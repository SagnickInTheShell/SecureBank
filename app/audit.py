"""Audit logging helper."""
from sqlalchemy.orm import Session

from app.models import AuditLog


def log_action(db: Session, user_id: int | None, action: str, details: str | None = None) -> None:
    """Add an audit log entry to the current database session.

    This only ADDS the entry. It is saved by the caller's next db.commit(), so it is
    saved together with the action it describes (or not at all if that action is rolled back).

    SECURITY: never pass passwords, password hashes or tokens in `details`.
    Audit logs are read by staff and kept for a long time, so secrets must never end up in them.
    """
    db.add(AuditLog(user_id=user_id, action=action, details=details))
