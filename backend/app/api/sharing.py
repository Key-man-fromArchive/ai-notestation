from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole, NotePermission
from app.database import get_db
from app.models import NoteAccess
from app.services.access_control import (
    can_manage_note_access,
    get_note_access_list,
    grant_note_access,
    revoke_note_access,
)
from app.services.activity_log import get_trigger_name, log_activity
from app.services.auth_service import get_current_user
from app.services.user_service import get_user_by_email, get_user_by_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["sharing"])


class GrantAccessRequest(BaseModel):
    email: EmailStr
    permission: str = NotePermission.READ

    @classmethod
    def validate_permission(cls, v: str) -> str:
        valid = {NotePermission.READ, NotePermission.WRITE, NotePermission.ADMIN}
        if v not in valid:
            raise ValueError(f"Permission must be one of: {', '.join(valid)}")
        return v


class AccessResponse(BaseModel):
    id: int
    note_id: int
    user_id: int | None
    user_email: str | None
    user_name: str | None
    org_id: int | None
    permission: str
    granted_by: int
    is_org_wide: bool


class AccessListResponse(BaseModel):
    accesses: list[AccessResponse]
    can_manage: bool


class MessageResponse(BaseModel):
    message: str


@router.get("/{note_id}/share", response_model=AccessListResponse)
async def get_note_sharing(
    note_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AccessListResponse:
    accesses = await get_note_access_list(db, note_id)
    can_manage = await can_manage_note_access(db, current_user["user_id"], note_id)

    access_responses = []
    for access in accesses:
        user_email = None
        user_name = None
        if access.user_id:
            user = await get_user_by_id(db, access.user_id)
            if user:
                user_email = user.email
                user_name = user.name

        access_responses.append(
            AccessResponse(
                id=access.id,
                note_id=access.note_id,
                user_id=access.user_id,
                user_email=user_email,
                user_name=user_name,
                org_id=access.org_id,
                permission=access.permission,
                granted_by=access.granted_by,
                is_org_wide=access.org_id is not None,
            )
        )

    return AccessListResponse(accesses=access_responses, can_manage=can_manage)


@router.post("/{note_id}/share", response_model=AccessResponse, status_code=status.HTTP_201_CREATED)
async def grant_note_sharing(
    note_id: int,
    request: GrantAccessRequest,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AccessResponse:
    can_manage = await can_manage_note_access(db, current_user["user_id"], note_id)
    if not can_manage:
        if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to manage sharing for this note",
            )

    target_user = await get_user_by_email(db, request.email)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found with this email",
        )

    access = await grant_note_access(
        db,
        note_id=note_id,
        granted_by=current_user["user_id"],
        permission=request.permission,
        user_id=target_user.id,
    )
    await db.commit()

    logger.info(
        "Note access granted: note_id=%d, user=%s, permission=%s, by=%s",
        note_id,
        request.email,
        request.permission,
        current_user["email"],
    )

    await log_activity(
        "access", "completed",
        message=f"노트 공유 권한 부여: {request.email} ({request.permission})",
        details={"note_id": note_id},
        triggered_by=get_trigger_name(current_user),
    )

    return AccessResponse(
        id=access.id,
        note_id=access.note_id,
        user_id=access.user_id,
        user_email=target_user.email,
        user_name=target_user.name,
        org_id=access.org_id,
        permission=access.permission,
        granted_by=access.granted_by,
        is_org_wide=False,
    )


@router.delete("/{note_id}/share/{access_id}", response_model=MessageResponse)
async def revoke_note_sharing(
    note_id: int,
    access_id: int,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> MessageResponse:
    can_manage = await can_manage_note_access(db, current_user["user_id"], note_id)
    if not can_manage:
        if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to manage sharing for this note",
            )

    result = await db.execute(select(NoteAccess).where(NoteAccess.id == access_id, NoteAccess.note_id == note_id))
    access = result.scalar_one_or_none()

    if not access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access record not found",
        )

    if access.user_id:
        await revoke_note_access(db, note_id, user_id=access.user_id)
    elif access.org_id:
        await revoke_note_access(db, note_id, org_id=access.org_id)

    await db.commit()

    logger.info(
        "Note access revoked: note_id=%d, access_id=%d, by=%s",
        note_id,
        access_id,
        current_user["email"],
    )

    await log_activity(
        "access", "completed",
        message="노트 공유 권한 회수",
        details={"note_id": note_id, "access_id": access_id},
        triggered_by=get_trigger_name(current_user),
    )

    return MessageResponse(message="Access revoked successfully")


@router.post("/{note_id}/share/org", response_model=AccessResponse, status_code=status.HTTP_201_CREATED)
async def grant_org_wide_access(
    note_id: int,
    permission: str = NotePermission.READ,
    current_user: dict = Depends(get_current_user),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> AccessResponse:
    can_manage = await can_manage_note_access(db, current_user["user_id"], note_id)
    if not can_manage:
        if current_user["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to manage sharing for this note",
            )

    access = await grant_note_access(
        db,
        note_id=note_id,
        granted_by=current_user["user_id"],
        permission=permission,
        org_id=current_user["org_id"],
    )
    await db.commit()

    logger.info(
        "Org-wide access granted: note_id=%d, org_id=%d, permission=%s, by=%s",
        note_id,
        current_user["org_id"],
        permission,
        current_user["email"],
    )

    await log_activity(
        "access", "completed",
        message="노트 조직 전체 공유",
        details={"note_id": note_id, "permission": permission},
        triggered_by=get_trigger_name(current_user),
    )

    return AccessResponse(
        id=access.id,
        note_id=access.note_id,
        user_id=None,
        user_email=None,
        user_name=None,
        org_id=access.org_id,
        permission=access.permission,
        granted_by=access.granted_by,
        is_org_wide=True,
    )
