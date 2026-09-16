"""Evaluators for the MediBridge agent.

Three metrics:
  1. tool_selection_accuracy  — deterministic, no LLM cost. Did the agent call
     (at least) the expected set of tools?  Target: > 0.90 aggregate.
  2. faithfulness              — LLM-judge. Is every factual/$ claim in the
     answer grounded in the tool outputs (context)?  (1 - faithfulness ≈
     hallucination rate.)
  3. answer_relevance          — LLM-judge. Does the answer directly address the
     user's specific cost/policy question?

Each evaluator is a callable (run, example) -> dict, the signature
`langsmith.Client.evaluate` accepts directly.
"""
from __future__ import annotations

from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from medibridge.config import CHAT_MODEL, settings


# ---------------------------------------------------------------- deterministic

def tool_selection_accuracy(run, example) -> dict:
    """1.0 if every expected tool was called (extra calls tolerated), else 0.0."""
    actual = set((run.outputs or {}).get("tool_calls") or [])
    expected = set((example.outputs or {}).get("expected_tool_calls") or [])
    covered = expected.issubset(actual)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    return {
        "key": "tool_selection_accuracy",
        "score": 1.0 if covered else 0.0,
        "comment": f"expected={sorted(expected)} actual={sorted(actual)} "
        f"missing={missing} extra={extra}",
    }


# ---------------------------------------------------------------- LLM-as-judge

class _Judgement(BaseModel):
    score: float = Field(description="Score between 0.0 and 1.0")
    reasoning: str = Field(description="One or two sentences justifying the score")


def _judge():
    # temp 0 for stable grading; reuse the project's chat model + key
    return ChatOpenAI(
        model=CHAT_MODEL,
        api_key=settings.openai_api_key,
        temperature=0,
    ).with_structured_output(_Judgement)


_FAITHFULNESS_PROMPT = """You grade whether an ANSWER is grounded — i.e. not
hallucinated.

Two valid grounding sources:
  - CONTEXT: raw output of the database/retrieval tools the agent called.
  - REFERENCE: authoritative deed/OSHC facts known to be true for this case.
A claim is grounded if it is supported by EITHER CONTEXT or REFERENCE.

Grade per claim, then average:
  - Specific figures (schedule fees, dollar gaps, item numbers, % benefits,
    waiting-period months) must be supported by CONTEXT or match REFERENCE.
    A specific figure that appears in neither is a hallucination → that claim
    scores 0.
  - Qualitative deed rules (the 3 exclusions, 85%/100% deed minimums, nil vs
    2 vs 12 month waiting defaults, "X is not covered") are grounded when they
    are consistent with REFERENCE, even if CONTEXT is empty.
  - "N/A — derived fee" or an explicit anaesthesia-estimate caveat is grounded
    (it correctly declines to invent a number) — do NOT penalise it.

Score = fraction of claims that are grounded. Only fabricated specific figures
or facts contradicting REFERENCE should pull the score down. If CONTEXT is
"(no tool output)" but every claim matches REFERENCE, score 1.0.

QUESTION:
{question}

REFERENCE (authoritative facts — also valid grounding):
{reference}

CONTEXT:
{context}

ANSWER:
{answer}
"""

_RELEVANCE_PROMPT = """You grade whether an ANSWER addresses the user's
QUESTION and is consistent with the REFERENCE key facts.

Score 1.0 if the answer addresses what was asked and does not contradict
REFERENCE. Extra correct detail, a different-but-correct phrasing, or covering
more than asked is FINE — do not require verbatim wording or penalise thorough
answers. Score 0.0 only if the answer is off-topic, evasive, refuses without
reason, or contradicts REFERENCE. Partial credit in between for answers that
address only part of the question. Do not penalise standard informational
disclaimers.

QUESTION:
{question}

REFERENCE (expected key facts):
{reference}

ANSWER:
{answer}
"""


def _run_judge(prompt: str, key: str) -> dict:
    judge = _judge()
    try:
        result: _Judgement = judge.invoke(prompt)
        return {
            "key": key,
            "score": max(0.0, min(1.0, float(result.score))),
            "comment": result.reasoning,
        }
    except Exception as e:  # judge failure shouldn't crash the whole run
        return {"key": key, "score": 0.0, "comment": f"judge error: {e}"}


def faithfulness(run, example) -> dict:
    outputs = run.outputs or {}
    context = "\n\n".join(str(c) for c in (outputs.get("context") or [])) or "(no tool output)"
    return _run_judge(
        _FAITHFULNESS_PROMPT.format(
            question=(example.inputs or {}).get("instructions", ""),
            reference=(example.outputs or {}).get("reference", ""),
            context=context,
            answer=outputs.get("answer", ""),
        ),
        "faithfulness",
    )


def answer_relevance(run, example) -> dict:
    return _run_judge(
        _RELEVANCE_PROMPT.format(
            question=(example.inputs or {}).get("instructions", ""),
            reference=(example.outputs or {}).get("reference", ""),
            answer=(run.outputs or {}).get("answer", ""),
        ),
        "answer_relevance",
    )


EVALUATORS = [tool_selection_accuracy, faithfulness, answer_relevance]
