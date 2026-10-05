# SecureBank

A mini banking REST API built with FastAPI. Users can register (which opens a bank account automatically), log in with JWT, deposit money, transfer money to other accounts and view their own transaction history. Transfers are atomic (all-or-nothing), safe against concurrent double-spending, and every failed attempt is recorded. Important actions are written to an audit log.

## Features

- User registration with automatic account creation (account numbers `SB10001`, `SB10002`, ...)
- Login with JWT access tokens (expire after 30 minutes)
- Passwords stored only as bcrypt hashes
- View your account details and balance (currency: INR)
- Deposit money (1 to 1,000,000 rupees per deposit)
- Transfer money to another account, as a single atomic database transaction
- **Account status**: `ACTIVE`, `FROZEN` or `CLOSED`. Only ACTIVE accounts can send, receive or deposit money (otherwise `403`). There is no endpoint to change status, because that would be an admin feature.
- **Failed transfers are recorded** with status `FAILED` and a `failure_reason` (insufficient balance, inactive account, transfer to self). Balances are never changed by a failed transfer.
- **Race-condition-safe transfers**: the balance check and the deduction happen in one conditional `UPDATE`
- **Audit log** of registrations, logins, failed logins, deposits and transfers (never contains passwords or tokens)
- Transaction history: only your own transactions, newest first, shown with account numbers
- Users can only see and move their own money. The sender of a transfer is always taken from the JWT.
- `/health` endpoint for a quick "is it running?" check

## Tech stack

- Python 3 + FastAPI
- SQLite + SQLAlchemy ORM
- Pydantic (request/response validation)
- PyJWT (JSON Web Tokens)
- bcrypt (password hashing)
- pytest + FastAPI TestClient

## Project structure

```
app/
  main.py            FastAPI app, routers, /health, create tables on startup
  database.py        engine, SessionLocal, Base, get_db
  models.py          SQLAlchemy models (tables)
  schemas.py         Pydantic request/response models
  auth.py            password hashing + JWT helpers
  audit.py           log_action() helper for the audit log
  dependencies.py    get_current_user (Bearer token -> User)
  routers/
    auth.py          /auth/register, /auth/login
    accounts.py      /accounts/me, /accounts/me/balance, /accounts/me/deposit
    transactions.py  /transactions/transfer, /transactions/history
tests/
  test_banking.py
```

## Database schema (4 tables)

**users**
| column | type | notes |
|---|---|---|
| id | Integer | primary key |
| name | String | |
| email | String | unique |
| password_hash | String | bcrypt hash |
| created_at | DateTime | |

**accounts**
| column | type | notes |
|---|---|---|
| id | Integer | primary key |
| user_id | Integer | FK -> users.id, unique (one account per user) |
| account_number | String | unique, e.g. `SB10001` |
| balance | Integer | whole rupees |
| status | String | `ACTIVE` (default), `FROZEN` or `CLOSED` |
| created_at | DateTime | |

**transactions**
| column | type | notes |
|---|---|---|
| id | Integer | primary key |
| type | String | `DEPOSIT` or `TRANSFER` |
| sender_account_id | Integer | FK -> accounts.id, null for deposits |
| receiver_account_id | Integer | FK -> accounts.id |
| amount | Integer | whole rupees |
| status | String | `COMPLETED` or `FAILED` |
| failure_reason | String | null unless FAILED |
| created_at | DateTime | |

**audit_logs**
| column | type | notes |
|---|---|---|
| id | Integer | primary key |
| user_id | Integer | FK -> users.id, null for a failed login with an unknown email |
| action | String | `USER_REGISTERED`, `USER_LOGIN`, `LOGIN_FAILED`, `DEPOSIT_COMPLETED`, `TRANSFER_COMPLETED`, `TRANSFER_FAILED` |
| details | String | short description (never passwords or tokens) |
| timestamp | DateTime | |

Money is stored as an **integer number of rupees**, never as a float. Floats are binary approximations (`0.1 + 0.2 != 0.3`), and those rounding errors are unacceptable for money.

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/register | no | Create user + account |
| POST | /auth/login | no | Get a JWT (form fields: `username` = email, `password`) |
| GET | /accounts/me | yes | Account number, balance, status, currency, created_at |
| GET | /accounts/me/balance | yes | Account number, balance, currency |
| POST | /accounts/me/deposit | yes | Add money to your account |
| POST | /transactions/transfer | yes | Send money to another account |
| GET | /transactions/history | yes | Your transaction history |
| GET | /health | no | `{"status": "healthy", "service": "SecureBank API"}` |

Status codes: `400` bad request (duplicate email, insufficient balance, transfer to self), `401` missing/invalid token or wrong login, `403` account is not ACTIVE, `404` receiver account not found, `422` invalid request body (e.g. bad email, short password, amount <= 0).

## How transfers work

1. **Atomicity.** The deduction, the credit and the transaction record are all pending in one database transaction and saved by a single `commit()`. If anything fails, `rollback()` undoes all of it, so money can never be deducted from the sender without reaching the receiver.
2. **Race-condition fix.** Checking the balance in Python and then writing it is unsafe. Two simultaneous transfers could both read the same balance and both pass the check. Instead, the deduction is one conditional SQL statement:
   ```sql
   UPDATE accounts SET balance = balance - :amount
   WHERE id = :sender_id AND balance >= :amount AND status = 'ACTIVE'
   ```
   The database checks and updates in one uninterruptible step. If it changes 0 rows, the transfer is rejected as "Insufficient balance".
3. **Recording failures.** When a business rule fails, the code first rolls back, then saves a `FAILED` transaction (with `failure_reason`) and a `TRANSFER_FAILED` audit entry in a separate small commit. The order matters: a record saved before the rollback would be erased by it.
4. A transfer to a **nonexistent account** returns `404` and is not recorded, because there is no receiver account to reference.
5. **History.** Your history shows everything you sent (including your own failed attempts) and the completed transfers you received. Failed transfers *to* you are hidden, because their failure reason (e.g. the sender's insufficient balance) is the sender's private information.

## How to run

```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open **http://127.0.0.1:8000/docs** for the interactive Swagger UI.

For anything beyond local development, set a real secret first:
```bash
# Windows PowerShell:  $env:SECRET_KEY = "a-long-random-string"
# macOS/Linux:         export SECRET_KEY="a-long-random-string"
```

> If you ran an older version of this project, delete `securebank.db` first. The schema changed, and tables are only created when missing (there are no migrations).

## Swagger demo (step by step)

1. **Health check.** `GET /health` works without logging in.
2. **Register user A.** `POST /auth/register` with
   `{"name": "Alice", "email": "alice@example.com", "password": "secret123"}`. Note the account number (`SB10001`).
3. **Log in.** Click the **Authorize** button (top right). Enter username `alice@example.com` and password `secret123`, then click Authorize. Swagger now sends the token with every request.
4. **View account.** `GET /accounts/me` shows balance 0, status `ACTIVE`, currency `INR`.
5. **Deposit.** `POST /accounts/me/deposit` with `{"amount": 20000}`. The balance is now 20000.
6. **Register user B.** `POST /auth/register` with
   `{"name": "Bob", "email": "bob@example.com", "password": "secret123"}`. B gets `SB10002`.
7. **Transfer.** Still logged in as Alice, `POST /transactions/transfer` with
   `{"receiver_account": "SB10002", "amount": 5000}`. Status is `COMPLETED`.
8. **Try an overdraft.** Transfer `{"receiver_account": "SB10002", "amount": 50000}`. You get **400 "Insufficient balance"**.
9. **Check balances.** `GET /accounts/me/balance` shows Alice still has 15000. To see Bob's, click Authorize -> Logout, log in as `bob@example.com`, and call it again (5000).
10. **View history.** As Alice, `GET /transactions/history` shows the deposit, the completed transfer and the `FAILED` 50000 attempt with its `failure_reason`. As Bob, you only see the completed 5000 transfer.

## Running tests

```bash
pytest
```

Tests use a separate SQLite file (`test_securebank.db`) that is reset for every test, so your real data is never touched. They cover auth, deposits, transfers, insufficient balance (including the FAILED record), frozen accounts, 404s, invalid amounts, missing tokens, history isolation, audit logging and `/health`.
