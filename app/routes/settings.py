from __future__ import annotations

from typing import Optional
from zoneinfo import available_timezones, ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import app_settings as S
from ..db import connect
from ..scheduler import scheduler

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


class GeneralSettings(BaseModel):
    sync_enabled: bool
    sync_interval_minutes: int
    last_synced_at: Optional[int]
    timezone: str
    include_pending: bool
    default_dashboard_range: str


class GeneralSettingsPatch(BaseModel):
    sync_enabled: Optional[bool] = None
    sync_interval_minutes: Optional[int] = Field(default=None, ge=5, le=24 * 60)
    timezone: Optional[str] = None
    include_pending: Optional[bool] = None
    default_dashboard_range: Optional[str] = Field(
        default=None, pattern="^(month|ytd|12m)$"
    )


def _read(conn) -> GeneralSettings:
    last_str = S.get(conn, "last_synced_at")
    return GeneralSettings(
        sync_enabled=S.get_bool(conn, "sync_enabled"),
        sync_interval_minutes=S.get_int(conn, "sync_interval_minutes"),
        last_synced_at=int(last_str) if last_str else None,
        timezone=S.get(conn, "timezone") or "America/New_York",
        include_pending=S.get_bool(conn, "include_pending"),
        default_dashboard_range=S.get(conn, "default_dashboard_range") or "month",
    )


@router.get("/general", response_model=GeneralSettings)
def get_general(conn=Depends(get_conn)) -> GeneralSettings:
    return _read(conn)


@router.patch("/general", response_model=GeneralSettings)
def update_general(patch: GeneralSettingsPatch, conn=Depends(get_conn)) -> GeneralSettings:
    fields = patch.model_fields_set
    if patch.timezone is not None:
        try:
            ZoneInfo(patch.timezone)
        except ZoneInfoNotFoundError:
            raise HTTPException(status_code=400, detail=f"Unknown timezone: {patch.timezone}")

    if "sync_enabled" in fields:
        S.set_(conn, "sync_enabled", "1" if patch.sync_enabled else "0")
    if "sync_interval_minutes" in fields:
        S.set_(conn, "sync_interval_minutes", str(patch.sync_interval_minutes))
    if "timezone" in fields:
        S.set_(conn, "timezone", patch.timezone or "America/New_York")
    if "include_pending" in fields:
        S.set_(conn, "include_pending", "1" if patch.include_pending else "0")
    if "default_dashboard_range" in fields:
        S.set_(conn, "default_dashboard_range", patch.default_dashboard_range or "month")
    conn.commit()
    scheduler.reload()
    return _read(conn)


@router.get("/timezones")
def list_timezones() -> list[str]:
    """Sorted list of valid IANA tz names — used to populate the dropdown."""
    return sorted(available_timezones())
