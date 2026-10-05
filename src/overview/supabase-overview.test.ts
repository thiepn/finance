import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinanceOverviewService } from "../services/supabase-overview.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let initialized = 0;
let calledFunction = "";
let calledArgs: Record<string, unknown> | undefined;

const client: SupabaseRpcClient = {
  async rpc<T>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: null }> {
    calledFunction = functionName;
    calledArgs = args;

    const payload = {
      period_kind: "month",
      anchor_date: "2026-10-05",
      profile: {
        currency_code: "EUR",
        locale: "de-DE",
        time_zone: "Europe/Berlin",
      },
      period: {
        start: "2026-09-30T22:00:00Z",
        end: "2026-10-31T23:00:00Z",
        compare_start: "2026-08-31T22:00:00Z",
        compare_end: "2026-09-30T22:00:00Z",
        as_of: "2026-10-05T13:19:00Z",
        elapsed_ratio: 0.15,
      },
      summary: {
        income_minor: 200000,
        gross_spend_minor: 70000,
        recoveries_minor: 10000,
        net_spent_minor: 60000,
        net_cash_flow_minor: 140000,
        savings_rate: 0.7,
        transaction_count: 4,
        expense_count: 2,
        available_to_spend_minor: 40000,
      },
      comparison: {
        income_minor: 180000,
        gross_spend_minor: 80000,
        recoveries_minor: 0,
        net_spent_minor: 80000,
        net_cash_flow_minor: 100000,
        savings_rate: 0.555555,
        transaction_count: 2,
        expense_count: 1,
      },
      planning: {
        configured: true,
        budget_period_count: 1,
        planned_income_minor: 200000,
        planned_spend_minor: 100000,
        budgeted_spent_minor: 60000,
        remaining_minor: 40000,
        pace_ratio: 0.6,
        elapsed_ratio: 0.15,
        projected_spend_minor: 400000,
      },
      financial_status: { code: "at_risk", tone: "warning" },
      top_categories: [
        {
          category_id: "11111111-1111-4111-8111-111111111111",
          name: "Snacks",
          current_minor: 40000,
          previous_minor: 80000,
          delta_minor: -40000,
          delta_ratio: -0.5,
          share: 0.666666,
        },
      ],
      attention: {
        total_count: 1,
        items: [
          {
            code: "receipt_review_required",
            severity: "warning",
            entity_id: "22222222-2222-4222-8222-222222222222",
            entity_kind: "receipt",
            subject: "REWE",
            detail_code: "1",
            action: "review_receipt",
            occurred_at: "2026-10-05T12:00:00Z",
          },
        ],
      },
      recent_activity: [],
      accounts: {
        active_count: 1,
        tracked_net_worth_minor: 240000,
      },
    };

    return { data: payload as T, error: null };
  },
};

const service = new SupabaseFinanceOverviewService(
  client,
  async () => {
    initialized += 1;
  },
);

const dashboard = await service.getDashboard({
  periodKind: "month",
  anchorDate: "2026-10-05",
  asOf: "2026-10-05T13:19:00Z",
  recentLimit: 6,
});

assert(initialized === 1, "overview should initialize Finance once per service request");
assert(
  calledFunction === "finance_get_overview_dashboard_period",
  "overview RPC name mismatch",
);
assert(calledArgs?.p_period_kind === "month", "period kind RPC arg failed");
assert(calledArgs?.p_anchor_date === "2026-10-05", "anchor RPC arg failed");
assert(dashboard.summary.netSpentMinor === 60000, "summary parsing failed");
assert(dashboard.planning.remainingMinor === 40000, "planning parsing failed");
assert(dashboard.financialStatus.code === "at_risk", "status parsing failed");
assert(dashboard.topCategories[0]?.name === "Snacks", "category parsing failed");
assert(dashboard.attention.totalCount === 1, "attention parsing failed");
assert(
  dashboard.accounts.trackedNetWorthMinor === 240000,
  "account summary parsing failed",
);

console.log("Supabase Overview adapter fixtures passed");
