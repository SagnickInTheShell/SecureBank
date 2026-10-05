"""Endpoints for money transfers and transaction history."""
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session, aliased

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Account, Transaction, User
from app.risk import evaluate_transfer_risk
from app.schemas import TransactionResponse, TransferRequest

router = APIRouter(prefix="/transactions", tags=["Transactions"])


def record_failed_transfer(
    db: Session,
    user_id: int,
    sender_id: int,
    receiver_id: int,
    receiver_number: str,
    amount: int,
    reason: str,
    status: str = "FAILED",
    risk_score: str = "LOW",
    idempotency_key: Optional[str] = None,
) -> None:
    """Save a FAILED or BLOCKED transfer record and an audit entry, in their own small commit.

    The caller MUST call db.rollback() BEFORE this.
    """
    db.add(Transaction(
        type="TRANSFER",
        sender_account_id=sender_id,
        receiver_account_id=receiver_id,
        amount=amount,
        status=status,
        risk_score=risk_score,
        idempotency_key=idempotency_key,
        failure_reason=reason,
    ))
    log_action(db, user_id, "TRANSFER_FAILED", f"{amount} to {receiver_number} failed: {reason}")
    db.commit()


@router.post("/transfer", response_model=TransactionResponse)
def transfer(
    data: TransferRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    idempotency_key_header: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    """Move money from the logged-in user's account to another account.

    Includes:
    - Idempotency deduplication: accidental duplicate requests return the prior transaction without re-transferring.
    - Rule-based risk engine: LOW (process), MEDIUM (flagged), HIGH (blocked).
    - Full transaction ledger with risk scores and audit trails.
    - Atomic execution with rollback on any failure.
    """
    sender = current_user.account
    user_id = current_user.id
    sender_id = sender.id
    sender_number = sender.account_number

    effective_key = data.idempotency_key or idempotency_key_header

    # Step 0: Check idempotency
    if effective_key:
        existing = db.query(Transaction).filter(
            Transaction.sender_account_id == sender_id,
            Transaction.idempotency_key == effective_key,
        ).first()
        if existing:
            receiver_acc = db.query(Account).filter(Account.id == existing.receiver_account_id).first()
            receiver_num = receiver_acc.account_number if receiver_acc else "UNKNOWN"
            return TransactionResponse(
                id=existing.id,
                type=existing.type,
                sender_account=sender_number,
                receiver_account=receiver_num,
                amount=existing.amount,
                status=existing.status,
                risk_score=existing.risk_score,
                idempotency_key=existing.idempotency_key,
                failure_reason=existing.failure_reason,
                created_at=existing.created_at,
            )

    try:
        # Step 1: Receiver account must exist
        receiver = db.query(Account).filter(
            Account.account_number == data.receiver_account
        ).first()
        if receiver is None:
            raise HTTPException(status_code=404, detail="Receiver account not found")
        receiver_id = receiver.id
        receiver_number = receiver.account_number

        def fail(status_code: int, reason: str, status_val: str = "FAILED", risk_val: str = "LOW"):
            """Rollback and record failure."""
            db.rollback()
            record_failed_transfer(
                db, user_id, sender_id, receiver_id,
                receiver_number, data.amount, reason,
                status=status_val, risk_score=risk_val,
                idempotency_key=effective_key,
            )
            raise HTTPException(status_code=status_code, detail=reason)

        # Step 2: Transferring to self is forbidden
        if receiver_id == sender_id:
            fail(400, "Cannot transfer to your own account")

        # Step 3: Both accounts must be ACTIVE
        if sender.status != "ACTIVE" or receiver.status != "ACTIVE":
            fail(403, "Account is not active")

        # Step 4: Audit - transfer initiated
        log_action(db, user_id, "TRANSFER_INITIATED", f"Initiated transfer of {data.amount} to {receiver_number}")

        # Step 5: Fraud / Risk Detection Engine (evaluated before processing money)
        risk_score_val, risk_level, reasons = evaluate_transfer_risk(db, sender, receiver, data.amount)

        if risk_level == "HIGH":
            reason_str = f"Transaction blocked by Risk Engine: High risk score ({', '.join(reasons)})"
            log_action(db, user_id, "TRANSACTION_FLAGGED", f"High risk transfer flagged ({risk_score_val} pts): {', '.join(reasons)}")
            fail(403, reason_str, status_val="BLOCKED", risk_val="HIGH")

        # Step 6: Check balance
        if sender.balance < data.amount:
            fail(400, "Insufficient balance")

        tx_status = "COMPLETED"
        if risk_level == "MEDIUM":
            tx_status = "FLAGGED"
            log_action(db, user_id, "TRANSACTION_FLAGGED", f"Medium risk transfer flagged ({risk_score_val} pts): {', '.join(reasons)}")

        # Step 7: Conditional atomic balance deduction
        result = db.execute(
            update(Account)
            .where(
                Account.id == sender_id,
                Account.balance >= data.amount,
                Account.status == "ACTIVE",
            )
            .values(balance=Account.balance - data.amount)
        )
        if result.rowcount == 0:
            fail(400, "Insufficient balance", status_val="FAILED", risk_val=risk_level)

        # Step 8: Credit receiver
        db.execute(
            update(Account)
            .where(Account.id == receiver_id)
            .values(balance=Account.balance + data.amount)
        )

        # Step 9: Save transaction ledger record
        record = Transaction(
            type="TRANSFER",
            sender_account_id=sender_id,
            receiver_account_id=receiver_id,
            amount=data.amount,
            status=tx_status,
            risk_score=risk_level,
            idempotency_key=effective_key,
        )
        db.add(record)
        log_action(db, user_id, "TRANSFER_COMPLETED", f"{data.amount} to {receiver_number}")

        db.commit()
        db.refresh(record)
        return TransactionResponse(
            id=record.id,
            type=record.type,
            sender_account=sender_number,
            receiver_account=receiver_number,
            amount=record.amount,
            status=record.status,
            risk_score=record.risk_score,
            idempotency_key=record.idempotency_key,
            failure_reason=None,
            created_at=record.created_at,
        )

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Transfer failed. No money was moved.")


@router.get("/history", response_model=list[TransactionResponse])
def history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the logged-in user's transactions, newest first, with account numbers and risk scores."""
    my_id = current_user.account.id

    Sender = aliased(Account)
    Receiver = aliased(Account)

    rows = (
        db.query(Transaction, Sender.account_number, Receiver.account_number)
        .outerjoin(Sender, Transaction.sender_account_id == Sender.id)
        .join(Receiver, Transaction.receiver_account_id == Receiver.id)
        .filter(or_(
            Transaction.sender_account_id == my_id,
            and_(Transaction.receiver_account_id == my_id, Transaction.status.in_(["COMPLETED", "FLAGGED"])),
        ))
        .order_by(Transaction.created_at.desc(), Transaction.id.desc())
        .all()
    )

    return [
        TransactionResponse(
            id=txn.id,
            type=txn.type,
            sender_account=sender_number,
            receiver_account=receiver_number,
            amount=txn.amount,
            status=txn.status,
            risk_score=txn.risk_score,
            idempotency_key=txn.idempotency_key,
            failure_reason=txn.failure_reason,
            created_at=txn.created_at,
        )
        for txn, sender_number, receiver_number in rows
    ]
