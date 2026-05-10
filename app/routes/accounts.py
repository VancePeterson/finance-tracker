from __future__ import annotations

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db import connect
from ..models import Account

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _trailing_digits(name: str) -> str:
    # Match the last run of digits in the name (SimpleFIN names typically
    # end with the masked last-4, e.g. "Checking ...4752").
    m = re.search(r"(\d+)\D*$", name or "")
    return m.group(1) if m else ""


class AccountPatch(BaseModel):
    excluded_from_totals: Optional[bool] = None


@router.get("", response_model=list[Account])
def list_accounts(conn=Depends(get_conn)) -> list[Account]:
    rows = conn.execute(
        """
        SELECT id, name, currency, balance, available_balance,
               balance_date, org_name, org_domain,
               COALESCE(excluded_from_totals, 0) AS excluded_from_totals
          FROM accounts
         ORDER BY org_name, name
        """
    ).fetchall()
    return [
        Account(**{**dict(r), "excluded_from_totals": bool(r["excluded_from_totals"])})
        for r in rows
    ]


@router.patch("/{account_id}", response_model=Account)
def update_account(account_id: str, patch: AccountPatch, conn=Depends(get_conn)) -> Account:
    if not conn.execute("SELECT 1 FROM accounts WHERE id = ?", (account_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Account not found")
    if patch.excluded_from_totals is not None:
        conn.execute(
            "UPDATE accounts SET excluded_from_totals = ? WHERE id = ?",
            (1 if patch.excluded_from_totals else 0, account_id),
        )
        conn.commit()
    row = conn.execute(
        """
        SELECT id, name, currency, balance, available_balance,
               balance_date, org_name, org_domain,
               COALESCE(excluded_from_totals, 0) AS excluded_from_totals
          FROM accounts WHERE id = ?
        """,
        (account_id,),
    ).fetchone()
    return Account(**{**dict(row), "excluded_from_totals": bool(row["excluded_from_totals"])})


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: str, confirm: str, conn=Depends(get_conn)) -> None:
    row = conn.execute("SELECT name FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    name = row["name"] or ""
    digits = _trailing_digits(name)
    expected = digits or name
    if (confirm or "").strip() != expected:
        raise HTTPException(
            status_code=400,
            detail=f"Confirmation does not match. Expected: {expected!r}",
        )
    conn.execute("DELETE FROM transactions WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    conn.commit()
