"""Background scheduler that runs the SimpleFIN sync at a user-configured interval.

Settings live in ``app_settings``:
  * ``sync_enabled``           — '1' (default) or '0'
  * ``sync_interval_minutes``  — integer, default 360 (6 hours)
  * ``last_synced_at``         — unix epoch of the last successful sync

The settings page calls :func:`SyncScheduler.reload` after a write so changes
take effect immediately rather than on the next tick.
"""

from __future__ import annotations

import logging
import subprocess
import sys
import threading
import time
from typing import Optional

from .config import SYNC_CWD, SYNC_SCRIPT
from .db import connect
from .rules import apply_rules

log = logging.getLogger("finances-web.scheduler")

DEFAULT_INTERVAL_MIN = 360
INITIAL_DELAY_SEC = 30
DISABLED_POLL_SEC = 300


def _read_settings() -> tuple[bool, int]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT key, value FROM app_settings "
            "WHERE key IN ('sync_enabled', 'sync_interval_minutes')"
        ).fetchall()
        s = {r["key"]: r["value"] for r in rows}
        enabled = s.get("sync_enabled", "1") != "0"
        try:
            interval = max(1, int(s.get("sync_interval_minutes", DEFAULT_INTERVAL_MIN)))
        except ValueError:
            interval = DEFAULT_INTERVAL_MIN
        return enabled, interval
    finally:
        conn.close()


def _record_sync(success: bool) -> None:
    conn = connect()
    try:
        now = int(time.time())
        if success:
            conn.execute(
                "INSERT INTO app_settings(key, value, updated_at) VALUES('last_synced_at', ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (str(now), now),
            )
            conn.commit()
    finally:
        conn.close()


def run_sync_once() -> tuple[bool, str]:
    """Spawn sync.py, then re-apply merchant rules. Returns (success, output)."""
    if not SYNC_SCRIPT.exists():
        return False, f"sync.py missing at {SYNC_SCRIPT}"
    proc = subprocess.run(
        [sys.executable, str(SYNC_SCRIPT)],
        cwd=str(SYNC_CWD),
        capture_output=True,
        text=True,
        timeout=300,
    )
    output = (proc.stdout + proc.stderr).strip()
    if proc.returncode != 0:
        return False, output

    conn = connect()
    try:
        apply_rules(conn)
    finally:
        conn.close()
    _record_sync(success=True)
    return True, output


class SyncScheduler:
    def __init__(self) -> None:
        self.thread: Optional[threading.Thread] = None
        self.wake = threading.Event()
        self.stopping = False

    def start(self) -> None:
        if self.thread and self.thread.is_alive():
            return
        self.stopping = False
        self.thread = threading.Thread(target=self._loop, daemon=True, name="sync-scheduler")
        self.thread.start()

    def stop(self) -> None:
        self.stopping = True
        self.wake.set()
        if self.thread:
            self.thread.join(timeout=5)

    def reload(self) -> None:
        """Wake the loop so it re-reads settings now."""
        self.wake.set()

    def _loop(self) -> None:
        # Don't sync immediately on boot — let the app finish starting.
        if self.wake.wait(timeout=INITIAL_DELAY_SEC):
            self.wake.clear()
            if self.stopping:
                return

        while not self.stopping:
            enabled, interval_min = _read_settings()
            if not enabled:
                self.wake.wait(timeout=DISABLED_POLL_SEC)
                self.wake.clear()
                continue

            try:
                ok, out = run_sync_once()
                if ok:
                    log.info("auto-sync ok")
                else:
                    log.warning("auto-sync failed: %s", out[:300])
            except Exception:
                log.exception("auto-sync raised")

            # Sleep for the configured interval, but wake early on settings change.
            self.wake.wait(timeout=interval_min * 60)
            self.wake.clear()


scheduler = SyncScheduler()
