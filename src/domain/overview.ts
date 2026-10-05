import type { ActivityItem } from "./activity.js";
import type { UUID } from "./finance.js";

export type OverviewPeriodKind = "week" | "month" | "quarter" | "year";

export type OverviewStatusCode =
  | "on_track"
  | "at_risk"
  | "over_plan"
  | "positive_cash_flow"
  | "negative_cash_flow"
  | "no_activity";

export type OverviewStatusTone =
  | "positive"
  | "warning"
  | "negative"
  | "neutral";

export type OverviewAttentionSeverity =
  | "negative"
  | "warning"
  | "accent"
  | "neutral";

export type OverviewAttentionCode =
  | "receipt_processing_failed"
  | "receipt_ready_to_confirm"
  | "receipt_review_required"
  | "receipt_match_suggested"
  | "receipt_unmatched"
  | "budget_over_plan"
  | "budget_at_risk"
  | "unclassified_spending";

export type OverviewAttentionAction =
  | "open_receipt"
  | "review_receipt"
  | "review_match"
  | "open_budget"
  | "open_activity";

export interface OverviewProfile {
  currencyCode: string;
  locale: string;
  timeZone: string;
}

export interface OverviewPeriod {
  start: string;
  end: string;
  compareStart: string;
  compareEnd: string;
  asOf: string;
  elapsedRatio: number;
}

export interface OverviewSummary {
  incomeMinor: number;
  grossSpendMinor: number;
  recoveriesMinor: number;
  netSpentMinor: number;
  netCashFlowMinor: number;
  savingsRate: number | null;
  transactionCount: number;
  expenseCount: number;
  availableToSpendMinor: number | null;
}

export interface OverviewComparison {
  incomeMinor: number;
  grossSpendMinor: number;
  recoveriesMinor: number;
  netSpentMinor: number;
  netCashFlowMinor: number;
  savingsRate: number | null;
  transactionCount: number;
  expenseCount: number;
}

export interface OverviewPlanning {
  configured: boolean;
  budgetPeriodCount: number;
  plannedIncomeMinor: number | null;
  plannedSpendMinor: number | null;
  budgetedSpentMinor: number | null;
  remainingMinor: number | null;
  paceRatio: number | null;
  elapsedRatio: number;
  projectedSpendMinor: number | null;
}

export interface OverviewFinancialStatus {
  code: OverviewStatusCode;
  tone: OverviewStatusTone;
}

export interface OverviewCategory {
  categoryId: UUID;
  name: string;
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  deltaRatio: number | null;
  share: number | null;
}

export interface OverviewAttentionItem {
  code: OverviewAttentionCode;
  severity: OverviewAttentionSeverity;
  entityId: UUID | null;
  entityKind: string;
  subject: string;
  detailCode: string;
  action: OverviewAttentionAction;
  occurredAt: string;
}

export interface OverviewAttention {
  totalCount: number;
  items: readonly OverviewAttentionItem[];
}

export interface OverviewAccounts {
  activeCount: number;
  trackedNetWorthMinor: number;
}

export interface OverviewDashboard {
  periodKind: OverviewPeriodKind;
  anchorDate: string;
  profile: OverviewProfile;
  period: OverviewPeriod;
  summary: OverviewSummary;
  comparison: OverviewComparison;
  planning: OverviewPlanning;
  financialStatus: OverviewFinancialStatus;
  topCategories: readonly OverviewCategory[];
  attention: OverviewAttention;
  recentActivity: readonly ActivityItem[];
  accounts: OverviewAccounts;
}
