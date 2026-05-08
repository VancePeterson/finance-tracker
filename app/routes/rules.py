from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import connect
from ..models import Rule, RuleIn, RulePatch
from ..rules import apply_rules

router = APIRouter(prefix="/api/rules", tags=["rules"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_rule(row) -> Rule:
    return Rule(
        id=row["id"],
        pattern=row["pattern"],
        category_id=row["category_id"],
        category_name=row["category_name"],
        priority=row["priority"],
    )


_LIST_SQL = """
    SELECT r.id, r.pattern, r.category_id, c.name AS category_name, r.priority
      FROM merchant_rules r
      LEFT JOIN categories c ON c.id = r.category_id
     ORDER BY r.priority DESC, r.id ASC
"""


@router.get("", response_model=list[Rule])
def list_rules(conn=Depends(get_conn)) -> list[Rule]:
    return [_row_to_rule(r) for r in conn.execute(_LIST_SQL).fetchall()]


@router.post("", response_model=Rule, status_code=201)
def create_rule(payload: RuleIn, conn=Depends(get_conn)) -> Rule:
    if not conn.execute(
        "SELECT 1 FROM categories WHERE id = ?", (payload.category_id,)
    ).fetchone():
        raise HTTPException(status_code=400, detail="Unknown category_id")
    cur = conn.execute(
        "INSERT INTO merchant_rules(pattern, category_id, priority) VALUES(?,?,?)",
        (payload.pattern, payload.category_id, payload.priority),
    )
    conn.commit()
    apply_rules(conn)
    row = conn.execute(
        _LIST_SQL.replace("ORDER BY", "WHERE r.id = ? ORDER BY"),
        (cur.lastrowid,),
    ).fetchone()
    return _row_to_rule(row)


@router.patch("/{rule_id}", response_model=Rule)
def update_rule(rule_id: int, patch: RulePatch, conn=Depends(get_conn)) -> Rule:
    if not conn.execute(
        "SELECT 1 FROM merchant_rules WHERE id = ?", (rule_id,)
    ).fetchone():
        raise HTTPException(status_code=404, detail="Rule not found")

    sets, params = [], []
    if patch.pattern is not None:
        sets.append("pattern = ?")
        params.append(patch.pattern)
    if patch.category_id is not None:
        sets.append("category_id = ?")
        params.append(patch.category_id)
    if patch.priority is not None:
        sets.append("priority = ?")
        params.append(patch.priority)
    if sets:
        params.append(rule_id)
        conn.execute(
            f"UPDATE merchant_rules SET {', '.join(sets)} WHERE id = ?", params
        )
        conn.commit()
        apply_rules(conn)

    row = conn.execute(
        _LIST_SQL.replace("ORDER BY", "WHERE r.id = ? ORDER BY"),
        (rule_id,),
    ).fetchone()
    return _row_to_rule(row)


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, conn=Depends(get_conn)) -> None:
    cur = conn.execute("DELETE FROM merchant_rules WHERE id = ?", (rule_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    conn.commit()
    apply_rules(conn)


@router.post("/apply")
def reapply(conn=Depends(get_conn)) -> dict:
    affected = apply_rules(conn)
    return {"affected": affected}
