from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import claude_auth
from ..db import connect

router = APIRouter(prefix="/api/claude", tags=["claude-auth"])


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


class CodePayload(BaseModel):
    code: str


def _extract_code(raw: str) -> str:
    """Accept either a bare code or a full callback URL (with ?code=...)."""
    s = raw.strip()
    if "code=" not in s:
        return s
    try:
        parsed = urlparse(s)
        for source in (parsed.query, parsed.fragment):
            if source:
                qs = parse_qs(source)
                if "code" in qs and qs["code"]:
                    return qs["code"][0]
    except Exception:
        pass
    m = re.search(r"code=([^&\s#]+)", s)
    return m.group(1) if m else s


@router.get("/status")
def status(conn=Depends(get_conn)) -> dict:
    return claude_auth.get_status(conn)


@router.post("/login/start")
def login_start() -> dict:
    try:
        url = claude_auth.start_login()
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="`claude` CLI is not installed on this server. "
            "Run scripts/setup-lxc.sh first.",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"url": url}


@router.post("/login/complete")
def login_complete(payload: CodePayload, conn=Depends(get_conn)) -> dict:
    try:
        return claude_auth.complete_login(_extract_code(payload.code), conn)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/login")
def logout(conn=Depends(get_conn)) -> dict:
    return claude_auth.clear_token(conn)
