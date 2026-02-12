# @TASK P3-T3.7 - 인사이트 도출 프롬프트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Insight extraction prompt template.

Analyzes research notes to identify key points, patterns,
and connections, producing structured insights.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 연구노트 분석 전문가입니다. "
        "사용자가 제공하는 연구노트 내용을 깊이 있게 분석하여 "
        "핵심 포인트, 데이터 패턴, 개념 간 연결관계를 식별합니다.\n\n"
        "노트에 이미지(실험 사진, 그래프, 다이어그램 등)가 포함되어 있을 수 있습니다. "
        "이미지가 있다면 텍스트와 함께 종합적으로 분석하세요.\n\n"
        "분석 결과는 다음 구조로 제공하세요:\n"
        "1. **요약**: 노트의 핵심 내용을 2-3문장으로 요약\n"
        "2. **핵심 발견**: 중요한 발견사항을 불릿 포인트로 나열\n"
        "3. **이미지 분석**: 이미지가 있다면 각 이미지의 주요 내용과 시사점 분석\n"
        "4. **패턴 및 연결**: 데이터 간 패턴이나 다른 연구와의 연결점\n"
        "5. **제안**: 후속 실험이나 추가 분석에 대한 제안\n\n"
        "마크다운 형식으로 깔끔하게 정리하여 답변하세요."
    ),
    "en": (
        "You are an expert in analyzing research notes. "
        "Deeply analyze the research note content provided by the user to identify "
        "key points, data patterns, and connections between concepts.\n\n"
        "The note may contain images (experimental photos, graphs, diagrams, etc.). "
        "If images are present, analyze them comprehensively together with the text.\n\n"
        "Provide your analysis in the following structure:\n"
        "1. **Summary**: Summarize the core content of the note in 2-3 sentences\n"
        "2. **Key Findings**: List important discoveries in bullet points\n"
        "3. **Image Analysis**: If images are present, analyze the main content and implications of each image\n"
        "4. **Patterns and Connections**: Patterns between data or connections to other research\n"
        "5. **Recommendations**: Suggestions for follow-up experiments or additional analysis\n\n"
        "Please organize your response neatly in markdown format."
    ),
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": "다음 연구노트를 분석하여 인사이트를 도출해주세요.\n\n{note_content}",
    "en": "Please analyze the following research note and extract insights.\n\n{note_content}",
}

USER_CONTEXT_TEMPLATES: dict[str, str] = {
    "ko": "\n\n추가 맥락:\n{additional_context}",
    "en": "\n\nAdditional context:\n{additional_context}",
}


def build_messages(
    note_content: str,
    additional_context: str | None = None,
    lang: str = "ko",
) -> list[Message]:
    """Build message list for insight extraction.

    Args:
        note_content: The research note content to analyze.
        additional_context: Optional extra context or instructions.
        lang: Language for prompts ("ko" or "en"). Defaults to "ko".

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If note_content is empty or whitespace-only.
    """
    if not note_content or not note_content.strip():
        raise ValueError("note_content must not be empty")

    user_parts = [USER_PROMPT_TEMPLATES[lang].format(note_content=note_content)]

    if additional_context:
        user_parts.append(USER_CONTEXT_TEMPLATES[lang].format(additional_context=additional_context))

    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(role="user", content="".join(user_parts)),
    ]
