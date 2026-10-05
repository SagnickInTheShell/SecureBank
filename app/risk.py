"""Rule-based Fraud and Risk Engine for SecureBank.

Evaluates transactions in real time using clear business rules:
- Unusually large amount
- New recipient
- Transaction velocity (too many transactions in short period)
- Unusual transaction pattern

Scoring outcome:
- LOW    (score < 30)  -> Process immediately (Status: COMPLETED)
- MEDIUM (score 30-59) -> Flag for review but execute (Status: FLAGGED)
- HIGH   (score >= 60) -> Block transfer immediately, no funds moved (Status: BLOCKED)
"""
from datetime import datetime, timedelta, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Account, Transaction


def evaluate_transfer_risk(
    db: Session,
    sender: Account,
    receiver: Account,
    amount: int,
) -> tuple[int, str, list[str]]:
    """Evaluates transaction risk and returns (score, risk_level, reasons)."""
    score = 0
    reasons: list[str] = []

    # Rule 1: Large amount
    if amount >= 250_000:
        score += 50
        reasons.append(f"Unusually large transfer amount (₹{amount:,} >= ₹250,000)")
    elif amount >= 150_000:
        score += 40
        reasons.append(f"Very high-value transfer (₹{amount:,} >= ₹150,000)")
    elif amount >= 75_000:
        score += 30
        reasons.append(f"High-value transfer (₹{amount:,} >= ₹75,000)")
    elif amount >= 50_000:
        score += 20
        reasons.append(f"Significant transfer amount (₹{amount:,} >= ₹50,000)")

    # Rule 2: New recipient (sender has never sent money to this account before)
    prior_tx = db.query(Transaction).filter(
        Transaction.sender_account_id == sender.id,
        Transaction.receiver_account_id == receiver.id,
        Transaction.status.in_(["COMPLETED", "FLAGGED"]),
    ).first()

    if prior_tx is None:
        score += 15
        reasons.append(f"First-time transfer to recipient {receiver.account_number}")

    # Rule 3: Transaction velocity (too many transactions in short period: last 2 minutes)
    two_minutes_ago = datetime.now(timezone.utc) - timedelta(minutes=2)
    recent_count = db.query(Transaction).filter(
        Transaction.sender_account_id == sender.id,
        Transaction.created_at >= two_minutes_ago,
    ).count()

    if recent_count >= 3:
        score += 35
        reasons.append(f"High velocity: {recent_count} transactions initiated in the last 2 minutes")
    elif recent_count >= 2:
        score += 15
        reasons.append(f"Elevated velocity: {recent_count} transactions initiated in the last 2 minutes")

    # Rule 4: Unusual pattern check (amount is >5x sender's historical average transfer)
    avg_amount = db.query(func.avg(Transaction.amount)).filter(
        Transaction.sender_account_id == sender.id,
        Transaction.status.in_(["COMPLETED", "FLAGGED"]),
    ).scalar()

    if avg_amount and amount >= 25_000 and amount >= 5 * float(avg_amount):
        score += 20
        reasons.append(f"Amount is >5x higher than historical average of ₹{int(avg_amount):,}")

    score = min(score, 100)

    if score >= 60:
        risk_level = "HIGH"
    elif score >= 30:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return score, risk_level, reasons
