import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../api";
import { fmtUSD, monthEnd, monthStart, fmtDateLocal, DEFAULT_COLOR_PALETTE } from "../lib/format";
import { Link } from "react-router-dom";
import Chat from "../components/Chat";
import type { Budget, Goal } from "../types";

type RangeKey = "month" | "ytd" | "12m";

const ranges: Record<RangeKey, { label: string; start: () => string; end: () => string }> = {
  month: {
    label: "This month",
    start: () => monthStart(),
    end: () => monthEnd(),
  },
  ytd: {
    label: "Year to date",
    start: () => `${new Date().getFullYear()}-01-01`,
    end: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    },
  },
  "12m": {
    label: "Last 12 months",
    start: () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 12);
      return d.toISOString().slice(0, 10);
    },
    end: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    },
  },
};

export default function Dashboard() {
  const settingsQ = useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => api.settings.getGeneral(),
  });
  const [rangeKey, setRangeKey] = useState<RangeKey | null>(null);

  // Initialize range from saved default the first time settings load.
  useEffect(() => {
    if (rangeKey === null && settingsQ.data) {
      setRangeKey((settingsQ.data.default_dashboard_range as RangeKey) ?? "month");
    }
  }, [settingsQ.data, rangeKey]);

  const effectiveKey: RangeKey = rangeKey ?? "month";
  const range = ranges[effectiveKey];
  const start = range.start();
  const end = range.end();

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api.accounts.list() });
  const byCatQ = useQuery({
    queryKey: ["stats", "by-category", start, end],
    queryFn: () => api.stats.byCategory({ start, end }),
  });
  const recentQ = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () => api.transactions.list({ limit: 10 }),
  });

  const accounts = accountsQ.data ?? [];
  const cats = byCatQ.data ?? [];
  const recent = recentQ.data ?? [];

  const cashAccounts = accounts.filter(
    (a) => !a.excluded_from_totals && (a.balance ?? 0) >= 0,
  );
  const totalCash = cashAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const totalSpend = cats.reduce((s, c) => s + c.total, 0);

  return (
    <>
      <div className="row between">
        <h2>Dashboard</h2>
        <div className="row">
          {(Object.keys(ranges) as RangeKey[]).map((k) => (
            <button
              key={k}
              className={k === effectiveKey ? "primary" : ""}
              onClick={() => setRangeKey(k)}
            >
              {ranges[k].label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Chat />
      </div>

      <div className="grid cards" style={{ marginBottom: 16 }}>
        <div className="card">
          <h3>Cash on hand</h3>
          <div className="value">{fmtUSD(totalCash)}</div>
          <div className="muted">{cashAccounts.length} account(s)</div>
        </div>
        <div className="card">
          <h3>Outflows ({range.label.toLowerCase()})</h3>
          <div className="value">{fmtUSD(totalSpend)}</div>
          <div className="muted">{cats.reduce((s, c) => s + c.transaction_count, 0)} txns</div>
        </div>
        <div className="card">
          <h3>Categories</h3>
          <div className="value">{cats.length}</div>
          <div className="muted">
            {cats.find((c) => c.category_id === null)
              ? `${cats.find((c) => c.category_id === null)?.transaction_count} uncategorized`
              : "all categorized"}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
        <GoalsSummary />
        <BudgetsSummary />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
        <div className="card">
          <h3>Spending by category</h3>
          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={cats}
                  dataKey="total"
                  nameKey="category_name"
                  outerRadius={110}
                  label={(e) => e.category_name}
                >
                  {cats.map((c, i) => (
                    <Cell
                      key={i}
                      fill={c.color ?? DEFAULT_COLOR_PALETTE[i % DEFAULT_COLOR_PALETTE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => fmtUSD(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Top categories</h3>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="right">Spent</th>
                <th className="right">Txns</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category_id ?? "uncat"}>
                  <td>
                    <span className="pill">
                      <span
                        className="dot"
                        style={{ background: c.color ?? "#64748b" }}
                      />
                      {c.category_name}
                    </span>
                  </td>
                  <td className="amount">{fmtUSD(c.total)}</td>
                  <td className="amount">{c.transaction_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Recent transactions</h3>
          <Link to="/transactions">view all →</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Account</th>
              <th>Category</th>
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((t) => (
              <tr key={t.id}>
                <td>{fmtDateLocal(t.posted)}</td>
                <td>{t.payee || t.description || "—"}</td>
                <td className="muted">{t.account_name}</td>
                <td>{t.category_name ?? <span className="muted">—</span>}</td>
                <td className={"amount " + (t.amount < 0 ? "neg" : "pos")}>
                  {fmtUSD(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GoalsSummary() {
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: () => api.goals.list() });
  const sorted = [...goals].sort(
    (a, b) =>
      b.current_amount / b.target_amount - a.current_amount / a.target_amount,
  );
  const top = sorted.slice(0, 4);

  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Goals</h3>
        <Link to="/goals">view all →</Link>
      </div>
      {top.length === 0 ? (
        <div className="muted" style={{ marginTop: 12 }}>
          No goals yet. <Link to="/goals">Set one →</Link>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {top.map((g) => (
            <GoalRow key={g.id} g={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalRow({ g }: { g: Goal }) {
  const pct = Math.max(0, Math.min(100, (g.current_amount / g.target_amount) * 100));
  return (
    <div>
      <div className="row between">
        <span>{g.name}</span>
        <span className="mono muted" style={{ fontSize: 12 }}>
          {fmtUSD(g.current_amount)} / {fmtUSD(g.target_amount)}
        </span>
      </div>
      <div className="progress" style={{ marginTop: 4 }}>
        <div
          className={"bar" + (pct >= 100 ? " ok" : "")}
          style={{ width: `${pct}%`, background: g.color ?? undefined }}
        />
      </div>
    </div>
  );
}

function BudgetsSummary() {
  const { data: budgets = [] } = useQuery({ queryKey: ["budgets"], queryFn: () => api.budgets.list() });
  const sorted = [...budgets].sort(
    (a, b) =>
      b.spent_this_month / b.monthly_limit - a.spent_this_month / a.monthly_limit,
  );
  const top = sorted.slice(0, 4);
  const overCount = budgets.filter(
    (b) => b.spent_this_month >= b.monthly_limit,
  ).length;

  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>
          Budgets{" "}
          {overCount > 0 && (
            <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: "normal" }}>
              · {overCount} over
            </span>
          )}
        </h3>
        <Link to="/budgets">view all →</Link>
      </div>
      {top.length === 0 ? (
        <div className="muted" style={{ marginTop: 12 }}>
          No budgets yet. <Link to="/budgets">Set one →</Link>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {top.map((b) => (
            <BudgetRow key={b.id} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetRow({ b }: { b: Budget }) {
  const pct = b.monthly_limit > 0 ? (b.spent_this_month / b.monthly_limit) * 100 : 0;
  const cls = pct >= 100 ? "over" : pct >= 75 ? "warn" : "ok";
  return (
    <div>
      <div className="row between">
        <span className="pill">
          <span className="dot" style={{ background: b.color ?? "var(--text-dim)" }} />
          {b.category_name}
        </span>
        <span className="mono muted" style={{ fontSize: 12 }}>
          {fmtUSD(b.spent_this_month)} / {fmtUSD(b.monthly_limit)}
        </span>
      </div>
      <div className="progress" style={{ marginTop: 4 }}>
        <div className={"bar " + cls} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
