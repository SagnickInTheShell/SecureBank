"""Pydantic schemas: they define and validate the shape of request bodies and responses."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------

class RegisterRequest(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr  # Pydantic rejects anything that is not a valid email format
    # bcrypt only uses the first 72 bytes of a password, so we cap the length there.
    password: str = Field(min_length=6, max_length=72)


class RegisterResponse(BaseModel):
    # Deliberately has no password_hash field, so it can never leak in a response.
    id: int
    name: str
    email: EmailStr
    account_number: str


class Token(BaseModel):
    access_token: str
    token_type: str


# ---------- Accounts ----------

class AccountResponse(BaseModel):
    account_number: str
    balance: int
    status: str
    currency: str
    created_at: datetime


class BalanceResponse(BaseModel):
    account_number: str
    balance: int
    currency: str


class DepositRequest(BaseModel):
    # gt=0: must be more than zero. le=1_000_000: a sanity cap for this demo.
    amount: int = Field(gt=0, le=1_000_000)


# ---------- Transactions ----------

class TransferRequest(BaseModel):
    # Note: there is NO sender field. The sender always comes from the JWT.
    receiver_account: str
    amount: int = Field(gt=0)
    idempotency_key: Optional[str] = None


class TransactionResponse(BaseModel):
    # The database stores account IDs, but users know account NUMBERS,
    # so responses show the account numbers (looked up with a join).
    id: int
    type: str
    sender_account: Optional[str]  # None for deposits
    receiver_account: str
    amount: int
    status: str
    risk_score: str = "LOW"
    idempotency_key: Optional[str] = None
    failure_reason: Optional[str]
    created_at: datetime


# ---------- Audit ----------

class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    action: str
    details: Optional[str]
    timestamp: datetime

