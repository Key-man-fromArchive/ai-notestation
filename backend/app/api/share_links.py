# @TASK ShareLink CRUD API implementation
# @SPEC ShareLink CRUD API with permission checks and validation
# @TEST tests/test_api_share_links.py

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Note, Notebook, ShareLink
from app.services.activity_log import log_activity
from app.services.auth_service import get_current_user
from app.services.notebook_access_control import can_manage_notebook_access

router = APIRouter(prefix="/notebooks", tags=["share_links"])


class ShareLinkCreate(BaseModel):
    link_type: str
    expires_in_days: int | None = None
    email_restriction: str | None = None


class ShareLinkResponse(BaseModel):
    id: int
    token: str
    notebook_id: int | None
    note_id: int | None
    link_type: str
    email_restriction: str | None
    expires_at: str | None
    access_count: int
    is_active: bool
    created_at: str


class ShareLinksListResponse(BaseModel):
    items: list[ShareLinkResponse]
    total: int


def _validate_link_create(data: ShareLinkCreate) -> None:
    """Validate ShareLinkCreate request data."""
    valid_types = {"public", "email_required", "time_limited"}
    if data.link_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid link_type. Must be one of: {', '.join(valid_types)}")
    if data.link_type == "email_required" and not data.email_restriction:
        raise HTTPException(status_code=400, detail="email_restriction is required for email_required link type")
    if data.link_type == "time_limited":
        if data.expires_in_days is None:
            raise HTTPException(status_code=400, detail="expires_in_days is required for time_limited link type")
        if not (1 <= data.expires_in_days <= 90):
            raise HTTPException(status_code=400, detail="expires_in_days must be between 1 and 90")


def _share_link_to_response(link: ShareLink) -> ShareLinkResponse:
    """Convert ShareLink model to ShareLinkResponse."""
    return ShareLinkResponse(
        id=link.id,
        token=link.token,
        notebook_id=link.notebook_id,
        note_id=link.note_id,
        link_type=link.link_type,
        email_restriction=link.email_restriction,
        expires_at=link.expires_at.isoformat() if link.expires_at else None,
        access_count=link.access_count,
        is_active=link.is_active,
        created_at=link.created_at.isoformat(),
    )


@router.post("/{notebook_id}/links", status_code=201, response_model=ShareLinkResponse)
async def create_notebook_share_link(
    notebook_id: int,
    data: ShareLinkCreate,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ShareLinkResponse:
    """Create a share link for a notebook."""
    _validate_link_create(data)

    result = await db.execute(select(Notebook).where(Notebook.id == notebook_id))
    notebook = result.scalar_one_or_none()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not await can_manage_notebook_access(db, current_user["user_id"], notebook_id):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    active_count_result = await db.execute(
        select(func.count(ShareLink.id)).where(
            ShareLink.notebook_id == notebook_id,
            ShareLink.created_by == current_user["user_id"],
            ShareLink.is_active == True,  # noqa: E712
        )
    )
    active_count = active_count_result.scalar_one()
    if active_count >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 active links per notebook reached")

    token = secrets.token_urlsafe(32)
    expires_at = None
    if data.link_type == "time_limited" and data.expires_in_days:
        expires_at = datetime.now(UTC) + timedelta(days=data.expires_in_days)

    share_link = ShareLink(
        token=token,
        notebook_id=notebook_id,
        note_id=None,
        link_type=data.link_type,
        email_restriction=data.email_restriction,
        expires_at=expires_at,
        created_by=current_user["user_id"],
        is_active=True,
        access_count=0,
    )
    db.add(share_link)
    await db.commit()
    await db.refresh(share_link)

    await log_activity(
        "share_link", "completed",
        message="노트북 공유 링크 생성",
        details={"notebook_id": notebook_id, "link_type": data.link_type},
        triggered_by=current_user["email"],
    )

    return _share_link_to_response(share_link)


@router.get("/{notebook_id}/links", response_model=ShareLinksListResponse)
async def list_notebook_share_links(
    notebook_id: int,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ShareLinksListResponse:
    """List all active share links for a notebook."""
    result = await db.execute(select(Notebook).where(Notebook.id == notebook_id))
    notebook = result.scalar_one_or_none()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not await can_manage_notebook_access(db, current_user["user_id"], notebook_id):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    links_result = await db.execute(
        select(ShareLink).where(
            ShareLink.notebook_id == notebook_id,
            ShareLink.is_active == True,  # noqa: E712
        )
    )
    links = links_result.scalars().all()

    return ShareLinksListResponse(
        items=[_share_link_to_response(link) for link in links],
        total=len(links),
    )


@router.delete("/{notebook_id}/links/{link_id}", status_code=204)
async def revoke_share_link(
    notebook_id: int,
    link_id: int,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Revoke (soft delete) a share link."""
    result = await db.execute(select(Notebook).where(Notebook.id == notebook_id))
    notebook = result.scalar_one_or_none()
    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if not await can_manage_notebook_access(db, current_user["user_id"], notebook_id):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    link_result = await db.execute(
        select(ShareLink).where(
            ShareLink.id == link_id,
            ShareLink.notebook_id == notebook_id,
        )
    )
    link = link_result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")

    link.is_active = False
    await db.commit()

    await log_activity(
        "share_link", "completed",
        message="공유 링크 삭제",
        details={"notebook_id": notebook_id, "link_id": link_id},
        triggered_by=current_user["email"],
    )


note_router = APIRouter(prefix="/notes", tags=["share_links"])


@note_router.post("/{note_id}/links", status_code=201, response_model=ShareLinkResponse)
async def create_note_share_link(
    note_id: int,
    data: ShareLinkCreate,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ShareLinkResponse:
    """Create a share link for a note."""
    _validate_link_create(data)

    result = await db.execute(select(Note).where(Note.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if not await can_manage_notebook_access(db, current_user["user_id"], note.notebook_id):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    active_count_result = await db.execute(
        select(func.count(ShareLink.id)).where(
            ShareLink.note_id == note_id,
            ShareLink.created_by == current_user["user_id"],
            ShareLink.is_active == True,  # noqa: E712
        )
    )
    active_count = active_count_result.scalar_one()
    if active_count >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 active links per note reached")

    token = secrets.token_urlsafe(32)
    expires_at = None
    if data.link_type == "time_limited" and data.expires_in_days:
        expires_at = datetime.now(UTC) + timedelta(days=data.expires_in_days)

    share_link = ShareLink(
        token=token,
        notebook_id=None,
        note_id=note_id,
        link_type=data.link_type,
        email_restriction=data.email_restriction,
        expires_at=expires_at,
        created_by=current_user["user_id"],
        is_active=True,
        access_count=0,
    )
    db.add(share_link)
    await db.commit()
    await db.refresh(share_link)

    await log_activity(
        "share_link", "completed",
        message="노트 공유 링크 생성",
        details={"note_id": note_id, "link_type": data.link_type},
        triggered_by=current_user["email"],
    )

    return _share_link_to_response(share_link)
