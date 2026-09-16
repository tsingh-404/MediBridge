"""RAG over deed + insurer docs for policy questions."""
from __future__ import annotations

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from medibridge.config import CHROMA_RULES_COLLECTION
from medibridge.data import db as dbmod
from medibridge.profile import device_from_config, device_scope
from medibridge.data.vectorstore import get_client, get_or_create_collection, query_rules


def _user_insurer_id(device_id: str | None = None) -> str | None:
    where, params = device_scope(device_id, "p")
    with dbmod.get_conn() as conn:
        row = conn.execute(
            f"""SELECT t.insurer_id FROM user_profile p
               JOIN insurer_tiers t ON p.tier_id = t.tier_id WHERE {where}""",
            params,
        ).fetchone()
    return row["insurer_id"] if row else None


@tool
def query_oshc_rules(
    question: str, n_results: int = 5, config: RunnableConfig = None
) -> list[dict]:
    """Retrieve OSHC deed / insurer / MBS Book chunks relevant to a policy question."""
    client = get_client()
    coll = get_or_create_collection(client, CHROMA_RULES_COLLECTION)

    insurer = _user_insurer_id(device_from_config(config))
    where = None
    if insurer:
        where = {"$or": [
            {"insurer_id": insurer},
            {"source": "oshc_deed"},
            {"source": "reference_md"},
        ]}
    try:
        results = query_rules(coll, question, n_results=n_results, where=where)
    except Exception:
        results = query_rules(coll, question, n_results=n_results)
    return [
        {"text": r["document"], "source": r["metadata"].get("source"),
         "section": r["metadata"].get("section"), "page_num": r["metadata"].get("page_num"),
         "insurer_id": r["metadata"].get("insurer_id")}
        for r in results
    ]
