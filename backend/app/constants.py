from enum import StrEnum


class MemberRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class NotePermission(StrEnum):
    READ = "read"
    WRITE = "write"
    ADMIN = "admin"


class LinkType(StrEnum):
    PUBLIC = "public"
    EMAIL_REQUIRED = "email_required"
    TIME_LIMITED = "time_limited"


# Default notebook categories (fallback when settings not loaded yet)
DEFAULT_NOTEBOOK_CATEGORIES: list[dict[str, str]] = [
    # Research
    {"value": "labnote", "ko": "연구 노트", "en": "Lab Note", "color": "bg-blue-100 text-blue-700"},
    {"value": "daily_log", "ko": "업무록", "en": "Daily Log", "color": "bg-green-100 text-green-700"},
    {"value": "meeting", "ko": "회의록", "en": "Meeting", "color": "bg-purple-100 text-purple-700"},
    {"value": "sop", "ko": "표준 운영 절차", "en": "SOP", "color": "bg-orange-100 text-orange-700"},
    {"value": "protocol", "ko": "실험 프로토콜", "en": "Protocol", "color": "bg-red-100 text-red-700"},
    {"value": "reference", "ko": "참고 자료", "en": "Reference", "color": "bg-gray-100 text-gray-700"},
    # Lifestyle
    {"value": "diary", "ko": "일기", "en": "Diary", "color": "bg-yellow-100 text-yellow-700"},
    {"value": "travel", "ko": "여행", "en": "Travel", "color": "bg-pink-100 text-pink-700"},
    {"value": "recipe", "ko": "레시피", "en": "Recipe", "color": "bg-cyan-100 text-cyan-700"},
    {"value": "health", "ko": "건강", "en": "Health", "color": "bg-teal-100 text-teal-700"},
    {"value": "finance", "ko": "재무", "en": "Finance", "color": "bg-indigo-100 text-indigo-700"},
    {"value": "hobby", "ko": "취미", "en": "Hobby", "color": "bg-amber-100 text-amber-700"},
]

VALID_CATEGORIES = {c["value"] for c in DEFAULT_NOTEBOOK_CATEGORIES}
