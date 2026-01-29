# @TASK P0-T0.3 - Test configuration
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
