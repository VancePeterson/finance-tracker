"""Merchant-rules engine: applies LIKE patterns to auto-categorize transactions.

A transaction's category source is one of:
  * 'manual' — set explicitly by the user; never overwritten by rules.
  * 'rule'   — set automatically by the highest-priority matching rule.
  * NULL     — uncategorized (no rule matches and no manual override).

`apply_rules` clears every non-manual category and re-applies in priority order,
so deletions and edits to rules take effect immediately.
"""

from __future__ import annotations

import sqlite3


def apply_rules(conn: sqlite3.Connection) -> int:
    rules = conn.execute(
        "SELECT id, pattern, category_id FROM merchant_rules "
        "ORDER BY priority DESC, id ASC"
    ).fetchall()

    conn.execute(
        "UPDATE transactions SET category_id = NULL, category_source = NULL "
        "WHERE category_source IS NOT 'manual'"
    )

    affected = 0
    for rule in rules:
        cur = conn.execute(
            """
            UPDATE transactions
               SET category_id = ?, category_source = 'rule'
             WHERE category_source IS NULL
               AND (payee LIKE ? OR description LIKE ?)
            """,
            (rule["category_id"], rule["pattern"], rule["pattern"]),
        )
        affected += cur.rowcount
    conn.commit()
    return affected
