from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import app_settings as S
from ..db import connect
from ..models import Transaction, TransactionPatch

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _epoch(conn, date_str: Optional[str]) -> Optional[int]:
    if not date_str:
        return None
    return S.epoch_for_local_date(date_str, S.get_tz(conn))


@router.get("", response_model=list[Transaction])
def list_transactions(
    conn=Depends(get_conn),
    start: Optional[str] = Query(None, description="YYYY-MM-DD inclusive"),
    end: Optional[str] = Query(None, description="YYYY-MM-DD exclusive"),
    account_id: Optional[str] = None,
    category_id: Optional[int] = None,
    uncategorized: bool = False,
    search: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[Transaction]:
    where = ["1=1"]
    params: list = []
    if (s := _epoch(conn, start)) is not None:
        where.append("t.posted >= ?")
        params.append(s)
    if (e := _epoch(conn, end)) is not None:
        where.append("t.posted < ?")
        params.append(e)
    if account_id:
        where.append("t.account_id = ?")
        params.append(account_id)
    if uncategorized:
        where.append("t.category_id IS NULL")
    elif category_id is not None:
        where.append("t.category_id = ?")
        params.append(category_id)
    if search:
        like = f"%{search}%"
        where.append("(t.payee LIKE ? OR t.description LIKE ? OR t.memo LIKE ? OR t.notes LIKE ?)")
        params.extend([like, like, like, like])

    sql = f"""
        SELECT t.id, t.account_id, a.name AS account_name,
               t.posted, t.amount, t.description, t.payee, t.memo, t.pending,
               t.category_id, c.name AS category_name, t.category_source, t.notes
          FROM transactions t
          LEFT JOIN accounts   a ON a.id = t.account_id
          LEFT JOIN categories c ON c.id = t.category_id
         WHERE {' AND '.join(where)}
         ORDER BY t.posted DESC, t.id
         LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])
    rows = conn.execute(sql, params).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["pending"] = bool(d["pending"])
        out.append(Transaction(**d))
    return out


@router.patch("/{txn_id}", response_model=Transaction)
def update_transaction(
    txn_id: str,
    patch: TransactionPatch,
    conn=Depends(get_conn),
) -> Transaction:
    row = conn.execute("SELECT id FROM transactions WHERE id = ?", (txn_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    sets = []
    params: list = []
    if patch.clear_category:
        sets.append("category_id = NULL")
        sets.append("category_source = NULL")
    elif patch.category_id is not None:
        sets.append("category_id = ?")
        sets.append("category_source = 'manual'")
        params.append(patch.category_id)

    if patch.notes is not None:
        sets.append("notes = ?")
        params.append(patch.notes)

    if sets:
        params.append(txn_id)
        conn.execute(f"UPDATE transactions SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()

    row = conn.execute(
        """
        SELECT t.id, t.account_id, a.name AS account_name,
               t.posted, t.amount, t.description, t.payee, t.memo, t.pending,
               t.category_id, c.name AS category_name, t.category_source, t.notes
          FROM transactions t
          LEFT JOIN accounts   a ON a.id = t.account_id
          LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.id = ?
        """,
        (txn_id,),
    ).fetchone()
    d = dict(row)
    d["pending"] = bool(d["pending"])
    return Transaction(**d)
