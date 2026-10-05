"""SQLAlchemy models: each class is one database table."""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


def utc_now():
    """Current time in UTC, used as the default for created_at / timestamp columns."""
    return datetime.now(timezone.utc)


# NOTE ON MONEY: all amounts are stored as whole rupees in an Integer column.
# We never use float for money because floats are binary approximations:
# 0.1 + 0.2 == 0.30000000000000004 in Python. Small rounding errors like that
# add up across many transactions, and a bank's books must balance exactly.


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)  # bcrypt hash, never the plain password
    created_at = Column(DateTime, default=utc_now)

    # One-to-one link: user.account gives this user's Account object.
    account = relationship("Account", back_populates="user", uselist=False)


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    # unique=True enforces "one account per user" at the database level.
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    account_number = Column(String, unique=True, index=True, nullable=False)  # e.g. "SB10001"
    balance = Column(Integer, default=0, nullable=False)  # whole rupees (see money note above)
    # "ACTIVE", "FROZEN" or "CLOSED". Only ACTIVE accounts can send or receive money.
    # There is no endpoint to change this: that would be an admin feature.
    status = Column(String, default="ACTIVE", nullable=False)
    created_at = Column(DateTime, default=utc_now)

    user = relationship("User", back_populates="account")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)  # "DEPOSIT" or "TRANSFER"
    # Foreign keys to accounts.id: the database guarantees these point at real accounts.
    sender_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)  # None for deposits
    receiver_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    amount = Column(Integer, nullable=False)  # whole rupees
    status = Column(String, nullable=False)  # "COMPLETED" or "FAILED"
    failure_reason = Column(String, nullable=True)  # only filled in for FAILED transactions
    created_at = Column(DateTime, default=utc_now)


class AuditLog(Base):
    """A record of important actions, for security and traceability."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    # Nullable: a failed login with an unknown email has no user to point to.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)  # e.g. "USER_LOGIN", "TRANSFER_FAILED"
    details = Column(String, nullable=True)  # short human-readable description
    timestamp = Column(DateTime, default=utc_now)
