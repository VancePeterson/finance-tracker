import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { fmtUSD } from "../lib/format";
import type { Budget } from "../types";

export default function Budgets() {
  const qc = useQueryClient();
  const budgetsQ = useQuery({ queryKey: ["budgets"], queryFn: () => api.budgets.list() });
  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: () => api.categories.list() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["budgets"] });

  const create = useMutation({
    mutationFn: (b: { category_id: number; monthly_limit: number }) => api.budgets.create(b),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, monthly_limit }: { id: number; monthly_limit: number }) =>
      api.budgets.update(id, { monthly_limit }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.budgets.delete(id),
    onSuccess: invalidate,
  });

  const [newCat, setNewCat] = useState<number | "">("");
  const [newLimit, setNewLimit] = useState("");

  const budgets = budgetsQ.data ?? [];
  const usedCategoryIds = new Set(budgets.map((b) => b.category_id));
  const availableCategories = (categoriesQ.data ?? []).filter((c) => !usedCategoryIds.has(c.id));

  const totalLimit = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent_this_month, 0);

  return (
    <>
      <div className="row between">
        <h2>Budgets</h2>
        <span className="muted">
          {fmtUSD(totalSpent)} of {fmtUSD(totalLimit)} this month
        </span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Add a budget</h3>
        <div className="row" style={{ marginTop: 8 }}>
          <select value={newCat} onChange={(e) => setNewCat(e.target.value === "" ? "" : Number(e.target.value))} style={{ flex: 1 }}>
            <option value="">— pick a category —</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="monthly limit"
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            style={{ width: 160 }}
          />
          <button
            className="primary"
            disabled={newCat === "" || !newLimit}
            onClick={() => {
              create.mutate(
                { category_id: newCat as number, monthly_limit: Number(newLimit) },
                {
                  onSuccess: () => {
                    setNewCat("");
                    setNewLimit("");
                  },
                },
              );
            }}
          >
            add
          </button>
        </div>
        {availableCategories.length === 0 && (categoriesQ.data ?? []).length > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Every category has a budget already. Delete one below to free it up.
          </div>
        )}
      </div>

      <div className="card">
        {budgets.length === 0 ? (
          <div className="muted">No budgets yet. Pick a category above to start.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="right">Spent this month</th>
                <th className="right">Monthly limit</th>
                <th>Progress</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <BudgetRow
                  key={b.id}
                  b={b}
                  onUpdate={(monthly_limit) => update.mutate({ id: b.id, monthly_limit })}
                  onDelete={() => {
                    if (confirm(`Delete budget for "${b.category_name}"?`)) remove.mutate(b.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function BudgetRow({
  b,
  onUpdate,
  onDelete,
}: {
  b: Budget;
  onUpdate: (limit: number) => void;
  onDelete: () => void;
}) {
  const pct = b.monthly_limit > 0 ? (b.spent_this_month / b.monthly_limit) * 100 : 0;
  const remaining = b.monthly_limit - b.spent_this_month;
  const cls = pct >= 100 ? "over" : pct >= 75 ? "warn" : "ok";

  return (
    <tr>
      <td>
        <span className="pill">
          <span className="dot" style={{ background: b.color ?? "var(--text-dim)" }} />
          {b.category_name}
        </span>
      </td>
      <td className="amount mono">{fmtUSD(b.spent_this_month)}</td>
      <td className="amount">
        <input
          type="number"
          min="0"
          step="0.01"
          defaultValue={b.monthly_limit}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v > 0 && v !== b.monthly_limit) onUpdate(v);
          }}
          style={{ width: 110, textAlign: "right" }}
        />
      </td>
      <td style={{ minWidth: 240 }}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <span className="muted" style={{ fontSize: 12 }}>{pct.toFixed(0)}%</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {remaining >= 0 ? `${fmtUSD(remaining)} left` : `${fmtUSD(-remaining)} over`}
          </span>
        </div>
        <div className="progress">
          <div className={"bar " + cls} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </td>
      <td>
        <button className="danger" onClick={onDelete}>delete</button>
      </td>
    </tr>
  );
}
