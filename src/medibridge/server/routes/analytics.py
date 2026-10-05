from __future__ import annotations

from fastapi import APIRouter

from medibridge.data import db as dbmod
from medibridge.data import queries

router = APIRouter()


@router.get("/analytics/clinics")
def get_clinic_analytics() -> dict:
    with dbmod.get_conn() as conn:
        return queries.get_clinic_analytics(conn)
