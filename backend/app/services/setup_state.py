"""Setup initialization state management."""

import logging
import time

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_cache: dict[str, object] = {"initialized": None, "checked_at": 0.0}
_CACHE_TTL = 30  # seconds


async def is_initialized(db: AsyncSession) -> bool:
    """Check if the system has been initialized (at least one organization exists)."""
    result = await db.execute(text("SELECT count(*) FROM organizations"))
    count = result.scalar() or 0
    return count > 0


async def check_initialized(db: AsyncSession) -> bool:
    """Cached version of is_initialized(). Uses 30s TTL."""
    now = time.monotonic()
    if _cache["initialized"] is not None and (now - _cache["checked_at"]) < _CACHE_TTL:
        return _cache["initialized"]

    initialized = await is_initialized(db)
    _cache["initialized"] = initialized
    _cache["checked_at"] = now
    return initialized


def mark_initialized():
    """Immediately invalidate the cache after setup completes."""
    _cache["initialized"] = True
    _cache["checked_at"] = time.monotonic()
