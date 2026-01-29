# @TASK P3-T3.7 - AI Prompt Templates tests
# @SPEC docs/plans/2026-01-29-labnote-ai-design.md#AI-Router
"""Tests for AI prompt template modules.

Each module must expose:
- SYSTEM_PROMPT: str (non-empty, Korean)
- build_messages(...) -> list[Message] (system + user messages)
"""

from __future__ import annotations

import pytest

from app.ai_router.schemas import Message


# ──────────────────────────────────────────────
# 1. insight.py - 인사이트 도출
# ──────────────────────────────────────────────
class TestInsightPrompt:
    """Tests for the insight prompt module."""

    def test_system_prompt_exists_and_non_empty(self):
        from app.ai_router.prompts.insight import SYSTEM_PROMPT

        assert isinstance(SYSTEM_PROMPT, str)
        assert len(SYSTEM_PROMPT) > 0

    def test_build_messages_returns_list_of_messages(self):
        from app.ai_router.prompts.insight import build_messages

        result = build_messages(note_content="실험 결과 기록입니다.")
        assert isinstance(result, list)
        assert all(isinstance(m, Message) for m in result)

    def test_build_messages_first_message_is_system(self):
        from app.ai_router.prompts.insight import build_messages

        result = build_messages(note_content="테스트 노트")
        assert result[0].role == "system"

    def test_build_messages_contains_user_message_with_content(self):
        from app.ai_router.prompts.insight import build_messages

        note = "PCR 결과 분석: 밴드가 예상 크기에서 관찰됨"
        result = build_messages(note_content=note)
        user_messages = [m for m in result if m.role == "user"]
        assert len(user_messages) >= 1
        assert note in user_messages[0].content

    def test_build_messages_with_additional_context(self):
        from app.ai_router.prompts.insight import build_messages

        result = build_messages(
            note_content="실험 데이터",
            additional_context="이전 실험과 비교 필요",
        )
        user_messages = [m for m in result if m.role == "user"]
        assert "이전 실험과 비교 필요" in user_messages[0].content

    def test_build_messages_raises_on_empty_content(self):
        from app.ai_router.prompts.insight import build_messages

        with pytest.raises(ValueError):
            build_messages(note_content="")

    def test_build_messages_raises_on_whitespace_only(self):
        from app.ai_router.prompts.insight import build_messages

        with pytest.raises(ValueError):
            build_messages(note_content="   ")


# ──────────────────────────────────────────────
# 2. search_qa.py - RAG 검색 QA
# ──────────────────────────────────────────────
class TestSearchQAPrompt:
    """Tests for the search QA (RAG) prompt module."""

    def test_system_prompt_exists_and_non_empty(self):
        from app.ai_router.prompts.search_qa import SYSTEM_PROMPT

        assert isinstance(SYSTEM_PROMPT, str)
        assert len(SYSTEM_PROMPT) > 0

    def test_build_messages_returns_list_of_messages(self):
        from app.ai_router.prompts.search_qa import build_messages

        result = build_messages(
            question="PCR 프로토콜은?",
            context_notes=["노트1: PCR 조건은 95도에서 시작"],
        )
        assert isinstance(result, list)
        assert all(isinstance(m, Message) for m in result)

    def test_build_messages_first_message_is_system(self):
        from app.ai_router.prompts.search_qa import build_messages

        result = build_messages(
            question="질문",
            context_notes=["참조 노트"],
        )
        assert result[0].role == "system"

    def test_build_messages_contains_question_in_user_message(self):
        from app.ai_router.prompts.search_qa import build_messages

        question = "Western blot 결과 해석은?"
        result = build_messages(
            question=question,
            context_notes=["WB 이미지에서 밴드가 관찰됨"],
        )
        user_messages = [m for m in result if m.role == "user"]
        assert any(question in m.content for m in user_messages)

    def test_build_messages_contains_context_notes(self):
        from app.ai_router.prompts.search_qa import build_messages

        notes = ["첫 번째 노트 내용", "두 번째 노트 내용"]
        result = build_messages(
            question="요약해주세요",
            context_notes=notes,
        )
        user_messages = [m for m in result if m.role == "user"]
        user_text = " ".join(m.content for m in user_messages)
        for note in notes:
            assert note in user_text

    def test_build_messages_raises_on_empty_question(self):
        from app.ai_router.prompts.search_qa import build_messages

        with pytest.raises(ValueError):
            build_messages(question="", context_notes=["노트"])

    def test_build_messages_raises_on_empty_context_notes(self):
        from app.ai_router.prompts.search_qa import build_messages

        with pytest.raises(ValueError):
            build_messages(question="질문입니다", context_notes=[])


# ──────────────────────────────────────────────
# 3. writing.py - 연구노트 작성 보조
# ──────────────────────────────────────────────
class TestWritingPrompt:
    """Tests for the writing assistant prompt module."""

    def test_system_prompt_exists_and_non_empty(self):
        from app.ai_router.prompts.writing import SYSTEM_PROMPT

        assert isinstance(SYSTEM_PROMPT, str)
        assert len(SYSTEM_PROMPT) > 0

    def test_build_messages_returns_list_of_messages(self):
        from app.ai_router.prompts.writing import build_messages

        result = build_messages(topic="유전자 발현 분석")
        assert isinstance(result, list)
        assert all(isinstance(m, Message) for m in result)

    def test_build_messages_first_message_is_system(self):
        from app.ai_router.prompts.writing import build_messages

        result = build_messages(topic="단백질 구조 분석")
        assert result[0].role == "system"

    def test_build_messages_contains_topic_in_user_message(self):
        from app.ai_router.prompts.writing import build_messages

        topic = "CRISPR-Cas9 실험 프로토콜"
        result = build_messages(topic=topic)
        user_messages = [m for m in result if m.role == "user"]
        assert any(topic in m.content for m in user_messages)

    def test_build_messages_with_keywords(self):
        from app.ai_router.prompts.writing import build_messages

        keywords = ["PCR", "전기영동", "DNA 추출"]
        result = build_messages(topic="실험 방법", keywords=keywords)
        user_messages = [m for m in result if m.role == "user"]
        user_text = " ".join(m.content for m in user_messages)
        for kw in keywords:
            assert kw in user_text

    def test_build_messages_with_existing_content(self):
        from app.ai_router.prompts.writing import build_messages

        existing = "기존에 작성된 노트 내용입니다."
        result = build_messages(topic="실험", existing_content=existing)
        user_messages = [m for m in result if m.role == "user"]
        user_text = " ".join(m.content for m in user_messages)
        assert existing in user_text

    def test_build_messages_raises_on_empty_topic(self):
        from app.ai_router.prompts.writing import build_messages

        with pytest.raises(ValueError):
            build_messages(topic="")

    def test_build_messages_raises_on_whitespace_only_topic(self):
        from app.ai_router.prompts.writing import build_messages

        with pytest.raises(ValueError):
            build_messages(topic="   ")


# ──────────────────────────────────────────────
# 4. spellcheck.py - 맞춤법 교정
# ──────────────────────────────────────────────
class TestSpellcheckPrompt:
    """Tests for the spellcheck prompt module."""

    def test_system_prompt_exists_and_non_empty(self):
        from app.ai_router.prompts.spellcheck import SYSTEM_PROMPT

        assert isinstance(SYSTEM_PROMPT, str)
        assert len(SYSTEM_PROMPT) > 0

    def test_build_messages_returns_list_of_messages(self):
        from app.ai_router.prompts.spellcheck import build_messages

        result = build_messages(text="맞춤법을 확인해 주세요.")
        assert isinstance(result, list)
        assert all(isinstance(m, Message) for m in result)

    def test_build_messages_first_message_is_system(self):
        from app.ai_router.prompts.spellcheck import build_messages

        result = build_messages(text="테스트 문장")
        assert result[0].role == "system"

    def test_build_messages_contains_text_in_user_message(self):
        from app.ai_router.prompts.spellcheck import build_messages

        text = "이 문장에는 오타가 있읍니다."
        result = build_messages(text=text)
        user_messages = [m for m in result if m.role == "user"]
        assert any(text in m.content for m in user_messages)

    def test_build_messages_raises_on_empty_text(self):
        from app.ai_router.prompts.spellcheck import build_messages

        with pytest.raises(ValueError):
            build_messages(text="")

    def test_build_messages_raises_on_whitespace_only_text(self):
        from app.ai_router.prompts.spellcheck import build_messages

        with pytest.raises(ValueError):
            build_messages(text="   ")


# ──────────────────────────────────────────────
# 5. template.py - 템플릿 생성
# ──────────────────────────────────────────────
class TestTemplatePrompt:
    """Tests for the template generation prompt module."""

    VALID_TYPES = [
        "experiment_log",
        "paper_review",
        "meeting_notes",
        "lab_report",
        "research_proposal",
    ]

    def test_system_prompt_exists_and_non_empty(self):
        from app.ai_router.prompts.template import SYSTEM_PROMPT

        assert isinstance(SYSTEM_PROMPT, str)
        assert len(SYSTEM_PROMPT) > 0

    def test_build_messages_returns_list_of_messages(self):
        from app.ai_router.prompts.template import build_messages

        result = build_messages(template_type="experiment_log")
        assert isinstance(result, list)
        assert all(isinstance(m, Message) for m in result)

    def test_build_messages_first_message_is_system(self):
        from app.ai_router.prompts.template import build_messages

        result = build_messages(template_type="paper_review")
        assert result[0].role == "system"

    def test_build_messages_contains_template_type_in_user_message(self):
        from app.ai_router.prompts.template import build_messages

        result = build_messages(template_type="lab_report")
        user_messages = [m for m in result if m.role == "user"]
        assert any("lab_report" in m.content for m in user_messages)

    @pytest.mark.parametrize("template_type", VALID_TYPES)
    def test_build_messages_accepts_all_valid_types(self, template_type: str):
        from app.ai_router.prompts.template import build_messages

        result = build_messages(template_type=template_type)
        assert isinstance(result, list)
        assert len(result) >= 2  # system + user

    def test_build_messages_with_custom_instructions(self):
        from app.ai_router.prompts.template import build_messages

        instructions = "섹션에 참고문헌 항목을 추가해주세요"
        result = build_messages(
            template_type="research_proposal",
            custom_instructions=instructions,
        )
        user_messages = [m for m in result if m.role == "user"]
        user_text = " ".join(m.content for m in user_messages)
        assert instructions in user_text

    def test_build_messages_raises_on_invalid_template_type(self):
        from app.ai_router.prompts.template import build_messages

        with pytest.raises(ValueError):
            build_messages(template_type="invalid_type")

    def test_build_messages_raises_on_empty_template_type(self):
        from app.ai_router.prompts.template import build_messages

        with pytest.raises(ValueError):
            build_messages(template_type="")


# ──────────────────────────────────────────────
# Package-level import tests
# ──────────────────────────────────────────────
class TestPromptsPackageExports:
    """Tests that the prompts package properly exports all modules."""

    def test_import_insight(self):
        from app.ai_router.prompts import insight

        assert hasattr(insight, "SYSTEM_PROMPT")
        assert hasattr(insight, "build_messages")

    def test_import_search_qa(self):
        from app.ai_router.prompts import search_qa

        assert hasattr(search_qa, "SYSTEM_PROMPT")
        assert hasattr(search_qa, "build_messages")

    def test_import_writing(self):
        from app.ai_router.prompts import writing

        assert hasattr(writing, "SYSTEM_PROMPT")
        assert hasattr(writing, "build_messages")

    def test_import_spellcheck(self):
        from app.ai_router.prompts import spellcheck

        assert hasattr(spellcheck, "SYSTEM_PROMPT")
        assert hasattr(spellcheck, "build_messages")

    def test_import_template(self):
        from app.ai_router.prompts import template

        assert hasattr(template, "SYSTEM_PROMPT")
        assert hasattr(template, "build_messages")
