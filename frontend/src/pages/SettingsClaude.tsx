import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { fmtDateLocal } from "../lib/format";

export default function SettingsClaude() {
  const qc = useQueryClient();
  const statusQ = useQuery({
    queryKey: ["claude", "status"],
    queryFn: () => api.claude.status(),
    refetchInterval: 5_000,
  });

  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const startLogin = useMutation({
    mutationFn: () => api.claude.loginStart(),
    onSuccess: (data) => {
      setAuthUrl(data.url);
      setCode("");
      setError(null);
      setWarnings([]);
    },
    onError: (e: Error) => setError(e.message),
  });

  const completeLogin = useMutation({
    mutationFn: () => api.claude.loginComplete(code),
    onSuccess: (data) => {
      setAuthUrl(null);
      setCode("");
      setWarnings(data.warnings ?? []);
      qc.invalidateQueries({ queryKey: ["claude", "status"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const logout = useMutation({
    mutationFn: () => api.claude.logout(),
    onSuccess: (data) => {
      setWarnings(data.warnings ?? []);
      qc.invalidateQueries({ queryKey: ["claude", "status"] });
    },
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; answer: string; duration_ms: number } | null>(null);
  const test = useMutation({
    mutationFn: () => api.claude.test(),
    onSuccess: (data) => { setTestResult(data); setError(null); },
    onError: (e: Error) => { setTestResult(null); setError(e.message); },
  });

  const status = statusQ.data;

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3>Claude Code</h3>
      {!status && <div className="spinner">loading…</div>}

      {status && !status.claude_installed && (
        <div className="error">
          The <code>claude</code> CLI isn't installed on this server. Run{" "}
          <code>scripts/setup-lxc.sh</code> on the LXC, then refresh.
        </div>
      )}

      {status && status.claude_installed && (
        <>
          <div className="row" style={{ marginBottom: 16 }}>
            <span className="pill">
              <span
                className="dot"
                style={{
                  background: status.authenticated ? "var(--success)" : "var(--text-dim)",
                }}
              />
              {status.authenticated ? "Authenticated" : "Not authenticated"}
            </span>
            {status.auth_source && (
              <span className="muted" style={{ fontSize: 12 }}>
                via {status.auth_source}
              </span>
            )}
            {status.last_login_at && (
              <span className="muted">
                since {fmtDateLocal(status.last_login_at)}
              </span>
            )}
          </div>

          {!authUrl && !status.authenticated && (
            <button
              className="primary"
              disabled={startLogin.isPending}
              onClick={() => startLogin.mutate()}
            >
              {startLogin.isPending ? "starting…" : "Login with Claude.ai"}
            </button>
          )}

          {!authUrl && status.authenticated && (
            <>
              <div className="row">
                <button disabled={startLogin.isPending} onClick={() => startLogin.mutate()}>
                  Re-authenticate
                </button>
                <button disabled={test.isPending} onClick={() => test.mutate()}>
                  {test.isPending ? "testing…" : "Test Claude"}
                </button>
                {status.auth_source === "app" && (
                  <button
                    className="danger"
                    disabled={logout.isPending}
                    onClick={() => {
                      if (confirm("Log out of Claude Code on this server?"))
                        logout.mutate();
                    }}
                  >
                    {logout.isPending ? "logging out…" : "Log out"}
                  </button>
                )}
              </div>
              {status.auth_source && status.auth_source !== "app" && (
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Auth was set up outside this app
                  {status.auth_source.startsWith("env")
                    ? " (env var). Unset the variable in your shell or systemd unit to remove it."
                    : " (credentials file at ~/.claude/.credentials.json). Run `claude /logout` or delete that file to remove it."}
                </div>
              )}
            </>
          )}

          {testResult && (
            <div
              className="card"
              style={{
                marginTop: 12,
                background: "var(--panel-2)",
                borderColor: testResult.ok ? "var(--success)" : "var(--danger)",
              }}
            >
              <div className="row between">
                <strong style={{ color: testResult.ok ? "var(--success)" : "var(--danger)" }}>
                  {testResult.ok ? "Test passed" : "Test failed"}
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {(testResult.duration_ms / 1000).toFixed(1)}s
                </span>
              </div>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
                {testResult.answer}
              </div>
            </div>
          )}

          {authUrl && (
            <div style={{ marginTop: 8 }}>
              <p>
                <strong>1.</strong> Open this URL in a browser where you're signed in to
                Claude.ai:
              </p>
              <div
                className="card"
                style={{
                  background: "var(--panel-2)",
                  wordBreak: "break-all",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 13,
                }}
              >
                <a href={authUrl} target="_blank" rel="noreferrer">{authUrl}</a>
              </div>
              <p style={{ marginTop: 16 }}>
                <strong>2.</strong> After clicking <em>Authorize</em>, the redirect page
                may stay blank — that's a Claude.ai issue. Look at your browser's address
                bar; it should contain <code>code=...</code>. Paste either just the code
                or the entire URL below:
              </p>
              <div className="row">
                <input
                  type="text"
                  placeholder="paste code OR the redirect URL from your address bar"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  style={{ flex: 1, fontFamily: "ui-monospace, monospace" }}
                  autoFocus
                />
                <button
                  className="primary"
                  disabled={!code || completeLogin.isPending}
                  onClick={() => completeLogin.mutate()}
                >
                  {completeLogin.isPending ? "verifying…" : "Submit"}
                </button>
                <button onClick={() => setAuthUrl(null)}>Cancel</button>
              </div>
            </div>
          )}

          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          {warnings.length > 0 && (
            <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
              <strong>Saved with warnings:</strong>
              <ul style={{ margin: "4px 0" }}>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
