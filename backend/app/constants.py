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
