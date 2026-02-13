"""Quality evaluation prompt template.

Evaluates AI responses against a task-specific checklist.
Used by QualityGate to assess response quality with structured JSON output.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 AI 응답 품질 평가 전문가입니다. "
        "사용자의 원본 요청과 AI 응답을 체크리스트 항목에 따라 평가합니다.\n\n"
        "규칙:\n"
        "1. 각 체크리스트 항목에 대해 AI 응답이 충족하는지 판단하세요.\n"
        "2. passed: true(완전 충족), false(미충족), null(부분 충족)\n"
        "3. note에 판단 근거를 한 문장으로 작성하세요.\n"
        "4. summary에 전체 평가를 한 줄로 요약하세요.\n"
        "5. 반드시 JSON 형식으로만 응답하세요:\n"
        '{"items": [{"question": "항목", "passed": true/false/null, "note": "이유"}], '
        '"summary": "전체 평가 한 줄 요약"}'
    ),
    "en": (
        "You are an AI response quality evaluator. "
        "Evaluate the AI response against the checklist items based on the original request.\n\n"
        "Rules:\n"
        "1. For each checklist item, determine if the AI response meets the criteria.\n"
        "2. passed: true (fully met), false (not met), null (partially met)\n"
        "3. Write a one-sentence justification in the note field.\n"
        "4. Write a one-line overall assessment in the summary field.\n"
        "5. Respond ONLY in JSON format:\n"
        '{"items": [{"question": "item", "passed": true/false/null, "note": "reason"}], '
        '"summary": "one-line overall assessment"}'
    ),
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": (
        "## 원본 요청\n{original_request}\n\n"
        "## AI 응답\n{ai_response}\n\n"
        "## 체크리스트\n{checklist}\n\n"
        "위 체크리스트 항목별로 AI 응답을 평가하여 JSON으로 응답하세요."
    ),
    "en": (
        "## Original Request\n{original_request}\n\n"
        "## AI Response\n{ai_response}\n\n"
        "## Checklist\n{checklist}\n\n"
        "Evaluate the AI response for each checklist item and respond in JSON."
    ),
}


def build_messages(
    original_request: str,
    ai_response: str,
    checklist_items: list[str],
    lang: str = "ko",
) -> list[Message]:
    """Build message list for quality evaluation.

    Args:
        original_request: The user's original request text.
        ai_response: The AI-generated response to evaluate.
        checklist_items: List of checklist question strings.
        lang: Language for prompts ("ko" or "en").

    Returns:
        A list of Message objects (system + user).
    """
    checklist_text = "\n".join(
        f"{i}. {item}" for i, item in enumerate(checklist_items, 1)
    )

    # Truncate long content to keep evaluation prompt compact
    truncated_request = original_request[:2000]
    truncated_response = ai_response[:4000]

    user_content = USER_PROMPT_TEMPLATES[lang].format(
        original_request=truncated_request,
        ai_response=truncated_response,
        checklist=checklist_text,
    )

    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(role="user", content=user_content),
    ]
