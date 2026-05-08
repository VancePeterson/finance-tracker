import type {
  Account,
  BalancePoint,
  Budget,
  Category,
  CategorySpend,
  GeneralSettings,
  Goal,
  MerchantSpend,
  MonthlySpend,
  Rule,
  Transaction,
} from "./types";

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const qs = (params: Record<string, unknown>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export const api = {
  accounts: {
    list: () => request<Account[]>("/api/accounts"),
    update: (id: string, body: { excluded_from_totals?: boolean }) =>
      request<Account>(`/api/accounts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  transactions: {
    list: (params: {
      start?: string;
      end?: string;
      account_id?: string;
      category_id?: number;
      uncategorized?: boolean;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}) => request<Transaction[]>(`/api/transactions${qs(params)}`),
    update: (
      id: string,
      patch: Partial<{ category_id: number | null; notes: string; clear_category: boolean }>,
    ) =>
      request<Transaction>(`/api/transactions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  },
  categories: {
    list: () => request<Category[]>("/api/categories"),
    create: (body: { name: string; color?: string | null; parent_id?: number | null }) =>
      request<Category>("/api/categories", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<{ name: string; color: string | null; parent_id: number | null }>) =>
      request<Category>(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<void>(`/api/categories/${id}`, { method: "DELETE" }),
  },
  rules: {
    list: () => request<Rule[]>("/api/rules"),
    create: (body: { pattern: string; category_id: number; priority?: number }) =>
      request<Rule>("/api/rules", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<{ pattern: string; category_id: number; priority: number }>) =>
      request<Rule>(`/api/rules/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<void>(`/api/rules/${id}`, { method: "DELETE" }),
    apply: () => request<{ affected: number }>("/api/rules/apply", { method: "POST" }),
  },
  stats: {
    byCategory: (params: { start?: string; end?: string }) =>
      request<CategorySpend[]>(`/api/stats/by-category${qs(params)}`),
    monthly: (params: { start?: string; end?: string }) =>
      request<MonthlySpend[]>(`/api/stats/monthly${qs(params)}`),
    merchants: (params: { start?: string; end?: string; limit?: number }) =>
      request<MerchantSpend[]>(`/api/stats/merchants${qs(params)}`),
    balances: (params: { account_id: string; start?: string }) =>
      request<BalancePoint[]>(`/api/stats/balances${qs(params)}`),
  },
  sync: {
    run: () => request<{ output: string }>("/api/sync", { method: "POST" }),
  },
  settings: {
    getGeneral: () => request<GeneralSettings>("/api/settings/general"),
    updateGeneral: (body: Partial<GeneralSettings>) =>
      request<GeneralSettings>("/api/settings/general", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    timezones: () => request<string[]>("/api/settings/timezones"),
  },
  simplefin: {
    status: () =>
      request<{ configured: boolean; has_pending_token: boolean; env_path: string }>(
        "/api/simplefin/status",
      ),
    setup: (setup_token: string) =>
      request<{ configured: boolean; output: string }>("/api/simplefin/setup", {
        method: "POST",
        body: JSON.stringify({ setup_token }),
      }),
    disconnect: () =>
      request<{ configured: boolean }>("/api/simplefin/connection", {
        method: "DELETE",
      }),
  },
  claude: {
    status: () =>
      request<{
        authenticated: boolean;
        auth_source: string | null;
        last_login_at: number | null;
        claude_installed: boolean;
      }>("/api/claude/status"),
    loginStart: () => request<{ url: string }>("/api/claude/login/start", { method: "POST" }),
    loginComplete: (code: string) =>
      request<{ token_saved: boolean; saved_at: number; warnings: string[] }>(
        "/api/claude/login/complete",
        { method: "POST", body: JSON.stringify({ code }) },
      ),
    logout: () =>
      request<{ warnings: string[] }>("/api/claude/login", { method: "DELETE" }),
    test: () =>
      request<{ ok: boolean; answer: string; duration_ms: number }>(
        "/api/claude/test",
        { method: "POST" },
      ),
  },
  goals: {
    list: () => request<Goal[]>("/api/goals"),
    create: (body: {
      name: string;
      target_amount: number;
      target_date?: string | null;
      account_id?: string | null;
      starting_balance?: number;
      color?: string | null;
      notes?: string | null;
    }) => request<Goal>("/api/goals", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Goal>) =>
      request<Goal>(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<void>(`/api/goals/${id}`, { method: "DELETE" }),
  },
  budgets: {
    list: () => request<Budget[]>("/api/budgets"),
    create: (body: { category_id: number; monthly_limit: number }) =>
      request<Budget>("/api/budgets", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: { monthly_limit: number }) =>
      request<Budget>(`/api/budgets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<void>(`/api/budgets/${id}`, { method: "DELETE" }),
  },
  ask: (question: string) =>
    request<{ answer: string; duration_ms: number }>("/api/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
    }),
};
