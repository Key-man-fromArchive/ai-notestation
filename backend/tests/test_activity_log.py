"""Tests for the activity log API.

@TASK T9 - Activity log API tests
@SPEC docs/plans/2026-02-10-operations-activity-log.md
"""

from datetime import datetime

import pytest

from app.api.activity_log import ActivityLogItem, ActivityLogResponse, router


def test_activity_log_router_exists():
    """The activity-log router should be importable and have routes."""
    assert router is not None
    assert router.prefix == "/activity-log"


def test_activity_log_item_schema():
    """ActivityLogItem should accept valid data."""
    item = ActivityLogItem(
        id=1,
        operation="sync",
        status="completed",
        message="동기화 완료: 100개 노트",
        details={"added": 5, "updated": 3, "deleted": 1, "total": 100},
        triggered_by="test_user",
        created_at=datetime.now(),
    )
    assert item.operation == "sync"
    assert item.status == "completed"
    assert item.details["added"] == 5


def test_activity_log_item_minimal():
    """ActivityLogItem should work with minimal required fields."""
    item = ActivityLogItem(
        id=2,
        operation="embedding",
        status="started",
        message=None,
        details=None,
        triggered_by=None,
        created_at=datetime.now(),
    )
    assert item.id == 2
    assert item.operation == "embedding"
    assert item.status == "started"
    assert item.message is None
    assert item.details is None
    assert item.triggered_by is None


def test_activity_log_response_schema():
    """ActivityLogResponse should accept items list."""
    resp = ActivityLogResponse(
        items=[
            ActivityLogItem(
                id=1,
                operation="embedding",
                status="started",
                message=None,
                details=None,
                triggered_by="admin",
                created_at=datetime.now(),
            ),
        ],
        total=1,
    )
    assert len(resp.items) == 1
    assert resp.total == 1


def test_activity_log_response_multiple_items():
    """ActivityLogResponse should handle multiple items."""
    now = datetime.now()
    resp = ActivityLogResponse(
        items=[
            ActivityLogItem(
                id=1,
                operation="sync",
                status="completed",
                message="Sync complete",
                details={"count": 10},
                triggered_by="user1",
                created_at=now,
            ),
            ActivityLogItem(
                id=2,
                operation="embedding",
                status="in_progress",
                message=None,
                details=None,
                triggered_by="system",
                created_at=now,
            ),
        ],
        total=2,
    )
    assert len(resp.items) == 2
    assert resp.total == 2
    assert resp.items[0].operation == "sync"
    assert resp.items[1].operation == "embedding"


def test_activity_log_response_empty():
    """ActivityLogResponse should accept empty items."""
    resp = ActivityLogResponse(items=[], total=0)
    assert len(resp.items) == 0
    assert resp.total == 0
