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
    ))
    log_action(db, current_user.id, "DEPOSIT_COMPLETED", f"Deposited {data.amount} {CURRENCY}")

    # The balance update, the transaction record and the audit entry are saved together.
    db.commit()
    return BalanceResponse(account_number=account.account_number, balance=account.balance, currency=CURRENCY)
