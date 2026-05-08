import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { fmtUSD, DEFAULT_COLOR_PALETTE } from "../lib/format";
import type { Goal } from "../types";

export default function Goals() {
  const qc = useQueryClient();
  const goalsQ = useQuery({ queryKey: ["goals"], queryFn: () => api.goals.list() });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api.accounts.list() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["goals"] });
  };

  const create = useMutation({
    mutationFn: (b: Parameters<typeof api.goals.create>[0]) => api.goals.create(b),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Goal> }) => api.goals.update(id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.goals.delete(id),
    onSuccess: invalidate,
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [startBal, setStartBal] = useState("0");
  const [color, setColor] = useState(DEFAULT_COLOR_PALETTE[3]);

  return (
    <>
      <div className="row between">
        <h2>Savings goals</h2>
        <button className="primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "cancel" : "+ new goal"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row mobile-stack" style={{ gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <label>
              <div className="muted" style={{ fontSize: 12 }}>Name</div>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12 }}>Target amount</div>
              <input type="number" min="0" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12 }}>Target date</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12 }}>Linked account</div>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">— none —</option>
                {(accountsQ.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            <label>
              <div className="muted" style={{ fontSize: 12 }}>Color</div>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 50, padding: 0 }} />
            </label>
            <button
              className="primary"
              disabled={!name || !target}
              onClick={() => {
                create.mutate(
                  {
                    name,
                    target_amount: Number(target),
                    target_date: date || null,
                    account_id: accountId || null,
                    starting_balance: Number(startBal) || 0,
                    color,
                  },
                  {
                    onSuccess: () => {
                      setShowForm(false);
                      setName(""); setTarget(""); setDate(""); setAccountId(""); setStartBal("0");
                    },
                  },
                );
              }}
            >
              create
            </button>
          </div>
          {accountId && (
            <label className="row" style={{ marginTop: 12 }}>
              <span className="muted" style={{ fontSize: 12 }}>Starting balance offset (current account balance not yet counted toward goal)</span>
              <input type="number" step="0.01" value={startBal} onChange={(e) => setStartBal(e.target.value)} style={{ width: 120 }} />
            </label>
          )}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {(goalsQ.data ?? []).length === 0 && (
          <div className="muted">No goals yet. Click "new goal" to add one.</div>
        )}
        {(goalsQ.data ?? []).map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            onUpdate={(body) => update.mutate({ id: g.id, body })}
            onDelete={() => {
              if (confirm(`Delete "${g.name}"?`)) remove.mutate(g.id);
            }}
          />
        ))}
      </div>
    </>
  );
}

function GoalCard({
  goal: g,
  onUpdate,
  onDelete,
}: {
  goal: Goal;
  onUpdate: (body: Partial<Goal>) => void;
  onDelete: () => void;
}) {
  const pct = Math.max(0, Math.min(100, (g.current_amount / g.target_amount) * 100));
  const remaining = g.target_amount - g.current_amount;

  let monthsLeft: number | null = null;
  if (g.target_date) {
    const now = new Date();
    const target = new Date(g.target_date);
    const ms = target.getTime() - now.getTime();
    monthsLeft = Math.max(0, ms / (1000 * 60 * 60 * 24 * 30.44));
  }
  const monthlyNeeded =
    monthsLeft != null && monthsLeft > 0 && remaining > 0
      ? remaining / monthsLeft
      : null;

  return (
    <div className="card" style={{ borderTop: `4px solid ${g.color ?? "var(--accent)"}` }}>
      <div className="row between">
        <input
          defaultValue={g.name}
          onBlur={(e) => {
            if (e.target.value !== g.name) onUpdate({ name: e.target.value });
          }}
          style={{
            background: "transparent",
            border: "none",
            fontSize: 18,
            fontWeight: 600,
            padding: 0,
          }}
        />
        <button className="danger" onClick={onDelete}>delete</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="row between">
          <span className="mono">{fmtUSD(g.current_amount)} / {fmtUSD(g.target_amount)}</span>
          <span className="muted">{pct.toFixed(0)}%</span>
        </div>
        <div className="progress" style={{ marginTop: 6 }}>
          <div
            className={"bar" + (pct >= 100 ? " ok" : "")}
            style={{ width: `${pct}%`, background: g.color ?? undefined }}
          />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, fontSize: 12 }}>
        {g.target_date && (
          <div>
            <div className="muted">Target date</div>
            <div className="mono">{g.target_date}</div>
          </div>
        )}
        {g.account_name && (
          <div>
            <div className="muted">Linked account</div>
            <div>{g.account_name}</div>
          </div>
        )}
        {monthlyNeeded != null && (
          <div>
            <div className="muted">Need / month</div>
            <div className="mono">{fmtUSD(monthlyNeeded)}</div>
          </div>
        )}
        {remaining > 0 && (
          <div>
            <div className="muted">Remaining</div>
            <div className="mono">{fmtUSD(remaining)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
