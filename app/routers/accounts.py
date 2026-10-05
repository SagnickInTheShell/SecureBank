"""Endpoints for the logged-in user's own account ("me")."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Transaction, User
from app.schemas import AccountResponse, BalanceResponse, DepositRequest

router = APIRouter(prefix="/accounts", tags=["Accounts"])

CURRENCY = "INR"  # all amounts are whole Indian rupees


@router.get("/me", response_model=AccountResponse)
def get_my_account(current_user: User = Depends(get_current_user)):
    # The account comes from the JWT user, so a user can only ever see their own account.
    account = current_user.account
    return AccountResponse(
        account_number=account.account_number,
        balance=account.balance,
        status=account.status,
        currency=CURRENCY,
        created_at=account.created_at,
    )


@router.get("/me/balance", response_model=BalanceResponse)
def get_my_balance(current_user: User = Depends(get_current_user)):
    account = current_user.account
    return BalanceResponse(account_number=account.account_number, balance=account.balance, currency=CURRENCY)


@router.post("/me/deposit", response_model=BalanceResponse)
def deposit(
    data: DepositRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # data.amount was already validated by DepositRequest (> 0 and <= 1,000,000).
    # This endpoint exists only so the demo has money to transfer.
    account = current_user.account

    # Frozen or closed accounts cannot receive money.
    if account.status != "ACTIVE":
        raise HTTPException(status_code=403, detail="Account is not active")

    account.balance += data.amount

    # Record the deposit. sender_account_id is None because the money comes from outside the bank.
    db.add(Transaction(
        type="DEPOSIT",
        sender_account_id=None,
        receiver_account_id=account.id,
        amount=data.amount,
        status="COMPLETED",
        risk_score="LOW",
    ))
    log_action(db, current_user.id, "DEPOSIT_COMPLETED", f"Deposited {data.amount} {CURRENCY}")

    # The balance update, the transaction record and the audit entry are saved together.
    db.commit()
    return BalanceResponse(account_number=account.account_number, balance=account.balance, currency=CURRENCY)


@router.get("/me/audit-logs", response_model=list[dict])
def get_my_audit_logs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve the recent audit log trail for the logged-in user."""
    from app.models import AuditLog
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == current_user.id)
        .order_by(AuditLog.timestamp.desc(), AuditLog.id.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "action": log.action,
            "details": log.details,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        }
        for log in logs
    ]


@router.get("/verify/{account_number}")
def verify_recipient(
    account_number: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify if a recipient account number exists and is ACTIVE."""
    from app.models import Account
    acc = db.query(Account).filter(Account.account_number == account_number).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    is_self = (acc.id == current_user.account.id)
    return {
        "account_number": acc.account_number,
        "name": acc.user.name if acc.user else "Account Holder",
        "status": acc.status,
        "is_self": is_self,
        "valid": (acc.status == "ACTIVE" and not is_self),
    }


@router.post("/demo-seed")
def seed_demo_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Seed the exact interview demo state (₹42,500 balance, Bob recipient, and 3 transactions)."""
    alice_acc = current_user.account
    bob_user = db.query(User).filter(User.email == "bob@example.com").first()
    if not bob_user:
        from app.auth import hash_password
        bob_user = User(name="Bob Jones", email="bob@example.com", password_hash=hash_password("secret123"))
        db.add(bob_user)
        db.flush()
        bob_acc = Account(user_id=bob_user.id, account_number="SB10002", balance=90000, status="ACTIVE")
        db.add(bob_acc)
        db.flush()
    else:
        bob_acc = bob_user.account

    # Set Alice balance to exact spec: 42,500
    alice_acc.balance = 42500
    if bob_acc:
        bob_acc.balance = 90000

    # Remove existing demo transactions for Alice to give exact match
    db.query(Transaction).filter(
        (Transaction.sender_account_id == alice_acc.id) | (Transaction.receiver_account_id == alice_acc.id)
    ).delete()

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
    log_action(db, current_user.id, "DEMO_SEEDED", "Reset demo data to interview spec: ₹42,500")
    db.commit()

    return {"message": "Demo data seeded successfully", "balance": 42500, "account_number": alice_acc.account_number}


