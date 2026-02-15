# @TASK Notebooks CRUD API implementation
# @SPEC Notebooks CRUD API with permission checks
# @TEST tests/test_api_notebooks.py

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import NotePermission
from app.database import get_db
from app.models import Note, Notebook, User
from app.services.activity_log import log_activity
from app.services.auth_service import get_current_user
from app.services.notebook_access_control import (
    can_manage_notebook_access,
    check_notebook_access,
    get_accessible_notebooks,
    get_notebook_access_list,
    grant_notebook_access,
    revoke_notebook_access,
)

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


VALID_CATEGORIES = {"labnote", "daily_log", "meeting", "sop", "protocol", "reference"}


def _validate_category(v: str | None) -> str | None:
    if v is not None and v not in VALID_CATEGORIES:
        raise ValueError(f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
    return v


class NotebookCreate(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None

    @field_validator("category")
    @classmethod
    def check_category(cls, v: str | None) -> str | None:
        return _validate_category(v)


class NotebookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None

    @field_validator("category")
    @classmethod
    def check_category(cls, v: str | None) -> str | None:
        return _validate_category(v)


class NotebookResponse(BaseModel):
    id: int
    name: str
    description: str | None
    category: str | None
    note_count: int
    is_public: bool
    created_at: str
    updated_at: str


class NotebooksListResponse(BaseModel):
    items: list[NotebookResponse]
    total: int


@router.get("")
async def list_notebooks(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> NotebooksListResponse:
    """List all notebooks accessible to the current user with note counts."""
    accessible_notebook_ids = await get_accessible_notebooks(db, current_user["user_id"])

    if not accessible_notebook_ids:
        return NotebooksListResponse(items=[], total=0)

    stmt = (
        select(Notebook, func.count(Note.id).label("note_count"))
        .outerjoin(Note, Note.notebook_id == Notebook.id)
        .where(Notebook.id.in_(accessible_notebook_ids))
        .group_by(Notebook.id)
        .order_by(Notebook.updated_at.desc())
    )

    result = await db.execute(stmt)
    rows = result.all()

    items = [
        NotebookResponse(
            id=notebook.id,
            name=notebook.name,
            description=notebook.description,
            category=notebook.category,
            note_count=note_count,
            is_public=notebook.is_public,
            created_at=notebook.created_at.isoformat(),
            updated_at=notebook.updated_at.isoformat(),
        )
        for notebook, note_count in rows
    ]

    return NotebooksListResponse(items=items, total=len(items))


@router.post("", status_code=201)
async def create_notebook(
    notebook: NotebookCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> NotebookResponse:
    """Create a new notebook and grant ADMIN permission to creator."""
    new_notebook = Notebook(
        name=notebook.name,
        description=notebook.description,
        category=notebook.category,
    )

    db.add(new_notebook)
    await db.flush()
    await db.refresh(new_notebook)

    await grant_notebook_access(
        db=db,
        notebook_id=new_notebook.id,
        user_id=current_user["user_id"],
        org_id=None,
        permission=NotePermission.ADMIN,
        granted_by=current_user["user_id"],
    )

    await db.commit()
    await log_activity(
        "notebook", "completed",
        message=f"노트북 생성: {notebook.name}",
        triggered_by=current_user["email"],
    )
    await db.refresh(new_notebook)

    stmt = select(func.count(Note.id)).where(Note.notebook_id == new_notebook.id)
    result = await db.execute(stmt)
    note_count = result.scalar() or 0

    return NotebookResponse(
        id=new_notebook.id,
        name=new_notebook.name,
        description=new_notebook.description,
        category=new_notebook.category,
        note_count=note_count,
        is_public=new_notebook.is_public or False,
        created_at=new_notebook.created_at.isoformat(),
        updated_at=new_notebook.updated_at.isoformat(),
    )


@router.get("/{notebook_id}")
async def get_notebook(
    notebook_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> NotebookResponse:
    """Get notebook details by ID (requires READ permission)."""
    has_access = await check_notebook_access(db, current_user["user_id"], notebook_id, NotePermission.READ)
    if not has_access:
        raise HTTPException(status_code=403, detail="Insufficient permission to access this notebook")

    stmt = select(Notebook).where(Notebook.id == notebook_id)
    result = await db.execute(stmt)
    notebook = result.scalar_one_or_none()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    count_stmt = select(func.count(Note.id)).where(Note.notebook_id == notebook_id)
    count_result = await db.execute(count_stmt)
    note_count = count_result.scalar() or 0

    return NotebookResponse(
        id=notebook.id,
        name=notebook.name,
        description=notebook.description,
        category=notebook.category,
        note_count=note_count,
        is_public=notebook.is_public,
        created_at=notebook.created_at.isoformat(),
        updated_at=notebook.updated_at.isoformat(),
    )


@router.put("/{notebook_id}")
async def update_notebook(
    notebook_id: int,
    notebook: NotebookUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> NotebookResponse:
    """Update notebook (requires WRITE permission)."""
    has_access = await check_notebook_access(db, current_user["user_id"], notebook_id, NotePermission.WRITE)
    if not has_access:
        raise HTTPException(status_code=403, detail="Insufficient permission to update this notebook")

    stmt = select(Notebook).where(Notebook.id == notebook_id)
    result = await db.execute(stmt)
    existing_notebook = result.scalar_one_or_none()

    if not existing_notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    if notebook.name is not None:
        existing_notebook.name = notebook.name
    if notebook.description is not None:
        existing_notebook.description = notebook.description
    if notebook.category is not None:
        existing_notebook.category = notebook.category

    await db.commit()
    await log_activity(
        "notebook", "completed",
        message=f"노트북 수정: {existing_notebook.name}",
        triggered_by=current_user["email"],
    )
    await db.refresh(existing_notebook)

    count_stmt = select(func.count(Note.id)).where(Note.notebook_id == notebook_id)
    count_result = await db.execute(count_stmt)
    note_count = count_result.scalar() or 0

    return NotebookResponse(
        id=existing_notebook.id,
        name=existing_notebook.name,
        description=existing_notebook.description,
        category=existing_notebook.category,
        note_count=note_count,
        is_public=existing_notebook.is_public,
        created_at=existing_notebook.created_at.isoformat(),
        updated_at=existing_notebook.updated_at.isoformat(),
    )


@router.delete("/{notebook_id}")
async def delete_notebook(
    notebook_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Delete notebook (requires ADMIN permission, fails if notebook has notes)."""
    has_access = await check_notebook_access(db, current_user["user_id"], notebook_id, NotePermission.ADMIN)
    if not has_access:
        raise HTTPException(status_code=403, detail="Insufficient permission to delete this notebook")

    stmt = select(Notebook).where(Notebook.id == notebook_id)
    result = await db.execute(stmt)
    notebook = result.scalar_one_or_none()

    if not notebook:
        raise HTTPException(status_code=404, detail="Notebook not found")

    count_stmt = select(func.count(Note.id)).where(Note.notebook_id == notebook_id)
    count_result = await db.execute(count_stmt)
    note_count = count_result.scalar() or 0

    if note_count > 0:
        raise HTTPException(
            status_code=400, detail=f"Cannot delete notebook with {note_count} notes. Delete notes first."
        )

    await db.delete(notebook)
    await db.commit()
    await log_activity(
        "notebook", "completed",
        message=f"노트북 삭제: {notebook.name}",
        triggered_by=current_user["email"],
    )

    return {"success": True}


class AccessGrantRequest(BaseModel):
    email: str
    permission: str


class AccessUpdateRequest(BaseModel):
    permission: str


class AccessResponse(BaseModel):
    id: int
    user_id: int | None
    org_id: int | None
    user_email: str | None
    permission: str
    granted_by: int
    created_at: str


class AccessListResponse(BaseModel):
    items: list[AccessResponse]


@router.get("/{notebook_id}/access")
async def list_notebook_access(
    notebook_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> AccessListResponse:
    if not await can_manage_notebook_access(db, notebook_id, current_user["user_id"]):
        raise HTTPException(status_code=403, detail="No permission to manage access")

    access_list = await get_notebook_access_list(db, notebook_id)

    items = []
    for access in access_list:
        user_email = None
        if access.user_id:
            stmt = select(User).where(User.id == access.user_id)
            result = await db.execute(stmt)
            user = result.scalar_one_or_none()
            if user:
                user_email = user.email

        permission_str = "read"
        if access.permission == NotePermission.WRITE:
            permission_str = "write"
        elif access.permission == NotePermission.ADMIN:
            permission_str = "admin"

        items.append(
            AccessResponse(
                id=access.id,
                user_id=access.user_id,
                org_id=access.org_id,
                user_email=user_email,
                permission=permission_str,
                granted_by=access.granted_by,
                created_at=access.created_at.isoformat(),
            )
        )

    return AccessListResponse(items=items)


@router.post("/{notebook_id}/access")
async def grant_notebook_access_endpoint(
    notebook_id: int,
    request: AccessGrantRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> AccessResponse:
    if not await can_manage_notebook_access(db, notebook_id, current_user["user_id"]):
        raise HTTPException(status_code=403, detail="No permission to manage access")

    stmt = select(User).where(User.email == request.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    permission_map = {"read": NotePermission.READ, "write": NotePermission.WRITE, "admin": NotePermission.ADMIN}
    if request.permission not in permission_map:
        raise HTTPException(status_code=400, detail="Invalid permission value")

    permission = permission_map[request.permission]

    new_access = await grant_notebook_access(
        db, notebook_id=notebook_id, user_id=user.id, permission=permission, granted_by=current_user["user_id"]
    )

    permission_str = "read"
    if new_access.permission == NotePermission.WRITE:
        permission_str = "write"
    elif new_access.permission == NotePermission.ADMIN:
        permission_str = "admin"

    await log_activity(
        "access", "completed",
        message=f"노트북 접근 권한 부여: {request.email} ({request.permission})",
        details={"notebook_id": notebook_id},
        triggered_by=current_user["email"],
    )

    return AccessResponse(
        id=new_access.id,
        user_id=new_access.user_id,
        org_id=new_access.org_id,
        user_email=request.email,
        permission=permission_str,
        granted_by=new_access.granted_by,
        created_at=new_access.created_at.isoformat(),
    )


@router.put("/{notebook_id}/access/{access_id}")
async def update_notebook_access(
    notebook_id: int,
    access_id: int,
    request: AccessUpdateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> AccessResponse:
    if not await can_manage_notebook_access(db, notebook_id, current_user["user_id"]):
        raise HTTPException(status_code=403, detail="No permission to manage access")

    from app.models import NotebookAccess

    stmt = select(NotebookAccess).where(NotebookAccess.id == access_id, NotebookAccess.notebook_id == notebook_id)
    result = await db.execute(stmt)
    existing_access = result.scalar_one_or_none()
    if not existing_access:
        raise HTTPException(status_code=404, detail="Access record not found")

    permission_map = {"read": NotePermission.READ, "write": NotePermission.WRITE, "admin": NotePermission.ADMIN}
    if request.permission not in permission_map:
        raise HTTPException(status_code=400, detail="Invalid permission value")

    new_permission = permission_map[request.permission]

    if existing_access.permission == NotePermission.ADMIN and new_permission != NotePermission.ADMIN:
        access_list = await get_notebook_access_list(db, notebook_id)
        admin_count = sum(1 for access in access_list if access.permission == NotePermission.ADMIN)
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner")

    updated_access = await grant_notebook_access(
        db,
        notebook_id=notebook_id,
        user_id=existing_access.user_id,
        permission=new_permission,
        granted_by=current_user["user_id"],
    )

    permission_str = "read"
    if updated_access.permission == NotePermission.WRITE:
        permission_str = "write"
    elif updated_access.permission == NotePermission.ADMIN:
        permission_str = "admin"

    user_email = None
    if updated_access.user_id:
        stmt = select(User).where(User.id == updated_access.user_id)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        if user:
            user_email = user.email

    await log_activity(
        "access", "completed",
        message=f"노트북 접근 권한 변경: {request.permission}",
        details={"notebook_id": notebook_id, "access_id": access_id},
        triggered_by=current_user["email"],
    )

    return AccessResponse(
        id=updated_access.id,
        user_id=updated_access.user_id,
        org_id=updated_access.org_id,
        user_email=user_email,
        permission=permission_str,
        granted_by=updated_access.granted_by,
        created_at=updated_access.created_at.isoformat(),
    )


@router.delete("/{notebook_id}/access/{access_id}")
async def revoke_notebook_access_endpoint(
    notebook_id: int,
    access_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    if not await can_manage_notebook_access(db, notebook_id, current_user["user_id"]):
        raise HTTPException(status_code=403, detail="No permission to manage access")

    from app.models import NotebookAccess

    stmt = select(NotebookAccess).where(NotebookAccess.id == access_id, NotebookAccess.notebook_id == notebook_id)
    result = await db.execute(stmt)
    existing_access = result.scalar_one_or_none()
    if not existing_access:
        raise HTTPException(status_code=404, detail="Access record not found")

    if existing_access.permission == NotePermission.ADMIN:
        access_list = await get_notebook_access_list(db, notebook_id)
        admin_count = sum(1 for access in access_list if access.permission == NotePermission.ADMIN)
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner")

    await revoke_notebook_access(db, access_id)
    await log_activity(
        "access", "completed",
        message="노트북 접근 권한 회수",
        details={"notebook_id": notebook_id, "access_id": access_id},
        triggered_by=current_user["email"],
    )

    return {"success": True}
