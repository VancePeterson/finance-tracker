"""SimpleFIN connection management — read/write the .env that sync.py uses."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import SYNC_CWD
from ..db import connect
from ..scheduler import run_sync_once

router = APIRouter(prefix="/api/simplefin", tags=["simplefin"])

ENV_PATH = SYNC_CWD / ".env"
ENV_KEYS = ("SIMPLEFIN_SETUP_TOKEN", "SIMPLEFIN_ACCESS_URL")


def _read_env() -> dict[str, str]:
    env = {k: "" for k in ENV_KEYS}
    if not ENV_PATH.exists():
        return env
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def _write_env(env: dict[str, str]) -> None:
    lines = [
        "# Paste your SimpleFIN setup token below (the base64 string from beta-bridge.simplefin.org).",
        "# After the first sync the setup token is consumed and replaced with the access URL.",
        "",
    ]
    for k in ENV_KEYS:
        lines.append(f"{k}={env.get(k, '')}")
    ENV_PATH.write_text("\n".join(lines) + "\n")
    try:
        ENV_PATH.chmod(0o600)
    except OSError:
        pass


def get_conn():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


class SetupTokenIn(BaseModel):
    setup_token: str = Field(min_length=10, max_length=4000)


@router.get("/status")
def status() -> dict:
    env = _read_env()
    return {
        "configured": bool(env.get("SIMPLEFIN_ACCESS_URL")),
        "has_pending_token": bool(env.get("SIMPLEFIN_SETUP_TOKEN")),
        "env_path": str(ENV_PATH),
    }


@router.post("/setup")
def setup(payload: SetupTokenIn) -> dict:
    """Save the setup token to .env, then immediately run a sync (which
    consumes the token via the SimpleFIN claim API and replaces it with a
    long-lived access URL)."""
    env = _read_env()
    env["SIMPLEFIN_SETUP_TOKEN"] = payload.setup_token.strip()
    env["SIMPLEFIN_ACCESS_URL"] = env.get("SIMPLEFIN_ACCESS_URL", "")
    _write_env(env)

    ok, output = run_sync_once()
    if not ok:
        # Roll back the token write so the form re-appears.
        env["SIMPLEFIN_SETUP_TOKEN"] = ""
        _write_env(env)
        raise HTTPException(status_code=400, detail=output[-2000:])

    new_env = _read_env()
    return {
        "configured": bool(new_env.get("SIMPLEFIN_ACCESS_URL")),
        "output": output[-2000:],
    }


@router.delete("/connection")
def disconnect() -> dict:
    """Clear both the setup token and access URL from .env. The user must
    paste a fresh setup token from beta-bridge.simplefin.org to reconnect."""
    _write_env({"SIMPLEFIN_SETUP_TOKEN": "", "SIMPLEFIN_ACCESS_URL": ""})
    return {"configured": False}
