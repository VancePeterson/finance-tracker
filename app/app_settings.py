"""Read/write helpers for the ``app_settings`` key/value table, plus
timezone-aware date conversion that respects the user's configured zone."""

from __future__ import annotations

import datetime as dt
import sqlite3
import time
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULTS: dict[str, str] = {
    "sync_enabled": "1",
    "sync_interval_minutes": "360",
    "timezone": "America/New_York",
    "include_pending": "1",
    "include_uncategorized": "1",
    "default_dashboard_range": "month",
}


def get(conn: sqlite3.Connection, key: str, default: Optional[str] = None) -> Optional[str]:
    row = conn.execute(
        "SELECT value FROM app_settings WHERE key = ?", (key,)
    ).fetchone()
    if row is None:
        return DEFAULTS.get(key, default)
    return row["value"]


def get_bool(conn: sqlite3.Connection, key: str) -> bool:
    return get(conn, key) != "0"


def get_int(conn: sqlite3.Connection, key: str) -> int:
    return int(get(conn, key) or "0")


def set_(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO app_settings(key, value, updated_at) VALUES(?, ?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (key, value, int(time.time())),
    )


def get_tz(conn: sqlite3.Connection) -> ZoneInfo:
    name = get(conn, "timezone") or "America/New_York"
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("America/New_York")


def epoch_for_local_date(date_str: Optional[str], tz: ZoneInfo) -> Optional[int]:
    """Convert a 'YYYY-MM-DD' string interpreted in ``tz`` to a UTC epoch."""
    if not date_str:
        return None
    naive = dt.datetime.strptime(date_str, "%Y-%m-%d")
    return int(naive.replace(tzinfo=tz).timestamp())


def month_bounds(tz: ZoneInfo) -> tuple[int, int]:
    """First-of-this-month and first-of-next-month, as UTC epochs in ``tz``."""
    now = dt.datetime.now(tz)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        end = start.replace(year=now.year + 1, month=1)
    else:
        end = start.replace(month=now.month + 1)
    return int(start.timestamp()), int(end.timestamp())
