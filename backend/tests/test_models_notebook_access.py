# @TASK Create NotebookAccess Model and Migration
# @SPEC Test NotebookAccess model structure and constraints

"""Tests for the NotebookAccess model.

Covers:
- Model structure and fields
- Check constraint: exactly one of user_id or org_id must be set
- Unique constraint on (notebook_id, user_id) when user_id is not null
- Unique constraint on (notebook_id, org_id) when org_id is not null
- Permission values (read, write, admin)
- Timestamp fields (created_at)
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError


@pytest.mark.asyncio
async def test_notebook_access_user_permission(async_session):
    """Test creating NotebookAccess with user_id."""
    from app.models import NotebookAccess

    access = NotebookAccess(
        notebook_id=1,
        user_id=2,
        permission="read",
        granted_by=1,
    )

    async_session.add(access)
    await async_session.commit()
    await async_session.refresh(access)

    assert access.id is not None
    assert access.notebook_id == 1
    assert access.user_id == 2
    assert access.org_id is None
    assert access.permission == "read"
    assert access.granted_by == 1
    assert access.created_at is not None


@pytest.mark.asyncio
async def test_notebook_access_org_permission(async_session):
    """Test creating NotebookAccess with org_id."""
    from app.models import NotebookAccess

    access = NotebookAccess(
        notebook_id=1,
        org_id=5,
        permission="write",
        granted_by=1,
    )

    async_session.add(access)
    await async_session.commit()
    await async_session.refresh(access)

    assert access.id is not None
    assert access.notebook_id == 1
    assert access.user_id is None
    assert access.org_id == 5
    assert access.permission == "write"
    assert access.granted_by == 1
    assert access.created_at is not None


@pytest.mark.asyncio
async def test_notebook_access_admin_permission(async_session):
    """Test creating NotebookAccess with admin permission."""
    from app.models import NotebookAccess

    access = NotebookAccess(
        notebook_id=1,
        user_id=3,
        permission="admin",
        granted_by=1,
    )

    async_session.add(access)
    await async_session.commit()
    await async_session.refresh(access)

    assert access.permission == "admin"


@pytest.mark.asyncio
async def test_notebook_access_check_constraint_both_null(async_session):
    """Test check constraint: both user_id and org_id cannot be null."""
    from app.models import NotebookAccess

    access = NotebookAccess(
        notebook_id=1,
        user_id=None,
        org_id=None,
        permission="read",
        granted_by=1,
    )

    async_session.add(access)

    with pytest.raises(IntegrityError):
        await async_session.commit()

    await async_session.rollback()


@pytest.mark.asyncio
async def test_notebook_access_check_constraint_both_set(async_session):
    """Test check constraint: both user_id and org_id cannot be set."""
    from app.models import NotebookAccess

    access = NotebookAccess(
        notebook_id=1,
        user_id=2,
        org_id=5,
        permission="read",
        granted_by=1,
    )

    async_session.add(access)

    with pytest.raises(IntegrityError):
        await async_session.commit()

    await async_session.rollback()


@pytest.mark.asyncio
async def test_notebook_access_unique_constraint_user(async_session):
    """Test unique constraint on (notebook_id, user_id)."""
    from app.models import NotebookAccess

    # First access
    access1 = NotebookAccess(
        notebook_id=1,
        user_id=2,
        permission="read",
        granted_by=1,
    )
    async_session.add(access1)
    await async_session.commit()

    # Same notebook, same user - should fail
    access2 = NotebookAccess(
        notebook_id=1,
        user_id=2,
        permission="write",
        granted_by=1,
    )
    async_session.add(access2)

    with pytest.raises(IntegrityError):
        await async_session.commit()

    await async_session.rollback()


@pytest.mark.asyncio
async def test_notebook_access_unique_constraint_org(async_session):
    """Test unique constraint on (notebook_id, org_id)."""
    from app.models import NotebookAccess

    # First access
    access1 = NotebookAccess(
        notebook_id=1,
        org_id=5,
        permission="read",
        granted_by=1,
    )
    async_session.add(access1)
    await async_session.commit()

    # Same notebook, same org - should fail
    access2 = NotebookAccess(
        notebook_id=1,
        org_id=5,
        permission="write",
        granted_by=1,
    )
    async_session.add(access2)

    with pytest.raises(IntegrityError):
        await async_session.commit()

    await async_session.rollback()


@pytest.mark.asyncio
async def test_notebook_access_different_notebooks(async_session):
    """Test same user can have access to different notebooks."""
    from app.models import NotebookAccess

    access1 = NotebookAccess(
        notebook_id=1,
        user_id=2,
        permission="read",
        granted_by=1,
    )
    access2 = NotebookAccess(
        notebook_id=2,
        user_id=2,
        permission="write",
        granted_by=1,
    )

    async_session.add_all([access1, access2])
    await async_session.commit()

    result = await async_session.execute(select(NotebookAccess).order_by(NotebookAccess.notebook_id))
    accesses = result.scalars().all()

    assert len(accesses) == 2
    assert accesses[0].notebook_id == 1
    assert accesses[1].notebook_id == 2
    assert accesses[0].user_id == 2
    assert accesses[1].user_id == 2


@pytest.mark.asyncio
async def test_notebook_access_different_users(async_session):
    """Test different users can have access to same notebook."""
    from app.models import NotebookAccess

    access1 = NotebookAccess(
        notebook_id=1,
        user_id=2,
        permission="read",
        granted_by=1,
    )
    access2 = NotebookAccess(
        notebook_id=1,
        user_id=3,
        permission="write",
        granted_by=1,
    )

    async_session.add_all([access1, access2])
    await async_session.commit()

    result = await async_session.execute(select(NotebookAccess).order_by(NotebookAccess.user_id))
    accesses = result.scalars().all()

    assert len(accesses) == 2
    assert accesses[0].user_id == 2
    assert accesses[1].user_id == 3
    assert accesses[0].notebook_id == 1
    assert accesses[1].notebook_id == 1


@pytest.mark.asyncio
async def test_notebook_access_user_and_org_separate(async_session):
    """Test user and org access are independent (no unique constraint between them)."""
    from app.models import NotebookAccess

    # User access
    access1 = NotebookAccess(
        notebook_id=1,
        user_id=2,
        permission="read",
        granted_by=1,
    )
    # Org access for same notebook
    access2 = NotebookAccess(
        notebook_id=1,
        org_id=5,
        permission="write",
        granted_by=1,
    )

    async_session.add_all([access1, access2])
    await async_session.commit()

    result = await async_session.execute(select(NotebookAccess).order_by(NotebookAccess.id))
    accesses = result.scalars().all()

    assert len(accesses) == 2
    assert accesses[0].user_id == 2
    assert accesses[0].org_id is None
    assert accesses[1].user_id is None
    assert accesses[1].org_id == 5


@pytest.mark.asyncio
async def test_notebook_access_created_at_timestamp(async_session):
    """Test created_at timestamp is set automatically."""
    from app.models import NotebookAccess

    access = NotebookAccess(
        notebook_id=1,
        user_id=2,
        permission="read",
        granted_by=1,
    )

    async_session.add(access)
    await async_session.commit()
    await async_session.refresh(access)

    assert access.created_at is not None
    assert isinstance(access.created_at, datetime)
