"""Real-time SSE stream quality monitor.

Monitors AI response chunks as they arrive during SSE streaming and
detects quality issues using lightweight heuristic checks (no AI calls).

Design rationale (Web-Shepherd paper): Process reward > Outcome reward.
Mid-stream evaluation catches problems earlier than post-hoc evaluation.

Checks run every ``check_interval`` characters for performance.
Actions: CONTINUE (pass), WARN (alert but continue), ABORT (stop + retry).
"""

from __future__ import annotations

from collections import Counter
from enum import Enum

from pydantic import BaseModel


class StreamAction(str, Enum):
    """Stream monitoring action."""

    CONTINUE = "continue"
    WARN = "warn"
    ABORT = "abort"


class StreamCheckResult(BaseModel):
    """Result of a heuristic quality check."""

    action: StreamAction
    reason: str = ""
    issue_type: str = ""


class StreamMonitor:
    """SSE chunk real-time quality monitor.

    Accumulates streamed text and periodically runs heuristic checks.
    All checks are pure Python (regex, char counting, word counting)
    with sub-millisecond latency.

    Args:
        task: Feature type (insight, search_qa, writing, spellcheck, template).
        lang: Request language (ko, en, etc.).
        check_interval: Characters between check runs.
    """

    def __init__(
        self,
        task: str,
        lang: str = "ko",
        check_interval: int = 300,
    ) -> None:
        self._task = task
        self._lang = lang
        self._buffer = ""
        self._chunk_count = 0
        self._check_interval = check_interval
        self._last_check_pos = 0
        self._warnings: list[str] = []

    def process_chunk(self, chunk: str) -> StreamCheckResult:
        """Process a chunk and return a quality check result.

        Checks only run when accumulated text since last check exceeds
        ``check_interval`` characters, returning CONTINUE otherwise.
        """
        self._buffer += chunk
        self._chunk_count += 1

        if len(self._buffer) - self._last_check_pos < self._check_interval:
            return StreamCheckResult(action=StreamAction.CONTINUE)

        self._last_check_pos = len(self._buffer)
        return self._run_checks()

    def _run_checks(self) -> StreamCheckResult:
        """Run all heuristic checks in priority order."""
        for check in (
            self._check_language_mismatch,
            self._check_repetition,
            self._check_format,
            self._check_length_anomaly,
        ):
            result = check()
            if result:
                return result

        return StreamCheckResult(action=StreamAction.CONTINUE)

    # ------------------------------------------------------------------
    # Individual heuristic checks
    # ------------------------------------------------------------------

    def _check_language_mismatch(self) -> StreamCheckResult | None:
        """Detect language mismatch for Korean requests.

        Checks the last 500 chars; if Korean character ratio < 15%
        when the request language is Korean, emit a warning.
        Only triggers after 100+ non-whitespace chars to avoid
        false positives during early streaming.
        """
        if self._lang != "ko":
            return None

        recent = self._buffer[-500:] if len(self._buffer) > 500 else self._buffer
        if len(recent) < 100:
            return None

        korean_chars = sum(1 for c in recent if "\uac00" <= c <= "\ud7a3")
        total_chars = sum(1 for c in recent if c.strip())

        if total_chars < 100:
            return None

        korean_ratio = korean_chars / total_chars
        if korean_ratio < 0.15:
            return StreamCheckResult(
                action=StreamAction.WARN,
                reason="응답 언어가 요청 언어(한국어)와 다릅니다",
                issue_type="language_mismatch",
            )
        return None

    def _check_repetition(self) -> StreamCheckResult | None:
        """Detect repetitive sentence patterns (hallucination indicator).

        Splits on periods, counts sentences > 20 chars.
        3+ identical sentences triggers ABORT.
        """
        sentences = [s.strip() for s in self._buffer.split(".") if len(s.strip()) > 20]
        if len(sentences) < 5:
            return None

        counts = Counter(sentences)
        for sentence, count in counts.items():
            if count >= 3:
                preview = sentence[:50]
                return StreamCheckResult(
                    action=StreamAction.ABORT,
                    reason=f"반복 패턴 감지: '{preview}...' ({count}회 반복)",
                    issue_type="repetition",
                )
        return None

    def _check_format(self) -> StreamCheckResult | None:
        """Task-specific format validation.

        For writing/template tasks, checks that markdown headings (#)
        appear after 500+ chars of output.
        """
        if self._task not in ("template", "writing"):
            return None

        if len(self._buffer) < 500:
            return None

        if "#" not in self._buffer:
            return StreamCheckResult(
                action=StreamAction.WARN,
                reason="마크다운 형식(# 헤딩)이 감지되지 않습니다",
                issue_type="format",
            )
        return None

    def _check_length_anomaly(self) -> StreamCheckResult | None:
        """Detect excessive repetition via low word diversity.

        After 3000+ chars, if the last 1000 chars contain fewer than
        20 unique words, the output is likely stuck in a loop.
        """
        if len(self._buffer) < 3000:
            return None

        tail = self._buffer[-1000:]
        unique_words = set(tail.split())

        if len(unique_words) < 20:
            return StreamCheckResult(
                action=StreamAction.ABORT,
                reason="과도한 반복 출력 감지",
                issue_type="length",
            )
        return None
