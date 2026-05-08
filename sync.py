"""Sync SimpleFIN account and transaction data into finances.db.

Usage:
    uv run sync.py            # incremental (or first-time) sync
    uv run sync.py --since 2023-01-01  # backfill from a specific date

Configuration lives in .env in this directory:
    SIMPLEFIN_SETUP_TOKEN=...   # base64 token from beta-bridge.simplefin.org
    SIMPLEFIN_ACCESS_URL=...    # filled in automatically after first run

The setup token is single-use; this script consumes it on the first run
and stores the resulting access URL back into .env.

Schema management is delegated to ``app.db.migrate`` so the web app and
this script share one source of truth for table definitions.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from app.db import connect, migrate  # noqa: E402

ENV_PATH = ROOT / ".env"

ENV_KEYS = ("SIMPLEFIN_SETUP_TOKEN", "SIMPLEFIN_ACCESS_URL")
USER_AGENT = "finances-sync/0.1 (+local SimpleFIN sync)"


def read_env() -> dict[str, str]:
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


def write_env(env: dict[str, str]) -> None:
    lines = [
        "# Paste your SimpleFIN setup token below (the base64 string from beta-bridge.simplefin.org).",
        "# After the first sync the setup token is consumed and replaced with the access URL.",
        "",
    ]
    for k in ENV_KEYS:
        lines.append(f"{k}={env.get(k, '')}")
    ENV_PATH.write_text("\n".join(lines) + "\n")


def claim_access_url(setup_token: str) -> str:
    try:
        claim_url = base64.b64decode(setup_token).decode("utf-8").strip()
    except Exception as e:
        raise SystemExit(
            f"SIMPLEFIN_SETUP_TOKEN does not look like a valid base64 string: {e}"
        )
    req = urllib.request.Request(
        claim_url,
        method="POST",
        data=b"",
        headers={"User-Agent": USER_AGENT, "Content-Length": "0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8").strip()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        if e.code == 403:
            raise SystemExit(
                "SimpleFIN returned 403 when claiming the setup token.\n"
                "This usually means the token has already been claimed (they're single-use) "
                "or has expired. Generate a new one at https://beta-bridge.simplefin.org/ , "
                "paste it into .env (SIMPLEFIN_SETUP_TOKEN=...), and retry.\n"
                f"URL hit: {claim_url}\n"
                f"Body: {body[:500]}"
            )
        raise SystemExit(f"Claim failed: HTTP {e.code} {e.reason}\nBody: {body[:500]}")


def fetch_accounts(access_url: str, start_date: int | None) -> dict:
    parsed = urllib.parse.urlparse(access_url)
    if not parsed.username or not parsed.password:
        raise SystemExit("Access URL is missing credentials.")

    base = f"{parsed.scheme}://{parsed.hostname}{parsed.path.rstrip('/')}"
    params = {"pending": "1"}
    if start_date is not None:
        params["start-date"] = str(start_date)
    url = f"{base}/accounts?{urllib.parse.urlencode(params)}"

    user = urllib.parse.unquote(parsed.username)
    pw = urllib.parse.unquote(parsed.password)
    auth = base64.b64encode(f"{user}:{pw}".encode()).decode()

    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Basic {auth}", "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def init_db() -> sqlite3.Connection:
    conn = connect()
    migrate(conn)
    return conn


def _to_float(x: object) -> float | None:
    if x is None or x == "":
        return None
    return float(x)  # type: ignore[arg-type]


def upsert(conn: sqlite3.Connection, data: dict) -> tuple[int, int]:
    n_accounts = 0
    n_txns = 0
    for acct in data.get("accounts", []):
        org = acct.get("org") or {}
        conn.execute(
            """
            INSERT INTO accounts(id, name, currency, balance, available_balance,
                                 balance_date, org_name, org_domain)
            VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              currency=excluded.currency,
              balance=excluded.balance,
              available_balance=excluded.available_balance,
              balance_date=excluded.balance_date,
              org_name=excluded.org_name,
              org_domain=excluded.org_domain
            """,
            (
                acct["id"],
                acct.get("name", ""),
                acct.get("currency"),
                _to_float(acct.get("balance")),
                _to_float(acct.get("available-balance")),
                acct.get("balance-date"),
                org.get("name"),
                org.get("domain"),
            ),
        )
        n_accounts += 1
        for txn in acct.get("transactions", []):
            conn.execute(
                """
                INSERT INTO transactions(id, account_id, posted, amount,
                                         description, payee, memo, pending)
                VALUES(?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                  posted=excluded.posted,
                  amount=excluded.amount,
                  description=excluded.description,
                  payee=excluded.payee,
                  memo=excluded.memo,
                  pending=excluded.pending
                """,
                (
                    txn["id"],
                    acct["id"],
                    txn["posted"],
                    _to_float(txn["amount"]),
                    txn.get("description"),
                    txn.get("payee"),
                    txn.get("memo"),
                    1 if txn.get("pending") else 0,
                ),
            )
            n_txns += 1
    conn.commit()
    return n_accounts, n_txns


def latest_posted(conn: sqlite3.Connection) -> int | None:
    row = conn.execute("SELECT MAX(posted) FROM transactions").fetchone()
    return row[0]


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--since",
        help="ISO date (YYYY-MM-DD) to fetch transactions from. "
        "Default: 30 days before the most recent stored transaction, "
        "or 2 years ago on first run.",
    )
    return p.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    env = read_env()

    access_url = env.get("SIMPLEFIN_ACCESS_URL", "")
    setup_token = env.get("SIMPLEFIN_SETUP_TOKEN", "")

    if not access_url:
        if not setup_token:
            print(
                "No SIMPLEFIN_SETUP_TOKEN or SIMPLEFIN_ACCESS_URL set.\n"
                f"Edit {ENV_PATH} and paste your SimpleFIN setup token, then re-run.",
                file=sys.stderr,
            )
            return 1
        print("Exchanging setup token for access URL...")
        access_url = claim_access_url(setup_token)
        env["SIMPLEFIN_SETUP_TOKEN"] = ""
        env["SIMPLEFIN_ACCESS_URL"] = access_url
        write_env(env)
        print("Saved access URL to .env (setup token cleared).")

    conn = init_db()

    if args.since:
        start = int(
            dt.datetime.strptime(args.since, "%Y-%m-%d")
            .replace(tzinfo=dt.timezone.utc)
            .timestamp()
        )
        print(f"Fetching transactions since {args.since}...")
    else:
        last = latest_posted(conn)
        if last is None:
            start = int(time.time()) - 60 * 60 * 24 * 365 * 2
            print("First sync: fetching the last 2 years of transactions...")
        else:
            start = last - 60 * 60 * 24 * 30
            since_str = dt.datetime.fromtimestamp(start, tz=dt.timezone.utc).strftime("%Y-%m-%d")
            print(f"Incremental sync from {since_str} (30-day overlap)...")

    data = fetch_accounts(access_url, start_date=start)

    for err in data.get("errors", []) or []:
        print(f"SimpleFIN warning: {err}", file=sys.stderr)

    n_accounts, n_txns = upsert(conn, data)
    print(f"Synced {n_accounts} accounts, {n_txns} transactions.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
