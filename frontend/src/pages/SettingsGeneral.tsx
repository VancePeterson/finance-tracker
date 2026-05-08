import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { fmtDateLocal, fmtUSD } from "../lib/format";
import type { GeneralSettings } from "../types";

function SimpleFinConnection() {
  const qc = useQueryClient();
  const statusQ = useQuery({
    queryKey: ["simplefin", "status"],
    queryFn: () => api.simplefin.status(),
  });

  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const setup = useMutation({
    mutationFn: (t: string) => api.simplefin.setup(t),
    onSuccess: () => {
      setToken("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["simplefin"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["settings", "general"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => api.simplefin.disconnect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["simplefin"] }),
  });

  const status = statusQ.data;

  return (
    <div className="card">
      <h3>SimpleFIN connection</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Get a setup token at{" "}
        <a href="https://beta-bridge.simplefin.org/" target="_blank" rel="noreferrer">
          beta-bridge.simplefin.org
        </a>
        . The token is single-use; this app exchanges it for a long-lived access URL on
        first sync.
      </p>

      {!status && <div className="spinner">loading…</div>}

      {status && status.configured && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="pill">
              <span className="dot" style={{ background: "var(--success)" }} />
              Connected
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              credentials in {status.env_path}
            </span>
          </div>
          <div className="row">
            <button
              className="danger"
              disabled={disconnect.isPending}
              onClick={() => {
                if (
                  confirm(
                    "Disconnect SimpleFIN? You'll need a fresh setup token to reconnect (the existing one is single-use and already consumed).",
                  )
                )
                  disconnect.mutate();
              }}
            >
              {disconnect.isPending ? "disconnecting…" : "Disconnect"}
            </button>
          </div>
        </>
      )}

      {status && !status.configured && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="pill">
              <span className="dot" style={{ background: "var(--text-dim)" }} />
              Not connected
            </span>
          </div>
          <div className="row">
            <input
              type="text"
              placeholder="Paste your SimpleFIN setup token (long base64 string)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{ flex: 1, fontFamily: "ui-monospace, monospace" }}
            />
            <button
              className="primary"
              disabled={!token.trim() || setup.isPending}
              onClick={() => {
                setError(null);
                setup.mutate(token.trim());
              }}
            >
              {setup.isPending ? "connecting…" : "Connect & sync"}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Submitting will save the token, exchange it for an access URL, and run an
            initial sync (~5–15s).
          </div>
        </>
      )}

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

const INTERVAL_PRESETS: { label: string; minutes: number }[] = [
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "12 hours", minutes: 720 },
  { label: "24 hours", minutes: 1440 },
];

const RANGE_OPTIONS: { label: string; value: GeneralSettings["default_dashboard_range"] }[] = [
  { label: "This month", value: "month" },
  { label: "Year to date", value: "ytd" },
  { label: "Last 12 months", value: "12m" },
];

export default function SettingsGeneral() {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: ["settings", "general"],
    queryFn: () => api.settings.getGeneral(),
  });
  const tzQ = useQuery({
    queryKey: ["settings", "timezones"],
    queryFn: () => api.settings.timezones(),
    staleTime: Infinity,
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.accounts.list(),
  });

  const [form, setForm] = useState<GeneralSettings | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settingsQ.data) {
      // Snap legacy interval values to the closest preset.
      const stored = settingsQ.data.sync_interval_minutes;
      const isPreset = INTERVAL_PRESETS.some((p) => p.minutes === stored);
      const snapped = isPreset
        ? stored
        : INTERVAL_PRESETS.reduce((best, p) =>
            Math.abs(p.minutes - stored) < Math.abs(best.minutes - stored) ? p : best,
          ).minutes;
      setForm({ ...settingsQ.data, sync_interval_minutes: snapped });
      setDirty(snapped !== stored);
    }
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: (body: Partial<GeneralSettings>) => api.settings.updateGeneral(body),
    onSuccess: (data) => {
      setForm(data);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["settings", "general"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
    },
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, excluded }: { id: string; excluded: boolean }) =>
      api.accounts.update(id, { excluded_from_totals: excluded }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
    },
  });

  const syncNow = useMutation({
    mutationFn: () => api.sync.run(),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (!form) return <div className="spinner">loading…</div>;

  const set = <K extends keyof GeneralSettings>(k: K, v: GeneralSettings[K]) => {
    setForm({ ...form, [k]: v });
    setDirty(true);
  };

  const nextSyncAt =
    form.sync_enabled && form.last_synced_at
      ? form.last_synced_at + form.sync_interval_minutes * 60
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <SimpleFinConnection />

      {/* Automatic sync */}
      <div className="card">
        <h3>Automatic sync</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          How often the app pulls fresh transactions from SimpleFIN.
        </p>

        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={form.sync_enabled}
            onChange={(e) => set("sync_enabled", e.target.checked)}
          />
          Run automatic syncs
        </label>

        <div style={{ marginTop: 12, opacity: form.sync_enabled ? 1 : 0.5 }}>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>Interval</div>
            <select
              disabled={!form.sync_enabled}
              value={form.sync_interval_minutes}
              onChange={(e) => set("sync_interval_minutes", Number(e.target.value))}
            >
              {INTERVAL_PRESETS.map((p) => (
                <option key={p.minutes} value={p.minutes}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button disabled={syncNow.isPending} onClick={() => syncNow.mutate()}>
            {syncNow.isPending ? "syncing…" : "Sync now"}
          </button>
        </div>

        <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
          Last synced: {form.last_synced_at ? `${fmtDateLocal(form.last_synced_at)} ${new Date(form.last_synced_at * 1000).toLocaleTimeString()}` : "never"}
          {nextSyncAt && (
            <>
              <br />
              Next sync (approx): {new Date(nextSyncAt * 1000).toLocaleString()}
            </>
          )}
        </div>
      </div>

      {/* Display & calc preferences */}
      <div className="card">
        <h3>Preferences</h3>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <label>
            <div className="muted" style={{ fontSize: 12 }}>Time zone</div>
            <select
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              disabled={!tzQ.data}
              style={{ width: "100%" }}
            >
              {(tzQ.data ?? [form.timezone]).map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Used for "this month" / date filters and budget windows.
            </div>
          </label>

          <label>
            <div className="muted" style={{ fontSize: 12 }}>Default dashboard range</div>
            <select
              value={form.default_dashboard_range}
              onChange={(e) =>
                set("default_dashboard_range", e.target.value as GeneralSettings["default_dashboard_range"])
              }
              style={{ width: "100%" }}
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="row" style={{ gap: 8, marginTop: 16 }}>
          <input
            type="checkbox"
            checked={form.include_pending}
            onChange={(e) => set("include_pending", e.target.checked)}
          />
          Include pending transactions in spending totals
        </label>
      </div>

      {/* Account exclusions */}
      <div className="card">
        <h3>Accounts in totals</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Uncheck accounts whose balances and activity should be excluded from
          dashboard totals, charts, and budget calculations. Transactions still
          appear on the Transactions page.
        </p>
        <table>
          <thead>
            <tr>
              <th>Include</th>
              <th>Account</th>
              <th>Org</th>
              <th className="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(accountsQ.data ?? []).map((a) => (
              <tr key={a.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={!a.excluded_from_totals}
                    onChange={(e) =>
                      updateAccount.mutate({ id: a.id, excluded: !e.target.checked })
                    }
                  />
                </td>
                <td>{a.name}</td>
                <td className="muted">{a.org_name}</td>
                <td className="amount mono">{fmtUSD(a.balance ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row">
        <button
          className="primary"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate({
              sync_enabled: form.sync_enabled,
              sync_interval_minutes: form.sync_interval_minutes,
              timezone: form.timezone,
              include_pending: form.include_pending,
              default_dashboard_range: form.default_dashboard_range,
            })
          }
        >
          {save.isPending ? "saving…" : dirty ? "Save settings" : "Saved"}
        </button>
        {dirty && <span className="muted" style={{ fontSize: 12 }}>unsaved changes</span>}
      </div>

      {syncNow.isError && (
        <div className="error">{(syncNow.error as Error).message}</div>
      )}
    </div>
  );
}
