"""ChromaDB setup + population."""
from __future__ import annotations

from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

from medibridge.config import (
    CHROMA_DIR,
    CHROMA_MBS_COLLECTION,
    CHROMA_RULES_COLLECTION,
    EMBED_BATCH_SIZE,
    EMBEDDING_MODEL,
    settings,
)


def _embedding_fn() -> OpenAIEmbeddingFunction:
    return OpenAIEmbeddingFunction(
        api_key=settings.openai_api_key,
        model_name=EMBEDDING_MODEL,
    )


_CLIENT: chromadb.PersistentClient | None = None


def get_client() -> chromadb.PersistentClient:
    # Cache one client per process. Re-creating PersistentClient on the same
    # path (esp. concurrently, e.g. under eval) triggers chromadb's
    # "RustBindingsAPI object has no attribute 'bindings'" / tenant errors.
    global _CLIENT
    if _CLIENT is None:
        CHROMA_DIR.mkdir(parents=True, exist_ok=True)
        _CLIENT = chromadb.PersistentClient(
            path=str(CHROMA_DIR),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _CLIENT


def get_or_create_collection(client: chromadb.PersistentClient, name: str):
    return client.get_or_create_collection(
        name=name,
        embedding_function=_embedding_fn(),
        metadata={"hnsw:space": "cosine"},
    )


def reset_collection(client: chromadb.PersistentClient, name: str):
    try:
        client.delete_collection(name)
    except Exception:
        pass
    return get_or_create_collection(client, name)


def _batched(items: list[Any], size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def add_mbs_items(collection, items: list[dict]) -> int:
    """items: list of dicts with item_num, description, category_desc, group_desc, btos_desc, schedule_fee, benefit_*, benefit_type, category, group_code."""
    ids, docs, metas = [], [], []
    for it in items:
        ids.append(f"mbs_{it['item_num']}")
        docs.append(
            f"MBS Item {it['item_num']}: {it.get('description', '')}\n"
            f"Category: {it.get('category_desc') or ''}\n"
            f"Group: {it.get('group_desc') or ''}\n"
            f"Service Type: {it.get('btos_desc') or ''}"
        )
        metas.append({
            "item_num": it["item_num"],
            "schedule_fee": float(it["schedule_fee"]) if it.get("schedule_fee") is not None else 0.0,
            "benefit_type": it.get("benefit_type") or "",
            "benefit_100": float(it["benefit_100"]) if it.get("benefit_100") is not None else 0.0,
            "benefit_85": float(it["benefit_85"]) if it.get("benefit_85") is not None else 0.0,
            "benefit_75": float(it["benefit_75"]) if it.get("benefit_75") is not None else 0.0,
            "category": it.get("category") or "",
            "group_code": it.get("group_code") or "",
            "btos_desc": it.get("btos_desc") or "",
            "is_gp_item": (it.get("benefit_type") == "E"),
        })
    total = 0
    for batch_ids, batch_docs, batch_metas in zip(
        _batched(ids, EMBED_BATCH_SIZE),
        _batched(docs, EMBED_BATCH_SIZE),
        _batched(metas, EMBED_BATCH_SIZE),
    ):
        collection.add(ids=batch_ids, documents=batch_docs, metadatas=batch_metas)
        total += len(batch_ids)
    return total


def _sanitize_meta(meta: dict) -> dict:
    """Chroma metadata accepts only str/int/float/bool. None -> drop key."""
    out = {}
    for k, v in meta.items():
        if v is None:
            continue
        if isinstance(v, (str, int, float, bool)):
            out[k] = v
        else:
            out[k] = str(v)
    return out


def add_rule_chunks(collection, chunks: list[dict], id_prefix: str) -> int:
    ids, docs, metas = [], [], []
    for idx, ch in enumerate(chunks):
        ids.append(f"{id_prefix}_{idx}")
        docs.append(ch["text"])
        metas.append(_sanitize_meta(ch["metadata"]))
    total = 0
    for b_ids, b_docs, b_metas in zip(
        _batched(ids, EMBED_BATCH_SIZE),
        _batched(docs, EMBED_BATCH_SIZE),
        _batched(metas, EMBED_BATCH_SIZE),
    ):
        collection.add(ids=b_ids, documents=b_docs, metadatas=b_metas)
        total += len(b_ids)
    return total


def query_mbs(collection, query_text: str, n_results: int = 20, where: dict | None = None) -> list[dict]:
    res = collection.query(query_texts=[query_text], n_results=n_results, where=where)
    out = []
    if not res["ids"] or not res["ids"][0]:
        return out
    for i, _id in enumerate(res["ids"][0]):
        out.append({
            "id": _id,
            "document": res["documents"][0][i],
            "metadata": res["metadatas"][0][i],
            "distance": res["distances"][0][i] if res.get("distances") else None,
        })
    return out


def query_rules(collection, query_text: str, n_results: int = 5, where: dict | None = None) -> list[dict]:
    return query_mbs(collection, query_text, n_results, where)
