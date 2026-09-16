"""Entry point: upload dataset, run the agent, evaluate, summarize.

    python -m evals.run_eval          # from the repo root

Requires (in .env):  OPENAI_API_KEY  and  LANGSMITH_API_KEY
Install:              pip install -e ".[eval]"
"""
from __future__ import annotations

import sys

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from medibridge.config import settings


def run_agent(inputs: dict) -> dict:
    """Target fn LangSmith calls per example. Reuses the real graph unchanged.

    Returns answer text, the ordered list of tool names called, and the raw
    tool outputs (context for the faithfulness judge).
    """
    from medibridge.agent.graph import build_graph

    graph = build_graph()
    res = graph.invoke(
        {"messages": [HumanMessage(content=inputs["instructions"])]}
    )
    msgs = res["messages"]

    tool_calls = [
        c["name"]
        for m in msgs
        if isinstance(m, AIMessage)
        for c in (getattr(m, "tool_calls", None) or [])
    ]
    final = next(
        (
            m.content
            for m in reversed(msgs)
            if isinstance(m, AIMessage)
            and isinstance(m.content, str)
            and m.content.strip()
            and not (getattr(m, "tool_calls", None) or [])
        ),
        "",
    )
    context = [
        m.content if isinstance(m.content, str) else str(m.content)
        for m in msgs
        if isinstance(m, ToolMessage)
    ]
    return {"answer": final, "tool_calls": tool_calls, "context": context}


def main() -> int:
    missing = [
        name
        for name, val in (
            ("OPENAI_API_KEY", settings.openai_api_key),
            ("LANGSMITH_API_KEY", settings.langsmith_api_key),
        )
        if not val
    ]
    if missing:
        print(
            f"Missing required env var(s): {', '.join(missing)}. "
            f"Set them in .env (see .env.example).",
            file=sys.stderr,
        )
        return 1

    try:
        from langsmith import Client
    except ImportError:
        print(
            'langsmith not installed. Run:  pip install -e ".[eval]"',
            file=sys.stderr,
        )
        return 1

    from evals.dataset import DATASET_NAME, upsert_dataset
    from evals.evaluators import EVALUATORS

    client = Client()

    print(f"Upserting dataset '{DATASET_NAME}' ...")
    upsert_dataset(client)

    print("Running agent over dataset + evaluating (this calls OpenAI) ...")
    results = client.evaluate(
        run_agent,
        data=DATASET_NAME,
        evaluators=EVALUATORS,
        experiment_prefix="medibridge",
        # singleton chroma client (vectorstore.get_client) makes parallel
        # runs safe again; 2 keeps wall time reasonable.
        max_concurrency=2,
    )

    _summarize(results)
    return 0


def _summarize(results) -> None:
    """Aggregate mean per metric + print a small table and the experiment URL."""
    try:
        from rich.console import Console
        from rich.table import Table
    except ImportError:
        Console = None

    sums: dict[str, float] = {}
    counts: dict[str, int] = {}
    rows = list(results)
    for r in rows:
        for ev in r.get("evaluation_results", {}).get("results", []):
            if ev.score is None:
                continue
            sums[ev.key] = sums.get(ev.key, 0.0) + float(ev.score)
            counts[ev.key] = counts.get(ev.key, 0) + 1

    means = {k: sums[k] / counts[k] for k in sums if counts.get(k)}
    hallucination = (
        1.0 - means["faithfulness"] if "faithfulness" in means else None
    )

    if Console is None:
        print(f"n={len(rows)}")
        for k, v in means.items():
            print(f"{k}: {v:.3f}")
        if hallucination is not None:
            print(f"hallucination_rate (1 - faithfulness): {hallucination:.3f}")
    else:
        console = Console()
        table = Table(title=f"MediBridge eval - {len(rows)} cases")
        table.add_column("Metric")
        table.add_column("Mean", justify="right")
        table.add_column("Target", justify="right")
        targets = {
            "tool_selection_accuracy": "> 0.90",
            "faithfulness": "-> 1.00",
            "answer_relevance": "-> 1.00",
        }
        for k in (
            "tool_selection_accuracy",
            "faithfulness",
            "answer_relevance",
        ):
            if k in means:
                table.add_row(k, f"{means[k]:.3f}", targets.get(k, "-"))
        if hallucination is not None:
            table.add_row(
                "hallucination_rate", f"{hallucination:.3f}", "-> 0.00"
            )
        console.print(table)

    url = getattr(results, "experiment_url", None) or getattr(
        results, "_experiment_url", None
    )
    if url:
        print(f"\nLangSmith experiment: {url}")


if __name__ == "__main__":
    raise SystemExit(main())
