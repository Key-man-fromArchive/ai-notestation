# @TASK P0-T0.3 - Test configuration
# @TASK P1-T1.1 - SynologyClient fixture 추가
import os

import pytest

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
