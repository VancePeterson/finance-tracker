from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import connect
from ..models import Category, CategoryIn, CategoryPatch

router = APIRouter(prefix="/api/categories", tags=["categories"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


@router.get("", response_model=list[Category])
def list_categories(conn=Depends(get_conn)) -> list[Category]:
    rows = conn.execute(
        """
        SELECT c.id, c.name, c.color, c.parent_id,
               COALESCE(c.excluded_from_reports, 0) AS excluded_from_reports,
               (SELECT COUNT(*) FROM transactions WHERE category_id = c.id) AS transaction_count
          FROM categories c
         ORDER BY c.name
        """
    ).fetchall()
    return [Category(**dict(r)) for r in rows]


@router.post("", response_model=Category, status_code=201)
def create_category(payload: CategoryIn, conn=Depends(get_conn)) -> Category:
    try:
        cur = conn.execute(
            "INSERT INTO categories(name, color, parent_id) VALUES(?,?,?)",
            (payload.name, payload.color, payload.parent_id),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    conn.commit()
    return Category(
        id=cur.lastrowid,
        name=payload.name,
        color=payload.color,
        parent_id=payload.parent_id,
        transaction_count=0,
    )


@router.patch("/{category_id}", response_model=Category)
def update_category(
    category_id: int, patch: CategoryPatch, conn=Depends(get_conn)
) -> Category:
    row = conn.execute("SELECT id FROM categories WHERE id = ?", (category_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")

    sets, params = [], []
    if patch.name is not None:
        sets.append("name = ?")
        params.append(patch.name)
    if patch.color is not None:
        sets.append("color = ?")
        params.append(patch.color)
    if patch.parent_id is not None or "parent_id" in patch.model_fields_set:
        sets.append("parent_id = ?")
        params.append(patch.parent_id)
    if patch.excluded_from_reports is not None:
        sets.append("excluded_from_reports = ?")
        params.append(1 if patch.excluded_from_reports else 0)
    if sets:
        params.append(category_id)
        conn.execute(f"UPDATE categories SET {', '.join(sets)} WHERE id = ?", params)
        conn.commit()

    row = conn.execute(
        """
        SELECT c.id, c.name, c.color, c.parent_id,
               COALESCE(c.excluded_from_reports, 0) AS excluded_from_reports,
               (SELECT COUNT(*) FROM transactions WHERE category_id = c.id) AS transaction_count
          FROM categories c
         WHERE c.id = ?
        """,
        (category_id,),
    ).fetchone()
    return Category(**dict(row))


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, conn=Depends(get_conn)) -> None:
    cur = conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    conn.commit()
