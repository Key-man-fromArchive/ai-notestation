from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import MemberRole, NotePermission
from app.database import get_db
from app.models import NoteAccess, User
from app.services.access_control import (
    can_manage_note_access,
    get_note_access_list,
    grant_note_access,
    revoke_note_access,
)
from app.services.auth_service import verify_token
from app.services.user_service import get_membership, get_user_by_email, get_user_by_id

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


async def get_current_member(token: str, db: AsyncSession) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = verify_token(token)
    except Exception:
        raise credentials_exception from None

    if payload.get("type") != "access":
        raise credentials_exception

    user_id = payload.get("user_id")
    org_id = payload.get("org_id")
    if user_id is None or org_id is None:
        raise credentials_exception

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise credentials_exception

    membership = await get_membership(db, user_id, org_id)
    if not membership or not membership.accepted_at:
        raise credentials_exception

    return {
        "user_id": user_id,
        "org_id": org_id,
        "role": membership.role,
        "email": user.email,
    }


@router.get("/{note_id}/share", response_model=AccessListResponse)
async def get_note_sharing(
    note_id: int,
    authorization: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> AccessListResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]
    current_member = await get_current_member(token, db)

    accesses = await get_note_access_list(db, note_id)
    can_manage = await can_manage_note_access(db, current_member["user_id"], note_id)

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
    authorization: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> AccessResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]
    current_member = await get_current_member(token, db)

    can_manage = await can_manage_note_access(db, current_member["user_id"], note_id)
    if not can_manage:
        if current_member["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
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
        granted_by=current_member["user_id"],
        permission=request.permission,
        user_id=target_user.id,
    )
    await db.commit()

    logger.info(
        "Note access granted: note_id=%d, user=%s, permission=%s, by=%s",
        note_id,
        request.email,
        request.permission,
        current_member["email"],
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
    authorization: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]
    current_member = await get_current_member(token, db)

    can_manage = await can_manage_note_access(db, current_member["user_id"], note_id)
    if not can_manage:
        if current_member["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
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
        current_member["email"],
    )

    return MessageResponse(message="Access revoked successfully")


@router.post("/{note_id}/share/org", response_model=AccessResponse, status_code=status.HTTP_201_CREATED)
async def grant_org_wide_access(
    note_id: int,
    permission: str = NotePermission.READ,
    authorization: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> AccessResponse:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1]
    current_member = await get_current_member(token, db)

    can_manage = await can_manage_note_access(db, current_member["user_id"], note_id)
    if not can_manage:
        if current_member["role"] not in {MemberRole.OWNER, MemberRole.ADMIN}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to manage sharing for this note",
            )

    access = await grant_note_access(
        db,
        note_id=note_id,
        granted_by=current_member["user_id"],
        permission=permission,
        org_id=current_member["org_id"],
    )
    await db.commit()

    logger.info(
        "Org-wide access granted: note_id=%d, org_id=%d, permission=%s, by=%s",
        note_id,
        current_member["org_id"],
        permission,
        current_member["email"],
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
