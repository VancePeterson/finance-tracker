"""Pydantic request/response models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# --- Categories -----------------------------------------------------------------


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: Optional[str] = Field(default=None, max_length=16)
    parent_id: Optional[int] = None


class CategoryPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    color: Optional[str] = Field(default=None, max_length=16)
    parent_id: Optional[int] = None


class Category(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    parent_id: Optional[int] = None
    transaction_count: int = 0


# --- Merchant rules -------------------------------------------------------------


class RuleIn(BaseModel):
    pattern: str = Field(min_length=1, max_length=200)
    category_id: int
    priority: int = 0


class RulePatch(BaseModel):
    pattern: Optional[str] = Field(default=None, min_length=1, max_length=200)
    category_id: Optional[int] = None
    priority: Optional[int] = None


class Rule(BaseModel):
    id: int
    pattern: str
    category_id: int
    category_name: Optional[str] = None
    priority: int


# --- Transactions ---------------------------------------------------------------


class Transaction(BaseModel):
    id: str
    account_id: str
    account_name: Optional[str] = None
    posted: int
    amount: float
    description: Optional[str] = None
    payee: Optional[str] = None
    memo: Optional[str] = None
    pending: bool
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_source: Optional[str] = None
    notes: Optional[str] = None


class TransactionPatch(BaseModel):
    category_id: Optional[int] = None
    notes: Optional[str] = None
    # Sentinel: if true, clears the category and lets rules re-apply on next sync.
    clear_category: bool = False


# --- Accounts -------------------------------------------------------------------


class Account(BaseModel):
    id: str
    name: str
    currency: Optional[str] = None
    balance: Optional[float] = None
    available_balance: Optional[float] = None
    balance_date: Optional[int] = None
    org_name: Optional[str] = None
    org_domain: Optional[str] = None
    excluded_from_totals: bool = False


# --- Stats ----------------------------------------------------------------------


class CategorySpend(BaseModel):
    category_id: Optional[int]
    category_name: Optional[str]
    color: Optional[str]
    total: float
    transaction_count: int


class MonthlySpend(BaseModel):
    month: str  # YYYY-MM
    category_id: Optional[int]
    category_name: Optional[str]
    color: Optional[str]
    total: float


class MerchantSpend(BaseModel):
    merchant: str
    total: float
    transaction_count: int


class BalancePoint(BaseModel):
    date: str  # YYYY-MM-DD
    balance: float


# --- Goals ----------------------------------------------------------------------


class GoalIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    target_amount: float = Field(gt=0)
    target_date: Optional[str] = None  # YYYY-MM-DD
    account_id: Optional[str] = None
    starting_balance: float = 0
    color: Optional[str] = Field(default=None, max_length=16)
    notes: Optional[str] = None


class GoalPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    target_amount: Optional[float] = Field(default=None, gt=0)
    target_date: Optional[str] = None
    account_id: Optional[str] = None
    starting_balance: Optional[float] = None
    color: Optional[str] = Field(default=None, max_length=16)
    notes: Optional[str] = None


class Goal(BaseModel):
    id: int
    name: str
    target_amount: float
    target_date: Optional[str]
    account_id: Optional[str]
    account_name: Optional[str]
    starting_balance: float
    current_amount: float  # computed
    color: Optional[str]
    notes: Optional[str]


# --- Budgets --------------------------------------------------------------------


class BudgetIn(BaseModel):
    category_id: int
    monthly_limit: float = Field(gt=0)


class BudgetPatch(BaseModel):
    monthly_limit: Optional[float] = Field(default=None, gt=0)


class Budget(BaseModel):
    id: int
    category_id: int
    category_name: str
    color: Optional[str]
    monthly_limit: float
    spent_this_month: float
