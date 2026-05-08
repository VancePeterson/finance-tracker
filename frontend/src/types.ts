export interface Account {
  id: string;
  name: string;
  currency?: string | null;
  balance?: number | null;
  available_balance?: number | null;
  balance_date?: number | null;
  org_name?: string | null;
  org_domain?: string | null;
  excluded_from_totals: boolean;
}

export interface GeneralSettings {
  sync_enabled: boolean;
  sync_interval_minutes: number;
  last_synced_at: number | null;
  timezone: string;
  include_pending: boolean;
  default_dashboard_range: "month" | "ytd" | "12m";
}

export interface Transaction {
  id: string;
  account_id: string;
  account_name?: string | null;
  posted: number;
  amount: number;
  description?: string | null;
  payee?: string | null;
  memo?: string | null;
  pending: boolean;
  category_id?: number | null;
  category_name?: string | null;
  category_source?: "rule" | "manual" | null;
  notes?: string | null;
}

export interface Category {
  id: number;
  name: string;
  color?: string | null;
  parent_id?: number | null;
  transaction_count: number;
}

export interface Rule {
  id: number;
  pattern: string;
  category_id: number;
  category_name?: string | null;
  priority: number;
}

export interface CategorySpend {
  category_id: number | null;
  category_name: string | null;
  color: string | null;
  total: number;
  transaction_count: number;
}

export interface MonthlySpend {
  month: string;
  category_id: number | null;
  category_name: string | null;
  color: string | null;
  total: number;
}

export interface MerchantSpend {
  merchant: string;
  total: number;
  transaction_count: number;
}

export interface BalancePoint {
  date: string;
  balance: number;
}

export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
  account_id: string | null;
  account_name: string | null;
  starting_balance: number;
  current_amount: number;
  color: string | null;
  notes: string | null;
}

export interface Budget {
  id: number;
  category_id: number;
  category_name: string;
  color: string | null;
  monthly_limit: number;
  spent_this_month: number;
}
