# @TASK P4-T4.1 - JWT 인증 서비스 테스트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#authentication
# @TEST tests/test_auth_service.py

"""Tests for the JWT authentication service and auth API endpoints.

Covers:
- JWT token creation / verification
- Expired & invalid token rejection
- get_current_user dependency
- /api/auth/login, /api/auth/token/refresh, /api/auth/me endpoints
"""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from jose import JWTError

# ---------------------------------------------------------------------------
# Auth Service unit tests
# ---------------------------------------------------------------------------


class TestCreateAccessToken:
    """Test create_access_token function."""

    def test_returns_string(self):
        """create_access_token should return a non-empty JWT string."""
        from app.services.auth_service import create_access_token

        token = create_access_token(data={"sub": "testuser"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_contains_subject(self):
        """The decoded token should contain the subject claim."""
        from app.services.auth_service import create_access_token, verify_token

        token = create_access_token(data={"sub": "alice"})
        payload = verify_token(token)
        assert payload["sub"] == "alice"

    def test_custom_expiry(self):
        """create_access_token should accept a custom expires_delta."""
        from app.services.auth_service import create_access_token, verify_token

        token = create_access_token(
            data={"sub": "bob"},
            expires_delta=timedelta(minutes=5),
        )
        payload = verify_token(token)
        assert payload["sub"] == "bob"
        assert "exp" in payload

    def test_token_has_exp_claim(self):
        """The generated token must always contain an 'exp' claim."""
        from app.services.auth_service import create_access_token, verify_token

        token = create_access_token(data={"sub": "user1"})
        payload = verify_token(token)
        assert "exp" in payload

    def test_token_type_is_access(self):
        """Access tokens should include type='access' claim."""
        from app.services.auth_service import create_access_token, verify_token

        token = create_access_token(data={"sub": "user1"})
        payload = verify_token(token)
        assert payload.get("type") == "access"


class TestCreateRefreshToken:
    """Test create_refresh_token function."""

    def test_returns_string(self):
        """create_refresh_token should return a non-empty JWT string."""
        from app.services.auth_service import create_refresh_token

        token = create_refresh_token(data={"sub": "testuser"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_refresh_token_contains_subject(self):
        """The decoded refresh token should contain the subject claim."""
        from app.services.auth_service import create_refresh_token, verify_token

        token = create_refresh_token(data={"sub": "carol"})
        payload = verify_token(token)
        assert payload["sub"] == "carol"

    def test_refresh_token_type(self):
        """Refresh tokens should include type='refresh' claim."""
        from app.services.auth_service import create_refresh_token, verify_token

        token = create_refresh_token(data={"sub": "user1"})
        payload = verify_token(token)
        assert payload.get("type") == "refresh"


class TestVerifyToken:
    """Test verify_token function."""

    def test_valid_token(self):
        """verify_token should return claims for a valid token."""
        from app.services.auth_service import create_access_token, verify_token

        token = create_access_token(data={"sub": "test"})
        payload = verify_token(token)
        assert payload["sub"] == "test"

    def test_expired_token_raises(self):
        """verify_token should raise JWTError for expired tokens."""
        from app.services.auth_service import create_access_token, verify_token

        token = create_access_token(
            data={"sub": "expired_user"},
            expires_delta=timedelta(seconds=-1),
        )
        with pytest.raises(JWTError):
            verify_token(token)

    def test_invalid_token_raises(self):
        """verify_token should raise JWTError for malformed tokens."""
        from app.services.auth_service import verify_token

        with pytest.raises(JWTError):
            verify_token("not.a.valid.jwt.token")

    def test_tampered_token_raises(self):
        """verify_token should reject tokens with a tampered payload."""
        from app.services.auth_service import create_access_token, verify_token

        token = create_access_token(data={"sub": "real_user"})
        # Tamper with the payload by changing a character
        parts = token.split(".")
        # Modify the payload portion
        tampered_payload = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
        tampered_token = f"{parts[0]}.{tampered_payload}.{parts[2]}"
        with pytest.raises(JWTError):
            verify_token(tampered_token)


class TestGetCurrentUser:
    """Test get_current_user FastAPI dependency."""

    @pytest.mark.asyncio
    async def test_valid_token_returns_username(self):
        """get_current_user should return the username from a valid token."""
        from app.services.auth_service import create_access_token, get_current_user

        token = create_access_token(data={
            "sub": "depuser@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": "owner",
        })
        result = await get_current_user(token=token)
        assert result["username"] == "depuser@example.com"
        assert result["email"] == "depuser@example.com"
        assert result["user_id"] == 1
        assert result["org_id"] == 1
        assert result["role"] == "owner"

    @pytest.mark.asyncio
    async def test_missing_subject_raises(self):
        """get_current_user should raise HTTPException if 'sub' is missing."""
        from fastapi import HTTPException

        from app.services.auth_service import create_access_token, get_current_user

        # Create a token without 'sub' but with other required claims
        token = create_access_token(data={"user_id": 1, "org_id": 1, "role": "admin"})
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token=token)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_user_id_raises(self):
        """get_current_user should raise HTTPException if 'user_id' is missing."""
        from fastapi import HTTPException

        from app.services.auth_service import create_access_token, get_current_user

        # Create a token without 'user_id'
        token = create_access_token(data={"sub": "test@example.com", "org_id": 1, "role": "member"})
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token=token)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_org_id_raises(self):
        """get_current_user should raise HTTPException if 'org_id' is missing."""
        from fastapi import HTTPException

        from app.services.auth_service import create_access_token, get_current_user

        # Create a token without 'org_id'
        token = create_access_token(data={"sub": "test@example.com", "user_id": 1, "role": "member"})
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token=token)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_token_raises_401(self):
        """get_current_user should raise 401 for an invalid token."""
        from fastapi import HTTPException

        from app.services.auth_service import get_current_user

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token="bad-token")
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_token_rejected(self):
        """get_current_user should reject refresh tokens (type != 'access')."""
        from fastapi import HTTPException

        from app.services.auth_service import create_refresh_token, get_current_user

        token = create_refresh_token(data={"sub": "user1"})
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token=token)
        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# Auth API endpoint tests
# ---------------------------------------------------------------------------


def _get_app():
    """Import and return the FastAPI app with auth router included."""
    from app.api.auth import router as auth_router
    from app.main import app

    # Ensure router is included (idempotent check)
    route_paths = [route.path for route in app.routes]
    if "/api/auth/login" not in route_paths:
        app.include_router(auth_router, prefix="/api")
    return app


class TestLoginEndpoint:
    """Test POST /api/auth/login endpoint (member auth)."""

    @pytest.mark.asyncio
    async def test_login_success(self):
        """Successful member auth should return access + refresh tokens with org context."""
        from datetime import UTC, datetime

        app = _get_app()
        transport = ASGITransport(app=app)

        mock_user = AsyncMock()
        mock_user.id = 1
        mock_user.email = "admin@example.com"
        mock_user.name = "Admin User"
        mock_user.is_active = True
        mock_user.password_hash = "hashed"

        mock_membership = AsyncMock()
        mock_membership.org_id = 1
        mock_membership.role = "owner"
        mock_membership.accepted_at = datetime.now(UTC)

        mock_org = AsyncMock()
        mock_org.id = 1
        mock_org.slug = "test-org"

        mock_org_result = AsyncMock()
        mock_org_result.scalar_one = lambda: mock_org

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_org_result)

        with (
            patch("app.api.auth.get_user_by_email", new_callable=AsyncMock, return_value=mock_user),
            patch("app.api.auth.verify_password", return_value=True),
            patch("app.api.auth.get_user_memberships", new_callable=AsyncMock, return_value=[mock_membership]),
        ):
            from app.database import get_db
            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/auth/login",
                    json={"email": "admin@example.com", "password": "secret123"},
                )

            app.dependency_overrides.pop(get_db, None)

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["email"] == "admin@example.com"
        assert data["user_id"] == 1
        assert data["org_id"] == 1
        assert data["role"] == "owner"

    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self):
        """Invalid credentials should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        mock_db = AsyncMock()

        with patch("app.api.auth.get_user_by_email", new_callable=AsyncMock, return_value=None):
            from app.database import get_db
            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/auth/login",
                    json={"email": "admin@example.com", "password": "wrong"},
                )

            app.dependency_overrides.pop(get_db, None)

        assert response.status_code == 401
        data = response.json()
        assert "detail" in data

    @pytest.mark.asyncio
    async def test_login_missing_fields(self):
        """Missing email/password should return 422."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/auth/login",
                json={"email": "admin@example.com"},  # missing password
            )

        assert response.status_code == 422


class TestRefreshEndpoint:
    """Test POST /api/auth/token/refresh endpoint."""

    @pytest.mark.asyncio
    async def test_refresh_success(self):
        """Valid refresh token should return a new access token."""
        from app.services.auth_service import create_refresh_token

        app = _get_app()
        transport = ASGITransport(app=app)

        mock_user = AsyncMock()
        mock_user.id = 1
        mock_user.email = "refreshuser@example.com"
        mock_user.name = "Refresh User"
        mock_user.is_active = True

        mock_membership = AsyncMock()
        mock_membership.role = "owner"
        mock_membership.accepted_at = True

        refresh = create_refresh_token(data={
            "sub": "refreshuser@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": "owner",
        })

        with (
            patch("app.api.auth.get_user_by_id", new_callable=AsyncMock, return_value=mock_user),
            patch("app.api.auth.get_membership", new_callable=AsyncMock, return_value=mock_membership),
        ):
            from app.database import get_db
            mock_db = AsyncMock()
            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/auth/token/refresh",
                    json={"refresh_token": refresh},
                )

            app.dependency_overrides.pop(get_db, None)

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_refresh_with_access_token_rejected(self):
        """An access token should not work as a refresh token."""
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        access = create_access_token(data={
            "sub": "user1@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": "owner",
        })

        from app.database import get_db
        mock_db = AsyncMock()
        app.dependency_overrides[get_db] = lambda: mock_db

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/auth/token/refresh",
                json={"refresh_token": access},
            )

        app.dependency_overrides.pop(get_db, None)

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_with_invalid_token(self):
        """Invalid refresh token should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/auth/token/refresh",
                json={"refresh_token": "garbage-token"},
            )

        assert response.status_code == 401


class TestMeEndpoint:
    """Test GET /api/auth/me endpoint."""

    @pytest.mark.asyncio
    async def test_me_authenticated(self):
        """Authenticated request should return user info."""
        from app.services.auth_service import create_access_token

        app = _get_app()
        transport = ASGITransport(app=app)

        token = create_access_token(data={
            "sub": "meuser@example.com",
            "user_id": 1,
            "org_id": 1,
            "role": "owner",
        })

        mock_user = AsyncMock()
        mock_user.id = 1
        mock_user.email = "meuser@example.com"
        mock_user.name = "Me User"
        mock_user.is_active = True

        mock_org = AsyncMock()
        mock_org.id = 1
        mock_org.slug = "test-org"

        mock_org_result = AsyncMock()
        mock_org_result.scalar_one_or_none = lambda: mock_org

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_org_result)

        with patch("app.api.auth.get_user_by_id", new_callable=AsyncMock, return_value=mock_user):
            from app.database import get_db
            app.dependency_overrides[get_db] = lambda: mock_db

            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get(
                    "/api/auth/me",
                    headers={"Authorization": f"Bearer {token}"},
                )

            app.dependency_overrides.pop(get_db, None)

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "meuser@example.com"
        assert data["user_id"] == 1
        assert data["org_id"] == 1
        assert data["role"] == "owner"

    @pytest.mark.asyncio
    async def test_me_unauthenticated(self):
        """Request without auth header should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/auth/me")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_me_invalid_token(self):
        """Request with invalid token should return 401."""
        app = _get_app()
        transport = ASGITransport(app=app)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/auth/me",
                headers={"Authorization": "Bearer invalid-token-here"},
            )

        assert response.status_code == 401
