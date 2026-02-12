"""Cluster insight prompt template.

Analyzes a group of semantically related research notes to extract
cross-note patterns, ideas, contradictions, and actionable next steps.
"""

from __future__ import annotations

from app.ai_router.schemas import Message

SYSTEM_PROMPT: str = (
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
)


def build_messages(
    notes: list[tuple[str, str]],
    focus: str | None = None,
) -> list[Message]:
    """Build message list for cluster insight analysis.

    Args:
        notes: List of (title, content) tuples for the cluster.
        focus: Optional focus question or area to emphasize.

    Returns:
        A list of Message objects (system + user).

    Raises:
        ValueError: If notes list is empty.
    """
    if not notes:
        raise ValueError("notes must not be empty")

    notes_section = "\n\n---\n\n".join(
        f"[노트 {i + 1}] {title}\n{content}"
        for i, (title, content) in enumerate(notes)
    )

    parts = [
        f"다음 {len(notes)}개의 관련 연구노트를 종합 분석하여 "
        "클러스터 인사이트를 도출해주세요.\n\n",
        notes_section,
    ]

    if focus:
        parts.append(f"\n\n특히 다음 관점에서 분석해주세요: {focus}")

    return [
        Message(role="system", content=SYSTEM_PROMPT),
        Message(role="user", content="".join(parts)),
    ]
