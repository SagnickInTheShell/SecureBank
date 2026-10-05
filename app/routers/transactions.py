"""Endpoints for money transfers and transaction history."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, update
from sqlalchemy.orm import Session, aliased

from app.audit import log_action
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Account, Transaction, User
from app.schemas import TransactionResponse, TransferRequest

router = APIRouter(prefix="/transactions", tags=["Transactions"])


def record_failed_transfer(db: Session, user_id: int, sender_id: int, receiver_id: int,
                           receiver_number: str, amount: int, reason: str) -> None:
    """Save a FAILED transfer record and an audit entry, in their own small commit.

    The caller MUST call db.rollback() BEFORE this. Why the order matters:
    a rollback throws away EVERYTHING pending in the current transaction. If we added the
    FAILED record first and rolled back afterwards, the rollback would erase the record too,
    and the failed attempt would leave no trace. So: roll back first (balances stay untouched),
    then write the failure record as a fresh, separate commit.
    """
    db.add(Transaction(
        type="TRANSFER",
        sender_account_id=sender_id,
        receiver_account_id=receiver_id,
        amount=amount,
        status="FAILED",
        failure_reason=reason,
    ))
    log_action(db, user_id, "TRANSFER_FAILED", f"{amount} to {receiver_number} failed: {reason}")
    db.commit()


@router.post("/transfer", response_model=TransactionResponse)
def transfer(
    data: TransferRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move money from the logged-in user's account to another account.

    ATOMICITY (all-or-nothing):
    A transfer is two separate changes: subtract from the sender and add to the
    receiver. They must succeed or fail TOGETHER. Without this, a crash or error
    between the two steps could leave money deducted from the sender but never
    received, and that money would simply disappear from the bank.

    How we get atomicity: the session has autocommit=False, so every change below
    stays pending inside ONE database transaction. Nothing is permanently saved until
    db.commit(). If anything fails before that, db.rollback() throws away ALL
    pending changes, and the database looks exactly as it did before the request.
    """
    # Step 1: validate amount > 0.
    # This is already enforced by TransferRequest (Field gt=0). FastAPI rejects
    # a zero or negative amount with 422 before this function even runs.

    # Step 2: the sender is ALWAYS the logged-in user's account, taken from the JWT.
    # We never read a sender from the request body, so a user can't spend someone else's money.
    sender = current_user.account

    # Plain values we need later. We copy them now because db.rollback() "expires"
    # the loaded objects, and we want to use these values safely after a rollback.
    user_id = current_user.id
    sender_id = sender.id
    sender_number = sender.account_number

    try:
        # Step 3: the receiver account must exist. NOT recorded as a FAILED transaction,
        # because there is no receiver account for the record to point to.
        receiver = db.query(Account).filter(
            Account.account_number == data.receiver_account
        ).first()
        if receiver is None:
            raise HTTPException(status_code=404, detail="Receiver account not found")
        receiver_id = receiver.id
        receiver_number = receiver.account_number

        def fail(status_code: int, reason: str):
            """A business rule was broken: undo, record the failure, return an error."""
            db.rollback()  # FIRST undo everything (see record_failed_transfer for why)
            record_failed_transfer(db, user_id, sender_id, receiver_id,
                                   receiver_number, data.amount, reason)
            raise HTTPException(status_code=status_code, detail=reason)

        # Step 4: transferring to your own account is not allowed.
        if receiver_id == sender_id:
            fail(400, "Cannot transfer to your own account")

        # Step 5: both accounts must be ACTIVE (not FROZEN or CLOSED).
        if sender.status != "ACTIVE" or receiver.status != "ACTIVE":
            fail(403, "Account is not active")

        # Step 6: deduct from the sender, ONLY if there is enough money. This is done
        # as ONE conditional UPDATE statement:
        #
        #   UPDATE accounts SET balance = balance - :amount
        #   WHERE id = :sender_id AND balance >= :amount AND status = 'ACTIVE'
        #
        # THE RACE CONDITION this prevents: the naive version reads the balance in Python,
        # checks it, then writes it. Suppose a user has 10000 and sends two 8000 transfers
        # at the same moment. Both requests read "10000", both checks pass, and both deduct.
        # The user has now sent 16000 from a 10000 balance.
        #
        # With the conditional UPDATE, the database checks and changes the balance in a
        # single step that no other request can interrupt. The second transfer's UPDATE
        # sees the already-reduced balance (2000), its WHERE condition is false, and it
        # changes 0 rows.
        result = db.execute(
            update(Account)
            .where(
                Account.id == sender_id,
                Account.balance >= data.amount,
                Account.status == "ACTIVE",
            )
            .values(balance=Account.balance - data.amount)
        )
        # rowcount = how many rows the UPDATE changed. 0 means the WHERE condition failed.
        if result.rowcount == 0:
            fail(400, "Insufficient balance")

        # Step 7: add to the receiver. "balance = balance + amount" is also done inside the
        # database, so a simultaneous transfer into the same account can't overwrite it.
        db.execute(
            update(Account)
            .where(Account.id == receiver_id)
            .values(balance=Account.balance + data.amount)
        )

        # Step 8: record the transfer and write an audit entry (both pending until commit).
        record = Transaction(
            type="TRANSFER",
            sender_account_id=sender_id,
            receiver_account_id=receiver_id,
            amount=data.amount,
            status="COMPLETED",
        )
        db.add(record)
        log_action(db, user_id, "TRANSFER_COMPLETED", f"{data.amount} to {receiver_number}")

        # Step 9: commit. Steps 6, 7 and 8 are saved together, as one unit.
        db.commit()
        db.refresh(record)  # reload the record so id and created_at are filled in
        return TransactionResponse(
            id=record.id,
            type=record.type,
            sender_account=sender_number,
            receiver_account=receiver_number,
            amount=record.amount,
            status=record.status,
            failure_reason=None,
            created_at=record.created_at,
        )

    except HTTPException:
        # A business rule failed (404/400/403). fail() has already rolled back and
        # recorded the failure. This rollback is a safety net (e.g. for the 404 path).
        db.rollback()
        raise
    except Exception:
        # Something unexpected happened (e.g. a database error). Undo EVERYTHING,
        # so no half-finished transfer is saved, and report a server error.
        db.rollback()
        raise HTTPException(status_code=500, detail="Transfer failed. No money was moved.")


@router.get("/history", response_model=list[TransactionResponse])
def history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the logged-in user's transactions, newest first, with account numbers."""
    my_id = current_user.account.id

    # The transactions table stores account IDs. To show account NUMBERS we join to the
    # accounts table twice: once for the sender and once for the receiver. aliased()
    # gives each join its own name so SQL can tell them apart.
    Sender = aliased(Account)
    Receiver = aliased(Account)

    rows = (
        db.query(Transaction, Sender.account_number, Receiver.account_number)
        # outerjoin for the sender: deposits have no sender, and we still want them.
        .outerjoin(Sender, Transaction.sender_account_id == Sender.id)
        .join(Receiver, Transaction.receiver_account_id == Receiver.id)
        .filter(or_(
            # Everything I sent, including my own FAILED attempts.
            Transaction.sender_account_id == my_id,
            # Money I received, but only COMPLETED. A failed transfer TO me says something
            # about the sender (e.g. "Insufficient balance"), which is not my business.
            and_(Transaction.receiver_account_id == my_id, Transaction.status == "COMPLETED"),
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
            failure_reason=txn.failure_reason,
            created_at=txn.created_at,
        )
        for txn, sender_number, receiver_number in rows
    ]
