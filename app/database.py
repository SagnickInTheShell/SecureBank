"""Database setup: the engine, the session factory and the Base class for models."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# SQLite stores the whole database in this one file in the project folder.
DATABASE_URL = "sqlite:///./securebank.db"

# check_same_thread=False: FastAPI may use a different thread for each request,
# and by default SQLite refuses to share a connection across threads.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Each call to SessionLocal() gives us a new database session (a "conversation" with the DB).
# autocommit=False means nothing is saved until we explicitly call db.commit().
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

# All our models inherit from Base, so SQLAlchemy knows which tables to create.
Base = declarative_base()


def get_db():
    """FastAPI dependency: open a session for one request, and always close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
