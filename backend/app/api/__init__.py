# @TASK P4-T4.1 - API 패키지 초기화
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#api-endpoints

"""LabNote AI REST API package.

Sub-modules expose FastAPI routers for each domain:
- auth: JWT authentication (login, token refresh, user info)
- sync: NoteStation synchronisation trigger and status
"""
