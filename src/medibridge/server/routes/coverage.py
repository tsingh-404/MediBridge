from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from medibridge.server.schemas import CoverageRequest
from medibridge.tools.coverage_calculator import calculate_oshc_coverage

router = APIRouter()

DeviceId = Annotated[str | None, Header(alias="X-MB-Device")]


@router.post("/coverage")
def post_coverage(req: CoverageRequest, x_mb_device: DeviceId = None) -> dict:
    try:
        return calculate_oshc_coverage.invoke(
            {"item_num": req.item_num, "setting": req.setting},
            config={"configurable": {"device_id": x_mb_device}},
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
