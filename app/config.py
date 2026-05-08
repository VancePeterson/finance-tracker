"""Runtime configuration, driven by environment variables."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Path to the SimpleFIN-synced SQLite database. Lives at the repo root by
# default; override with FINANCES_DB_PATH if you want a different location
# (e.g. /var/lib/finances/finances.db).
DB_PATH = Path(
    os.environ.get("FINANCES_DB_PATH", REPO_ROOT / "finances.db")
).expanduser()

# Path to sync.py (now sibling to this app/ package).
SYNC_SCRIPT = Path(
    os.environ.get("FINANCES_SYNC_SCRIPT", REPO_ROOT / "sync.py")
).expanduser()

# Working directory for the sync script (so its .env resolves correctly).
SYNC_CWD = Path(
    os.environ.get("FINANCES_SYNC_CWD", REPO_ROOT)
).expanduser()

# Built React assets. ``frontend/dist`` is produced by ``npm run build``.
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

PORT = int(os.environ.get("PORT", "8765"))
