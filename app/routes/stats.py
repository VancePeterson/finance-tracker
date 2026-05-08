from __future__ import annotations

import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, Query

from .. import app_settings as S
from ..db import connect
from ..models import BalancePoint, CategorySpend, MerchantSpend, MonthlySpend

router = APIRouter(prefix="/api/stats", tags=["stats"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _date_window(conn, start: Optional[str], end: Optional[str]) -> tuple[list[str], list]:
    tz = S.get_tz(conn)
    where = [
        "t.amount < 0",
        "COALESCE(a.excluded_from_totals, 0) = 0",
    ]
    params: list = []
    if not S.get_bool(conn, "include_pending"):
        where.append("t.pending = 0")
    s_epoch = S.epoch_for_local_date(start, tz)
    if s_epoch is not None:
        where.append("t.posted >= ?")
        params.append(s_epoch)
    e_epoch = S.epoch_for_local_date(end, tz)
    if e_epoch is not None:
        where.append("t.posted < ?")
        params.append(e_epoch)
    return where, params


@router.get("/by-category", response_model=list[CategorySpend])
def by_category(
    start: Optional[str] = None,
    end: Optional[str] = None,
    conn=Depends(get_conn),
) -> list[CategorySpend]:
    where, params = _date_window(conn, start, end)
    sql = f"""
        SELECT t.category_id, c.name AS category_name, c.color,
               -SUM(t.amount) AS total,
               COUNT(*) AS transaction_count
          FROM transactions t
          JOIN accounts a   ON a.id = t.account_id
          LEFT JOIN categories c ON c.id = t.category_id
         WHERE {' AND '.join(where)}
         GROUP BY t.category_id
         ORDER BY total DESC
    """
    rows = conn.execute(sql, params).fetchall()
    return [
        CategorySpend(
            category_id=r["category_id"],
            category_name=r["category_name"] or "Uncategorized",
            color=r["color"],
            total=r["total"] or 0.0,
            transaction_count=r["transaction_count"],
        )
        for r in rows
    ]


@router.get("/monthly", response_model=list[MonthlySpend])
def monthly(
    start: Optional[str] = None,
    end: Optional[str] = None,
    conn=Depends(get_conn),
) -> list[MonthlySpend]:
    where, params = _date_window(conn, start, end)
    sql = f"""
        SELECT strftime('%Y-%m', t.posted, 'unixepoch') AS month,
               t.category_id,
               c.name AS category_name,
               c.color,
               -SUM(t.amount) AS total
          FROM transactions t
          JOIN accounts a   ON a.id = t.account_id
          LEFT JOIN categories c ON c.id = t.category_id
         WHERE {' AND '.join(where)}
         GROUP BY month, t.category_id
         ORDER BY month ASC, total DESC
    """
    return [
        MonthlySpend(
            month=r["month"],
            category_id=r["category_id"],
            category_name=r["category_name"] or "Uncategorized",
            color=r["color"],
            total=r["total"] or 0.0,
        )
        for r in conn.execute(sql, params).fetchall()
    ]


@router.get("/merchants", response_model=list[MerchantSpend])
def top_merchants(
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = Query(20, ge=1, le=200),
    conn=Depends(get_conn),
) -> list[MerchantSpend]:
    where, params = _date_window(conn, start, end)
    sql = f"""
        SELECT COALESCE(t.payee, t.description) AS merchant,
               -SUM(t.amount) AS total,
               COUNT(*) AS transaction_count
          FROM transactions t
          JOIN accounts a ON a.id = t.account_id
         WHERE {' AND '.join(where)}
         GROUP BY merchant
         ORDER BY total DESC
         LIMIT ?
    """
    params.append(limit)
    return [
        MerchantSpend(
            merchant=r["merchant"] or "(unknown)",
            total=r["total"] or 0.0,
            transaction_count=r["transaction_count"],
        )
        for r in conn.execute(sql, params).fetchall()
    ]


@router.get("/balances", response_model=list[BalancePoint])
def account_balance_history(
    account_id: str,
    start: Optional[str] = None,
    conn=Depends(get_conn),
) -> list[BalancePoint]:
    """Reconstruct balance over time for a single account by walking backwards
    from the current balance through each transaction.
    """
    acct = conn.execute(
        "SELECT balance FROM accounts WHERE id = ?", (account_id,)
    ).fetchone()
    if not acct or acct["balance"] is None:
        return []
    current = float(acct["balance"])
    tz = S.get_tz(conn)
    s = S.epoch_for_local_date(start, tz)

    txns = conn.execute(
        "SELECT posted, amount FROM transactions "
        "WHERE account_id = ? ORDER BY posted DESC, id DESC",
        (account_id,),
    ).fetchall()

    by_day: dict[str, float] = {}
    today = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    by_day[today] = current
    running = current
    for t in txns:
        running -= float(t["amount"])
        d = dt.datetime.fromtimestamp(int(t["posted"]), tz=dt.timezone.utc).strftime(
            "%Y-%m-%d"
        )
        by_day[d] = running

    points = sorted(by_day.items())
    if s is not None:
        cutoff = dt.datetime.fromtimestamp(s, tz=dt.timezone.utc).strftime("%Y-%m-%d")
        points = [p for p in points if p[0] >= cutoff]
    return [BalancePoint(date=d, balance=b) for d, b in points]
