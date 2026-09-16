"""Waiting period checker, insurer-aware."""
from __future__ import annotations

from datetime import date, datetime

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from medibridge.data import db as dbmod
from medibridge.data import queries
from medibridge.profile import device_from_config, device_scope

# Deed groups with NIL out-of-hospital waiting (Schedule 4)
_NIL_OUTPATIENT_GROUPS = {"A1", "A2", "A22", "A23", "A46"}
# Subgroup-specific NIL groups: A7 sub 2/10, A40 sub 1/2 — checked separately if data available


def _months_elapsed(start: date, today: date) -> int:
    months = (today.year - start.year) * 12 + (today.month - start.month)
    if today.day < start.day:
        months -= 1
    return max(months, 0)


def _parse_iso(d: str) -> date:
    return datetime.strptime(d, "%Y-%m-%d").date()


def _get_user_tier_id(conn, device_id: str | None = None) -> str | None:
    where, params = device_scope(device_id)
    row = conn.execute(
        f"SELECT tier_id FROM user_profile WHERE {where}", params
    ).fetchone()
    return row["tier_id"] if row else None


def _classify(item: dict, condition: str | None) -> str:
    """Map item + optional condition hint -> condition_type used in waiting table."""
    if condition:
        return condition
    grp = (item.get("group_code") or "").upper()
    if grp in _NIL_OUTPATIENT_GROUPS:
        return "gp_outpatient"
    return "general_hospital"


@tool
def check_waiting_period(
    item_num: str, condition: str | None = None, config: RunnableConfig = None
) -> dict:
    """Check if a waiting period applies to a service.

    Args:
        item_num: MBS item number
        condition: optional override - "pre_existing_non_psych", "pre_existing_psychiatric",
                   "pregnancy", "psychiatric_hospital", "ambulance", "pharmaceutical"
    """
    with dbmod.get_conn() as conn:
        item = queries.get_item_by_number(conn, str(item_num))
        if not item:
            return {"error": f"item {item_num} not found"}
        cond_type = _classify(item, condition)

        device_id = device_from_config(config)
        tier_id = _get_user_tier_id(conn, device_id)
        waiting_months = None
        notes = None
        if tier_id:
            row = conn.execute(
                "SELECT waiting_months, notes FROM insurer_waiting_periods "
                "WHERE tier_id = ? AND condition_type = ?",
                (tier_id, cond_type),
            ).fetchone()
            if row:
                waiting_months = row["waiting_months"]
                notes = row["notes"]
        if waiting_months is None:
            # deed defaults
            defaults = {
                "gp_outpatient": 0, "ambulance": 0, "pharmaceutical": 2,
                "psychiatric_hospital": 2, "general_hospital": 2,
                "pre_existing_non_psych": 12, "pre_existing_psychiatric": 2,
                "pregnancy": 12,
            }
            waiting_months = defaults.get(cond_type, 2)

        # Compare against policy_start_date
        pwhere, pparams = device_scope(device_id)
        prow = conn.execute(
            f"SELECT policy_start_date FROM user_profile WHERE {pwhere}", pparams
        ).fetchone()
        if prow:
            start = _parse_iso(prow["policy_start_date"])
            elapsed = _months_elapsed(start, date.today())
            remaining = max(waiting_months - elapsed, 0)
            served = remaining == 0
        else:
            elapsed = None
            remaining = waiting_months
            served = waiting_months == 0

        return {
            "item_num": item_num,
            "condition_type": cond_type,
            "group_code": item.get("group_code"),
            "waiting_months": waiting_months,
            "months_elapsed": elapsed,
            "months_remaining": remaining,
            "served": served,
            "notes": notes,
        }
