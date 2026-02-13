"""Search query refinement prompt template.

Generates improved search queries based on current results and user feedback.
Used by SearchRefiner to produce better search queries for multi-turn refinement.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 연구노트 검색 쿼리 최적화 전문가입니다. "
        "사용자의 원본 검색 쿼리와 현재 검색 결과를 분석하여 더 나은 검색 쿼리를 생성합니다.\n\n"
        "규칙:\n"
        "1. 검색에 최적화된 키워드 조합을 생성하세요 (자연어 질문 형태가 아닌 핵심 키워드 나열).\n"
        "2. 원본 쿼리의 언어에 맞춰 생성하세요.\n"
        "3. 현재 결과에서 누락된 측면을 파악하여 보완하세요.\n"
        "4. 반드시 JSON 형식으로만 응답하세요:\n"
        '{"refined_query": "개선된 검색 쿼리", '
        '"strategy": "broaden|narrow|related|rephrase", '
        '"reasoning": "한 줄 이유"}\n\n'
        "전략 설명:\n"
        "- broaden: 동의어, 상위 개념 추가로 범위 확장\n"
        "- narrow: 구체적 키워드 추가로 범위 축소\n"
        "- related: 관련 주제/개념 포함\n"
        "- rephrase: 다른 표현으로 재구성"
    ),
    "en": (
        "You are an expert in optimizing research note search queries. "
        "Analyze the user's original search query and current results to generate a better search query.\n\n"
        "Rules:\n"
        "1. Generate keyword combinations optimized for search (not natural language questions).\n"
        "2. Match the language of the original query.\n"
        "3. Identify and address gaps in current results.\n"
        "4. Respond ONLY in JSON format:\n"
        '{"refined_query": "improved search query", '
        '"strategy": "broaden|narrow|related|rephrase", '
        '"reasoning": "one-line reason"}\n\n'
        "Strategy descriptions:\n"
        "- broaden: Expand scope with synonyms, broader concepts\n"
        "- narrow: Narrow scope with specific keywords\n"
        "- related: Include related topics/concepts\n"
        "- rephrase: Restructure with different expressions"
    ),
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": (
        "원본 검색 쿼리: {query}\n\n"
        "현재 검색 결과 (상위 {result_count}개):\n{results_section}\n\n"
        "{feedback_section}"
        "위 정보를 분석하여 더 나은 검색 쿼리를 JSON으로 생성하세요."
    ),
    "en": (
        "Original search query: {query}\n\n"
        "Current search results (top {result_count}):\n{results_section}\n\n"
        "{feedback_section}"
        "Analyze the above and generate a better search query in JSON."
    ),
}

FEEDBACK_TEMPLATES: dict[str, dict[str, str]] = {
    "ko": {
        "broaden": "사용자 피드백: 범위를 넓혀서 더 많은 관련 결과를 찾아주세요.\n\n",
        "narrow": "사용자 피드백: 더 구체적이고 정확한 결과를 원합니다.\n\n",
        "related": "사용자 피드백: 관련된 다른 주제의 결과도 포함해주세요.\n\n",
    },
    "en": {
        "broaden": "User feedback: Broaden the search to find more related results.\n\n",
        "narrow": "User feedback: I want more specific and precise results.\n\n",
        "related": "User feedback: Include results from related topics as well.\n\n",
    },
}


def build_messages(
    query: str,
    results: list[dict[str, str]],
    feedback: str | None = None,
    turn: int = 1,
    lang: str = "ko",
) -> list[Message]:
    """Build message list for search query refinement.

    Args:
        query: The original search query.
        results: List of dicts with 'title' and 'snippet' keys (top results).
        feedback: User feedback - "broaden", "narrow", "related", or free text.
        turn: Current refinement turn (1-based).
        lang: Language for prompts ("ko" or "en"). Defaults to "ko".

    Returns:
        A list of Message objects (system + user).
    """
    if not query or not query.strip():
        raise ValueError("query must not be empty")

    # Build results section (top 5 max)
    top_results = results[:5]
    results_lines = []
    for i, r in enumerate(top_results, 1):
        title = r.get("title", "")
        snippet = r.get("snippet", "")
        results_lines.append(f"{i}. [{title}] {snippet[:100]}")

    results_section = "\n".join(results_lines) if results_lines else "(결과 없음)" if lang == "ko" else "(no results)"

    # Build feedback section
    feedback_section = ""
    if feedback:
        templates = FEEDBACK_TEMPLATES.get(lang, FEEDBACK_TEMPLATES["ko"])
        if feedback in templates:
            feedback_section = templates[feedback]
        else:
            # Free text feedback
            label = "사용자 피드백" if lang == "ko" else "User feedback"
            feedback_section = f"{label}: {feedback}\n\n"

    user_content = USER_PROMPT_TEMPLATES[lang].format(
        query=query,
        result_count=len(top_results),
        results_section=results_section,
        feedback_section=feedback_section,
    )

    # Add turn info for multi-turn context
    if turn > 1:
        turn_note = f"(리파인 턴 {turn}/4)" if lang == "ko" else f"(Refinement turn {turn}/4)"
        user_content = f"{turn_note}\n{user_content}"

    return [
        Message(role="system", content=SYSTEM_PROMPTS[lang]),
        Message(role="user", content=user_content),
    ]
