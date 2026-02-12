"""Summarize prompt template for auto-generating note titles and tags.

Analyzes note content and produces a concise title (≤50 chars) and
3–5 relevant tags in JSON format.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 연구노트 요약 전문가입니다. "
        "사용자가 제공하는 노트의 텍스트 및 이미지를 분석하여 적절한 제목과 태그를 생성합니다.\n\n"
        "반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:\n"
        '{"title": "50자 이내의 핵심 제목", "tags": ["태그1", "태그2", "태그3"]}\n\n'
        "규칙:\n"
        "- title: 노트 내용을 대표하는 명확하고 구체적인 제목 (50자 이내)\n"
        "- tags: 노트의 주제, 분야, 키워드를 반영한 태그 3~5개\n"
        "- 이미지가 포함된 경우 이미지의 내용도 제목/태그에 반영\n"
        "- 태그는 한글/영문 혼용 가능, 짧고 간결하게\n"
        "- JSON 외 다른 텍스트를 절대 포함하지 마세요"
    ),
    "en": (
        "You are an expert in research note summarization. "
        "Analyze the text and images in the note provided by the user to generate an appropriate title and tags.\n\n"
        "You must respond ONLY in the JSON format below. Do not include any other text:\n"
        '{"title": "Core title within 50 characters", "tags": ["tag1", "tag2", "tag3"]}\n\n'
        "Guidelines:\n"
        "- title: A clear and specific title representing the note content (within 50 characters)\n"
        "- tags: 3-5 tags reflecting the note's topic, field, and keywords\n"
        "- If images are included, reflect the image content in the title/tags\n"
        "- Tags can be in Korean/English mixed, short and concise\n"
        "- Never include any text other than JSON"
    ),
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": "다음 노트 내용을 분석하여 제목과 태그를 JSON으로 생성해주세요.\n\n{note_content}",
    "en": "Please analyze the following note content and generate a title and tags in JSON format.\n\n{note_content}",
}


def build_messages(note_content: str, lang: str = "ko") -> list[Message]:
    """Build message list for title/tag generation.

    Args:
        note_content: The note content to summarize.
        lang: Language for prompts ("ko" or "en"). Defaults to "ko".

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If note_content is empty or whitespace-only.
    """
    if not note_content or not note_content.strip():
        raise ValueError("note_content must not be empty")

    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(
            role="user",
            content=USER_PROMPT_TEMPLATES[lang].format(note_content=note_content),
        ),
    ]
