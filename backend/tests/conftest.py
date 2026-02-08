# @TASK P0-T0.3 - Test configuration
# @TASK P1-T1.1 - SynologyClient fixture 추가
import os

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set test environment variables before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://labnote:labnote@localhost:5432/labnote_test")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-testing-only")
os.environ.setdefault("SYNOLOGY_URL", "http://localhost:5000")
os.environ.setdefault("SYNOLOGY_USER", "testuser")
os.environ.setdefault("SYNOLOGY_PASSWORD", "testpassword")


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def async_session():
    """Provide an async database session for testing."""
    from app.database import Base
    import app.models  # noqa: F401 - Import to register models with Base

    test_engine = create_async_engine(
        os.environ["DATABASE_URL"],
        echo=False,
        pool_pre_ping=True,
    )

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    test_session_factory = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with test_session_factory() as session:
        yield session
        await session.rollback()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await test_engine.dispose()


@pytest.fixture
def synology_client():
    """Provide a SynologyClient configured with test environment variables.

    The client is created with the test credentials set above.
    It is NOT connected to a real NAS -- tests should mock httpx calls.
    """
    from app.synology_gateway.client import SynologyClient

    return SynologyClient(
        url=os.environ["SYNOLOGY_URL"],
        user=os.environ["SYNOLOGY_USER"],
        password=os.environ["SYNOLOGY_PASSWORD"],
    )
