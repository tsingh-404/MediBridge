"""Shared profile read/write — used by CLI onboarding and the HTTP API.

Every profile row is scoped by ``device_id``:

* ``None`` — the shared legacy row (``id = 1``). Used by the CLI and by the
  desktop web app, which sends no ``X-MB-Device`` header. Also the only row
  mirrored to the ``user_profile.json`` sidecar.
* a string — one row per mobile install, so two testers on the same deployment
  no longer overwrite each other.
"""
from __future__ import annotations

import json

from medibridge.config import USER_PROFILE_JSON
from medibridge.data import db as dbmod

COVER_TYPES = ("single", "couple", "family", "sole_parent")


def device_scope(device_id: str | None, alias: str = "") -> tuple[str, tuple]:
    """SQL predicate + params selecting one device's profile row (or the legacy one)."""
    col = f"{alias}.device_id" if alias else "device_id"
    if device_id:
        return f"{col} = ?", (device_id,)
    return f"{col} IS NULL", ()


def device_from_config(config) -> str | None:
    """Read the device id out of a LangChain/LangGraph RunnableConfig."""
    try:
        return (config or {}).get("configurable", {}).get("device_id") or None
    except (AttributeError, TypeError):
        return None


def has_profile(device_id: str | None = None) -> bool:
    where, params = device_scope(device_id)
    try:
        with dbmod.get_conn() as conn:
            row = conn.execute(
                f"SELECT 1 FROM user_profile WHERE {where}", params
            ).fetchone()
        return row is not None
    except Exception:
        return False


def load_profile(device_id: str | None = None) -> dict | None:
    """Return profile rehydrated with insurer + tier records, or None."""
    where, params = device_scope(device_id, "p")
    with dbmod.get_conn() as conn:
        row = conn.execute(
            f"""SELECT
                    p.cover_type, p.policy_start_date,
                    t.tier_id, t.tier_name,
                    t.gp_benefit_pct, t.specialist_benefit_pct, t.in_hospital_benefit_pct,
                    i.insurer_id, i.insurer_name
               FROM user_profile p
               JOIN insurer_tiers t ON p.tier_id = t.tier_id
               JOIN insurers i ON t.insurer_id = i.insurer_id
               WHERE {where}""",
            params,
        ).fetchone()
    if not row:
        return None
    return {
        "insurer": {"id": row["insurer_id"], "name": row["insurer_name"]},
        "tier": {
            "id": row["tier_id"],
            "name": row["tier_name"],
            "gp": row["gp_benefit_pct"],
            "spec": row["specialist_benefit_pct"],
            "in_hospital": row["in_hospital_benefit_pct"],
        },
        "cover": row["cover_type"],
        "date": row["policy_start_date"],
    }


def save_profile(
    tier_id: str,
    cover_type: str,
    policy_start_date: str,
    device_id: str | None = None,
) -> dict:
    """Upsert one device's profile in SQLite. Returns the rehydrated profile.

    Only the legacy row is mirrored to the JSON sidecar — that file is a
    single-user CLI convenience and has no per-device equivalent.
    """
    if cover_type not in COVER_TYPES:
        raise ValueError(f"cover_type must be one of {COVER_TYPES}")
    where, params = device_scope(device_id)
    with dbmod.get_conn() as conn:
        exists = conn.execute(
            "SELECT 1 FROM insurer_tiers WHERE tier_id = ?", (tier_id,)
        ).fetchone()
        if not exists:
            raise ValueError(f"Unknown tier_id: {tier_id}")
        # Scoped delete: replacing one device's profile must not touch the others.
        conn.execute(f"DELETE FROM user_profile WHERE {where}", params)
        # `id` is left to autoincrement — device_id is the real key now, and
        # pinning the legacy row to id=1 collides once a device row has taken it.
        conn.execute(
            "INSERT INTO user_profile (device_id, tier_id, cover_type, policy_start_date) "
            "VALUES (?, ?, ?, ?)",
            (device_id or None, tier_id, cover_type, policy_start_date),
        )
    if not device_id:
        USER_PROFILE_JSON.parent.mkdir(parents=True, exist_ok=True)
        USER_PROFILE_JSON.write_text(
            json.dumps(
                {
                    "tier_id": tier_id,
                    "cover_type": cover_type,
                    "policy_start_date": policy_start_date,
                }
            ),
            encoding="utf-8",
        )
    profile = load_profile(device_id)
    if profile is None:
        raise RuntimeError("Profile write succeeded but reload failed")
    return profile


def clear_profile(device_id: str | None = None) -> None:
    where, params = device_scope(device_id)
    with dbmod.get_conn() as conn:
        conn.execute(f"DELETE FROM user_profile WHERE {where}", params)
    if not device_id and USER_PROFILE_JSON.exists():
        USER_PROFILE_JSON.unlink()


def list_insurers() -> list[dict]:
    """Return [{id, name, tiers:[{id,name,gp,spec,in_hospital}]}] for onboarding UI."""
    with dbmod.get_conn() as conn:
        ins_rows = conn.execute(
            "SELECT insurer_id, insurer_name FROM insurers ORDER BY insurer_name"
        ).fetchall()
        tier_rows = conn.execute(
            """SELECT tier_id, insurer_id, tier_name,
                      gp_benefit_pct, specialist_benefit_pct, in_hospital_benefit_pct
               FROM insurer_tiers ORDER BY tier_name"""
        ).fetchall()
    by_insurer: dict[str, list[dict]] = {}
    for t in tier_rows:
        by_insurer.setdefault(t["insurer_id"], []).append(
            {
                "id": t["tier_id"],
                "name": t["tier_name"],
                "gp": t["gp_benefit_pct"],
                "spec": t["specialist_benefit_pct"],
                "in_hospital": t["in_hospital_benefit_pct"],
            }
        )
    return [
        {
            "id": ins["insurer_id"],
            "name": ins["insurer_name"],
            "tiers": by_insurer.get(ins["insurer_id"], []),
        }
        for ins in ins_rows
    ]
