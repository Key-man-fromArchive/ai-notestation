"""Handwriting recognition prompt templates.

Converts handwritten text/diagrams/math captured as images
into structured text, search-indexable descriptions, or LaTeX.
"""

from __future__ import annotations

from app.ai_router.schemas import ImageContent, Message

SYSTEM_PROMPTS: dict[str, dict[str, str]] = {
    "text": {
        "ko": (
            "당신은 손글씨 인식 전문가입니다. "
            "이미지에서 손으로 쓴 텍스트를 정확하게 읽어 텍스트로 변환합니다.\n\n"
            "규칙:\n"
            "1. 한국어와 영어가 혼합된 손글씨를 정확히 인식하세요.\n"
            "2. 줄바꿈과 단락 구조를 보존하세요.\n"
            "3. 인식된 텍스트만 출력하세요. 설명이나 주석을 추가하지 마세요.\n"
            "4. 읽을 수 없는 부분은 [?]로 표시하세요."
        ),
        "en": (
            "You are a handwriting recognition expert. "
            "Accurately read and convert handwritten text from images.\n\n"
            "Rules:\n"
            "1. Accurately recognize handwriting in Korean and English.\n"
            "2. Preserve line breaks and paragraph structure.\n"
            "3. Output only the recognized text. Do not add explanations or annotations.\n"
            "4. Mark illegible parts with [?]."
        ),
    },
    "ink": {
        "ko": (
            "당신은 손글씨 및 다이어그램 분석 전문가입니다. "
            "이미지에서 손으로 쓴 내용과 그린 도형을 분석하여 검색 가능한 텍스트로 변환합니다.\n\n"
            "규칙:\n"
            "1. 텍스트 부분은 그대로 인식하여 출력하세요.\n"
            "2. 도형이나 다이어그램은 [Diagram: 설명]으로 기술하세요.\n"
            "3. 화살표, 연결선 등의 관계도 설명에 포함하세요.\n"
            "4. 읽을 수 없는 부분은 [?]로 표시하세요."
        ),
        "en": (
            "You are a handwriting and diagram analysis expert. "
            "Analyze handwritten content and drawn shapes from images into searchable text.\n\n"
            "Rules:\n"
            "1. Recognize and output text parts as-is.\n"
            "2. Describe shapes or diagrams as [Diagram: description].\n"
            "3. Include relationships like arrows and connecting lines in the description.\n"
            "4. Mark illegible parts with [?]."
        ),
    },
    "math": {
        "ko": (
            "당신은 수학 수식 인식 전문가입니다. "
            "손으로 쓴 수학 수식을 LaTeX로 변환합니다.\n\n"
            "규칙:\n"
            "1. 수식을 정확한 LaTeX로 변환하세요.\n"
            "2. 여러 줄 수식은 aligned 환경을 사용하세요.\n"
            "3. $$ $$ 로 감싸서 출력하세요.\n"
            "4. 수식 외 텍스트가 있으면 수식과 분리하여 출력하세요."
        ),
        "en": (
            "You are a mathematical formula recognition expert. "
            "Convert handwritten mathematical formulas into LaTeX.\n\n"
            "Rules:\n"
            "1. Convert formulas into accurate LaTeX.\n"
            "2. Use the aligned environment for multi-line formulas.\n"
            "3. Wrap output in $$ $$.\n"
            "4. If there is non-formula text, output it separately from formulas."
        ),
    },
}

USER_PROMPT_TEMPLATES: dict[str, dict[str, str]] = {
    "text": {
        "ko": "이 이미지의 손글씨를 텍스트로 변환해주세요.",
        "en": "Convert the handwriting in this image to text.",
    },
    "ink": {
        "ko": "이 이미지의 손글씨와 도형을 검색 가능한 텍스트로 변환해주세요.",
        "en": "Convert the handwriting and diagrams in this image to searchable text.",
    },
    "math": {
        "ko": "이 이미지의 수학 수식을 LaTeX로 변환해주세요.",
        "en": "Convert the mathematical formulas in this image to LaTeX.",
    },
}


def build_messages(
    image: ImageContent,
    mode: str = "text",
    lang: str = "ko",
) -> list[Message]:
    """Build message list for handwriting recognition.

    Args:
        image: Base64-encoded image of the handwriting.
        mode: Recognition mode ("text", "ink", or "math").
        lang: Language for prompts ("ko" or "en"). Defaults to "ko".

    Returns:
        A list of Message objects (system + user with image).

    Raises:
        ValueError: If mode is invalid.
    """
    if mode not in SYSTEM_PROMPTS:
        raise ValueError(f"Invalid mode: {mode}. Must be one of: text, ink, math")

    return [
        Message(role="system", content=SYSTEM_PROMPTS[mode][lang]),
        Message(
            role="user",
            content=USER_PROMPT_TEMPLATES[mode][lang],
            images=[image],
        ),
    ]
