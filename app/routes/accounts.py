from __future__ import annotations

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
