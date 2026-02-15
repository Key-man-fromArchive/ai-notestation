"""Prompt templates for evaluation framework."""

SYNTHETIC_SEARCH_PROMPT = """Generate {count} search evaluation test cases for a research note-taking app.
Each test case should have:
- "query": a realistic search query
- "expected_topics": list of 2-3 topics that should appear in good results
- "difficulty": "easy", "medium", or "hard"

Return as a JSON array. Only output the JSON, no explanation."""

SYNTHETIC_QA_PROMPT = """Generate {count} question-answering evaluation test cases for a research note-taking app.
Each test case should have:
- "context": a short research note paragraph (2-3 sentences)
- "question": a question about the context
- "expected_answer": the correct answer
- "difficulty": "easy", "medium", or "hard"

Return as a JSON array. Only output the JSON, no explanation."""

QA_SCORING_PROMPT = """Evaluate this QA response on a scale of 0.0 to 1.0 for each criterion.

Context: {context}
Question: {question}
Expected Answer: {expected_answer}
Model Answer: {answer}

Rate:
1. correctness: How factually correct is the answer?
2. utility: How useful is the answer to the user?
3. faithfulness: How well does the answer stick to the given context?

Return JSON only: {{"correctness": 0.0, "utility": 0.0, "faithfulness": 0.0}}"""
