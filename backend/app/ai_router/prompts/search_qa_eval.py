"""Search QA evaluation prompt template.

Evaluates Search QA responses for correctness (grounding in source notes)
and utility (relevance to the user's question). Based on the ReSeek paper's
dense reward decomposition: Correctness + Utility as independent signals.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 RAG(검색 증강 생성) 응답 품질 평가 전문가입니다. "
        "AI 응답이 참조 노트에 근거하는지(정확성), 질문에 적절히 답변하는지(유용성)를 평가합니다.\n\n"
        "평가 규칙:\n"
        "1. correctness (0.0~1.0): 응답의 모든 주장이 참조 노트에 근거하면 1.0. "
        "근거 없는 주장(hallucination)이 있으면 감점.\n"
        "2. utility (0.0~1.0): 질문에 대한 직접적이고 완전한 답변이면 1.0. "
        "부분 답변이거나 관련 없는 내용이 많으면 감점.\n"
        "3. source_coverage: 각 참조 노트가 응답에서 인용/활용되었는지 판별.\n"
        "4. grounding_issues: 참조 노트에 없는 주장(hallucination) 목록.\n"
        "5. summary: 전체 평가를 한 줄로 요약.\n\n"
        "반드시 JSON 형식으로만 응답하세요:\n"
        '{"correctness": 0.85, "utility": 0.9, '
        '"source_coverage": [{"note_index": 1, "cited": true, "relevant_claim": "인용된 주장"}], '
        '"grounding_issues": ["근거 없는 주장 목록"], '
        '"summary": "전체 평가 한 줄 요약"}'
    ),
    "en": (
        "You are an expert evaluator for RAG (Retrieval-Augmented Generation) responses. "
        "Evaluate whether the AI response is grounded in the reference notes (correctness) "
        "and appropriately answers the question (utility).\n\n"
        "Evaluation rules:\n"
        "1. correctness (0.0~1.0): 1.0 if all claims are grounded in reference notes. "
        "Deduct for ungrounded claims (hallucinations).\n"
        "2. utility (0.0~1.0): 1.0 for a direct and complete answer to the question. "
        "Deduct for partial answers or irrelevant content.\n"
        "3. source_coverage: Determine if each reference note was cited/used in the response.\n"
        "4. grounding_issues: List claims not supported by reference notes (hallucinations).\n"
        "5. summary: One-line overall assessment.\n\n"
        "Respond ONLY in JSON format:\n"
        '{"correctness": 0.85, "utility": 0.9, '
        '"source_coverage": [{"note_index": 1, "cited": true, "relevant_claim": "cited claim"}], '
        '"grounding_issues": ["ungrounded claim list"], '
        '"summary": "one-line overall assessment"}'
    ),
}

NOTE_LABEL_TEMPLATES: dict[str, str] = {
    "ko": "[노트 {index}] {title}",
    "en": "[Note {index}] {title}",
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": (
        "## 원본 질문\n{question}\n\n"
        "## 참조 노트\n{notes_section}\n\n"
        "## AI 응답\n{ai_response}\n\n"
        "위 참조 노트를 기준으로 AI 응답의 정확성(correctness)과 유용성(utility)을 평가하여 JSON으로 응답하세요."
    ),
    "en": (
        "## Original Question\n{question}\n\n"
        "## Reference Notes\n{notes_section}\n\n"
        "## AI Response\n{ai_response}\n\n"
        "Evaluate the AI response's correctness and utility based on the reference notes above. Respond in JSON."
    ),
}


def build_messages(
    question: str,
    context_notes: list[str],
    note_titles: list[str],
    ai_response: str,
    lang: str = "ko",
) -> list[Message]:
    """Build message list for Search QA evaluation.

    Args:
        question: The user's original question.
        context_notes: List of reference note contents.
        note_titles: List of reference note titles.
        ai_response: The AI-generated response to evaluate.
        lang: Language for prompts ("ko" or "en").

    Returns:
        A list of Message objects (system + user).
    """
    note_label = NOTE_LABEL_TEMPLATES[lang]

    # Build notes section with titles and truncated content
    parts: list[str] = []
    for i, note_content in enumerate(context_notes):
        title = note_titles[i] if i < len(note_titles) else f"Note {i + 1}"
        label = note_label.format(index=i + 1, title=title)
        # Truncate each note to 1500 chars for evaluation prompt
        truncated = note_content[:1500]
        parts.append(f"{label}\n{truncated}")

    notes_section = "\n\n".join(parts)

    # Truncate question and response to keep prompt compact
    truncated_question = question[:2000]
    truncated_response = ai_response[:4000]

    user_content = USER_PROMPT_TEMPLATES[lang].format(
        question=truncated_question,
        notes_section=notes_section,
        ai_response=truncated_response,
    )

    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(role="user", content=user_content),
    ]
