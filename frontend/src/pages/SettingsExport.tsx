import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export default function SettingsExport() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
      <ExportCard />
      <ImportCard />
    </div>
  );
}

function ExportCard() {
  return (
    <div className="card">
      <h3>Export</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Download your data for backup or for analysis outside the app.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <ExportRow
          title="SQLite database"
          description="A consistent snapshot of finances.db (taken via SQLite's online backup API, so it's safe even if a sync is in progress)."
          filename="finances.db"
          href="/api/export/database"
        />
        <ExportRow
          title="Transactions CSV"
          description="All transactions, joined with account name and category, in spreadsheet-friendly form."
          filename="transactions.csv"
          href="/api/export/transactions.csv"
        />
      </div>
    </div>
  );
}

function ExportRow({
  title, description, filename, href,
}: { title: string; description: string; filename: string; href: string }) {
  return (
    <div
      className="row between"
      style={{ background: "var(--panel-2)", padding: 12, borderRadius: 8, gap: 16 }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>
      </div>
      <a href={href} download={filename} style={{ textDecoration: "none" }}>
        <button className="primary">Download</button>
      </a>
    </div>
  );
}

function ImportCard() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    imported_accounts: number;
    imported_transactions: number;
    backup_path: string | null;
  } | null>(null);

  const importDb = useMutation({
    mutationFn: (f: File) => api.importDatabase(f),
    onSuccess: (data) => {
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries();
    },
  });

  const submit = () => {
    if (!file) return;
    if (
      !confirm(
        `Replace the current database with "${file.name}"? Your existing data will be backed up to disk first, but this is otherwise irreversible from the UI.`,
      )
    )
      return;
    setResult(null);
    importDb.mutate(file);
  };

  return (
    <div className="card">
      <h3>Import</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Replace the live database with a SQLite file you exported from another
        instance of this app (or a compatible <code>finances.db</code>). The
        existing database is snapshotted to <code>finances.db.bak-&lt;epoch&gt;</code>
        on disk before the swap.
      </p>

      <div className="row" style={{ marginTop: 12 }}>
        <input
          ref={fileRef}
          type="file"
          accept=".db,.sqlite,.sqlite3,application/x-sqlite3"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={importDb.isPending}
          style={{ flex: 1 }}
        />
        <button
          className="primary"
          disabled={!file || importDb.isPending}
          onClick={submit}
        >
          {importDb.isPending ? "importing…" : "Import"}
        </button>
      </div>

      {importDb.isError && (
        <div className="error" style={{ marginTop: 12 }}>
          {(importDb.error as Error).message}
        </div>
      )}

      {result && (
        <div
          className="card"
          style={{
            marginTop: 12,
            background: "var(--panel-2)",
            borderColor: "var(--success)",
          }}
        >
          <strong style={{ color: "var(--success)" }}>Import complete</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            {result.imported_accounts} accounts · {result.imported_transactions}{" "}
            transactions imported.
          </div>
          {result.backup_path && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
              Previous DB backed up to: {result.backup_path}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
