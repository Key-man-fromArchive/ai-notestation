# @TASK P3-T3.7 - 맞춤법 교정 프롬프트
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Spellcheck and grammar correction prompt template.

Corrects Korean and English spelling, grammar, and expression
issues in research note text.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 한국어와 영어 맞춤법, 문법, 표현 교정 전문가입니다. "
        "사용자가 제공하는 텍스트의 오류를 정확하게 찾아 교정합니다.\n\n"
        "교정 규칙:\n"
        "1. 맞춤법 오류를 찾아 교정하세요.\n"
        "2. 문법적으로 어색한 부분을 자연스럽게 수정하세요.\n"
        "3. 학술적/과학적 문맥에 적합한 표현을 사용하세요.\n"
        "4. 원문의 의미와 어조를 최대한 보존하세요.\n\n"
        "출력 형식:\n"
        "1. **교정된 텍스트**: 전체 교정 결과를 제시\n"
        "2. **변경사항**: 각 수정 내용을 '원문 -> 수정' 형태로 나열\n"
        "3. **설명**: 주요 변경에 대한 간략한 설명"
    ),
    "en": (
        "You are an expert in Korean and English spelling, grammar, and expression correction. "
        "Accurately find and correct errors in the text provided by the user.\n\n"
        "Correction guidelines:\n"
        "1. Find and correct spelling errors.\n"
        "2. Naturally fix grammatically awkward parts.\n"
        "3. Use expressions appropriate for academic/scientific context.\n"
        "4. Preserve the original meaning and tone as much as possible.\n\n"
        "Output format:\n"
        "1. **Corrected Text**: Present the full correction result\n"
        "2. **Changes**: List each modification in 'Original -> Corrected' format\n"
        "3. **Explanation**: Brief explanation of major changes"
    ),
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": "다음 텍스트의 맞춤법과 문법을 교정해주세요.\n\n{text}",
    "en": "Please correct the spelling and grammar of the following text.\n\n{text}",
}


def build_messages(text: str, lang: str = "ko") -> list[Message]:
    """Build message list for spelling and grammar correction.

    Args:
        text: The text to check and correct.
        lang: Language for prompts ("ko" or "en"). Defaults to "ko".

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If text is empty or whitespace-only.
    """
    if not text or not text.strip():
        raise ValueError("text must not be empty")

    user_content = USER_PROMPT_TEMPLATES[lang].format(text=text)

    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(role="user", content=user_content),
    ]
