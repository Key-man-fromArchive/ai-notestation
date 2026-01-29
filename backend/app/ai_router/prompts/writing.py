# @TASK P3-T3.7 - 연구노트 작성 보조 프롬프트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Research note writing assistant prompt template.

Helps users draft research notes in markdown format,
optionally incorporating keywords and extending existing content.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPT: str = (
    "당신은 과학 및 연구 글쓰기 보조 전문가입니다. "
    "사용자가 제공하는 주제와 키워드를 바탕으로 체계적인 연구노트 초안을 작성합니다.\n\n"
    "작성 규칙:\n"
    "1. 마크다운 형식으로 구조화하여 작성하세요.\n"
    "2. 과학적 글쓰기 관례를 따르세요 (객관적 서술, 수동태 활용).\n"
    "3. 섹션 구조: 목적, 배경, 방법, 결과, 고찰 등을 적절히 활용하세요.\n"
    "4. 기존 내용이 제공되면 그 흐름을 이어서 확장하세요.\n"
    "5. 키워드가 제공되면 해당 키워드를 자연스럽게 포함하세요."
)


def build_messages(
    topic: str,
    keywords: list[str] | None = None,
    existing_content: str | None = None,
) -> list[Message]:
    """Build message list for research note writing assistance.

    Args:
        topic: The topic or subject of the research note.
        keywords: Optional list of keywords to incorporate.
        existing_content: Optional existing content to extend.

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If topic is empty or whitespace-only.
    """
    if not topic or not topic.strip():
        raise ValueError("topic must not be empty")

    user_parts = [f"다음 주제로 연구노트 초안을 작성해주세요.\n\n주제: {topic}"]

    if keywords:
        keywords_str = ", ".join(keywords)
        user_parts.append(f"\n\n키워드: {keywords_str}")

    if existing_content:
        user_parts.append(f"\n\n기존 내용 (이어서 확장해주세요):\n{existing_content}")

    return [
        Message(role="system", content=SYSTEM_PROMPT),
        Message(role="user", content="".join(user_parts)),
    ]
