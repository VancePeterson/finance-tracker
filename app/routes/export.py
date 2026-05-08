"""Bulk-export endpoints. The SQLite download uses ``conn.backup`` to produce a
consistent snapshot even if a write or sync is in flight."""

from __future__ import annotations

import csv
import datetime as dt
import io
import sqlite3
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask

from ..config import DB_PATH
from ..db import connect

router = APIRouter(prefix="/api/export", tags=["export"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@router.get("/database")
def export_database():
    if not DB_PATH.exists():
        raise HTTPException(status_code=404, detail="finances.db not found")

    src = sqlite3.connect(DB_PATH)
    fd = tempfile.NamedTemporaryFile(prefix="finances-", suffix=".db", delete=False)
    fd.close()
    snapshot_path = Path(fd.name)
    try:
        dst = sqlite3.connect(snapshot_path)
        with dst:
            src.backup(dst)
        dst.close()
    finally:
        src.close()

    today = dt.date.today().isoformat()
    return FileResponse(
        snapshot_path,
        media_type="application/x-sqlite3",
        filename=f"finances-{today}.db",
        background=BackgroundTask(snapshot_path.unlink, missing_ok=True),
    )


@router.get("/transactions.csv")
def export_transactions_csv(conn=Depends(get_conn)):
    rows = conn.execute(
        """
        SELECT date(t.posted, 'unixepoch') AS posted_date,
               t.posted AS posted_epoch,
               a.name AS account,
               t.amount,
               t.payee,
               t.description,
               t.memo,
               c.name AS category,
               t.category_source,
               t.notes,
               t.pending,
               t.id
          FROM transactions t
          LEFT JOIN accounts   a ON a.id = t.account_id
          LEFT JOIN categories c ON c.id = t.category_id
         ORDER BY t.posted DESC, t.id
        """
    ).fetchall()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "date", "epoch", "account", "amount", "payee", "description",
        "memo", "category", "category_source", "notes", "pending", "id",
    ])
    for r in rows:
        w.writerow([
            r["posted_date"], r["posted_epoch"], r["account"] or "",
            f"{r['amount']:.2f}" if r["amount"] is not None else "",
            r["payee"] or "", r["description"] or "", r["memo"] or "",
            r["category"] or "", r["category_source"] or "", r["notes"] or "",
            r["pending"], r["id"],
        ])
    buf.seek(0)
    today = dt.date.today().isoformat()
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="transactions-{today}.csv"'},
    )
