"""Checklist-based AI quality gate.

Evaluates AI responses against task-specific checklists using a secondary
AI call. Based on the Web-Shepherd paper's checklist decomposition approach.
"""

from __future__ import annotations

import json
import logging

from pydantic import BaseModel

from app.ai_router.prompts import quality_eval
from app.ai_router.router import AIRouter
from app.ai_router.schemas import AIRequest

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class ChecklistItem(BaseModel):
    """Single checklist evaluation item."""

    question: str
    passed: bool | None = None  # True=pass, False=fail, None=partial
    note: str = ""


class QualityChecklist(BaseModel):
    """Task-specific quality checklist definition."""

    task: str
    items: list[str]
    min_pass_ratio: float = 0.75


class QualityResult(BaseModel):
    """Quality evaluation result."""

    passed: bool
    score: float  # 0.0 ~ 1.0
    details: list[ChecklistItem]
    summary: str


# ---------------------------------------------------------------------------
# Task checklists
# ---------------------------------------------------------------------------

TASK_CHECKLISTS: dict[str, QualityChecklist] = {
    "insight": QualityChecklist(
        task="insight",
        items=[
            "핵심 발견이나 패턴을 식별했는가?",
            "분석의 근거를 구체적으로 인용했는가?",
            "실질적인 시사점이나 제안을 제시했는가?",
            "요청된 분석 범위를 충족했는가?",
        ],
        min_pass_ratio=0.75,
    ),
    "search_qa": QualityChecklist(
        task="search_qa",
        items=[
            "질문에 직접적으로 답변했는가?",
            "검색 결과를 근거로 활용했는가?",
            "출처(노트 제목 등)를 명시했는가?",
            "불확실한 부분을 솔직히 표시했는가?",
        ],
        min_pass_ratio=0.75,
    ),
    "writing": QualityChecklist(
        task="writing",
        items=[
            "요청된 글의 구조를 충족했는가?",
            "학술적 관례(논리 전개, 인용 등)를 따랐는가?",
            "핵심 키워드와 개념을 포함했는가?",
            "적절한 마크다운 형식을 사용했는가?",
        ],
        min_pass_ratio=0.75,
    ),
    "spellcheck": QualityChecklist(
        task="spellcheck",
        items=[
            "수정 사항을 명확히 표시했는가?",
            "원문의 의미를 보존했는가?",
            "수정 이유를 설명했는가?",
        ],
        min_pass_ratio=1.0,
    ),
    "template": QualityChecklist(
        task="template",
        items=[
            "요청된 템플릿 유형에 적합한 구조인가?",
            "각 섹션에 작성 가이드를 포함했는가?",
            "메타데이터(날짜, 작성자 등) 필드가 있는가?",
            "마크다운 형식으로 작성되었는가?",
        ],
        min_pass_ratio=0.75,
    ),
}


# ---------------------------------------------------------------------------
# QualityGate
# ---------------------------------------------------------------------------


class QualityGate:
    """Evaluates AI responses using task-specific checklists."""

    def __init__(self, ai_router: AIRouter) -> None:
        self._ai_router = ai_router

    def get_checklist(self, task: str) -> QualityChecklist | None:
        """Return checklist for the given task, or None if not applicable."""
        return TASK_CHECKLISTS.get(task)

    async def evaluate(
        self,
        task: str,
        original_request: str,
        ai_response: str,
        lang: str = "ko",
    ) -> QualityResult | None:
        """Evaluate an AI response against the task's checklist.

        Returns None if the task has no checklist (e.g. summarize)
        or if the evaluation AI call fails.
        """
        checklist = self.get_checklist(task)
        if checklist is None:
            return None

        try:
            messages = quality_eval.build_messages(
                original_request=original_request,
                ai_response=ai_response,
                checklist_items=checklist.items,
                lang=lang,
            )

            ai_request = AIRequest(
                messages=messages,
                temperature=0.1,
                max_tokens=512,
            )

            response = await self._ai_router.chat(ai_request)
            return self._parse_result(response.content, checklist)

        except Exception:
            logger.exception("Quality gate evaluation failed for task=%s", task)
            return None

    def _parse_result(
        self,
        raw_content: str,
        checklist: QualityChecklist,
    ) -> QualityResult:
        """Parse AI evaluation JSON into QualityResult."""
        # Strip markdown code fences if present
        content = raw_content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            # Remove first and last lines (```json and ```)
            lines = [ln for ln in lines if not ln.strip().startswith("```")]
            content = "\n".join(lines)

        data = json.loads(content)

        items: list[ChecklistItem] = []
        for item_data in data.get("items", []):
            items.append(
                ChecklistItem(
                    question=item_data.get("question", ""),
                    passed=item_data.get("passed"),
                    note=item_data.get("note", ""),
                )
            )

        # Calculate score: True=1.0, None(partial)=0.5, False=0.0
        if items:
            total = len(items)
            score_sum = sum(
                1.0 if i.passed is True else 0.5 if i.passed is None else 0.0
                for i in items
            )
            score = score_sum / total
        else:
            score = 0.0

        passed = score >= checklist.min_pass_ratio

        return QualityResult(
            passed=passed,
            score=round(score, 2),
            details=items,
            summary=data.get("summary", ""),
        )
