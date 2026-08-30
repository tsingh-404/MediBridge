from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Response

from medibridge.server.schemas import ProfileSavePayload
from medibridge.profile import clear_profile, load_profile, save_profile

router = APIRouter()

# Sent by the mobile app (see ui/api.js). Absent for the desktop web app and the
# CLI, which both fall back to the shared legacy profile row.
DeviceId = Annotated[str | None, Header(alias="X-MB-Device")]


@router.get("/profile")
def get_profile(x_mb_device: DeviceId = None) -> dict:
    p = load_profile(x_mb_device)
    if p is None:
        raise HTTPException(status_code=404, detail="No profile")
    return p


@router.put("/profile")
def put_profile(payload: ProfileSavePayload, x_mb_device: DeviceId = None) -> dict:
    try:
        return save_profile(
            payload.tier_id,
            payload.cover_type,
            payload.policy_start_date,
            device_id=x_mb_device,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/profile", status_code=204)
def delete_profile(x_mb_device: DeviceId = None) -> Response:
    clear_profile(x_mb_device)
    return Response(status_code=204)
