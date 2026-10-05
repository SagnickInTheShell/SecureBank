"""Reset database to exact initial demo state."""
from app.database import SessionLocal
from app.models import User, Account, Transaction, AuditLog
from app.auth import hash_password

db = SessionLocal()

alice_acc = db.query(Account).filter(Account.account_number == "SB10001").first()
if not alice_acc:
    alice = User(name="Alice", email="alice@example.com", password_hash=hash_password("secret123"))
    db.add(alice)
    db.flush()
    alice_acc = Account(user_id=alice.id, account_number="SB10001", balance=42500, status="ACTIVE")
    db.add(alice_acc)
    db.flush()
else:
    alice = alice_acc.user

bob_acc = db.query(Account).filter(Account.account_number == "SB10002").first()
if not bob_acc:
    bob = User(name="Bob", email="bob@example.com", password_hash=hash_password("secret123"))
    db.add(bob)
    db.flush()
    bob_acc = Account(user_id=bob.id, account_number="SB10002", balance=90000, status="ACTIVE")
    db.add(bob_acc)
    db.flush()
else:
    bob = bob_acc.user

alice_acc.balance = 42500
bob_acc.balance = 90000

# Clear old transactions
db.query(Transaction).delete()

t1 = Transaction(
    type="DEPOSIT",
    sender_account_id=None,
    receiver_account_id=alice_acc.id,
    amount=10000,
    status="COMPLETED",
    risk_score="LOW",
)
t2 = Transaction(
    type="TRANSFER",
    sender_account_id=alice_acc.id,
    receiver_account_id=bob_acc.id,
    amount=5000,
    status="COMPLETED",
    risk_score="LOW",
)
t3 = Transaction(
    type="TRANSFER",
    sender_account_id=alice_acc.id,
    receiver_account_id=bob_acc.id,
    amount=85000,
    status="FLAGGED",
    risk_score="MEDIUM",
)
db.add_all([t1, t2, t3])

db.commit()
db.close()
