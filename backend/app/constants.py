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
# Each category includes AI cognitive fields: prompt, extraction_hints, search_boost_terms
DEFAULT_NOTEBOOK_CATEGORIES: list[dict] = [
    # Research
    {
        "value": "labnote", "ko": "연구 노트", "en": "Lab Note",
        "color": "bg-blue-100 text-blue-700",
        "prompt": (
            "이 노트는 연구 노트입니다. 가설, 실험 방법론, 관찰 결과, 데이터 해석, 한계점 관점에서 분석하세요. "
            "구조: 배경→방법→결과→고찰→다음 단계."
        ),
        "extraction_hints": ["hypothesis", "method", "result", "conclusion", "next_step"],
        "search_boost_terms": ["실험", "결과", "가설", "프로토콜", "데이터"],
    },
    {
        "value": "daily_log", "ko": "업무록", "en": "Daily Log",
        "color": "bg-green-100 text-green-700",
        "prompt": "이 노트는 업무록입니다. 완료 작업, 진행 상황, 블로커, 내일 계획 관점에서 분석하세요.",
        "extraction_hints": ["task", "decision", "blocker", "plan"],
        "search_boost_terms": ["작업", "완료", "진행", "계획", "이슈"],
    },
    {
        "value": "meeting", "ko": "회의록", "en": "Meeting",
        "color": "bg-purple-100 text-purple-700",
        "prompt": "이 노트는 회의록입니다. 참석자, 안건, 결정 사항, 액션아이템 관점에서 분석하세요.",
        "extraction_hints": ["attendee", "agenda", "decision", "action_item", "deadline"],
        "search_boost_terms": ["회의", "결정", "액션", "담당", "마감"],
    },
    {
        "value": "sop", "ko": "표준 운영 절차", "en": "SOP",
        "color": "bg-orange-100 text-orange-700",
        "prompt": "이 노트는 표준 운영 절차(SOP)입니다. 절차 완전성, 순서, 안전 조치, 예외 처리 관점에서 분석하세요.",
        "extraction_hints": ["step", "prerequisite", "safety", "exception"],
        "search_boost_terms": ["절차", "단계", "주의", "기준", "승인"],
    },
    {
        "value": "protocol", "ko": "실험 프로토콜", "en": "Protocol",
        "color": "bg-red-100 text-red-700",
        "prompt": "이 노트는 실험 프로토콜입니다. 재료/장비, 단계, 주의사항, 트러블슈팅 관점에서 분석하세요.",
        "extraction_hints": ["material", "equipment", "step", "caution", "troubleshoot"],
        "search_boost_terms": ["시약", "장비", "온도", "시간", "농도"],
    },
    {
        "value": "reference", "ko": "참고 자료", "en": "Reference",
        "color": "bg-gray-100 text-gray-700",
        "prompt": "이 노트는 참고 자료입니다. 핵심 주장, 근거, 방법론, 한계, 연관성 관점에서 분석하세요.",
        "extraction_hints": ["claim", "evidence", "methodology", "limitation", "relevance"],
        "search_boost_terms": ["논문", "연구", "결론", "인용", "방법"],
    },
    # Lifestyle
    {
        "value": "diary", "ko": "일기", "en": "Diary",
        "color": "bg-yellow-100 text-yellow-700",
        "prompt": "이 노트는 일기입니다. 감정, 사건, 깨달음, 감사, 패턴 관점에서 분석하세요.",
        "extraction_hints": ["emotion", "event", "insight", "gratitude"],
        "search_boost_terms": ["오늘", "느낌", "생각", "감사", "배움"],
    },
    {
        "value": "travel", "ko": "여행", "en": "Travel",
        "color": "bg-pink-100 text-pink-700",
        "prompt": "이 노트는 여행 기록입니다. 방문지, 경험, 비용, 추천, 팁 관점에서 분석하세요.",
        "extraction_hints": ["place", "experience", "cost", "recommendation", "tip"],
        "search_boost_terms": ["여행", "숙소", "교통", "맛집", "경비"],
    },
    {
        "value": "recipe", "ko": "레시피", "en": "Recipe",
        "color": "bg-cyan-100 text-cyan-700",
        "prompt": "이 노트는 레시피입니다. 재료, 순서, 시간, 난이도, 대체 재료 관점에서 분석하세요.",
        "extraction_hints": ["ingredient", "step", "time", "difficulty", "substitute"],
        "search_boost_terms": ["재료", "분량", "조리", "불", "시간"],
    },
    {
        "value": "health", "ko": "건강", "en": "Health",
        "color": "bg-teal-100 text-teal-700",
        "prompt": "이 노트는 건강 기록입니다. 증상, 조치, 경과, 약물, 습관 관점에서 분석하세요.",
        "extraction_hints": ["symptom", "treatment", "progress", "medication", "habit"],
        "search_boost_terms": ["증상", "약", "병원", "운동", "수면"],
    },
    {
        "value": "finance", "ko": "재무", "en": "Finance",
        "color": "bg-indigo-100 text-indigo-700",
        "prompt": "이 노트는 재무 기록입니다. 수입/지출, 금액, 예산, 추세, 절약 관점에서 분석하세요.",
        "extraction_hints": ["income", "expense", "budget", "trend", "saving"],
        "search_boost_terms": ["수입", "지출", "예산", "저축", "투자"],
    },
    {
        "value": "hobby", "ko": "취미", "en": "Hobby",
        "color": "bg-amber-100 text-amber-700",
        "prompt": "이 노트는 취미 기록입니다. 활동, 진행, 배운 것, 목표, 재료 관점에서 분석하세요.",
        "extraction_hints": ["activity", "progress", "learning", "goal", "material"],
        "search_boost_terms": ["연습", "진행", "목표", "장비", "기술"],
    },
]

VALID_CATEGORIES = {c["value"] for c in DEFAULT_NOTEBOOK_CATEGORIES}
