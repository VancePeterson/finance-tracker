const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export const fmtUSD = (n: number | null | undefined) =>
  n == null ? "—" : usd.format(n);

export const fmtDate = (epochSec: number) =>
  new Date(epochSec * 1000).toISOString().slice(0, 10);

export const fmtDateLocal = (epochSec: number) => {
  const d = new Date(epochSec * 1000);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const monthStart = (d: Date = new Date()) =>
  new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);

export const monthEnd = (d: Date = new Date()) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);

export const yearStart = (d: Date = new Date()) =>
  `${d.getFullYear()}-01-01`;

export const DEFAULT_COLOR_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#a855f7", "#ec4899", "#f59e0b", "#14b8a6",
];
