from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..scheduler import run_sync_once

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("")
def trigger_sync() -> dict:
    ok, output = run_sync_once()
    if not ok:
        raise HTTPException(status_code=500, detail=output)
    return {"output": output}
