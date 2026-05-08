"""Database import endpoint. Replaces the live finances.db with an uploaded
SQLite snapshot (e.g. one produced by the Export tab on another machine)."""

from __future__ import annotations

import sqlite3
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..config import DB_PATH
from ..db import migrate

router = APIRouter(prefix="/api/import", tags=["import"])

REQUIRED_TABLES = {"accounts", "transactions"}


def _validate_sqlite(path: Path) -> tuple[int, int]:
    # sqlite3.connect succeeds on any path; the actual "is this a DB?" check
    # only runs when we issue a statement, so wrap the whole interaction.
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
        missing = REQUIRED_TABLES - tables
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Uploaded file is missing required tables: {sorted(missing)}",
            )
        n_accounts = conn.execute("SELECT COUNT(*) FROM accounts").fetchone()[0]
        n_txns = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        return n_accounts, n_txns
    except sqlite3.DatabaseError as e:
        raise HTTPException(status_code=400, detail=f"Not a valid SQLite file: {e}")
    finally:
        if conn is not None:
            conn.close()


@router.post("/database")
async def import_database(file: UploadFile = File(...)) -> dict:
    # Stream upload to a temp file so we don't hold the whole thing in memory.
    fd = tempfile.NamedTemporaryFile(
        prefix="finances-import-", suffix=".db", delete=False
    )
    upload_path = Path(fd.name)
    try:
        while True:
            chunk = await file.read(1 << 20)
            if not chunk:
                break
            fd.write(chunk)
        fd.close()

        n_accounts, n_txns = _validate_sqlite(upload_path)

        # Snapshot the current DB before overwriting it, so the user has a
        # rollback target if the imported file isn't what they expected.
        backup_path: Path | None = None
        if DB_PATH.exists():
            ts = int(time.time())
            backup_path = DB_PATH.with_name(f"{DB_PATH.name}.bak-{ts}")
            src = sqlite3.connect(DB_PATH)
            try:
                dst = sqlite3.connect(backup_path)
                with dst:
                    src.backup(dst)
                dst.close()
            finally:
                src.close()

        # Copy uploaded → live via the SQLite backup API. Safe even if other
        # connections (the scheduler thread, in-flight requests) are open.
        src = sqlite3.connect(upload_path)
        try:
            dst = sqlite3.connect(DB_PATH)
            try:
                with dst:
                    src.backup(dst)
                # Ensure additive web-app columns/tables exist on the imported DB.
                migrate(dst)
            finally:
                dst.close()
        finally:
            src.close()

        return {
            "ok": True,
            "imported_accounts": n_accounts,
            "imported_transactions": n_txns,
            "backup_path": str(backup_path) if backup_path else None,
        }
    finally:
        upload_path.unlink(missing_ok=True)
