"""Endpoints for registering and logging in."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import create_access_token, hash_password, verify_password
from app.database import get_db
from app.models import Account, User
from app.schemas import RegisterRequest, RegisterResponse, Token

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    # Reject duplicate emails with a clear 400 (the DB unique constraint is a second safety net).
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.flush()  # sends the INSERT without committing, so user.id is now available

    # Generate the next account number: SB10001, SB10002, ...
    last_id = db.query(func.max(Account.id)).scalar() or 0
    account = Account(user_id=user.id, account_number=f"SB{10001 + last_id}", balance=0)
    db.add(account)

    log_action(db, user.id, "USER_REGISTERED", f"Account {account.account_number} opened")

    # One commit for the user, the account and the audit entry: all saved together or none.
    db.commit()

    return RegisterResponse(
        id=user.id, name=user.name, email=user.email, account_number=account.account_number
    )


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # OAuth2PasswordRequestForm reads form fields "username" and "password".
    # This makes Swagger's "Authorize" button work. We treat username as the email.
    user = db.query(User).filter(User.email == form.username).first()

    # Same error for "no such email" and "wrong password", so attackers
    # can't use this endpoint to discover which emails are registered.
    if user is None or not verify_password(form.password, user.password_hash):
        # Log the failure. user_id is None if the email doesn't exist.
        # We record the email that was tried, but NEVER the password.
        log_action(db, user.id if user else None, "LOGIN_FAILED", f"Failed login for {form.username}")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    log_action(db, user.id, "USER_LOGIN")  # the token itself is never logged
    db.commit()
    return Token(access_token=create_access_token(user.id), token_type="bearer")
