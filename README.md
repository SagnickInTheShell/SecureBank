# SecureBank
### Intelligent Banking Transaction Platform

A secure, reliable banking transaction platform built with **FastAPI**, **React**, **SQLite/SQLAlchemy**, and a **rule-based Fraud/Risk Engine**.

---

## Tech Stack

- **Frontend:** React (Vite, Modern Dark-Mode Banking Dashboard)
- **Backend:** FastAPI (Python 3.11)
- **Database:** SQLite + SQLAlchemy ORM
- **Authentication:** JWT (JSON Web Tokens) + bcrypt password hashing
- **API:** RESTful JSON API with OpenAPI/Swagger docs
- **Risk Engine:** Python rule-based scoring (`LOW` $\rightarrow$ Process, `MEDIUM` $\rightarrow$ Flag, `HIGH` $\rightarrow$ Block)
- **Idempotency:** Unique request key deduplication to prevent duplicate money debits
- **Testing:** Pytest (100% test pass rate across 21 test cases)

---

## Core Features

### 1. Authentication & Security
- Secure registration with auto-allocated account numbers (`SB10001`, `SB10002`, ...)
- Login with JWT access tokens
- Passwords stored strictly as bcrypt hashes
- Protected endpoints using OAuth2 Bearer token dependencies

### 2. Account Management
- View account balance and details (`/accounts/me`, `/accounts/me/balance`)
- Currency: Indian Rupees (INR) stored as integers to prevent floating-point rounding errors
- Account status enforcement (`ACTIVE`, `FROZEN`, `CLOSED`)
- Recipient pre-flight verification (`/accounts/verify/{account_number}`)

### 3. Atomic Money Transfers
- Move money between accounts atomically (all-or-nothing database transactions)
- Complete rollback on error (sender balance is never debited without receiver credit)
- Race-condition safe balance check & deduction using single conditional `UPDATE` statements

### 4. Transaction Ledger
Every transaction records:
- **Transaction ID**
- **Sender Account**
- **Receiver Account**
- **Amount**
- **Timestamp**
- **Status:** `COMPLETED`, `FLAGGED`, `FAILED`, `BLOCKED`
- **Risk Score:** `LOW`, `MEDIUM`, `HIGH`
- **Idempotency Key**

### 5. Rule-Based Fraud / Risk Detection Engine
Before any transfer executes:

```text
Transaction
     ↓
Risk Engine
     ↓
Risk Score
     ↓
LOW (Score < 30)     ───────→ Process (COMPLETED)
MEDIUM (Score 30-59) ───────→ Flag for Review (FLAGGED)
HIGH (Score >= 60)   ───────→ Block Immediately (BLOCKED, 403 Forbidden)
```

Rules evaluated in real-time:
1. **Unusually Large Amount:** High thresholds trigger elevated scoring
2. **New Recipient:** First-time transfer to an account adds risk weight
3. **Transaction Velocity:** Frequency analysis (detects rapid transfers within 2 minutes)
4. **Unusual Pattern:** Compares transfer size against user's historical average transfer

### 6. Audit Logging
Audits critical security and banking actions:
- `USER_REGISTERED`
- `USER_LOGIN`
- `LOGIN_FAILED`
- `DEPOSIT_COMPLETED`
- `TRANSFER_INITIATED`
- `TRANSFER_COMPLETED`
- `TRANSFER_FAILED`
- `TRANSACTION_FLAGGED`

### 7. Idempotency Protection
Accidental duplicate requests (e.g., double clicking or network retries) using the same `Idempotency-Key` or body key return the original transaction without re-transferring or double-debiting funds.

### 8. Interactive React Dashboard
- Real-time balance display (`₹ 42,500`)
- One-click Transfer Money modal with live recipient verification and risk presets
- Visual rule-based risk pipeline
- Full transaction ledger table
- Security audit log trail viewer
- One-click demo user switcher (`Alice` / `Bob`)

### 9. Health Check
- `GET /health` returns live service health status

---

## Running Locally

### 1. Backend (FastAPI)
```bash
# Activate virtual environment
.\venv\Scripts\activate

# Run backend API server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
- **API Base:** `http://127.0.0.1:8000`
- **Swagger Documentation:** `http://127.0.0.1:8000/docs`
- **Health Check:** `http://127.0.0.1:8000/health`

### 2. Frontend (React / Vite)
```bash
cd frontend
npm install
npm run dev
```
- **Frontend App URL:** `http://localhost:5173/`

### 3. Running Pytest
```bash
.\venv\Scripts\pytest -v
```
All 21 unit and integration tests pass.
