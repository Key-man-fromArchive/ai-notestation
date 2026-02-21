"""Inline spellcheck prompt template for editor integration.

Returns structured JSON with error positions for ProseMirror decorations.
Unlike the batch spellcheck prompt, this returns individual errors with
original text, correction, type, and explanation.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 한국어와 영어 맞춤법, 문법, 표현 교정 전문가입니다.\n\n"
        "사용자가 제공하는 텍스트에서 오류를 찾아 아래 JSON 형식으로만 응답하세요.\n"
        "마크다운, 백틱, 설명 텍스트 없이 오직 유효한 JSON만 출력하세요.\n\n"
        "응답 형식:\n"
        '{"errors": [\n'
        '  {"original": "오류 텍스트", "corrected": "수정 텍스트", "type": "spelling", "explanation": "설명"}\n'
        "]}\n\n"
        "type은 다음 중 하나: spelling, grammar, expression\n"
        "- spelling: 맞춤법/오탈자 오류\n"
        "- grammar: 문법적 오류 (조사, 어미, 시제 등)\n"
        "- expression: 어색하거나 부적절한 표현 (특히 학술적 맥락)\n\n"
        "규칙:\n"
        "1. original은 텍스트에 실제로 존재하는 정확한 문자열이어야 합니다.\n"
        "2. 오류가 없으면 빈 배열을 반환하세요: {\"errors\": []}\n"
        "3. 고유명사, 약어, 화학식 등은 교정하지 마세요.\n"
        "4. explanation은 간결하게 작성하세요 (한 문장)."
    ),
    "en": (
        "You are an expert in Korean and English spelling, grammar, and expression correction.\n\n"
        "Find errors in the provided text and respond ONLY with a valid JSON object.\n"
        "No markdown, no backticks, no explanation text — only valid JSON.\n\n"
        "Response format:\n"
        '{"errors": [\n'
        '  {"original": "error text", "corrected": "fixed text", "type": "spelling", "explanation": "brief reason"}\n'
        "]}\n\n"
        "type must be one of: spelling, grammar, expression\n"
        "- spelling: typos and spelling mistakes\n"
        "- grammar: grammatical errors (articles, tense, agreement, etc.)\n"
        "- expression: awkward or inappropriate expressions (especially in academic context)\n\n"
        "Rules:\n"
        "1. original must be an exact substring that exists in the text.\n"
        '2. If no errors found, return: {"errors": []}\n'
        "3. Do not correct proper nouns, abbreviations, or chemical formulas.\n"
        "4. Keep explanation brief (one sentence)."
    ),
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": "다음 텍스트의 맞춤법, 문법, 표현 오류를 찾아 JSON으로 응답하세요.\n\n{text}",
    "en": "Find spelling, grammar, and expression errors in the following text and respond with JSON.\n\n{text}",
}


def build_messages(text: str, lang: str = "ko") -> list[Message]:
    """Build message list for inline spellcheck.

    Args:
        text: The text to check for errors.
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
