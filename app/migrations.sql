-- Additive schema for finances-web. Idempotent. Runs against finances.db on startup.
--
-- Includes the base SimpleFIN-managed tables (accounts, transactions) so the
-- web app can boot before sync.py has ever run. The CREATE statements are
-- IF NOT EXISTS, so an existing DB populated by sync.py is untouched. The
-- schema here must stay in sync with finances/schema.sql.

CREATE TABLE IF NOT EXISTS accounts (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  currency          TEXT,
  balance           REAL,
  available_balance REAL,
  balance_date      INTEGER,
  org_name          TEXT,
  org_domain        TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  posted      INTEGER NOT NULL,
  amount      REAL NOT NULL,
  description TEXT,
  payee       TEXT,
  memo        TEXT,
  pending     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_transactions_posted  ON transactions(posted);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

CREATE TABLE IF NOT EXISTS categories (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL UNIQUE,
  color                 TEXT,
  parent_id             INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  excluded_from_reports INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS merchant_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern     TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  priority    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_priority
  ON merchant_rules(priority DESC, id ASC);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  target_amount    REAL NOT NULL,
  target_date      TEXT,                                              -- YYYY-MM-DD
  account_id       TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  starting_balance REAL NOT NULL DEFAULT 0,
  color            TEXT,
  notes            TEXT,
  created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS budgets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  monthly_limit REAL NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
