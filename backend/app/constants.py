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


class NotebookCategory(StrEnum):
    LABNOTE = "labnote"
    DAILY_LOG = "daily_log"
    MEETING = "meeting"
    SOP = "sop"
    PROTOCOL = "protocol"
    REFERENCE = "reference"


# Category display labels (ko / en)
NOTEBOOK_CATEGORY_LABELS: dict[str, dict[str, str]] = {
    NotebookCategory.LABNOTE: {"ko": "연구 노트", "en": "Lab Note"},
    NotebookCategory.DAILY_LOG: {"ko": "업무록", "en": "Daily Log"},
    NotebookCategory.MEETING: {"ko": "회의록", "en": "Meeting"},
    NotebookCategory.SOP: {"ko": "표준 운영 절차", "en": "SOP"},
    NotebookCategory.PROTOCOL: {"ko": "실험 프로토콜", "en": "Protocol"},
    NotebookCategory.REFERENCE: {"ko": "참고 자료", "en": "Reference"},
}

VALID_CATEGORIES = set(NotebookCategory)
