import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinancePlanningService } from "../services/supabase-planning.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];

const client: SupabaseRpcClient = {
  async rpc<T>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: null }> {
    calls.push(args ? { name: functionName, args } : { name: functionName });

    if (functionName === "finance_get_planning_dashboard") {
      return {
        data: {
          profile: {
            currency_code: "EUR",
            locale: "de-DE",
            time_zone: "Europe/Berlin",
          },
          anchor_date: "2026-10-15",
          budget: {
            configured: true,
            budget_id: "budget-1",
            budget_name: "Monthly plan",
            period_kind: "monthly",
            period_id: "period-1",
            starts_on: "2026-10-01",
            ends_on: "2026-10-31",
            planned_income_minor: 100000,
            actual_income_minor: 50000,
            base_planned_minor: 40000,
            carry_in_minor: 10000,
            effective_planned_minor: 50000,
            actual_spend_minor: 10000,
            allocated_spend_minor: 10000,
            unallocated_spend_minor: 0,
            remaining_minor: 40000,
            elapsed_ratio: 0.48,
            pace_ratio: 0.51,
            projected_spend_minor: 25500,
            future_recurring_expense_minor: 5000,
            future_recurring_income_minor: 0,
            goal_period_target_minor: 10000,
            goal_period_contributed_minor: 4000,
            goal_funding_remaining_minor: 6000,
            safe_to_spend_minor: 79000,
            unallocated_plan_minor: 50000,
            projected_surplus_minor: 68500,
            status: "on_track",
          },
          allocations: [{
            allocation_id: "allocation-1",
            category_id: "category-1",
            category_name: "Food",
            category_path: ["Food"],
            planned_minor: 40000,
            rollover: true,
            carry_in_minor: 10000,
            effective_planned_minor: 50000,
            spent_minor: 10000,
            remaining_minor: 40000,
            utilization_ratio: 0.2,
            projected_spend_minor: 25500,
            future_recurring_minor: 5000,
            status: "on_track",
          }],
          goals: [{
            goal_id: "goal-1",
            name: "Annual insurance",
            kind: "sinking_fund",
            target_minor: 60000,
            currency_code: "EUR",
            target_date: "2026-12-31",
            linked_account_id: "account-1",
            linked_account_name: "Checking",
            planned_contribution_minor: 10000,
            required_monthly_minor: 18000,
            period_target_minor: 10000,
            period_contributed_minor: 4000,
            period_remaining_minor: 6000,
            funded_minor: 24000,
            remaining_minor: 36000,
            progress_ratio: 0.4,
            status: "active",
            health: "needs_more",
            note: "Known annual cost",
          }],
          forecast: [{
            bucket_index: 1,
            bucket_start: "2026-10-01T00:00:00Z",
            bucket_end: "2026-10-02T00:00:00Z",
            actual_cumulative_minor: 1000,
            forecast_cumulative_minor: 1000,
            planned_cumulative_minor: 1613,
          }],
          commitments: [{
            pattern_id: "pattern-1",
            transaction_type: "expense",
            category_id: "category-1",
            currency_code: "EUR",
            amount_minor: 5000,
            expected_at: "2026-10-20T10:00:00Z",
          }],
          available_categories: [{
            category_id: "category-1",
            parent_id: null,
            name: "Food",
            depth: 0,
            path: ["Food"],
          }],
          available_accounts: [{
            account_id: "account-1",
            name: "Checking",
            account_type: "checking",
            currency_code: "EUR",
          }],
        } as T,
        error: null,
      };
    }

    if (
      functionName === "finance_upsert_budget" ||
      functionName === "finance_ensure_budget_period" ||
      functionName === "finance_upsert_budget_period" ||
      functionName === "finance_upsert_budget_allocation" ||
      functionName === "finance_upsert_goal" ||
      functionName === "finance_add_goal_movement"
    ) {
      return { data: "created-id" as T, error: null };
    }

    if (functionName === "finance_set_goal_status") {
      return {
        data: { goal_id: "goal-1", status: "paused" } as T,
        error: null,
      };
    }

    return { data: null, error: null };
  },
};

let initialized = 0;
const service = new SupabaseFinancePlanningService(client, async () => {
  initialized += 1;
});

const dashboard = await service.getDashboard("2026-10-15");
assert(dashboard.budget.safeToSpendMinor === 79000, "safe-to-spend parse failed");
assert(dashboard.allocations[0]?.carryInMinor === 10000, "rollover parse failed");
assert(dashboard.goals[0]?.kind === "sinking_fund", "goal kind parse failed");
assert(dashboard.goals[0]?.fundedMinor === 24000, "goal funded parse failed");
assert(dashboard.commitments[0]?.amountMinor === 5000, "commitment parse failed");
assert(dashboard.availableCategories[0]?.name === "Food", "category parse failed");

const budgetId = await service.upsertBudget({
  name: "Monthly plan",
  periodKind: "monthly",
});
assert(budgetId === "created-id", "budget mutation failed");

await service.ensureBudgetPeriod("budget-1", "2026-10-15", 100000);
await service.upsertAllocation({
  budgetPeriodId: "period-1",
  categoryId: "category-1",
  plannedMinor: 40000,
  rollover: true,
});
await service.upsertGoal({
  name: "Insurance",
  kind: "sinking_fund",
  targetMinor: 60000,
  targetDate: "2026-12-31",
  plannedContributionMinor: 10000,
});
await service.addGoalMovement(
  "goal-1",
  4000,
  "contribution",
  "2026-10-10T09:00:00Z",
  "October",
);
await service.setGoalStatus("goal-1", "paused");
await service.deleteAllocation("allocation-1");

assert(initialized === 8, "planning initialization hook count failed");
assert(calls[0]?.name === "finance_get_planning_dashboard", "dashboard RPC mismatch");
assert(calls[1]?.name === "finance_upsert_budget", "budget RPC mismatch");
assert(calls[2]?.name === "finance_ensure_budget_period", "period ensure RPC mismatch");
assert(calls[3]?.name === "finance_upsert_budget_allocation", "allocation RPC mismatch");
assert(calls[4]?.name === "finance_upsert_goal", "goal RPC mismatch");
assert(calls[5]?.name === "finance_add_goal_movement", "movement RPC mismatch");
assert(calls[6]?.name === "finance_set_goal_status", "goal status RPC mismatch");
assert(calls[7]?.name === "finance_delete_budget_allocation", "allocation delete RPC mismatch");

console.log("P15 planning Supabase adapter fixtures passed");
