"""Ask-Claude endpoint and the auth-test endpoint.

Both spawn the locally-installed ``claude`` CLI in non-interactive ``--print``
mode. The /api/ask endpoint scopes Claude to a small workspace (CLAUDE.md +
sqlquery wrapper), and restricts tools via ``--allowedTools`` so the assistant
cannot edit, write, or run arbitrary shell commands.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import DB_PATH, REPO_ROOT
from ..db import connect

router = APIRouter(prefix="/api", tags=["ask"])

WORKSPACE = REPO_ROOT / "claude_workspace"
ALLOWED_TOOLS = "Read,Grep,Glob,Bash(./sqlquery:*),WebFetch,WebSearch"
ASK_TIMEOUT_SEC = 120
TEST_TIMEOUT_SEC = 30


class AskPayload(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


def _claude_binary() -> str:
    return shutil.which("claude") or "claude"


def _get_token_from_db() -> str | None:
    """Read the Claude OAuth token from the database."""
    try:
        with connect() as conn:
            row = conn.execute(
                "SELECT value FROM app_settings WHERE key = 'claude_oauth_token'"
            ).fetchone()
            return row["value"] if row else None
    except Exception:
        return None


def _spawn_claude(prompt: str, *, allowed_tools: str | None, timeout: int) -> dict:
    if not WORKSPACE.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Claude workspace missing at {WORKSPACE}",
        )
    cmd = [_claude_binary(), "--print"]
    if allowed_tools:
        # Use the --flag=value form because --allowed-tools is variadic
        # (commander.js <tools...>); the bare-flag form would consume the prompt.
        cmd.append(f"--allowed-tools={allowed_tools}")
    cmd.append(prompt)

    env = os.environ.copy()
    # Ensure sqlquery resolves to the right DB even if the symlink is missing.
    env.setdefault("FINANCES_DB_PATH", str(DB_PATH))

    # Load token from database so restarts aren't needed after login
    token = _get_token_from_db()
    if token:
        env["CLAUDE_CODE_OAUTH_TOKEN"] = token

    started = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(WORKSPACE),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="`claude` CLI not installed on this server. Run scripts/setup-lxc.sh.",
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail=f"Claude timed out after {timeout}s")

    duration_ms = int((time.monotonic() - started) * 1000)
    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "stdout": proc.stdout,
                "stderr": proc.stderr,
                "returncode": proc.returncode,
            },
        )
    return {"answer": proc.stdout.strip(), "duration_ms": duration_ms}


@router.post("/ask")
def ask(payload: AskPayload) -> dict:
    return _spawn_claude(
        payload.question, allowed_tools=ALLOWED_TOOLS, timeout=ASK_TIMEOUT_SEC
    )


@router.post("/claude/test")
def test() -> dict:
    """Quick auth/install sanity check. No DB access, no tool use."""
    prompt = (
        "Reply with exactly one word: pong. No tool calls, no extra text."
    )
    result = _spawn_claude(prompt, allowed_tools="", timeout=TEST_TIMEOUT_SEC)
    answer = result["answer"]
    ok = "pong" in answer.lower()
    return {"ok": ok, "answer": answer, "duration_ms": result["duration_ms"]}
