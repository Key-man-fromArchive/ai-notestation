# @TASK Unified Permission Resolution Service
# @SPEC Tests for notebook access control

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import NotePermission
from app.models import Note, NoteAccess, Notebook, NotebookAccess, Organization, User
from app.services import notebook_access_control


@pytest.fixture
async def test_user(async_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        password_hash="hashed",
        name="Test User",
    )
    async_session.add(user)
    await async_session.flush()
    return user


@pytest.fixture
async def other_user(async_session: AsyncSession) -> User:
    """Create another test user."""
    user = User(
        email="other@example.com",
        password_hash="hashed",
        name="Other User",
    )
    async_session.add(user)
    await async_session.flush()
    return user


@pytest.fixture
async def test_org(async_session: AsyncSession) -> Organization:
    """Create a test organization."""
    org = Organization(
        name="Test Org",
        slug="test-org",
    )
    async_session.add(org)
    await async_session.flush()
    return org


@pytest.fixture
async def test_notebook(async_session: AsyncSession, test_user: User, test_org: Organization) -> Notebook:
    """Create a test notebook."""
    notebook = Notebook(
        name="Test Notebook",
        description="A test notebook",
        owner_id=test_user.id,
        org_id=test_org.id,
    )
    async_session.add(notebook)
    await async_session.flush()
    return notebook


@pytest.fixture
async def test_note(async_session: AsyncSession, test_notebook: Notebook) -> Note:
    """Create a test note in the notebook."""
    note = Note(
        synology_note_id="test-note-1",
        title="Test Note",
        content_text="Test content",
        notebook_id=test_notebook.id,
    )
    async_session.add(note)
    await async_session.flush()
    return note


class TestCheckNotebookAccess:
    """Test check_notebook_access function."""

    async def test_user_with_read_permission(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """User with read permission can access notebook."""
        # Grant read access
        access = NotebookAccess(
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        async_session.add(access)
        await async_session.flush()

        # Check read access
        has_access = await notebook_access_control.check_notebook_access(
            async_session, test_user.id, test_notebook.id, NotePermission.READ
        )
        assert has_access is True

    async def test_user_with_write_can_read(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """User with write permission can read (permission hierarchy)."""
        # Grant write access
        access = NotebookAccess(
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            permission=NotePermission.WRITE,
            granted_by=test_user.id,
        )
        async_session.add(access)
        await async_session.flush()

        # Check read access (write > read)
        has_access = await notebook_access_control.check_notebook_access(
            async_session, test_user.id, test_notebook.id, NotePermission.READ
        )
        assert has_access is True

    async def test_user_with_read_cannot_write(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """User with read permission cannot write."""
        # Grant read access
        access = NotebookAccess(
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        async_session.add(access)
        await async_session.flush()

        # Check write access
        has_access = await notebook_access_control.check_notebook_access(
            async_session, test_user.id, test_notebook.id, NotePermission.WRITE
        )
        assert has_access is False

    async def test_user_without_access(self, async_session: AsyncSession, test_user: User, test_notebook: Notebook):
        """User without access cannot access notebook."""
        has_access = await notebook_access_control.check_notebook_access(
            async_session, test_user.id, test_notebook.id, NotePermission.READ
        )
        assert has_access is False

    async def test_org_level_access(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook, test_org: Organization
    ):
        """User can access via org-level permission."""
        # Grant org-level access
        access = NotebookAccess(
            notebook_id=test_notebook.id,
            org_id=test_org.id,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        async_session.add(access)
        await async_session.flush()

        # Check access (user must be in org)
        from app.models import Membership

        membership = Membership(
            user_id=test_user.id,
            org_id=test_org.id,
            role="member",
            accepted_at=await async_session.scalar(select(func.now())),
        )
        async_session.add(membership)
        await async_session.flush()

        has_access = await notebook_access_control.check_notebook_access(
            async_session, test_user.id, test_notebook.id, NotePermission.READ
        )
        assert has_access is True


class TestGetEffectiveNotePermission:
    """Test get_effective_note_permission function."""

    async def test_note_level_override_restricts(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook, test_note: Note
    ):
        """Note-level permission overrides notebook permission (restrictive)."""
        # Notebook has WRITE access
        notebook_access = NotebookAccess(
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            permission=NotePermission.WRITE,
            granted_by=test_user.id,
        )
        async_session.add(notebook_access)

        # Note has READ access (more restrictive)
        note_access = NoteAccess(
            note_id=test_note.id,
            user_id=test_user.id,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        async_session.add(note_access)
        await async_session.flush()

        # Effective permission should be READ (note wins)
        permission = await notebook_access_control.get_effective_note_permission(
            async_session, test_user.id, test_note.id
        )
        assert permission == NotePermission.READ

    async def test_note_level_override_expands(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook, test_note: Note
    ):
        """Note-level permission overrides notebook permission (expansive)."""
        # Notebook has READ access
        notebook_access = NotebookAccess(
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        async_session.add(notebook_access)

        # Note has ADMIN access (more permissive)
        note_access = NoteAccess(
            note_id=test_note.id,
            user_id=test_user.id,
            permission=NotePermission.ADMIN,
            granted_by=test_user.id,
        )
        async_session.add(note_access)
        await async_session.flush()

        # Effective permission should be ADMIN (note wins)
        permission = await notebook_access_control.get_effective_note_permission(
            async_session, test_user.id, test_note.id
        )
        assert permission == NotePermission.ADMIN

    async def test_fallback_to_notebook(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook, test_note: Note
    ):
        """Falls back to notebook permission when no note-level access."""
        # Only notebook has access
        notebook_access = NotebookAccess(
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            permission=NotePermission.WRITE,
            granted_by=test_user.id,
        )
        async_session.add(notebook_access)
        await async_session.flush()

        # Effective permission should be WRITE from notebook
        permission = await notebook_access_control.get_effective_note_permission(
            async_session, test_user.id, test_note.id
        )
        assert permission == NotePermission.WRITE

    async def test_no_access_returns_none(self, async_session: AsyncSession, test_user: User, test_note: Note):
        """Returns None when user has no access at all."""
        permission = await notebook_access_control.get_effective_note_permission(
            async_session, test_user.id, test_note.id
        )
        assert permission is None

    async def test_org_level_notebook_access(
        self,
        async_session: AsyncSession,
        test_user: User,
        test_notebook: Notebook,
        test_note: Note,
        test_org: Organization,
    ):
        """Falls back to org-level notebook permission."""
        # Org-level notebook access
        notebook_access = NotebookAccess(
            notebook_id=test_notebook.id,
            org_id=test_org.id,
            permission=NotePermission.WRITE,
            granted_by=test_user.id,
        )
        async_session.add(notebook_access)

        # User is member of org
        from sqlalchemy import func

        from app.models import Membership

        membership = Membership(
            user_id=test_user.id,
            org_id=test_org.id,
            role="member",
            accepted_at=await async_session.scalar(select(func.now())),
        )
        async_session.add(membership)
        await async_session.flush()

        # Effective permission should be WRITE from org-level notebook access
        permission = await notebook_access_control.get_effective_note_permission(
            async_session, test_user.id, test_note.id
        )
        assert permission == NotePermission.WRITE


class TestGetAccessibleNotebooks:
    """Test get_accessible_notebooks function."""

    async def test_returns_accessible_notebooks(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook
    ):
        """Returns list of notebook IDs user can access."""
        # Grant access
        access = NotebookAccess(
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        async_session.add(access)
        await async_session.flush()

        notebook_ids = await notebook_access_control.get_accessible_notebooks(
            async_session, test_user.id, NotePermission.READ
        )
        assert test_notebook.id in notebook_ids

    async def test_filters_by_permission_level(
        self, async_session: AsyncSession, test_user: User, test_org: Organization
    ):
        """Filters notebooks by minimum permission level."""
        # Create two notebooks
        nb1 = Notebook(name="NB1", owner_id=test_user.id, org_id=test_org.id)
        nb2 = Notebook(name="NB2", owner_id=test_user.id, org_id=test_org.id)
        async_session.add_all([nb1, nb2])
        await async_session.flush()

        # Grant READ to nb1, WRITE to nb2
        access1 = NotebookAccess(
            notebook_id=nb1.id,
            user_id=test_user.id,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        access2 = NotebookAccess(
            notebook_id=nb2.id,
            user_id=test_user.id,
            permission=NotePermission.WRITE,
            granted_by=test_user.id,
        )
        async_session.add_all([access1, access2])
        await async_session.flush()

        # Query for WRITE permission
        notebook_ids = await notebook_access_control.get_accessible_notebooks(
            async_session, test_user.id, NotePermission.WRITE
        )
        assert nb1.id not in notebook_ids  # Only has READ
        assert nb2.id in notebook_ids  # Has WRITE

    async def test_empty_list_when_no_access(self, async_session: AsyncSession, test_user: User):
        """Returns empty list when user has no access."""
        notebook_ids = await notebook_access_control.get_accessible_notebooks(
            async_session, test_user.id, NotePermission.READ
        )
        assert notebook_ids == []


class TestGrantNotebookAccess:
    """Test grant_notebook_access function."""

    async def test_grant_user_access(self, async_session: AsyncSession, test_user: User, test_notebook: Notebook):
        """Grants notebook access to a user."""
        access = await notebook_access_control.grant_notebook_access(
            async_session,
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            org_id=None,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )

        assert access.notebook_id == test_notebook.id
        assert access.user_id == test_user.id
        assert access.permission == NotePermission.READ

    async def test_grant_org_access(
        self, async_session: AsyncSession, test_user: User, test_notebook: Notebook, test_org: Organization
    ):
        """Grants notebook access to an organization."""
        access = await notebook_access_control.grant_notebook_access(
            async_session,
            notebook_id=test_notebook.id,
            user_id=None,
            org_id=test_org.id,
            permission=NotePermission.WRITE,
            granted_by=test_user.id,
        )

        assert access.notebook_id == test_notebook.id
        assert access.org_id == test_org.id
        assert access.permission == NotePermission.WRITE

    async def test_updates_existing_access(self, async_session: AsyncSession, test_user: User, test_notebook: Notebook):
        """Updates permission if access already exists."""
        # Initial grant
        access1 = await notebook_access_control.grant_notebook_access(
            async_session,
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            org_id=None,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        access1_id = access1.id

        # Update grant
        access2 = await notebook_access_control.grant_notebook_access(
            async_session,
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            org_id=None,
            permission=NotePermission.ADMIN,
            granted_by=test_user.id,
        )

        # Should be same record, updated
        assert access2.id == access1_id
        assert access2.permission == NotePermission.ADMIN

    async def test_requires_user_or_org(self, async_session: AsyncSession, test_notebook: Notebook, test_user: User):
        """Raises error if neither user_id nor org_id provided."""
        with pytest.raises(ValueError, match="Either user_id or org_id must be provided"):
            await notebook_access_control.grant_notebook_access(
                async_session,
                notebook_id=test_notebook.id,
                user_id=None,
                org_id=None,
                permission=NotePermission.READ,
                granted_by=test_user.id,
            )


class TestRevokeNotebookAccess:
    """Test revoke_notebook_access function."""

    async def test_revoke_existing_access(self, async_session: AsyncSession, test_user: User, test_notebook: Notebook):
        """Revokes existing notebook access."""
        # Grant access
        access = NotebookAccess(
            notebook_id=test_notebook.id,
            user_id=test_user.id,
            permission=NotePermission.READ,
            granted_by=test_user.id,
        )
        async_session.add(access)
        await async_session.flush()
        access_id = access.id

        # Revoke
        revoked = await notebook_access_control.revoke_notebook_access(async_session, access_id)
        assert revoked is True

        # Verify deleted
        result = await async_session.execute(select(NotebookAccess).where(NotebookAccess.id == access_id))
        assert result.scalar_one_or_none() is None

    async def test_revoke_nonexistent_access(self, async_session: AsyncSession):
        """Returns False when access doesn't exist."""
        revoked = await notebook_access_control.revoke_notebook_access(async_session, 99999)
        assert revoked is False
