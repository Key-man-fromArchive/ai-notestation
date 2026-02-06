"""Datetime conversion utilities."""

from datetime import UTC, datetime


def unix_to_iso(ts: int | float | None) -> str | None:
    """Convert a Unix timestamp to an ISO-8601 string, or None."""
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=UTC).isoformat()


def datetime_to_iso(value: datetime | None) -> str | None:
    """Convert a datetime to an ISO-8601 string, or None."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def datetime_from_iso(value: str | None) -> datetime | None:
    """Convert an ISO-8601 string to a datetime, or None."""
    if not value:
        return None
    return datetime.fromisoformat(value)
