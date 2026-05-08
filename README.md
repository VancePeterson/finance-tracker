# finance-tracker

A self-hosted personal finance dashboard. Pulls transactions from your banks via
[SimpleFIN](https://beta-bridge.simplefin.org), stores them locally in SQLite,
and serves a React UI for browsing, categorizing, budgeting, and goal-tracking.
Includes an in-app Claude Code assistant that can answer questions about your
data (read-only).

No auth. Designed to run on a LAN-only LXC. If you expose it beyond your LAN
or want access control on the LAN itself, you're responsible for adding it
yourself — e.g. an Nginx Proxy Manager access list, basic auth in front, a
VPN, or Tailscale ACLs.

## Features

- Dashboard with cash on hand, monthly outflows, spending pie + top categories,
  recent transactions, goals progress, and budget status.
- Transactions browser with filter/search, inline category assignment, and notes.
- Categories and merchant rules (regex-style `LIKE` patterns) — auto-categorize
  by merchant; manual overrides are sticky across re-syncs.
- Budgets per category with green/yellow/red progress vs. monthly limit.
- Goals tied to an account balance, with target dates and "need / month" hints.
- Settings page with sync interval, time zone, default dashboard range,
  pending-transaction handling, and per-account include/exclude toggles.
- Database + transactions CSV export.
- Claude Code chat panel that can query your data (read-only — enforced via
  SQLite authorizer + sandboxed working directory).

## Architecture

| Piece | Tech |
|---|---|
| Sync (`sync.py`) | Pure-stdlib Python; calls SimpleFIN, UPSERTs into SQLite |
| Backend (`app/`) | FastAPI + uvicorn; uv-managed |
| Frontend (`frontend/`) | Vite + React + TypeScript + TanStack Query + Recharts |
| Database | One SQLite file at `./finances.db` |
| Scheduler | Daemon thread inside the FastAPI process; configurable interval |
| Assistant | Local `claude` CLI spawned in `claude_workspace/`, with `--allowed-tools` |

In production the FastAPI process serves both the API and the built React assets
from a single port (`:8765`).

## Local development (macOS / Linux)

Prereqs: [`uv`](https://docs.astral.sh/uv/) and Node 20+.

```bash
# 1. Install deps
uv sync
cd frontend && npm install && cd ..

# 2. Drop your SimpleFIN setup token into .env (one line, gitignored)
echo 'SIMPLEFIN_SETUP_TOKEN=<paste your token>' > .env

# 3. First sync (consumes the token, writes the access URL back to .env)
uv run sync.py

# 4. Start the backend (terminal 1)
uv run uvicorn app.main:app --port 8765 --reload

# 5. Start the frontend (terminal 2)
cd frontend && npm run dev
# open http://localhost:5173
```

To run the prod-style single-process build locally:

```bash
cd frontend && npm run build && cd ..
uv run uvicorn app.main:app --port 8765
# open http://localhost:8765
```

## Deploying to an Ubuntu LXC

Clone the repo wherever you like — `setup-lxc.sh` auto-detects its own path
and bakes that into the systemd unit.

```bash
# On the LXC, as root:
git clone https://github.com/VancePeterson/finance-tracker.git
cd finance-tracker
bash scripts/setup-lxc.sh
```

(If you want a different on-disk name, just `git clone … finance-tracker my-name`
and `cd` there instead.)

The script installs Node 20, `uv`, the `claude` CLI, runs `uv sync`, builds the
frontend, generates a systemd unit pointing at the cloned directory, and starts
the service. To run as a non-root user, set `SERVICE_USER` first:

```bash
SERVICE_USER=finances bash scripts/setup-lxc.sh
```

Once the service is up:

1. Open `http://<lxc-ip>:8765/`.
2. **Settings → General → SimpleFIN connection**: paste your setup token
   (from [beta-bridge.simplefin.org](https://beta-bridge.simplefin.org/)) and
   click **Connect & sync**. Then pick a sync interval below.
3. **Settings → Claude** *(optional)*: click **Login with Claude.ai** to
   authenticate the in-app assistant. After login completes the token is
   written to `/etc/finances-web/claude.env`, which the systemd unit reads
   on next start (`systemctl restart finances-web`).

## Environment variables

Most users won't need to touch these — defaults work. Override in
`/etc/finances-web/claude.env` (read by the systemd unit) or via shell:

| Var | Default | Purpose |
|---|---|---|
| `FINANCES_DB_PATH` | `<repo>/finances.db` | Where the SQLite file lives |
| `FINANCES_SYNC_SCRIPT` | `<repo>/sync.py` | Path to the sync entry point |
| `FINANCES_SYNC_CWD` | `<repo>` | Working dir for sync (so `.env` resolves) |
| `PORT` | `8765` | Web server port |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | If set, the assistant uses this token |

## Project layout

```
finance-tracker/           ← cloned dir name; repo on GitHub is finance-tracker
├── sync.py                ← SimpleFIN fetcher (uses app.db for schema)
├── .env                   ← SimpleFIN credentials (gitignored)
├── finances.db            ← SQLite (gitignored)
├── pyproject.toml
├── app/                   ← FastAPI backend
│   ├── main.py            ← App + lifespan + scheduler start
│   ├── db.py              ← connect() + migrate()
│   ├── migrations.sql     ← Single source of truth for schema
│   ├── scheduler.py       ← In-process auto-sync loop
│   ├── claude_auth.py     ← Claude Code OAuth login flow (PTY-driven)
│   ├── routes/            ← All HTTP routes
│   └── …
├── frontend/              ← Vite + React + TS app
├── claude_workspace/      ← Sandbox for the in-app assistant
│   ├── CLAUDE.md          ← Schema + instructions for Claude
│   ├── sqlquery           ← Read-only SQL wrapper (SQLite authorizer)
│   └── .claude/settings.json  ← Allow/deny rules for Claude's tools
├── scripts/setup-lxc.sh   ← Bootstrap a fresh Ubuntu LXC
└── systemd/
    └── finances-web.service
```

## Re-syncing preserves your edits

`sync.py` only UPSERTs the SimpleFIN-sourced columns. Manually-set categories,
notes, merchant rules, budgets, goals, and account exclusions are never touched
on re-sync. Auto-applied (rule-based) categorizations re-evaluate after each
sync so new transactions get caught by your rules.

## Notes / caveats

- **No auth.** Anyone on the LAN who hits the port can read everything and
  trigger writes. Don't expose to the open internet.
- **macOS vs Linux Claude credentials**: on macOS `claude` stores tokens in the
  Keychain (no file); on Linux it's `~/.claude/.credentials.json`. The Settings
  page detects either.
- **Time zone affects "this month" boundaries**, including budgets and date
  filters. Default is `America/New_York`; change in Settings → General.
- **First-boot is cold-safe**: if `finances.db` doesn't exist when the web app
  starts, `migrate()` creates an empty schema. The first `sync.py` run populates
  it.
