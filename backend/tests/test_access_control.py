# @TASK P6-T6.3 - Access Control Service tests
# @SPEC docs/plans/phase6-member-auth.md
# @TEST tests/test_access_control.py

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.constants import MemberRole, NotePermission
from app.services.access_control import (
    PERMISSION_HIERARCHY,
    check_note_access,
    get_accessible_note_ids,
    get_user_org_ids,
    grant_note_access,
    permission_satisfies,
    revoke_note_access,
)


class TestPermissionSatisfies:
    def test_read_satisfies_read(self):
        assert permission_satisfies(NotePermission.READ, NotePermission.READ) is True

    def test_write_satisfies_read(self):
        assert permission_satisfies(NotePermission.WRITE, NotePermission.READ) is True

    def test_admin_satisfies_read(self):
        assert permission_satisfies(NotePermission.ADMIN, NotePermission.READ) is True

    def test_read_does_not_satisfy_write(self):
        assert permission_satisfies(NotePermission.READ, NotePermission.WRITE) is False

    def test_write_satisfies_write(self):
        assert permission_satisfies(NotePermission.WRITE, NotePermission.WRITE) is True

    def test_admin_satisfies_write(self):
        assert permission_satisfies(NotePermission.ADMIN, NotePermission.WRITE) is True

    def test_read_does_not_satisfy_admin(self):
        assert permission_satisfies(NotePermission.READ, NotePermission.ADMIN) is False

    def test_write_does_not_satisfy_admin(self):
        assert permission_satisfies(NotePermission.WRITE, NotePermission.ADMIN) is False

    def test_admin_satisfies_admin(self):
        assert permission_satisfies(NotePermission.ADMIN, NotePermission.ADMIN) is True

    def test_unknown_permission_defaults_to_zero(self):
        assert permission_satisfies("unknown", NotePermission.READ) is False
        assert permission_satisfies(NotePermission.READ, "unknown") is True


class TestPermissionHierarchy:
    def test_hierarchy_order(self):
        assert PERMISSION_HIERARCHY[NotePermission.READ] < PERMISSION_HIERARCHY[NotePermission.WRITE]
        assert PERMISSION_HIERARCHY[NotePermission.WRITE] < PERMISSION_HIERARCHY[NotePermission.ADMIN]


class TestGetUserOrgIds:
    @pytest.mark.asyncio
    async def test_returns_org_ids_for_accepted_memberships(self):
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = [(1,), (2,), (3,)]
        mock_db.execute.return_value = mock_result

        org_ids = await get_user_org_ids(mock_db, user_id=1)

        assert org_ids == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_memberships(self):
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.all.return_value = []
        mock_db.execute.return_value = mock_result

        org_ids = await get_user_org_ids(mock_db, user_id=1)

        assert org_ids == []


class TestCheckNoteAccess:
    @pytest.mark.asyncio
    async def test_user_has_direct_read_access(self):
        mock_db = AsyncMock()

        mock_org_result = MagicMock()
        mock_org_result.all.return_value = []

        mock_access = MagicMock()
        mock_access.permission = NotePermission.READ

        mock_access_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_access]
        mock_access_result.scalars.return_value = mock_scalars

        mock_db.execute.side_effect = [mock_org_result, mock_access_result]

        has_access = await check_note_access(mock_db, user_id=1, note_id=100, required_permission=NotePermission.READ)

        assert has_access is True

    @pytest.mark.asyncio
    async def test_user_has_write_access_satisfies_read(self):
        mock_db = AsyncMock()

        mock_org_result = MagicMock()
        mock_org_result.all.return_value = []

        mock_access = MagicMock()
        mock_access.permission = NotePermission.WRITE

        mock_access_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_access]
        mock_access_result.scalars.return_value = mock_scalars

        mock_db.execute.side_effect = [mock_org_result, mock_access_result]

        has_access = await check_note_access(mock_db, user_id=1, note_id=100, required_permission=NotePermission.READ)

        assert has_access is True

    @pytest.mark.asyncio
    async def test_user_has_no_access(self):
        mock_db = AsyncMock()

        mock_org_result = MagicMock()
        mock_org_result.all.return_value = []

        mock_access_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_access_result.scalars.return_value = mock_scalars

        mock_db.execute.side_effect = [mock_org_result, mock_access_result]

        has_access = await check_note_access(mock_db, user_id=1, note_id=100, required_permission=NotePermission.READ)

        assert has_access is False

    @pytest.mark.asyncio
    async def test_user_read_access_does_not_satisfy_write(self):
        mock_db = AsyncMock()

        mock_org_result = MagicMock()
        mock_org_result.all.return_value = []

        mock_access = MagicMock()
        mock_access.permission = NotePermission.READ

        mock_access_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_access]
        mock_access_result.scalars.return_value = mock_scalars

        mock_db.execute.side_effect = [mock_org_result, mock_access_result]

        has_access = await check_note_access(mock_db, user_id=1, note_id=100, required_permission=NotePermission.WRITE)

        assert has_access is False


class TestGetAccessibleNoteIds:
    @pytest.mark.asyncio
    async def test_returns_accessible_note_ids(self):
        mock_db = AsyncMock()

        mock_org_result = MagicMock()
        mock_org_result.all.return_value = [(1,)]

        mock_access1 = MagicMock()
        mock_access1.note_id = 100
        mock_access1.permission = NotePermission.READ

        mock_access2 = MagicMock()
        mock_access2.note_id = 200
        mock_access2.permission = NotePermission.WRITE

        mock_access_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_access1, mock_access2]
        mock_access_result.scalars.return_value = mock_scalars

        mock_db.execute.side_effect = [mock_org_result, mock_access_result]

        note_ids = await get_accessible_note_ids(mock_db, user_id=1)

        assert set(note_ids) == {100, 200}

    @pytest.mark.asyncio
    async def test_filters_by_min_permission(self):
        mock_db = AsyncMock()

        mock_org_result = MagicMock()
        mock_org_result.all.return_value = []

        mock_access1 = MagicMock()
        mock_access1.note_id = 100
        mock_access1.permission = NotePermission.READ

        mock_access2 = MagicMock()
        mock_access2.note_id = 200
        mock_access2.permission = NotePermission.WRITE

        mock_access_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_access1, mock_access2]
        mock_access_result.scalars.return_value = mock_scalars

        mock_db.execute.side_effect = [mock_org_result, mock_access_result]

        note_ids = await get_accessible_note_ids(mock_db, user_id=1, min_permission=NotePermission.WRITE)

        assert note_ids == [200]


class TestGrantNoteAccess:
    @pytest.mark.asyncio
    async def test_creates_new_access_for_user(self):
        mock_db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        access = await grant_note_access(
            mock_db,
            note_id=100,
            granted_by=1,
            permission=NotePermission.WRITE,
            user_id=2,
        )

        assert access.note_id == 100
        assert access.user_id == 2
        assert access.permission == NotePermission.WRITE
        assert access.granted_by == 1
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_creates_new_access_for_org(self):
        mock_db = AsyncMock()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        mock_db.add = MagicMock()
        mock_db.flush = AsyncMock()

        access = await grant_note_access(
            mock_db,
            note_id=100,
            granted_by=1,
            permission=NotePermission.READ,
            org_id=5,
        )

        assert access.note_id == 100
        assert access.org_id == 5
        assert access.permission == NotePermission.READ
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_updates_existing_access(self):
        mock_db = AsyncMock()

        existing_access = MagicMock()
        existing_access.permission = NotePermission.READ

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_access
        mock_db.execute.return_value = mock_result
        mock_db.flush = AsyncMock()

        access = await grant_note_access(
            mock_db,
            note_id=100,
            granted_by=1,
            permission=NotePermission.ADMIN,
            user_id=2,
        )

        assert access.permission == NotePermission.ADMIN
        assert access.granted_by == 1

    @pytest.mark.asyncio
    async def test_raises_when_no_user_or_org(self):
        mock_db = AsyncMock()

        with pytest.raises(ValueError, match="Either user_id or org_id must be provided"):
            await grant_note_access(mock_db, note_id=100, granted_by=1)

    @pytest.mark.asyncio
    async def test_raises_when_both_user_and_org(self):
        mock_db = AsyncMock()

        with pytest.raises(ValueError, match="Only one of user_id or org_id"):
            await grant_note_access(mock_db, note_id=100, granted_by=1, user_id=1, org_id=1)


class TestRevokeNoteAccess:
    @pytest.mark.asyncio
    async def test_revokes_user_access(self):
        mock_db = AsyncMock()
        mock_access = MagicMock()

        mock_check_result = MagicMock()
        mock_check_result.scalar_one_or_none.return_value = mock_access

        mock_delete_result = MagicMock()

        mock_db.execute.side_effect = [mock_check_result, mock_delete_result]

        revoked = await revoke_note_access(mock_db, note_id=100, user_id=2)

        assert revoked is True

    @pytest.mark.asyncio
    async def test_revokes_org_access(self):
        mock_db = AsyncMock()
        mock_access = MagicMock()

        mock_check_result = MagicMock()
        mock_check_result.scalar_one_or_none.return_value = mock_access

        mock_delete_result = MagicMock()

        mock_db.execute.side_effect = [mock_check_result, mock_delete_result]

        revoked = await revoke_note_access(mock_db, note_id=100, org_id=5)

        assert revoked is True

    @pytest.mark.asyncio
    async def test_returns_false_when_nothing_revoked(self):
        mock_db = AsyncMock()

        mock_check_result = MagicMock()
        mock_check_result.scalar_one_or_none.return_value = None

        mock_db.execute.return_value = mock_check_result

        revoked = await revoke_note_access(mock_db, note_id=100, user_id=2)

        assert revoked is False

    @pytest.mark.asyncio
    async def test_raises_when_no_user_or_org(self):
        mock_db = AsyncMock()

        with pytest.raises(ValueError, match="Either user_id or org_id must be provided"):
            await revoke_note_access(mock_db, note_id=100)
