# @TASK P0-T0.3 - FastAPI 백엔드 초기화 테스트
# @TEST tests/test_p0_t03_backend_init.py

import pytest
from httpx import ASGITransport, AsyncClient


class TestConfig:
    """Test pydantic-settings configuration."""

    def test_settings_loads_defaults(self):
        """Settings should load with sensible defaults."""
        from app.config import Settings

        settings = Settings(
            DATABASE_URL="postgresql+asyncpg://test:test@localhost/test",
            JWT_SECRET="test-secret",
        )
        assert settings.DATABASE_URL == "postgresql+asyncpg://test:test@localhost/test"
        assert settings.JWT_ALGORITHM == "HS256"
        assert settings.JWT_EXPIRE_MINUTES == 1440
        assert settings.EMBEDDING_MODEL == "text-embedding-3-small"
        assert settings.EMBEDDING_DIMENSION == 1536

    def test_settings_async_database_url_converts_prefix(self):
        """async_database_url property should convert postgresql:// to postgresql+asyncpg://."""
        from app.config import Settings

        settings = Settings(
            DATABASE_URL="postgresql://user:pass@host/db",
            JWT_SECRET="test-secret",
        )
        assert settings.async_database_url == "postgresql+asyncpg://user:pass@host/db"

    def test_settings_async_database_url_preserves_asyncpg(self):
        """async_database_url should not double-convert if already asyncpg."""
        from app.config import Settings

        settings = Settings(
            DATABASE_URL="postgresql+asyncpg://user:pass@host/db",
            JWT_SECRET="test-secret",
        )
        assert settings.async_database_url == "postgresql+asyncpg://user:pass@host/db"

    def test_get_settings_returns_instance(self):
        """get_settings should return a Settings instance."""
        from app.config import get_settings

        settings = get_settings()
        assert settings is not None
        assert hasattr(settings, "DATABASE_URL")
        assert hasattr(settings, "JWT_SECRET")

    def test_settings_optional_ai_keys_default_empty(self):
        """AI API keys should default to empty strings."""
        from app.config import Settings

        settings = Settings(
            DATABASE_URL="postgresql+asyncpg://test:test@localhost/test",
            JWT_SECRET="test-secret",
        )
        assert settings.OPENAI_API_KEY == ""
        assert settings.ANTHROPIC_API_KEY == ""
        assert settings.GOOGLE_API_KEY == ""
        assert settings.ZHIPUAI_API_KEY == ""


class TestDatabase:
    """Test database module structure."""

    def test_base_is_declarative_base(self):
        """Base should be a SQLAlchemy DeclarativeBase subclass."""
        from sqlalchemy.orm import DeclarativeBase

        from app.database import Base

        assert hasattr(Base, "metadata")
        assert issubclass(Base, DeclarativeBase)

    def test_engine_exists(self):
        """Async engine should be created."""
        from app.database import engine

        assert engine is not None

    def test_session_factory_exists(self):
        """Async session factory should be created."""
        from app.database import async_session_factory

        assert async_session_factory is not None

    def test_get_db_is_async_generator(self):
        """get_db should be an async generator function."""
        import inspect

        from app.database import get_db

        assert inspect.isasyncgenfunction(get_db)


class TestFastAPIApp:
    """Test FastAPI application setup."""

    def test_app_instance_exists(self):
        """FastAPI app should be importable and configured."""
        from app.main import app

        assert app is not None
        assert app.title == "LabNote AI"
        assert app.version == "0.1.0"

    @pytest.mark.asyncio
    async def test_health_check_endpoint(self):
        """GET /api/health should return status ok."""
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data == {"status": "ok"}

    @pytest.mark.asyncio
    async def test_cors_allows_localhost_3000(self):
        """CORS should allow requests from http://localhost:3000."""
        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.options(
                "/api/health",
                headers={
                    "Origin": "http://localhost:3000",
                    "Access-Control-Request-Method": "GET",
                },
            )

        # CORS preflight should succeed
        assert response.status_code == 200
        assert "http://localhost:3000" in response.headers.get("access-control-allow-origin", "")


class TestAlembicConfig:
    """Test Alembic configuration structure."""

    def test_alembic_ini_exists(self):
        """alembic.ini should exist in the backend directory."""
        import os

        ini_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini")
        assert os.path.isfile(ini_path), f"alembic.ini not found at {ini_path}"

    def test_alembic_env_exists(self):
        """alembic/env.py should exist."""
        import os

        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic", "env.py")
        assert os.path.isfile(env_path), f"alembic/env.py not found at {env_path}"

    def test_alembic_versions_dir_exists(self):
        """alembic/versions/ directory should exist."""
        import os

        versions_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic", "versions")
        assert os.path.isdir(versions_path), f"alembic/versions/ not found at {versions_path}"

    def test_alembic_script_mako_exists(self):
        """alembic/script.py.mako template should exist."""
        import os

        mako_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic", "script.py.mako")
        assert os.path.isfile(mako_path), f"script.py.mako not found at {mako_path}"
