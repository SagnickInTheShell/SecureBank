"""Tests for SecureBank. They use a separate SQLite file, so the real database is never touched."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Account, AuditLog, Transaction

# A separate database file used only by the tests.
TEST_DATABASE_URL = "sqlite:///./test_securebank.db"
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)


def override_get_db():
    """Same as get_db, but uses the test database."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


# Tell FastAPI: wherever an endpoint asks for get_db, give it the test database instead.
app.dependency_overrides[get_db] = override_get_db


@pytest.fixture
def client():
    """A fresh, empty database for every test, so tests don't affect each other."""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=test_engine)


# ---------- helpers ----------

def register(client, name, email, password="secret123"):
    """Register a user and return the JSON response (includes account_number)."""
    response = client.post("/auth/register", json={"name": name, "email": email, "password": password})
    assert response.status_code == 201
    return response.json()


def login(client, email, password="secret123"):
    """Log in and return the Authorization header for later requests."""
    response = client.post("/auth/login", data={"username": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def balance(client, headers):
    return client.get("/accounts/me/balance", headers=headers).json()["balance"]


def transfer(client, headers, receiver_account, amount):
    return client.post(
        "/transactions/transfer",
        json={"receiver_account": receiver_account, "amount": amount},
        headers=headers,
    )


def setup_a_and_b(client):
    """User A with 20000 rupees, and user B with 0. Returns (headers_a, headers_b, acc_a, acc_b)."""
    acc_a = register(client, "Alice", "alice@example.com")["account_number"]
    acc_b = register(client, "Bob", "bob@example.com")["account_number"]
    headers_a = login(client, "alice@example.com")
    headers_b = login(client, "bob@example.com")
    client.post("/accounts/me/deposit", json={"amount": 20000}, headers=headers_a)
    return headers_a, headers_b, acc_a, acc_b


def set_account_status(account_number, status):
    """Change an account's status directly in the test DB (there is no API for this)."""
    with TestSessionLocal() as db:
        db.query(Account).filter(Account.account_number == account_number).update({"status": status})
        db.commit()


def failed_transactions():
    """All FAILED transaction rows in the test DB."""
    with TestSessionLocal() as db:
        return db.query(Transaction).filter(Transaction.status == "FAILED").all()


def audit_actions():
    """The list of audit log actions, in the order they were written."""
    with TestSessionLocal() as db:
        return [log.action for log in db.query(AuditLog).order_by(AuditLog.id).all()]


# ---------- auth ----------

def test_register_and_login(client):
    data = register(client, "Alice", "alice@example.com")
    assert data["account_number"] == "SB10001"
    assert "password_hash" not in data  # the hash must never be returned
    assert "access_token" in client.post(
        "/auth/login", data={"username": "alice@example.com", "password": "secret123"}
    ).json()


def test_duplicate_email_rejected(client):
    register(client, "Alice", "alice@example.com")
    response = client.post(
        "/auth/register", json={"name": "Alice2", "email": "alice@example.com", "password": "secret123"}
    )
    assert response.status_code == 400


def test_wrong_password_returns_401(client):
    register(client, "Alice", "alice@example.com")
    response = client.post("/auth/login", data={"username": "alice@example.com", "password": "wrongpass"})
    assert response.status_code == 401


# ---------- accounts ----------

def test_account_details(client):
    register(client, "Alice", "alice@example.com")
    headers = login(client, "alice@example.com")
    data = client.get("/accounts/me", headers=headers).json()
    assert data["account_number"] == "SB10001"
    assert data["balance"] == 0
    assert data["status"] == "ACTIVE"
    assert data["currency"] == "INR"


def test_deposit_updates_balance(client):
    register(client, "Alice", "alice@example.com")
    headers = login(client, "alice@example.com")
    response = client.post("/accounts/me/deposit", json={"amount": 20000}, headers=headers)
    assert response.status_code == 200
    assert balance(client, headers) == 20000


def test_deposit_into_frozen_account_rejected(client):
    acc_a = register(client, "Alice", "alice@example.com")["account_number"]
    headers = login(client, "alice@example.com")
    set_account_status(acc_a, "FROZEN")
    response = client.post("/accounts/me/deposit", json={"amount": 100}, headers=headers)
    assert response.status_code == 403
    assert balance(client, headers) == 0


# ---------- transfers ----------

def test_transfer_moves_money(client):
    headers_a, headers_b, _, acc_b = setup_a_and_b(client)
    response = transfer(client, headers_a, acc_b, 5000)
    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETED"
    assert balance(client, headers_a) == 15000
    assert balance(client, headers_b) == 5000


def test_insufficient_balance_rejected_and_recorded(client):
    headers_a, headers_b, acc_a, acc_b = setup_a_and_b(client)
    transfer(client, headers_a, acc_b, 5000)

    response = transfer(client, headers_a, acc_b, 50000)
    assert response.status_code == 400
    assert response.json()["detail"] == "Insufficient balance"
    # Nothing moved: both balances are exactly what they were before.
    assert balance(client, headers_a) == 15000
    assert balance(client, headers_b) == 5000
    # The failed attempt was still saved, with a reason (it was NOT erased by the rollback).
    failed = failed_transactions()
    assert len(failed) == 1
    assert failed[0].amount == 50000
    assert failed[0].failure_reason == "Insufficient balance"
    # And the sender can see it in their own history.
    history = client.get("/transactions/history", headers=headers_a).json()
    assert history[0]["status"] == "FAILED"
    assert history[0]["sender_account"] == acc_a
    assert history[0]["receiver_account"] == acc_b


def test_transfer_from_frozen_account_rejected(client):
    headers_a, headers_b, acc_a, acc_b = setup_a_and_b(client)
    set_account_status(acc_a, "FROZEN")
    response = transfer(client, headers_a, acc_b, 1000)
    assert response.status_code == 403
    assert balance(client, headers_a) == 20000
    assert balance(client, headers_b) == 0
    assert failed_transactions()[0].failure_reason == "Account is not active"


def test_transfer_to_frozen_account_rejected(client):
    headers_a, headers_b, _, acc_b = setup_a_and_b(client)
    set_account_status(acc_b, "FROZEN")
    response = transfer(client, headers_a, acc_b, 1000)
    assert response.status_code == 403
    assert balance(client, headers_a) == 20000
    assert balance(client, headers_b) == 0


def test_transfer_to_nonexistent_account_returns_404(client):
    headers_a, _, _, _ = setup_a_and_b(client)
    response = transfer(client, headers_a, "SB99999", 100)
    assert response.status_code == 404
    assert balance(client, headers_a) == 20000
    assert failed_transactions() == []  # not recorded: there is no receiver to point to


def test_transfer_to_own_account_rejected(client):
    headers_a, _, acc_a, _ = setup_a_and_b(client)
    response = transfer(client, headers_a, acc_a, 100)
    assert response.status_code == 400
    assert balance(client, headers_a) == 20000
    assert len(failed_transactions()) == 1


@pytest.mark.parametrize("amount", [0, -500])
def test_zero_or_negative_amount_rejected(client, amount):
    headers_a, _, _, acc_b = setup_a_and_b(client)
    deposit = client.post("/accounts/me/deposit", json={"amount": amount}, headers=headers_a)
    # 422 = FastAPI's "request body failed validation" status code.
    assert transfer(client, headers_a, acc_b, amount).status_code == 422
    assert deposit.status_code == 422
    assert balance(client, headers_a) == 20000


# ---------- security ----------

def test_requests_without_token_return_401(client):
    assert client.get("/accounts/me").status_code == 401
    assert client.get("/accounts/me/balance").status_code == 401
    assert client.post("/accounts/me/deposit", json={"amount": 100}).status_code == 401
    assert transfer(client, {}, "SB10001", 1).status_code == 401
    assert client.get("/transactions/history").status_code == 401


def test_history_only_shows_own_transactions(client):
    headers_a, headers_b, acc_a, acc_b = setup_a_and_b(client)
    # A third user, C, makes a deposit and a transfer to B. Neither involves A.
    register(client, "Carol", "carol@example.com")
    headers_c = login(client, "carol@example.com")
    client.post("/accounts/me/deposit", json={"amount": 1000}, headers=headers_c)
    transfer(client, headers_c, acc_b, 300)
    # A sends money to B.
    transfer(client, headers_a, acc_b, 5000)

    history = client.get("/transactions/history", headers=headers_a).json()
    # A sees exactly 2 transactions: their deposit and their transfer to B.
    assert len(history) == 2
    for t in history:
        assert acc_a in (t["sender_account"], t["receiver_account"])
    # Newest first: the transfer happened after the deposit.
    assert history[0]["type"] == "TRANSFER"
    assert history[1]["type"] == "DEPOSIT"
    assert history[1]["sender_account"] is None  # deposits have no sender


def test_audit_log_entries_created(client):
    headers_a, _, _, acc_b = setup_a_and_b(client)
    client.post("/auth/login", data={"username": "alice@example.com", "password": "wrongpass"})
    client.post("/auth/login", data={"username": "nobody@example.com", "password": "whatever"})
    transfer(client, headers_a, acc_b, 5000)
    transfer(client, headers_a, acc_b, 999999)

    actions = audit_actions()
    assert actions.count("USER_REGISTERED") == 2
    assert actions.count("USER_LOGIN") == 2
    assert actions.count("LOGIN_FAILED") == 2
    assert "DEPOSIT_COMPLETED" in actions
    assert "TRANSFER_COMPLETED" in actions
    assert "TRANSFER_FAILED" in actions

    # Secrets must never appear in the audit log.
    with TestSessionLocal() as db:
        all_details = " ".join(log.details or "" for log in db.query(AuditLog).all())
        failed_unknown = db.query(AuditLog).filter(AuditLog.details.contains("nobody@")).one()
    assert "secret123" not in all_details
    assert "wrongpass" not in all_details
    assert failed_unknown.user_id is None  # unknown email: no user to link to


# ---------- health ----------

def test_health_works_without_token(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "SecureBank API"}
