from typing import AsyncGenerator
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

# Modern SQLAlchemy 2.0 Declarative Base class
class Base(DeclarativeBase):
    pass

# Create database engines
# sync engine (used for migrations and seeding)
engine = create_engine(
    settings.DATABASE_URL, 
    pool_pre_ping=True,
    echo=False
)

# async engine (used for fast, asynchronous API endpoints)
async_engine = create_async_engine(
    settings.ASYNC_DATABASE_URL, 
    pool_pre_ping=True,
    echo=False
)

# Session factories
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine
)

AsyncSessionLocal = async_sessionmaker(
    autoflush=False, 
    expire_on_commit=False, 
    bind=async_engine
)

# Dependency to get db session in FastAPI routes
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
