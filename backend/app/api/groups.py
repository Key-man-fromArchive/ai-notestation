# @TASK P6-T6.3 - Group Management API
# @SPEC docs/plans/phase6-member-auth.md

"""Group management API for member groups, memberships, and notebook access.

Provides:
- ``POST /groups``                                -- Create group (OWNER/ADMIN)
- ``GET  /groups``                                -- List org groups
- ``GET  /groups/{id}``                           -- Get group detail
- ``PUT  /groups/{id}``                           -- Update group (OWNER/ADMIN)
- ``DELETE /groups/{id}``                         -- Delete group (OWNER/ADMIN)
- ``GET  /groups/{id}/members``                   -- List group members
- ``POST /groups/{id}/members``                   -- Add members (OWNER/ADMIN)
- ``DELETE /groups/{id}/members``                 -- Remove members (OWNER/ADMIN)
- ``GET  /groups/{id}/notebook-access``           -- List notebook accesses
- ``PUT  /groups/{id}/notebook-access``           -- Bulk update access (OWNER/ADMIN)
- ``DELETE /groups/{id}/notebook-access/{nb_id}`` -- Remove access (OWNER/ADMIN)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole
from app.database import get_db
from app.models import MemberGroup, MemberGroupMembership
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user
from app.services.group_service import (
    add_members_to_group,
    bulk_set_group_notebook_access,
    create_group,
    delete_group,
    get_group,
    get_group_members,
    get_group_notebook_accesses,
    list_groups,
    remove_group_notebook_access,
    remove_members_from_group,
    update_group,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groups", tags=["groups"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class GroupCreateRequest(BaseModel):
    """Create a new member group."""

    name: str
    description: str = ""
    color: str = "#6B7280"


class GroupUpdateRequest(BaseModel):
    """Partial update for a group."""

    name: str | None = None
    description: str | None = None
    color: str | None = None


class GroupResponse(BaseModel):
    """Group detail response."""

    id: int
    name: str
    description: str
    color: str
    member_count: int
    created_at: str


class GroupListResponse(BaseModel):
    """Paginated group list response."""

    groups: list[GroupResponse]
    total: int


class GroupMemberItem(BaseModel):
    """Single member within a group."""

    membership_id: int
    user_id: int
    email: str
    name: str
    role: str
    added_at: str | None


class BatchAddMembersRequest(BaseModel):
    """Add multiple members to a group."""

    membership_ids: list[int]


class BatchRemoveMembersRequest(BaseModel):
    """Remove multiple members from a group."""

    membership_ids: list[int]


class GroupNotebookAccessItem(BaseModel):
    """Notebook access entry for a group."""

    id: int
    notebook_id: int
    notebook_name: str
    permission: str


class GroupNotebookAccessUpdateRequest(BaseModel):
    """Single notebook access upsert."""

    notebook_id: int
    permission: str

    @field_validator("permission")
    @classmethod
    def validate_permission(cls, v: str) -> str:
        valid = {"read", "write", "admin"}
        if v not in valid:
            raise ValueError(f"Permission must be one of: {', '.join(valid)}")
        return v


class BulkGroupNotebookAccessRequest(BaseModel):
    """Bulk update notebook access for a group."""

    accesses: list[GroupNotebookAccessUpdateRequest]


class MessageResponse(BaseModel):
    """Generic message response."""

    message: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_group_or_404(
    db: AsyncSession, group_id: int, org_id: int
) -> MemberGroup:
    """Get group and verify it belongs to the user's org."""
    group = await get_group(db, group_id)
    if not group or group.org_id != org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    return group


async def _count_group_members(db: AsyncSession, group_id: int) -> int:
    """Count the number of members in a group."""
    count_result = await db.execute(
        select(func.count(MemberGroupMembership.id)).where(
            MemberGroupMembership.group_id == group_id
        )
    )
    return count_result.scalar() or 0


def _group_to_response(
    group: MemberGroup, member_count: int
) -> GroupResponse:
    """Convert a MemberGroup model to GroupResponse."""
    return GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        color=group.color,
        member_count=member_count,
        created_at=group.created_at.isoformat() if group.created_at else "",
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group_endpoint(
    request: GroupCreateRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> GroupResponse:
    """Create a new member group.

    Requires OWNER or ADMIN role.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can create groups",
        )

    try:
        group = await create_group(
            db,
            org_id=current_user["org_id"],
            name=request.name,
            description=request.description,
            color=request.color,
            created_by=current_user["user_id"],
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from e

    logger.info(
        "Group created: name=%s, org_id=%d, by=%s",
        request.name,
        current_user["org_id"],
        current_user["email"],
    )

    await log_activity(
        "group",
        "completed",
        message=f"그룹 생성: {request.name}",
        details={"group_id": group.id},
        triggered_by=get_trigger_name(current_user),
    )

    return _group_to_response(group, member_count=0)


@router.get("", response_model=GroupListResponse)
async def list_groups_endpoint(
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> GroupListResponse:
    """List all groups in the organization."""
    groups = await list_groups(db, current_user["org_id"])

    items: list[GroupResponse] = []
    for g in groups:
        count = await _count_group_members(db, g.id)
        items.append(_group_to_response(g, member_count=count))

    return GroupListResponse(groups=items, total=len(items))


@router.get("/{group_id}", response_model=GroupResponse)
async def get_group_endpoint(
    group_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> GroupResponse:
    """Get a single group by ID."""
    group = await _get_group_or_404(db, group_id, current_user["org_id"])
    count = await _count_group_members(db, group.id)
    return _group_to_response(group, member_count=count)


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group_endpoint(
    group_id: int,
    request: GroupUpdateRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> GroupResponse:
    """Update a group's name, description, or color.

    Requires OWNER or ADMIN role.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can update groups",
        )

    await _get_group_or_404(db, group_id, current_user["org_id"])

    try:
        group = await update_group(
            db,
            group_id=group_id,
            name=request.name,
            description=request.description,
            color=request.color,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from e

    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )

    logger.info(
        "Group updated: group_id=%d, by=%s",
        group_id,
        current_user["email"],
    )

    await log_activity(
        "group",
        "completed",
        message=f"그룹 수정: {group.name}",
        details={"group_id": group_id},
        triggered_by=get_trigger_name(current_user),
    )

    count = await _count_group_members(db, group.id)
    return _group_to_response(group, member_count=count)


@router.delete("/{group_id}", response_model=MessageResponse)
async def delete_group_endpoint(
    group_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MessageResponse:
    """Delete a group and all related records.

    Requires OWNER or ADMIN role.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can delete groups",
        )

    group = await _get_group_or_404(db, group_id, current_user["org_id"])
    group_name = group.name

    deleted = await delete_group(db, group_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    await db.commit()

    logger.info(
        "Group deleted: group_id=%d, name=%s, by=%s",
        group_id,
        group_name,
        current_user["email"],
    )

    await log_activity(
        "group",
        "completed",
        message=f"그룹 삭제: {group_name}",
        details={"group_id": group_id},
        triggered_by=get_trigger_name(current_user),
    )

    return MessageResponse(message="Group deleted successfully")


# ---------------------------------------------------------------------------
# Group Members
# ---------------------------------------------------------------------------


@router.get("/{group_id}/members", response_model=list[GroupMemberItem])
async def get_group_members_endpoint(
    group_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> list[GroupMemberItem]:
    """Get all members of a group."""
    await _get_group_or_404(db, group_id, current_user["org_id"])

    members = await get_group_members(db, group_id)
    return [GroupMemberItem(**m) for m in members]


@router.post("/{group_id}/members")
async def add_group_members_endpoint(
    group_id: int,
    request: BatchAddMembersRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> dict:
    """Add members to a group.

    Requires OWNER or ADMIN role.
    Returns counts of added, already_exists, and errors.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can add group members",
        )

    await _get_group_or_404(db, group_id, current_user["org_id"])

    result = await add_members_to_group(
        db,
        group_id=group_id,
        membership_ids=request.membership_ids,
        added_by=current_user["user_id"],
    )
    await db.commit()

    if result["added"] > 0:
        logger.info(
            "Members added to group: group_id=%d, added=%d, by=%s",
            group_id,
            result["added"],
            current_user["email"],
        )

        await log_activity(
            "group",
            "completed",
            message=f"그룹 멤버 추가: {result['added']}명",
            details={"group_id": group_id, **result},
            triggered_by=get_trigger_name(current_user),
        )

    return result


@router.delete("/{group_id}/members", response_model=MessageResponse)
async def remove_group_members_endpoint(
    group_id: int,
    request: BatchRemoveMembersRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MessageResponse:
    """Remove members from a group.

    Requires OWNER or ADMIN role.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can remove group members",
        )

    await _get_group_or_404(db, group_id, current_user["org_id"])

    removed = await remove_members_from_group(
        db,
        group_id=group_id,
        membership_ids=request.membership_ids,
    )
    await db.commit()

    if removed > 0:
        logger.info(
            "Members removed from group: group_id=%d, removed=%d, by=%s",
            group_id,
            removed,
            current_user["email"],
        )

        await log_activity(
            "group",
            "completed",
            message=f"그룹 멤버 제거: {removed}명",
            details={"group_id": group_id, "removed": removed},
            triggered_by=get_trigger_name(current_user),
        )

    return MessageResponse(message=f"{removed} member(s) removed from group")


# ---------------------------------------------------------------------------
# Group Notebook Access
# ---------------------------------------------------------------------------


@router.get(
    "/{group_id}/notebook-access",
    response_model=list[GroupNotebookAccessItem],
)
async def get_group_notebook_access_endpoint(
    group_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> list[GroupNotebookAccessItem]:
    """Get all notebook access entries for a group."""
    await _get_group_or_404(db, group_id, current_user["org_id"])

    accesses = await get_group_notebook_accesses(db, group_id)
    return [
        GroupNotebookAccessItem(
            id=a["id"],
            notebook_id=a["notebook_id"],
            notebook_name=a["notebook_name"],
            permission=a["permission"],
        )
        for a in accesses
    ]


@router.put(
    "/{group_id}/notebook-access",
    response_model=list[GroupNotebookAccessItem],
)
async def update_group_notebook_access_endpoint(
    group_id: int,
    request: BulkGroupNotebookAccessRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> list[GroupNotebookAccessItem]:
    """Bulk upsert notebook access for a group.

    Requires OWNER or ADMIN role.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can update group notebook access",
        )

    await _get_group_or_404(db, group_id, current_user["org_id"])

    access_dicts = [
        {"notebook_id": a.notebook_id, "permission": a.permission}
        for a in request.accesses
    ]
    await bulk_set_group_notebook_access(
        db,
        group_id=group_id,
        accesses=access_dicts,
        granted_by=current_user["user_id"],
    )
    await db.commit()

    logger.info(
        "Group notebook access updated: group_id=%d, count=%d, by=%s",
        group_id,
        len(request.accesses),
        current_user["email"],
    )

    await log_activity(
        "group",
        "completed",
        message=f"그룹 노트북 접근 권한 수정: {len(request.accesses)}건",
        details={"group_id": group_id},
        triggered_by=get_trigger_name(current_user),
    )

    # Re-fetch to return current state
    accesses = await get_group_notebook_accesses(db, group_id)
    return [
        GroupNotebookAccessItem(
            id=a["id"],
            notebook_id=a["notebook_id"],
            notebook_name=a["notebook_name"],
            permission=a["permission"],
        )
        for a in accesses
    ]


@router.delete(
    "/{group_id}/notebook-access/{notebook_id}",
    response_model=MessageResponse,
)
async def remove_group_notebook_access_endpoint(
    group_id: int,
    notebook_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MessageResponse:
    """Remove a group's access to a specific notebook.

    Requires OWNER or ADMIN role.
    """
    if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only OWNER or ADMIN can remove group notebook access",
        )

    await _get_group_or_404(db, group_id, current_user["org_id"])

    removed = await remove_group_notebook_access(db, group_id, notebook_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notebook access not found for this group",
        )
    await db.commit()

    logger.info(
        "Group notebook access removed: group_id=%d, notebook_id=%d, by=%s",
        group_id,
        notebook_id,
        current_user["email"],
    )

    await log_activity(
        "group",
        "completed",
        message=f"그룹 노트북 접근 권한 제거: notebook_id={notebook_id}",
        details={"group_id": group_id, "notebook_id": notebook_id},
        triggered_by=get_trigger_name(current_user),
    )

    return MessageResponse(message="Notebook access removed successfully")
