import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import { fmtUSD } from "../lib/format";

export default function Accounts() {
  const [selected, setSelected] = useState<string | null>(null);

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
            </>
          )}
        </div>
      </div>
    </>
  );
}
