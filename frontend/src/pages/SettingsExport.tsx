export default function SettingsExport() {
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <h3>Export</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        Download your data for backup or for analysis outside the app.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
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
  title,
  description,
  filename,
  href,
}: {
  title: string;
  description: string;
  filename: string;
  href: string;
}) {
  return (
    <div
      className="row between"
      style={{
        background: "var(--panel-2)",
        padding: 12,
        borderRadius: 8,
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {description}
        </div>
      </div>
      <a href={href} download={filename} className="row" style={{ textDecoration: "none" }}>
        <button className="primary">Download</button>
      </a>
    </div>
  );
}
