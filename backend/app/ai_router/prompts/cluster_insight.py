"""Cluster insight prompt template.

Analyzes a group of semantically related research notes to extract
cross-note patterns, ideas, contradictions, and actionable next steps.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPTS: dict[str, str] = {
    "ko": (
        "당신은 연구노트 클러스터 분석 전문가입니다. "
        "사용자가 제공하는 여러 개의 관련 연구노트를 종합적으로 분석하여 "
        "개별 노트에서는 보이지 않는 패턴, 인사이트, 아이디어를 발굴합니다.\n\n"
        "분석 결과는 다음 구조로 제공하세요:\n\n"
        "## 클러스터 주제\n"
        "이 노트들을 관통하는 핵심 주제를 1-2문장으로 요약\n\n"
        "## 핵심 패턴\n"
        "여러 노트에 걸쳐 반복되는 패턴, 공통 발견, 일관된 결론을 불릿 포인트로 정리\n\n"
        "## 새로운 인사이트\n"
        "개별 노트만으로는 보이지 않지만, 함께 놓고 보면 드러나는 통찰:\n"
        "- 노트 간 연결고리와 시너지\n"
        "- 예상치 못한 관계나 유사성\n"
        "- 종합하면 도출되는 새로운 가설이나 결론\n\n"
        "## 모순과 갭\n"
        "노트 간 상충되는 내용, 결론의 불일치, 누락된 관점이나 데이터\n\n"
        "## 아이디어 및 제안\n"
        "이 클러스터에서 파생 가능한 구체적 아이디어:\n"
        "- 후속 실험/연구 방향\n"
        "- 문제 해결 접근법\n"
        "- 통합할 수 있는 방법론\n"
        "- 탐구할 가치가 있는 새 질문\n\n"
        "마크다운 형식으로 깔끔하게 정리하되, 구체적이고 실행 가능한 내용 위주로 답변하세요. "
        "각 포인트에서 어떤 노트를 근거로 하는지 [노트 N] 형태로 출처를 표기하세요."
    ),
    "en": (
        "You are an expert in research note cluster analysis. "
        "Comprehensively analyze multiple related research notes provided by the user to uncover "
        "patterns, insights, and ideas that are not visible in individual notes.\n\n"
        "Provide your analysis in the following structure:\n\n"
        "## Cluster Theme\n"
        "Summarize the core theme that runs through these notes in 1-2 sentences\n\n"
        "## Key Patterns\n"
        "Organize recurring patterns, common findings, and consistent conclusions across multiple notes in bullet points\n\n"
        "## New Insights\n"
        "Insights that are not visible from individual notes alone but emerge when viewed together:\n"
        "- Connections and synergies between notes\n"
        "- Unexpected relationships or similarities\n"
        "- New hypotheses or conclusions derived from synthesis\n\n"
        "## Contradictions and Gaps\n"
        "Conflicting content between notes, inconsistent conclusions, missing perspectives or data\n\n"
        "## Ideas and Recommendations\n"
        "Specific ideas that can be derived from this cluster:\n"
        "- Follow-up experiment/research directions\n"
        "- Problem-solving approaches\n"
        "- Methodologies that can be integrated\n"
        "- New questions worth exploring\n\n"
        "Organize neatly in markdown format, focusing on specific and actionable content. "
        "For each point, cite which note it is based on in the form [Note N]."
    ),
}

NOTE_LABEL_TEMPLATES: dict[str, str] = {
    "ko": "[노트 {index}]",
    "en": "[Note {index}]",
}

USER_PROMPT_TEMPLATES: dict[str, str] = {
    "ko": "다음 {count}개의 관련 연구노트를 종합 분석하여 클러스터 인사이트를 도출해주세요.\n\n{notes_section}",
    "en": "Please analyze the following {count} related research notes comprehensively and extract cluster insights.\n\n{notes_section}",
}

FOCUS_TEMPLATES: dict[str, str] = {
    "ko": "\n\n특히 다음 관점에서 분석해주세요: {focus}",
    "en": "\n\nPlease analyze especially from the following perspective: {focus}",
}


def build_messages(
    notes: list[tuple[str, str]],
    focus: str | None = None,
    category_context: str | None = None,
    lang: str = "ko",
) -> list[Message]:
    """Build message list for cluster insight analysis.

    Args:
        notes: List of (title, content) tuples for the cluster.
        focus: Optional focus question or area to emphasize.
        category_context: Optional category-specific AI prompt to inject.
        lang: Language for prompts ("ko" or "en"). Defaults to "ko".

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If notes list is empty.
    """
    if not notes:
        raise ValueError("notes must not be empty")

    system_content = SYSTEM_PROMPTS[lang]
    if category_context:
        system_content += f"\n\n[카테고리 분석 지침]\n{category_context}"

    note_label = NOTE_LABEL_TEMPLATES[lang]
    notes_section = "\n\n---\n\n".join(
        f"{note_label.format(index=i + 1)} {title}\n{content}"
        for i, (title, content) in enumerate(notes)
    )

    user_content = USER_PROMPT_TEMPLATES[lang].format(count=len(notes), notes_section=notes_section)

    if focus:
        user_content += FOCUS_TEMPLATES[lang].format(focus=focus)

    return [
        Message(role="system", content=system_content),
        Message(role="user", content=user_content),
    ]
