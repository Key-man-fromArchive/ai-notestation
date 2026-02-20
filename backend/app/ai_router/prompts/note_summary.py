"""Note summary prompt template for generating embedding-optimized summaries.

Unlike ``summarize.py`` (which generates title + tags in JSON), this module
produces free-text 2-3 sentence summaries that capture the note's key topic,
methodology, and findings. These summaries are embedded as special chunks
(chunk_type="summary") to improve recall for question-type queries.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 연구노트 요약 전문가입니다. "
        "주어진 노트 내용을 2~3문장으로 요약해주세요.\n\n"
        "규칙:\n"
        "- 핵심 주제, 방법론, 주요 발견/결론을 포함\n"
        "- 검색에 최적화된 명확하고 구체적인 문장\n"
        "- 요약만 출력하고, 다른 텍스트는 포함하지 마세요\n"
        "- 2~3문장으로 제한"
    ),
    "en": (
        "You are an expert in research note summarization. "
        "Summarize the given note content in 2-3 sentences.\n\n"
        "Guidelines:\n"
        "- Include the key topic, methodology, and main findings/conclusions\n"
        "- Write clear, specific sentences optimized for search retrieval\n"
        "- Output only the summary, no other text\n"
        "- Limit to 2-3 sentences"
    ),
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": "다음 노트 내용을 2~3문장으로 요약해주세요.\n\n{note_content}",
    "en": "Please summarize the following note content in 2-3 sentences.\n\n{note_content}",
}

# Maximum characters to send to AI for summary generation
MAX_CONTENT_LENGTH = 12000


def build_messages(note_content: str, lang: str = "ko") -> list[Message]:
    """Build message list for note summary generation.

    Args:
        note_content: The note content to summarize (will be truncated to
            MAX_CONTENT_LENGTH characters).
        lang: Language for prompts ("ko" or "en"). Defaults to "ko".

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If note_content is empty or whitespace-only.
    """
    if not note_content or not note_content.strip():
        raise ValueError("note_content must not be empty")

    truncated = note_content[:MAX_CONTENT_LENGTH]

    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(
            role="user",
            content=USER_PROMPT_TEMPLATES[lang].format(note_content=truncated),
        ),
    ]
