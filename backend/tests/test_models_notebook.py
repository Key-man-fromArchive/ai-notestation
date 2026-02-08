# @TASK Create Notebook Model and Migration
# @SPEC Test Notebook model structure and constraints

"""Tests for the Notebook model.

Covers:
- Model structure and fields
- Unique constraint on (org_id, name)
- Nullable fields (owner_id, org_id, description)
- Default values (is_public, public_links_enabled)
- Timestamp fields (created_at, updated_at)
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError


@pytest.mark.asyncio
async def test_notebook_model_creation(async_session):
    """Test creating a Notebook with all fields."""
    from app.models import Notebook

    notebook = Notebook(
        name="Research Notes",
        description="My research notebook",
        owner_id=1,
        org_id=1,
        is_public=False,
        public_links_enabled=False,
    )

    async_session.add(notebook)
    await async_session.commit()
    await async_session.refresh(notebook)

    assert notebook.id is not None
    assert notebook.name == "Research Notes"
    assert notebook.description == "My research notebook"
    assert notebook.owner_id == 1
    assert notebook.org_id == 1
    assert notebook.is_public is False
    assert notebook.public_links_enabled is False
    assert notebook.created_at is not None
    assert notebook.updated_at is not None


@pytest.mark.asyncio
async def test_notebook_minimal_fields(async_session):
    """Test creating a Notebook with minimal required fields."""
    from app.models import Notebook

    notebook = Notebook(name="System Notebook")

    async_session.add(notebook)
    await async_session.commit()
    await async_session.refresh(notebook)

    assert notebook.id is not None
    assert notebook.name == "System Notebook"
    assert notebook.description is None
    assert notebook.owner_id is None
    assert notebook.org_id is None
    assert notebook.is_public is False
    assert notebook.public_links_enabled is False
    assert notebook.created_at is not None
    assert notebook.updated_at is not None


@pytest.mark.asyncio
async def test_notebook_unique_constraint_org_name(async_session):
    """Test unique constraint on (org_id, name)."""
    from app.models import Notebook

    # First notebook
    notebook1 = Notebook(name="Project Notes", org_id=1)
    async_session.add(notebook1)
    await async_session.commit()

    # Same name, same org - should fail
    notebook2 = Notebook(name="Project Notes", org_id=1)
    async_session.add(notebook2)

    with pytest.raises(IntegrityError):
        await async_session.commit()

    await async_session.rollback()


@pytest.mark.asyncio
async def test_notebook_unique_constraint_different_org(async_session):
    """Test same name is allowed in different orgs."""
    from app.models import Notebook

    # Same name, different orgs - should succeed
    notebook1 = Notebook(name="Project Notes", org_id=1)
    notebook2 = Notebook(name="Project Notes", org_id=2)

    async_session.add(notebook1)
    async_session.add(notebook2)
    await async_session.commit()

    result = await async_session.execute(select(Notebook))
    notebooks = result.scalars().all()

    assert len(notebooks) == 2
    assert notebooks[0].name == "Project Notes"
    assert notebooks[1].name == "Project Notes"
    assert notebooks[0].org_id != notebooks[1].org_id


@pytest.mark.asyncio
async def test_notebook_unique_constraint_null_org(async_session):
    """Test same name is allowed with NULL org_id (system notebooks)."""
    from app.models import Notebook

    # Multiple notebooks with same name but NULL org_id - should succeed
    # (NULL != NULL in SQL, so unique constraint doesn't apply)
    notebook1 = Notebook(name="Uncategorized", org_id=None)
    notebook2 = Notebook(name="Uncategorized", org_id=None)

    async_session.add(notebook1)
    async_session.add(notebook2)

    # This should succeed because NULL values don't trigger unique constraint
    await async_session.commit()

    result = await async_session.execute(select(Notebook).where(Notebook.name == "Uncategorized"))
    notebooks = result.scalars().all()

    assert len(notebooks) == 2


@pytest.mark.asyncio
async def test_notebook_public_flags(async_session):
    """Test public and public_links_enabled flags."""
    from app.models import Notebook

    # Public notebook with links enabled
    notebook1 = Notebook(
        name="Public Notes",
        is_public=True,
        public_links_enabled=True,
    )

    # Private notebook with links disabled
    notebook2 = Notebook(
        name="Private Notes",
        is_public=False,
        public_links_enabled=False,
    )

    async_session.add_all([notebook1, notebook2])
    await async_session.commit()

    result = await async_session.execute(select(Notebook).order_by(Notebook.name))
    notebooks = result.scalars().all()

    assert len(notebooks) == 2
    assert notebooks[1].is_public is True
    assert notebooks[1].public_links_enabled is True
    assert notebooks[0].is_public is False
    assert notebooks[0].public_links_enabled is False


@pytest.mark.asyncio
async def test_notebook_timestamps(async_session):
    """Test created_at and updated_at timestamps."""
    from app.models import Notebook

    notebook = Notebook(name="Test Notebook")
    async_session.add(notebook)
    await async_session.commit()
    await async_session.refresh(notebook)

    created_at = notebook.created_at
    updated_at = notebook.updated_at

    assert created_at is not None
    assert updated_at is not None
    assert created_at == updated_at

    notebook.description = "Updated description"
    await async_session.commit()
    await async_session.refresh(notebook)

    assert notebook.created_at == created_at
    assert notebook.updated_at >= updated_at
