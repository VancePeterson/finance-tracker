import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { fmtDateLocal, fmtUSD, monthStart, monthEnd } from "../lib/format";
import CategoryPicker from "../components/CategoryPicker";
import type { Transaction } from "../types";

export default function Transactions() {
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(monthEnd());
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [uncategorized, setUncategorized] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api.accounts.list() });
  const categoriesQ = useQuery({ queryKey: ["categories"], queryFn: () => api.categories.list() });

  const params = {
    start,
    end,
    search,
    account_id: accountId || undefined,
    category_id: categoryId ? Number(categoryId) : undefined,
    uncategorized: uncategorized || undefined,
    limit: 500,
  };
  const txnsQ = useQuery({
    queryKey: ["transactions", params],
    queryFn: () => api.transactions.list(params),
  });

  const qc = useQueryClient();
  const updateTxn = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.transactions.update>[1] }) =>
      api.transactions.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });

  return (
    <>
      <h2>Transactions</h2>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row mobile-stack" style={{ alignItems: "flex-end" }}>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>From</div>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>To</div>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>Account</div>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">All accounts</option>
              {(accountsQ.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>Category</div>
            <select
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setUncategorized(false); }}
            >
              <option value="">All categories</option>
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={uncategorized}
              onChange={(e) => { setUncategorized(e.target.checked); if (e.target.checked) setCategoryId(""); }}
            />
            Only uncategorized
          </label>
          <label style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 12 }}>Search</div>
            <input
              type="search"
              placeholder="payee, description, memo, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="muted" style={{ marginBottom: 8 }}>
          {txnsQ.isFetching ? "Loading…" : `${(txnsQ.data ?? []).length} transactions`}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant / Description</th>
                <th>Account</th>
                <th>Category</th>
                <th className="right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(txnsQ.data ?? []).map((t) => (
                <Row
                  key={t.id}
                  txn={t}
                  editing={editingId === t.id}
                  onEditToggle={() => setEditingId(editingId === t.id ? null : t.id)}
                  onSaveCategory={(cid) =>
                    updateTxn.mutate({
                      id: t.id,
                      patch: cid === null ? { clear_category: true } : { category_id: cid },
                    })
                  }
                  onSaveNotes={(notes) =>
                    updateTxn.mutate({ id: t.id, patch: { notes } })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Row({
  txn,
  editing,
  onEditToggle,
  onSaveCategory,
  onSaveNotes,
}: {
  txn: Transaction;
  editing: boolean;
  onEditToggle: () => void;
  onSaveCategory: (categoryId: number | null) => void;
  onSaveNotes: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(txn.notes ?? "");
  return (
    <>
      <tr>
        <td>{fmtDateLocal(txn.posted)}</td>
        <td>
          <div>{txn.payee || txn.description || "—"}</div>
          {txn.notes && <div className="muted" style={{ fontSize: 12 }}>📝 {txn.notes}</div>}
        </td>
        <td className="muted">{txn.account_name}</td>
        <td>
          <CategoryPicker value={txn.category_id} onChange={onSaveCategory} />
          {txn.category_source && (
            <div className="muted" style={{ fontSize: 11 }}>
              via {txn.category_source}
            </div>
          )}
        </td>
        <td className={"amount " + (txn.amount < 0 ? "neg" : "pos")}>
          {fmtUSD(txn.amount)}
        </td>
        <td>
          <button onClick={onEditToggle}>{editing ? "close" : "notes"}</button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={6} style={{ background: "var(--panel-2)" }}>
            <div className="row">
              <input
                type="text"
                placeholder="Add a note…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="primary"
                onClick={() => { onSaveNotes(notes); onEditToggle(); }}
              >
                save
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
