import type { ActivityItem } from "../domain/activity.js";
import type {
  OverviewAttentionItem,
  OverviewCategory,
  OverviewDashboard,
  OverviewPeriodKind,
} from "../domain/overview.js";
import type {
  FinanceOverviewService,
  OverviewRequest,
} from "./overview.js";
import {
  parseActivityItem,
} from "./supabase-activity.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function parseActivityArray(value: unknown): ActivityItem[] {
  return Array.isArray(value)
    ? value.map((item) => parseActivityItem(record(item, "recent activity")))
    : [];
}

function parseCategory(value: unknown): OverviewCategory {
  const raw = record(value, "overview category");
  return {
    categoryId: String(raw.category_id),
    name: String(raw.name),
    currentMinor: Number(raw.current_minor),
    previousMinor: Number(raw.previous_minor),
    deltaMinor: Number(raw.delta_minor),
    deltaRatio: nullableNumber(raw.delta_ratio),
    share: nullableNumber(raw.share),
  };
}

function parseAttention(value: unknown): OverviewAttentionItem {
  const raw = record(value, "overview attention item");
  return {
    code: String(raw.code) as OverviewAttentionItem["code"],
    severity: String(raw.severity) as OverviewAttentionItem["severity"],
    entityId:
      raw.entity_id === null || raw.entity_id === undefined
        ? null
        : String(raw.entity_id),
    entityKind: String(raw.entity_kind),
    subject: String(raw.subject),
    detailCode: String(raw.detail_code ?? ""),
    action: String(raw.action) as OverviewAttentionItem["action"],
    occurredAt: String(raw.occurred_at),
  };
}

function parseDashboard(raw: Record<string, unknown>): OverviewDashboard {
  const profile = record(raw.profile, "overview profile");
  const period = record(raw.period, "overview period");
  const summary = record(raw.summary, "overview summary");
  const comparison = record(raw.comparison, "overview comparison");
  const planning = record(raw.planning, "overview planning");
  const financialStatus = record(
    raw.financial_status,
    "overview financial status",
  );
  const attention = record(raw.attention, "overview attention");
  const accounts = record(raw.accounts, "overview accounts");

  return {
    periodKind: String(raw.period_kind) as OverviewPeriodKind,
    anchorDate: String(raw.anchor_date),
    profile: {
      currencyCode: String(profile.currency_code),
      locale: String(profile.locale),
      timeZone: String(profile.time_zone),
    },
    period: {
      start: String(period.start),
      end: String(period.end),
      compareStart: String(period.compare_start),
      compareEnd: String(period.compare_end),
      asOf: String(period.as_of),
      elapsedRatio: Number(period.elapsed_ratio),
    },
    summary: {
      incomeMinor: Number(summary.income_minor),
      grossSpendMinor: Number(summary.gross_spend_minor),
      recoveriesMinor: Number(summary.recoveries_minor),
      netSpentMinor: Number(summary.net_spent_minor),
      netCashFlowMinor: Number(summary.net_cash_flow_minor),
      savingsRate: nullableNumber(summary.savings_rate),
      transactionCount: Number(summary.transaction_count),
      expenseCount: Number(summary.expense_count),
      availableToSpendMinor: nullableNumber(
        summary.available_to_spend_minor,
      ),
    },
    comparison: {
      incomeMinor: Number(comparison.income_minor),
      grossSpendMinor: Number(comparison.gross_spend_minor),
      recoveriesMinor: Number(comparison.recoveries_minor),
      netSpentMinor: Number(comparison.net_spent_minor),
      netCashFlowMinor: Number(comparison.net_cash_flow_minor),
      savingsRate: nullableNumber(comparison.savings_rate),
      transactionCount: Number(comparison.transaction_count),
      expenseCount: Number(comparison.expense_count),
    },
    planning: {
      configured: Boolean(planning.configured),
      budgetPeriodCount: Number(planning.budget_period_count),
      plannedIncomeMinor: nullableNumber(planning.planned_income_minor),
      plannedSpendMinor: nullableNumber(planning.planned_spend_minor),
      budgetedSpentMinor: nullableNumber(planning.budgeted_spent_minor),
      remainingMinor: nullableNumber(planning.remaining_minor),
      paceRatio: nullableNumber(planning.pace_ratio),
      elapsedRatio: Number(planning.elapsed_ratio),
      projectedSpendMinor: nullableNumber(planning.projected_spend_minor),
    },
    financialStatus: {
      code: String(
        financialStatus.code,
      ) as OverviewDashboard["financialStatus"]["code"],
      tone: String(
        financialStatus.tone,
      ) as OverviewDashboard["financialStatus"]["tone"],
    },
    topCategories: Array.isArray(raw.top_categories)
      ? raw.top_categories.map(parseCategory)
      : [],
    attention: {
      totalCount: Number(attention.total_count ?? 0),
      items: Array.isArray(attention.items)
        ? attention.items.map(parseAttention)
        : [],
    },
    recentActivity: parseActivityArray(raw.recent_activity),
    accounts: {
      activeCount: Number(accounts.active_count ?? 0),
      trackedNetWorthMinor: Number(
        accounts.tracked_net_worth_minor ?? 0,
      ),
    },
  };
}

export class SupabaseFinanceOverviewService
  implements FinanceOverviewService
{
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async getDashboard(
    request: OverviewRequest = {},
  ): Promise<OverviewDashboard> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_overview_dashboard_period",
      {
        p_period_kind: request.periodKind ?? "month",
        p_anchor_date: request.anchorDate ?? null,
        p_as_of: request.asOf ?? new Date().toISOString(),
        p_recent_limit: request.recentLimit ?? 6,
      },
    );

    rpcError(result, "getOverviewDashboard");
    if (!result.data) {
      throw new Error("Finance Overview returned no data");
    }

    return parseDashboard(result.data);
  }
}
