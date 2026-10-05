"""Security helpers: password hashing and JWT creation/decoding."""
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

# The secret used to sign JWTs. In production it MUST come from the environment.
# The fallback value below is for local development only. Never use it in production,
# because anyone who knows it can forge tokens for any user.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-insecure-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def hash_password(password: str) -> str:
    """Return a bcrypt hash of the password. A random salt is generated and stored inside the hash."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Check a plain password against a stored bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user_id: int) -> str:
    """Create a signed JWT that identifies the user and expires in 30 minutes."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    # "sub" (subject) = who the token is about. JWT expects it to be a string.
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> int | None:
    """Return the user id inside a valid token, or None if the token is invalid or expired."""
    try:
        # jwt.decode checks the signature AND the "exp" expiry time for us.
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
