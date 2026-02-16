"""Bilingual message translations for API responses.

Usage:
    from app.utils.messages import msg
    msg("sync.started", lang)           # → "동기화 시작" or "Sync started"
    msg("sync.notes_synced", lang, count=5)  # → "5개 노트 동기화 완료" or "5 notes synced"
"""

from __future__ import annotations

_MESSAGES: dict[str, dict[str, str]] = {
    # Sync messages
    "sync.started": {
        "ko": "동기화 시작",
        "en": "Sync started",
    },
    "sync.completed": {
        "ko": "동기화 완료",
        "en": "Sync completed",
    },
    "sync.no_changes": {
        "ko": "변경사항 없음",
        "en": "No changes",
    },
    "sync.notes_synced": {
        "ko": "{count}개 노트 동기화 완료",
        "en": "{count} notes synced",
    },
    "sync.failed": {
        "ko": "동기화 실패",
        "en": "Sync failed",
    },
    "sync.already_running": {
        "ko": "동기화가 이미 진행 중입니다",
        "en": "Sync is already in progress",
    },
    "sync.nas_not_configured": {
        "ko": "NAS 설정이 필요합니다",
        "en": "NAS configuration required",
    },
    "sync.push_success": {
        "ko": "NAS에 노트를 업로드했습니다",
        "en": "Note pushed to NAS",
    },
    "sync.push_skipped": {
        "ko": "로컬 수정 없음",
        "en": "No local modifications",
    },
    "sync.push_conflict": {
        "ko": "NAS 노트가 더 최신입니다. 강제 업로드하려면 force=true를 사용하세요.",
        "en": "NAS note is newer. Use force=true to overwrite.",
    },
    "sync.pull_success": {
        "ko": "NAS에서 노트를 가져왔습니다",
        "en": "Note pulled from NAS",
    },
    "sync.pull_skipped": {
        "ko": "NAS 변경 없음",
        "en": "No changes on NAS",
    },
    "sync.pull_conflict": {
        "ko": "로컬 수정이 있습니다. 강제 가져오기하려면 force=true를 사용하세요.",
        "en": "Local modifications exist. Use force=true to overwrite.",
    },
    "sync.note_not_found": {
        "ko": "노트를 찾을 수 없습니다",
        "en": "Note not found",
    },
    "sync.2fa_required": {
        "ko": "2FA 계정은 자동 동기화를 지원하지 않습니다. NSX 파일을 가져오기하세요.",
        "en": "2FA accounts do not support automatic sync. Please import NSX file.",
    },
    "sync.nas_connection_failed": {
        "ko": "NAS 연결 실패: {detail}",
        "en": "NAS connection failed: {detail}",
    },
    "sync.no_write_permission": {
        "ko": "NoteStation 쓰기 권한이 없습니다. NAS 설정을 확인하세요.",
        "en": "No NoteStation write permission. Check NAS settings.",
    },
    "sync.push_conflict_detail": {
        "ko": "NAS에서 더 최근에 수정되었습니다 ({time}). 강제 푸시하려면 다시 시도하세요.",
        "en": "NAS was modified more recently ({time}). Try again to force push.",
    },
    "sync.push_success_detail": {
        "ko": "'{title}' NAS 동기화 완료",
        "en": "'{title}' synced to NAS",
    },
    "sync.push_error": {
        "ko": "동기화 실패: {detail}",
        "en": "Sync failed: {detail}",
    },
    "sync.pull_no_changes": {
        "ko": "NAS에 변경된 내용이 없습니다.",
        "en": "No changes on NAS.",
    },
    "sync.pull_conflict_prompt": {
        "ko": "로컬에서 수정된 내용이 있습니다. 덮어쓰시겠습니까?",
        "en": "Local modifications exist. Overwrite?",
    },
    "sync.pull_success_detail": {
        "ko": "'{title}' NAS에서 가져오기 완료",
        "en": "'{title}' pulled from NAS",
    },
    "sync.pull_error": {
        "ko": "가져오기 실패: {detail}",
        "en": "Pull failed: {detail}",
    },
    "sync.trigger_started": {
        "ko": "동기화를 시작합니다.",
        "en": "Starting synchronization.",
    },
    "sync.trigger_already_running": {
        "ko": "이미 동기화가 진행 중입니다.",
        "en": "Sync is already in progress.",
    },
    "sync.push_skipped_detail": {
        "ko": "로컬에서 수정된 내용이 없습니다.",
        "en": "No local modifications.",
    },
    "sync.created": {
        "ko": "생성: {count}개",
        "en": "Created: {count}",
    },
    "sync.updated": {
        "ko": "수정: {count}개",
        "en": "Updated: {count}",
    },
    "sync.deleted": {
        "ko": "삭제: {count}개",
        "en": "Deleted: {count}",
    },
    "sync.conflicts": {
        "ko": "충돌: {count}개",
        "en": "Conflicts: {count}",
    },
    # Search messages
    "search.no_results": {
        "ko": "검색 결과가 없습니다. 다른 검색어를 시도해 주세요.",
        "en": "No results found. Try a different search query.",
    },
    "search.index_started": {
        "ko": "인덱싱 시작",
        "en": "Indexing started",
    },
    "search.index_completed": {
        "ko": "인덱싱 완료",
        "en": "Indexing completed",
    },
    "search.index_already_running": {
        "ko": "인덱싱이 이미 진행 중입니다",
        "en": "Indexing is already in progress",
    },
    "search.index_trigger_already_running": {
        "ko": "임베딩 인덱싱이 이미 진행 중입니다.",
        "en": "Embedding indexing is already in progress.",
    },
    "search.index_trigger_no_api_key": {
        "ko": "OpenAI API 키가 필요합니다. Settings에서 API 키를 입력하거나 OAuth 연결하세요.",
        "en": "OpenAI API key required. Enter API key in Settings or connect via OAuth.",
    },
    "search.index_trigger_started": {
        "ko": "임베딩 인덱싱을 시작합니다. ({source} 사용)",
        "en": "Starting embedding indexing (using {source})",
    },
    # Settings messages
    "settings.nas_test_success": {
        "ko": "NAS 연결 성공",
        "en": "NAS connection successful",
    },
    "settings.nas_test_failed": {
        "ko": "NAS 연결 실패: {detail}",
        "en": "NAS connection failed: {detail}",
    },
    "settings.saved": {
        "ko": "설정이 저장되었습니다",
        "en": "Settings saved",
    },
    "settings.nas_url_not_set": {
        "ko": "NAS URL이 설정되지 않았습니다.",
        "en": "NAS URL is not configured.",
    },
    "settings.nas_test_success_full": {
        "ko": "NAS에 성공적으로 연결되었습니다.",
        "en": "Successfully connected to NAS.",
    },
    "settings.nas_test_success_2fa": {
        "ko": "NAS 연결 성공 (2FA 계정)",
        "en": "NAS connection successful (2FA account)",
    },
    "settings.nas_test_auth_failed": {
        "ko": "NAS 인증에 실패했습니다. 사용자 이름과 비밀번호를 확인하세요.",
        "en": "NAS authentication failed. Check username and password.",
    },
    "settings.nas_test_connection_failed": {
        "ko": "NAS 연결에 실패했습니다: {detail}",
        "en": "NAS connection failed: {detail}",
    },
    "settings.ai_test_success": {
        "ko": "{provider} 연결 성공",
        "en": "{provider} connected successfully",
    },
    "settings.ai_test_failed": {
        "ko": "{provider} 연결 실패: {detail}",
        "en": "{provider} connection failed: {detail}",
    },
    "settings.ai_test_no_key": {
        "ko": "{provider} API 키가 설정되지 않았습니다",
        "en": "No API key configured for {provider}",
    },
    # Graph messages
    "graph.no_data": {
        "ko": "그래프 데이터가 없습니다",
        "en": "No graph data available",
    },
    "graph.cluster_insufficient_notes": {
        "ko": "분석할 노트가 충분하지 않습니다. 최소 2개의 노트가 필요합니다.",
        "en": "Insufficient notes for analysis. At least 2 notes are required.",
    },
}


def msg(key: str, lang: str = "ko", **kwargs: object) -> str:
    """Return a translated message for the given key and language.

    Args:
        key: Dot-separated message key (e.g. "sync.completed").
        lang: Language code ("ko" or "en").
        **kwargs: Interpolation variables for the message template.

    Returns:
        Translated and formatted message string.
        Falls back to Korean if key not found for the requested language.
    """
    entry = _MESSAGES.get(key)
    if entry is None:
        return key

    template = entry.get(lang, entry.get("ko", key))
    if kwargs:
        try:
            return template.format(**kwargs)
        except (KeyError, IndexError):
            return template
    return template
