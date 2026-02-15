# @TASK P3-T3.7 - RAG 검색 QA 프롬프트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""RAG search QA prompt template.

Answers user questions based on retrieved research note context,
providing referenced and grounded responses.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 연구노트 기반 질의응답 전문가입니다. "
        "사용자의 질문에 대해 제공된 연구노트 컨텍스트를 참조하여 정확하게 답변합니다.\n\n"
        "답변 규칙:\n"
        "1. 반드시 제공된 노트 내용을 근거로 답변하세요.\n"
        "2. 답변에 출처 노트를 명시하세요 (예: [노트 1], [노트 2]).\n"
        "3. 제공된 노트에 관련 정보가 없으면 솔직하게 '관련 정보를 찾을 수 없습니다'라고 답변하세요.\n"
        "4. 추측이 포함된 경우 명확히 구분하여 표시하세요.\n"
        "5. 마크다운 형식으로 깔끔하게 정리하여 답변하세요."
    ),
    "en": (
        "You are an expert in research note-based question answering. "
        "Answer the user's questions accurately by referencing the provided research note context.\n\n"
        "Answer guidelines:\n"
        "1. Always base your answer on the provided note content.\n"
        "2. Cite source notes in your answer (e.g., [Note 1], [Note 2]).\n"
        "3. If there is no relevant information in the provided notes, honestly state 'No relevant information found'.\n"
        "4. Clearly distinguish and mark any speculation.\n"
        "5. Organize your answer neatly in markdown format."
    ),
}

NOTE_LABEL_TEMPLATES: dict[str, str] = {
    "ko": "[노트 {index}]",
    "en": "[Note {index}]",
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": "참조 노트:\n{notes_section}\n\n질문: {question}",
    "en": "Reference notes:\n{notes_section}\n\nQuestion: {question}",
}


def build_messages(
    question: str,
    context_notes: list[str],
    category_context: str | None = None,
    lang: str = "ko",
    **kwargs: object,
) -> list[Message]:
    """Build message list for RAG-based question answering.

    Args:
        question: The user's question.
        context_notes: List of retrieved note contents as context.
        category_context: Optional category-specific AI prompt to inject.
        lang: Language for prompts ("ko" or "en"). Defaults to "ko".
        **kwargs: Reserved for future extensions.

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If question is empty or context_notes is empty.
    """
    if not question or not question.strip():
        raise ValueError("question must not be empty")
    if not context_notes:
        raise ValueError("context_notes must not be empty")

    system_content = SYSTEM_PROMPTS[lang]
    if category_context:
        system_content += f"\n\n[카테고리 분석 지침]\n{category_context}"

    note_label = NOTE_LABEL_TEMPLATES[lang]
    notes_section = "\n\n".join(
        f"{note_label.format(index=i + 1)}\n{note}" for i, note in enumerate(context_notes)
    )

    user_content = USER_PROMPT_TEMPLATES[lang].format(notes_section=notes_section, question=question)

    return [
        Message(role="system", content=system_content),
        Message(role="user", content=user_content),
    ]
