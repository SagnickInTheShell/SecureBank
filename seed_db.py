"""Seed the exact interview demo state into securebank.db."""
from app.database import SessionLocal
from app.models import User, Account, Transaction, AuditLog
from app.auth import hash_password

db = SessionLocal()

# Find Alice (SB10001)
alice_acc = db.query(Account).filter(Account.account_number == "SB10001").first()
if not alice_acc:
    alice = User(name="Alice", email="alice@example.com", password_hash=hash_password("secret123"))
    db.add(alice)
    db.flush()
    alice_acc = Account(user_id=alice.id, account_number="SB10001", balance=42500, status="ACTIVE")
    db.add(alice_acc)
    db.flush()
else:
    alice = alice_acc.user

# Find or ensure second account SB10002
bob_acc = db.query(Account).filter(Account.account_number == "SB10002").first()
if not bob_acc:
    bob = User(name="Bob", email="bob@example.com", password_hash=hash_password("secret123"))
    db.add(bob)
    db.flush()
    bob_acc = Account(user_id=bob.id, account_number="SB10002", balance=90000, status="ACTIVE")
    db.add(bob_acc)
    db.flush()
else:
    bob = bob_acc.user

# Set exact spec balances
alice_acc.balance = 42500
bob_acc.balance = 90000

# Clear transactions for a clean slate
db.query(Transaction).delete()

# Insert the 3 transactions from the specification:
# + 10,000 Deposit Success
# - 5,000  Transfer Success
# - 85,000 Transfer Flagged
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

# Audit entries
db.query(AuditLog).delete()
db.add(AuditLog(user_id=alice.id, action="USER_LOGIN", details="User logged in"))
db.add(AuditLog(user_id=alice.id, action="DEPOSIT_COMPLETED", details="Deposited 10000 INR"))
db.add(AuditLog(user_id=alice.id, action="TRANSFER_INITIATED", details="Initiated transfer of 5000 to SB10002"))
db.add(AuditLog(user_id=alice.id, action="TRANSFER_COMPLETED", details="5000 to SB10002"))
db.add(AuditLog(user_id=alice.id, action="TRANSFER_INITIATED", details="Initiated transfer of 85000 to SB10002"))
db.add(AuditLog(user_id=alice.id, action="TRANSACTION_FLAGGED", details="Medium risk transfer flagged (35 pts): High-value transfer amount (₹85,000 >= ₹75,000)"))
db.add(AuditLog(user_id=alice.id, action="TRANSFER_COMPLETED", details="85000 to SB10002"))

db.commit()

print(f"Seeded successfully:")
print(f"  Alice ({alice_acc.account_number}): ₹{alice_acc.balance:,}")
print(f"  Recipient ({bob_acc.account_number}, {bob.name}): ₹{bob_acc.balance:,}")
print(f"  Transactions count: {db.query(Transaction).count()}")
print(f"  Audit logs count: {db.query(AuditLog).count()}")
db.close()
