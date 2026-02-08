# @TASK P0-T0.3 - Test configuration
# @TASK P1-T1.1 - SynologyClient fixture 추가
import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set test environment variables before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://labnote:labnote@db:5432/labnote_test")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-testing-only")
os.environ.setdefault("SYNOLOGY_URL", "http://localhost:5000")
os.environ.setdefault("SYNOLOGY_USER", "testuser")
os.environ.setdefault("SYNOLOGY_PASSWORD", "testpassword")


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="function")
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide an async database session for testing with automatic table creation.

    Each test gets a fresh database with all tables created and dropped after.
    Uses a per-test engine to avoid event loop issues.
    """
    from app.database import Base
    import app.models  # noqa: F401 - Import to register models with Base

    engine = create_async_engine(
        os.environ["DATABASE_URL"],
        echo=False,
        pool_pre_ping=True,
    )
    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        yield session
        await session.rollback()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def async_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide an async database session for testing (legacy fixture name).

    Alias for test_db fixture for backward compatibility.
    """
    from app.database import Base
    import app.models  # noqa: F401 - Import to register models with Base

    engine = create_async_engine(
        os.environ["DATABASE_URL"],
        echo=False,
        pool_pre_ping=True,
    )
    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        yield session
        await session.rollback()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def test_app(test_db: AsyncSession):
    """Provide a FastAPI app instance with test database override."""
    from app.main import app
    from app.database import get_db

    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def test_client(test_app) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP client for testing with test database."""
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


def make_auth_headers(sub: str = "testuser") -> dict[str, str]:
    """Create Authorization headers with a valid access token."""
    from app.services.auth_service import create_access_token

    token = create_access_token(data={"sub": sub})
    return {"Authorization": f"Bearer {token}"}


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
