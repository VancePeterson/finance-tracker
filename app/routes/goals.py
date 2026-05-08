from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import connect
from ..models import Goal, GoalIn, GoalPatch

router = APIRouter(prefix="/api/goals", tags=["goals"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


_SELECT = """
    SELECT g.id, g.name, g.target_amount, g.target_date, g.account_id,
           a.name AS account_name,
           g.starting_balance,
           COALESCE(a.balance - g.starting_balance, 0) AS current_amount,
           g.color, g.notes
      FROM goals g
      LEFT JOIN accounts a ON a.id = g.account_id
"""


@router.get("", response_model=list[Goal])
def list_goals(conn=Depends(get_conn)) -> list[Goal]:
    rows = conn.execute(_SELECT + " ORDER BY g.created_at DESC").fetchall()
    return [Goal(**dict(r)) for r in rows]


@router.post("", response_model=Goal, status_code=201)
def create_goal(payload: GoalIn, conn=Depends(get_conn)) -> Goal:
    cur = conn.execute(
        """
        INSERT INTO goals(name, target_amount, target_date, account_id,
                          starting_balance, color, notes)
        VALUES(?,?,?,?,?,?,?)
        """,
        (
            payload.name,
            payload.target_amount,
            payload.target_date,
            payload.account_id,
            payload.starting_balance,
            payload.color,
            payload.notes,
        ),
    )
    conn.commit()
    row = conn.execute(_SELECT + " WHERE g.id = ?", (cur.lastrowid,)).fetchone()
    return Goal(**dict(row))


@router.patch("/{goal_id}", response_model=Goal)
def update_goal(goal_id: int, patch: GoalPatch, conn=Depends(get_conn)) -> Goal:
    if not conn.execute("SELECT 1 FROM goals WHERE id = ?", (goal_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Goal not found")

    sets, params = [], []
    fields = patch.model_fields_set
    for col in (
        "name",
        "target_amount",
        "target_date",
        "account_id",
        "starting_balance",
        "color",
        "notes",
    ):
        if col in fields:
            sets.append(f"{col} = ?")
            params.append(getattr(patch, col))
    if sets:
        params.append(goal_id)
        conn.execute(f"UPDATE goals SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()

    row = conn.execute(_SELECT + " WHERE g.id = ?", (goal_id,)).fetchone()
    return Goal(**dict(row))


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, conn=Depends(get_conn)) -> None:
    cur = conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    conn.commit()
