from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import app_settings as S
from ..db import connect
from ..models import Budget, BudgetIn, BudgetPatch

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _list_sql(conn) -> tuple[str, list]:
    tz = S.get_tz(conn)
    start, end = S.month_bounds(tz)
    pending_clause = "" if S.get_bool(conn, "include_pending") else "AND t.pending = 0"
    sql = f"""
        SELECT b.id, b.category_id, c.name AS category_name, c.color,
               b.monthly_limit,
               COALESCE((
                 SELECT -SUM(t.amount)
                   FROM transactions t
                   JOIN accounts   a ON a.id = t.account_id
                  WHERE t.category_id = b.category_id
                    AND t.amount < 0
                    AND COALESCE(a.excluded_from_totals, 0) = 0
                    {pending_clause}
                    AND t.posted >= ?
                    AND t.posted <  ?
               ), 0) AS spent_this_month
          FROM budgets b
          JOIN categories c ON c.id = b.category_id
    """
    return sql, [start, end]


@router.get("", response_model=list[Budget])
def list_budgets(conn=Depends(get_conn)) -> list[Budget]:
    sql, params = _list_sql(conn)
    rows = conn.execute(sql + " ORDER BY c.name", params).fetchall()
    return [Budget(**dict(r)) for r in rows]


@router.post("", response_model=Budget, status_code=201)
def create_budget(payload: BudgetIn, conn=Depends(get_conn)) -> Budget:
    if not conn.execute(
        "SELECT 1 FROM categories WHERE id = ?", (payload.category_id,)
    ).fetchone():
        raise HTTPException(status_code=400, detail="Unknown category_id")
    try:
        cur = conn.execute(
            "INSERT INTO budgets(category_id, monthly_limit) VALUES(?, ?)",
            (payload.category_id, payload.monthly_limit),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    conn.commit()
    sql, params = _list_sql(conn)
    row = conn.execute(sql + " WHERE b.id = ?", params + [cur.lastrowid]).fetchone()
    return Budget(**dict(row))


@router.patch("/{budget_id}", response_model=Budget)
def update_budget(budget_id: int, patch: BudgetPatch, conn=Depends(get_conn)) -> Budget:
    if not conn.execute("SELECT 1 FROM budgets WHERE id = ?", (budget_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Budget not found")
    if patch.monthly_limit is not None:
        conn.execute(
            "UPDATE budgets SET monthly_limit = ? WHERE id = ?",
            (patch.monthly_limit, budget_id),
        )
        conn.commit()
    sql, params = _list_sql(conn)
    row = conn.execute(sql + " WHERE b.id = ?", params + [budget_id]).fetchone()
    return Budget(**dict(row))


@router.delete("/{budget_id}", status_code=204)
def delete_budget(budget_id: int, conn=Depends(get_conn)) -> None:
    cur = conn.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    conn.commit()
