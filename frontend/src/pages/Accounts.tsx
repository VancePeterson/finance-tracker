import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import { fmtUSD } from "../lib/format";
import type { Account } from "../types";

function trailingDigits(name: string): string {
  const m = (name || "").match(/(\d+)\D*$/);
  return m ? m[1] : "";
}

export default function Accounts() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api.accounts.list() });
  const accounts = accountsQ.data ?? [];
  const account = accounts.find((a) => a.id === selected);

  const oneYearAgo = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const balancesQ = useQuery({
    queryKey: ["balances", selected],
    queryFn: () =>
      selected
        ? api.stats.balances({ account_id: selected, start: oneYearAgo })
        : Promise.resolve([]),
    enabled: !!selected,
  });

  const deleteAccount = useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: string }) =>
      api.accounts.delete(id, confirm),
    onSuccess: () => {
      setPendingDelete(null);
      setConfirmText("");
      setDeleteError(null);
      if (selected === pendingDelete?.id) setSelected(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => setDeleteError(e.message),
  });

  const openDelete = (a: Account) => {
    setPendingDelete(a);
    setConfirmText("");
    setDeleteError(null);
  };

  const closeDelete = () => {
    setPendingDelete(null);
    setConfirmText("");
    setDeleteError(null);
  };

  const expectedConfirm = pendingDelete
    ? trailingDigits(pendingDelete.name) || pendingDelete.name
    : "";

  return (
    <>
      <h2>Accounts</h2>
      <div className="grid grid-2-col" style={{ gridTemplateColumns: "300px 1fr" }}>
        <div className="card">
          <h3>Accounts</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {accounts.map((a) => (
              <li key={a.id} style={{ marginBottom: 6 }}>
                <button
                  className={a.id === selected ? "primary" : ""}
                  style={{ width: "100%", textAlign: "left" }}
                  onClick={() => setSelected(a.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{a.name}</span>
                    <span className="mono">{fmtUSD(a.balance ?? null)}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>{a.org_name}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          {!account && <div className="muted">Select an account to view its balance history.</div>}
          {account && (
            <>
              <div className="row between">
                <div>
                  <h3 style={{ margin: 0 }}>{account.name}</h3>
                  <div className="muted">{account.org_name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="muted">Current balance</div>
                  <div className="value mono">{fmtUSD(account.balance ?? null)}</div>
                </div>
              </div>
              <div style={{ height: 320, marginTop: 16 }}>
                <ResponsiveContainer>
                  <LineChart data={balancesQ.data ?? []}>
                    <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" tickFormatter={(v) => fmtUSD(v)} width={90} />
                    <Tooltip
                      formatter={(v: number) => fmtUSD(v)}
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155" }}
                    />
                    <Line type="monotone" dataKey="balance" stroke="#38bdf8" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
                <button className="danger" onClick={() => openDelete(account)}>
                  Delete account
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div
          onClick={closeDelete}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 460, width: "90%" }}
          >
            <h3 style={{ marginTop: 0 }}>Delete account</h3>
            <p>
              This will permanently delete <strong>{pendingDelete.name}</strong>
              {pendingDelete.org_name ? ` (${pendingDelete.org_name})` : ""} and all of its
              transactions. This cannot be undone.
            </p>
            <p className="muted" style={{ fontSize: 13 }}>
              To confirm, type <code>{expectedConfirm}</code> below.
            </p>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => {
                setConfirmText(e.target.value);
                setDeleteError(null);
              }}
              placeholder={expectedConfirm}
              style={{ width: "100%", marginBottom: 12 }}
            />
            {deleteError && (
              <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>
                {deleteError}
              </div>
            )}
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button onClick={closeDelete} disabled={deleteAccount.isPending}>
                Cancel
              </button>
              <button
                className="danger"
                disabled={
                  confirmText.trim() !== expectedConfirm || deleteAccount.isPending
                }
                onClick={() =>
                  deleteAccount.mutate({
                    id: pendingDelete.id,
                    confirm: confirmText.trim(),
                  })
                }
              >
                {deleteAccount.isPending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
