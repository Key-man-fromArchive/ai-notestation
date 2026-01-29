# @TASK P3-T3.7 - 템플릿 생성 프롬프트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Research note template generation prompt.

Generates markdown templates for various research note types
such as experiment logs, paper reviews, and lab reports.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPT: str = (
    "당신은 연구노트 템플릿 생성 전문가입니다. "
    "사용자가 요청하는 유형의 연구노트 템플릿을 마크다운 형식으로 생성합니다.\n\n"
    "템플릿 생성 규칙:\n"
    "1. 해당 유형에 적합한 섹션 구조를 포함하세요.\n"
    "2. 각 섹션에 작성 가이드를 주석으로 포함하세요.\n"
    "3. 마크다운 형식으로 깔끔하게 구성하세요.\n"
    "4. 날짜, 작성자 등 메타데이터 필드를 포함하세요.\n"
    "5. 실제 사용할 수 있도록 실용적인 구조를 제공하세요."
)

VALID_TEMPLATE_TYPES: set[str] = {
    "experiment_log",
    "paper_review",
    "meeting_notes",
    "lab_report",
    "research_proposal",
}

_TEMPLATE_TYPE_LABELS: dict[str, str] = {
    "experiment_log": "실험 기록",
    "paper_review": "논문 리뷰",
    "meeting_notes": "회의록",
    "lab_report": "실험 보고서",
    "research_proposal": "연구 제안서",
}


def build_messages(
    template_type: str,
    custom_instructions: str | None = None,
) -> list[Message]:
    """Build message list for research note template generation.

    Args:
        template_type: Type of template to generate. Must be one of:
            "experiment_log", "paper_review", "meeting_notes",
            "lab_report", "research_proposal".
        custom_instructions: Optional additional instructions for customization.

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If template_type is empty or not a valid type.
    """
    if not template_type or not template_type.strip():
        raise ValueError("template_type must not be empty")
    if template_type not in VALID_TEMPLATE_TYPES:
        raise ValueError(
            f"Invalid template_type: '{template_type}'. Must be one of: {', '.join(sorted(VALID_TEMPLATE_TYPES))}"
        )

    label = _TEMPLATE_TYPE_LABELS[template_type]
    user_parts = [f"'{label}' ({template_type}) 유형의 연구노트 템플릿을 마크다운 형식으로 생성해주세요."]

    if custom_instructions:
        user_parts.append(f"\n\n추가 요청사항:\n{custom_instructions}")

    return [
        Message(role="system", content=SYSTEM_PROMPT),
        Message(role="user", content="".join(user_parts)),
    ]
