"""SQLite connection management and schema migration."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .config import DB_PATH

MIGRATIONS_SQL = (Path(__file__).parent / "migrations.sql").read_text()

# Columns that finances-web adds to the existing transactions table.
ADDITIONAL_TXN_COLUMNS: dict[str, str] = {
    "category_id": "INTEGER REFERENCES categories(id) ON DELETE SET NULL",
    "notes": "TEXT",
    "category_source": "TEXT",  # 'rule' | 'manual' | NULL
}

# Columns that finances-web adds to the existing accounts table.
ADDITIONAL_ACCOUNT_COLUMNS: dict[str, str] = {
    "excluded_from_totals": "INTEGER NOT NULL DEFAULT 0",
}

# Columns added to the categories table.
ADDITIONAL_CATEGORY_COLUMNS: dict[str, str] = {
    "excluded_from_reports": "INTEGER NOT NULL DEFAULT 0",
}


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(MIGRATIONS_SQL)
    txn_cols = {row[1] for row in conn.execute("PRAGMA table_info(transactions)")}
    for col, decl in ADDITIONAL_TXN_COLUMNS.items():
        if col not in txn_cols:
            conn.execute(f"ALTER TABLE transactions ADD COLUMN {col} {decl}")
    acct_cols = {row[1] for row in conn.execute("PRAGMA table_info(accounts)")}
    for col, decl in ADDITIONAL_ACCOUNT_COLUMNS.items():
        if col not in acct_cols:
            conn.execute(f"ALTER TABLE accounts ADD COLUMN {col} {decl}")
    cat_cols = {row[1] for row in conn.execute("PRAGMA table_info(categories)")}
    for col, decl in ADDITIONAL_CATEGORY_COLUMNS.items():
        if col not in cat_cols:
            conn.execute(f"ALTER TABLE categories ADD COLUMN {col} {decl}")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transactions_category "
        "ON transactions(category_id)"
    )
    conn.commit()
