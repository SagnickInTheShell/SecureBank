"""Entry point: creates the FastAPI app and plugs in all the routers."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import Base, engine
from app.routers import accounts, auth, transactions


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once on startup: create any tables that don't exist yet.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="SecureBank", description="A mini banking REST API", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(transactions.router)


@app.get("/health", tags=["Health"])
def health():
    """Simple check that the API is running. No login needed."""
    return {"status": "healthy", "service": "SecureBank API"}
