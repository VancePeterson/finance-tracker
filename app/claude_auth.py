"""Claude Code OAuth login flow, driven from the web UI.

We spawn ``claude setup-token`` in a PTY, scrape the auth URL from its TUI
output, and feed the user-pasted ``code#state`` back in through stdin. The
input has to be wrapped in xterm bracketed-paste markers (\\x1b[200~ /
\\x1b[201~) and submitted with a CR — Ink's raw-mode stdin doesn't treat
plain typed chars as a paste, and ICRNL translation is bypassed. After a
successful exchange the CLI prints the long-lived token (``sk-ant-oat01-…``)
on its own line; we pull it out of the captured PTY output. The CLI does
*not* persist credentials anywhere — printing is the entire delivery
mechanism. Behavior verified against claude 2.1.133.

The token is mirrored to:
  * the SQLite ``app_settings`` table (UI source of truth)
  * a 0600 file at $HOME/.claude/oauth_token
  * /etc/finance-tracker/claude.env (so the systemd service picks it up)
  * a one-line export in $HOME/.bashrc (so SSH sessions inherit it)

Failures writing the mirrored locations (e.g. running as a non-privileged
user during local dev) degrade to a warning — the DB row is authoritative.
"""

from __future__ import annotations

import fcntl
import os
import pty
import re
import select
import shutil
import struct
import subprocess
import sqlite3
import termios
import threading
import time
from pathlib import Path
from typing import Optional

URL_RE = re.compile(r"https?://\S+")
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07")

CLAUDE_BINARY = shutil.which("claude") or "claude"
ENV_FILE = Path("/etc/finance-tracker/claude.env")
TOKEN_FILE = Path(os.path.expanduser("~/.claude/oauth_token"))
BASHRC = Path(os.path.expanduser("~/.bashrc"))
BASHRC_MARKER = "# >>> finance-tracker claude oauth >>>"
BASHRC_END = "# <<< finance-tracker claude oauth <<<"


class LoginSession:
    """Tracks a single in-flight `claude setup-token` subprocess.

    `claude setup-token` requires a TTY — without one it prints the auth URL
    and exits before reading the pasted code. We give it a pseudo-terminal
    via Python's ``pty`` module so it stays in its read loop until we feed
    the code back through the master fd.
    """

    def __init__(self) -> None:
        self.proc: Optional[subprocess.Popen] = None
        self.master_fd: Optional[int] = None
        self.url: Optional[str] = None
        self.buffer: str = ""
        self.lock = threading.Lock()

    def _cleanup(self) -> None:
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
            except ProcessLookupError:
                pass
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    self.proc.kill()
                except ProcessLookupError:
                    pass
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
        self.proc = None
        self.master_fd = None
        self.url = None
        self.buffer = ""

    def _read_available(self, timeout: float = 0.5) -> str:
        if self.master_fd is None:
            return ""
        r, _, _ = select.select([self.master_fd], [], [], timeout)
        if not r:
            return ""
        try:
            chunk = os.read(self.master_fd, 4096)
        except OSError:
            return ""
        return chunk.decode("utf-8", errors="replace")

    def start(self) -> str:
        with self.lock:
            self._cleanup()
            master, slave = pty.openpty()
            # Disable input echo so the pasted code doesn't show up in our
            # stdout stream and confuse token extraction.
            attrs = termios.tcgetattr(slave)
            attrs[3] &= ~termios.ECHO  # lflag
            termios.tcsetattr(slave, termios.TCSANOW, attrs)
            # Set a very wide terminal so long auth URLs don't get hard-wrapped.
            # An ed25519 OAuth URL with redirect_uri + state + code_challenge
            # easily runs ~400 chars; default 80-col wrapping truncates it and
            # the auth server returns "Missing redirect_uri parameter".
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 4096, 0, 0))

            self.proc = subprocess.Popen(
                [CLAUDE_BINARY, "setup-token"],
                stdin=slave,
                stdout=slave,
                stderr=slave,
                close_fds=True,
                preexec_fn=os.setsid,
            )
            os.close(slave)
            self.master_fd = master

        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            chunk = self._read_available(timeout=0.5)
            if chunk:
                self.buffer += chunk
                # The wide-PTY setup prevents the URL from being hard-wrapped,
                # so URL_RE (\S+) reliably stops at the trailing newline.
                # Strip any ANSI escapes claude might emit before searching.
                clean = ANSI_RE.sub("", self.buffer)
                m = URL_RE.search(clean)
                if m:
                    candidate = m.group(0).rstrip(".,)\r\n")
                    if "redirect_uri=" in candidate or len(candidate) > 200:
                        self.url = candidate
                        return self.url
            elif self.proc.poll() is not None:  # type: ignore[union-attr]
                raise RuntimeError(
                    "`claude setup-token` exited before printing a URL.\n"
                    f"--- output ---\n{self.buffer or '(no output)'}"
                )
        raise RuntimeError(
            "Timed out waiting for `claude setup-token` to print an auth URL.\n"
            f"--- output so far ---\n{self.buffer or '(no output)'}"
        )

    def complete(self, code: str) -> str:
        # The TUI's input field accepts the code only when wrapped in bracketed
        # paste markers (\x1b[200~ ... \x1b[201~). Without them the chars get
        # buffered and Enter never submits — verified empirically against
        # claude 2.1.133. Send a CR after to trigger the OAuth exchange.
        with self.lock:
            if (
                not self.proc
                or self.proc.poll() is not None
                or self.master_fd is None
            ):
                state = "no proc" if not self.proc else f"exited rc={self.proc.returncode}"
                raise RuntimeError(
                    "No active login session. Start one first. "
                    f"(state: {state}; output: {self.buffer[:300] or '(empty)'})"
                )
            payload = f"\x1b[200~{code.strip()}\x1b[201~\r".encode()
            os.write(self.master_fd, payload)

        # On success setup-token prints `sk-ant-oat01-...` on its own line
        # (after a "Long-lived authentication token created successfully!"
        # banner). Stream output and pull the token out as soon as we see it
        # — the TUI may linger before exiting, so don't wait for that.
        out = self.buffer
        deadline = time.monotonic() + 60
        token: Optional[str] = None
        while time.monotonic() < deadline:
            chunk = self._read_available(timeout=0.25)
            if chunk:
                out += chunk
                token = _find_token(out)
                if token:
                    break
            if self.proc.poll() is not None:
                # Drain anything left in the PTY before giving up.
                for _ in range(10):
                    c = self._read_available(timeout=0.1)
                    if not c:
                        break
                    out += c
                token = token or _find_token(out)
                break

        # Tear down regardless of how we got here.
        if self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    self.proc.kill()
                    self.proc.wait(timeout=2)
                except (ProcessLookupError, subprocess.TimeoutExpired):
                    pass

        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None

        if token:
            return token

        rc = self.proc.returncode
        raise RuntimeError(
            f"`claude setup-token` did not print a token (rc={rc}). "
            "Auth code may be wrong, expired, or already used; "
            "try logging in again with a fresh code.\n"
            f"--- output ---\n{ANSI_RE.sub('', out)[:1500] or '(empty)'}"
        )


_session = LoginSession()


# claude OAuth tokens are long base64-url-ish strings prefixed with sk-ant-oat.
# Real samples are ~100 chars; we require ≥ 50 to filter out e.g. log-line
# fragments. The character class excludes whitespace (so we stop at line ends)
# and most punctuation that would never appear inside a token.
TOKEN_RE = re.compile(r"sk-ant-oat[A-Za-z0-9_\-]{40,}")


def _find_token(buf: str) -> Optional[str]:
    """Pull a Claude OAuth token out of accumulated PTY output. Returns the
    longest match — the TUI may have echoed a fragment-then-redraw, but the
    final clean print of the full token is the one we want."""
    clean = ANSI_RE.sub("", buf)
    matches = TOKEN_RE.findall(clean)
    if not matches:
        return None
    return max(matches, key=len)


# --- persistence ----------------------------------------------------------------


def store_token(conn: sqlite3.Connection, token: str) -> dict:
    now = int(time.time())
    conn.execute(
        """
        INSERT INTO app_settings(key, value, updated_at) VALUES('claude_oauth_token', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (token, now),
    )
    conn.commit()

    warnings: list[str] = []
    try:
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(token + "\n")
        TOKEN_FILE.chmod(0o600)
    except OSError as e:
        warnings.append(f"could not write {TOKEN_FILE}: {e}")

    try:
        ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
        ENV_FILE.write_text(f"CLAUDE_CODE_OAUTH_TOKEN={token}\n")
        ENV_FILE.chmod(0o600)
    except OSError as e:
        warnings.append(f"could not write {ENV_FILE}: {e}")

    try:
        _ensure_bashrc_export()
    except OSError as e:
        warnings.append(f"could not update {BASHRC}: {e}")

    return {"saved_at": now, "warnings": warnings}


def clear_token(conn: sqlite3.Connection) -> dict:
    conn.execute("DELETE FROM app_settings WHERE key = 'claude_oauth_token'")
    conn.commit()
    warnings: list[str] = []
    for path in (TOKEN_FILE, ENV_FILE):
        try:
            path.unlink(missing_ok=True)
        except OSError as e:
            warnings.append(f"could not remove {path}: {e}")
    try:
        _remove_bashrc_export()
    except OSError as e:
        warnings.append(f"could not update {BASHRC}: {e}")
    return {"warnings": warnings}


def _credentials_file_has_token() -> bool:
    """Look for *real* token content, not just an empty stub. The `claude`
    installer (and any prior aborted login) can leave behind ~/.claude/ or an
    empty credentials file; existence alone isn't enough."""
    cred_path = _credentials_path()
    if not cred_path.exists():
        return False
    try:
        if cred_path.stat().st_size < 40:
            return False
        text = cred_path.read_text(errors="replace")
    except OSError:
        return False
    return any(s in text for s in ("accessToken", "access_token", "refreshToken", "oauthToken"))


def _env_token_set() -> Optional[str]:
    for k in ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"):
        v = os.environ.get(k, "").strip()
        if v:
            return k
    return None


def get_status(conn: sqlite3.Connection) -> dict:
    """Report whether Claude Code has *any* working credential, regardless of
    whether it came from this app's login UI, a manual `claude /login`, or an
    env var like ANTHROPIC_API_KEY."""

    row = conn.execute(
        "SELECT updated_at FROM app_settings WHERE key = 'claude_oauth_token'"
    ).fetchone()
    db_authenticated = row is not None
    env_var_set = _env_token_set()
    has_creds_file = _credentials_file_has_token()

    if db_authenticated:
        source = "app"
    elif env_var_set:
        source = f"env ({env_var_set})"
    elif has_creds_file:
        source = "credentials file"
    else:
        source = None

    return {
        "authenticated": bool(db_authenticated or env_var_set or has_creds_file),
        "auth_source": source,
        "last_login_at": row["updated_at"] if row else None,
        "claude_installed": shutil.which("claude") is not None,
    }


def _ensure_bashrc_export() -> None:
    if not BASHRC.exists():
        return
    text = BASHRC.read_text()
    if BASHRC_MARKER in text:
        return
    block = (
        f"\n{BASHRC_MARKER}\n"
        f'if [ -r "{TOKEN_FILE}" ]; then\n'
        f'  export CLAUDE_CODE_OAUTH_TOKEN="$(cat {TOKEN_FILE})"\n'
        f"fi\n"
        f"{BASHRC_END}\n"
    )
    BASHRC.write_text(text + block)


def _remove_bashrc_export() -> None:
    if not BASHRC.exists():
        return
    text = BASHRC.read_text()
    if BASHRC_MARKER not in text:
        return
    start = text.index(BASHRC_MARKER)
    end_idx = text.index(BASHRC_END) + len(BASHRC_END)
    # Trim the leading newline we wrote.
    while start > 0 and text[start - 1] == "\n":
        start -= 1
    BASHRC.write_text(text[:start] + text[end_idx:].lstrip("\n"))


# --- public entry points --------------------------------------------------------


def start_login() -> str:
    return _session.start()


def complete_login(code: str, conn: sqlite3.Connection) -> dict:
    token = _session.complete(code)
    return {"token_saved": True, **store_token(conn, token)}
