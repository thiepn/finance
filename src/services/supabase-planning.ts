import type {
  PlanningAccountOption,
  PlanningAllocation,
  PlanningBudget,
  PlanningCategoryOption,
  PlanningCommitment,
  PlanningDashboard,
  PlanningForecastPoint,
  PlanningGoal,
  PlanningGoalMovementKind,
  PlanningGoalStatus,
  PlanningProfile,
  UpsertBudgetInput,
  UpsertBudgetPeriodInput,
  UpsertPlanningAllocationInput,
  UpsertPlanningGoalInput,
} from "../domain/planning.js";
import type { UUID } from "../domain/finance.js";
import type { FinancePlanningService } from "./planning.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}

function parseProfile(value: unknown): PlanningProfile {
  const raw = record(value, "planning profile");
  return {
    currencyCode: String(raw.currency_code),
    locale: String(raw.locale),
    timeZone: String(raw.time_zone),
  };
}

function parseBudget(value: unknown): PlanningBudget {
  const raw = record(value, "planning budget");
  return {
    configured: Boolean(raw.configured),
    budgetId: nullableString(raw.budget_id),
    budgetName: nullableString(raw.budget_name),
    periodKind:
      raw.period_kind === null || raw.period_kind === undefined
        ? null
        : (String(raw.period_kind) as PlanningBudget["periodKind"]),
    periodId: nullableString(raw.period_id),
    startsOn: nullableString(raw.starts_on),
    endsOn: nullableString(raw.ends_on),
    plannedIncomeMinor: nullableNumber(raw.planned_income_minor),
    actualIncomeMinor: Number(raw.actual_income_minor ?? 0),
    basePlannedMinor: nullableNumber(raw.base_planned_minor),
    carryInMinor: nullableNumber(raw.carry_in_minor),
    effectivePlannedMinor: nullableNumber(raw.effective_planned_minor),
    actualSpendMinor: nullableNumber(raw.actual_spend_minor),
    allocatedSpendMinor: nullableNumber(raw.allocated_spend_minor),
    unallocatedSpendMinor: nullableNumber(raw.unallocated_spend_minor),
    remainingMinor: nullableNumber(raw.remaining_minor),
    elapsedRatio: nullableNumber(raw.elapsed_ratio),
    paceRatio: nullableNumber(raw.pace_ratio),
    projectedSpendMinor: nullableNumber(raw.projected_spend_minor),
    futureRecurringExpenseMinor: nullableNumber(
      raw.future_recurring_expense_minor,
    ),
    futureRecurringIncomeMinor: nullableNumber(
      raw.future_recurring_income_minor,
    ),
    goalPeriodTargetMinor: nullableNumber(raw.goal_period_target_minor),
    goalPeriodContributedMinor: nullableNumber(
      raw.goal_period_contributed_minor,
    ),
    goalFundingRemainingMinor: nullableNumber(
      raw.goal_funding_remaining_minor,
    ),
    safeToSpendMinor: nullableNumber(raw.safe_to_spend_minor),
    unallocatedPlanMinor: nullableNumber(raw.unallocated_plan_minor),
    projectedSurplusMinor: nullableNumber(raw.projected_surplus_minor),
    status: String(raw.status) as PlanningBudget["status"],
  };
}

function parseAllocation(value: unknown): PlanningAllocation {
  const raw = record(value, "planning allocation");
  return {
    allocationId: String(raw.allocation_id),
    categoryId: String(raw.category_id),
    categoryName: String(raw.category_name),
    categoryPath: Array.isArray(raw.category_path)
      ? raw.category_path.map(String)
      : [],
    plannedMinor: Number(raw.planned_minor),
    rollover: Boolean(raw.rollover),
    carryInMinor: Number(raw.carry_in_minor),
    effectivePlannedMinor: Number(raw.effective_planned_minor),
    spentMinor: Number(raw.spent_minor),
    remainingMinor: Number(raw.remaining_minor),
    utilizationRatio: nullableNumber(raw.utilization_ratio),
    projectedSpendMinor: Number(raw.projected_spend_minor),
    futureRecurringMinor: Number(raw.future_recurring_minor),
    status: String(raw.status) as PlanningAllocation["status"],
  };
}

function parseGoal(value: unknown): PlanningGoal {
  const raw = record(value, "planning goal");
  return {
    goalId: String(raw.goal_id),
    name: String(raw.name),
    kind: String(raw.kind) as PlanningGoal["kind"],
    targetMinor: Number(raw.target_minor),
    currencyCode: String(raw.currency_code),
    targetDate: nullableString(raw.target_date),
    linkedAccountId: nullableString(raw.linked_account_id),
    linkedAccountName: nullableString(raw.linked_account_name),
    plannedContributionMinor: nullableNumber(
      raw.planned_contribution_minor,
    ),
    requiredMonthlyMinor: Number(raw.required_monthly_minor),
    periodTargetMinor: Number(raw.period_target_minor),
    periodContributedMinor: Number(raw.period_contributed_minor),
    periodRemainingMinor: Number(raw.period_remaining_minor),
    fundedMinor: Number(raw.funded_minor),
    remainingMinor: Number(raw.remaining_minor),
    progressRatio: Number(raw.progress_ratio),
    status: String(raw.status) as PlanningGoalStatus,
    health: String(raw.health) as PlanningGoal["health"],
    note: nullableString(raw.note),
  };
}

function parseForecast(value: unknown): PlanningForecastPoint {
  const raw = record(value, "planning forecast point");
  return {
    bucketIndex: Number(raw.bucket_index),
    bucketStart: String(raw.bucket_start),
    bucketEnd: String(raw.bucket_end),
    actualCumulativeMinor: nullableNumber(raw.actual_cumulative_minor),
    forecastCumulativeMinor: Number(raw.forecast_cumulative_minor),
    plannedCumulativeMinor: Number(raw.planned_cumulative_minor),
  };
}

function parseCommitment(value: unknown): PlanningCommitment {
  const raw = record(value, "planning commitment");
  return {
    patternId: String(raw.pattern_id),
    transactionType: String(
      raw.transaction_type,
    ) as PlanningCommitment["transactionType"],
    categoryId: nullableString(raw.category_id),
    currencyCode: String(raw.currency_code),
    amountMinor: Number(raw.amount_minor),
    expectedAt: String(raw.expected_at),
  };
}

function parseCategory(value: unknown): PlanningCategoryOption {
  const raw = record(value, "planning category option");
  return {
    categoryId: String(raw.category_id),
    parentId: nullableString(raw.parent_id),
    name: String(raw.name),
    depth: Number(raw.depth),
    path: Array.isArray(raw.path) ? raw.path.map(String) : [],
  };
}

function parseAccount(value: unknown): PlanningAccountOption {
  const raw = record(value, "planning account option");
  return {
    accountId: String(raw.account_id),
    name: String(raw.name),
    accountType: String(raw.account_type),
    currencyCode: String(raw.currency_code),
  };
}

export class SupabaseFinancePlanningService
  implements FinancePlanningService
{
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async getDashboard(
    anchorDate: string | null = null,
  ): Promise<PlanningDashboard> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_planning_dashboard",
      { p_anchor_date: anchorDate },
    );
    rpcError(result, "getPlanningDashboard");
    if (!result.data) throw new Error("Planning dashboard returned no data");

    return {
      profile: parseProfile(result.data.profile),
      anchorDate: String(result.data.anchor_date),
      budget: parseBudget(result.data.budget),
      allocations: Array.isArray(result.data.allocations)
        ? result.data.allocations.map(parseAllocation)
        : [],
      goals: Array.isArray(result.data.goals)
        ? result.data.goals.map(parseGoal)
        : [],
      forecast: Array.isArray(result.data.forecast)
        ? result.data.forecast.map(parseForecast)
        : [],
      commitments: Array.isArray(result.data.commitments)
        ? result.data.commitments.map(parseCommitment)
        : [],
      availableCategories: Array.isArray(
        result.data.available_categories,
      )
        ? result.data.available_categories.map(parseCategory)
        : [],
      availableAccounts: Array.isArray(
        result.data.available_accounts,
      )
        ? result.data.available_accounts.map(parseAccount)
        : [],
    };
  }

  async upsertBudget(input: UpsertBudgetInput): Promise<UUID> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<string>(
      "finance_upsert_budget",
      {
        p_budget_id: input.budgetId ?? null,
        p_name: input.name,
        p_period_kind: input.periodKind ?? "monthly",
        p_is_active: input.isActive ?? true,
      },
    );
    rpcError(result, "upsertBudget");
    if (!result.data) throw new Error("Budget upsert returned no id");
    return String(result.data);
  }

  async ensureBudgetPeriod(
    budgetId: UUID,
    anchorDate: string | null = null,
    plannedIncomeMinor: number | null = null,
  ): Promise<UUID> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<string>(
      "finance_ensure_budget_period",
      {
        p_budget_id: budgetId,
        p_anchor_date: anchorDate,
        p_planned_income_minor: plannedIncomeMinor,
      },
    );
    rpcError(result, "ensureBudgetPeriod");
    if (!result.data) throw new Error("Budget period ensure returned no id");
    return String(result.data);
  }

  async upsertBudgetPeriod(
    input: UpsertBudgetPeriodInput,
  ): Promise<UUID> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<string>(
      "finance_upsert_budget_period",
      {
        p_period_id: input.periodId ?? null,
        p_budget_id: input.budgetId,
        p_starts_on: input.startsOn,
        p_ends_on: input.endsOn,
        p_planned_income_minor: input.plannedIncomeMinor ?? null,
        p_notes: input.notes ?? null,
      },
    );
    rpcError(result, "upsertBudgetPeriod");
    if (!result.data) throw new Error("Budget period upsert returned no id");
    return String(result.data);
  }

  async upsertAllocation(
    input: UpsertPlanningAllocationInput,
  ): Promise<UUID> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<string>(
      "finance_upsert_budget_allocation",
      {
        p_allocation_id: input.allocationId ?? null,
        p_budget_period_id: input.budgetPeriodId,
        p_category_id: input.categoryId,
        p_planned_minor: input.plannedMinor,
        p_rollover: input.rollover ?? false,
      },
    );
    rpcError(result, "upsertBudgetAllocation");
    if (!result.data) throw new Error("Budget allocation upsert returned no id");
    return String(result.data);
  }

  async deleteAllocation(allocationId: UUID): Promise<void> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<null>(
      "finance_delete_budget_allocation",
      { p_allocation_id: allocationId },
    );
    rpcError(result, "deleteBudgetAllocation");
  }

  async upsertGoal(input: UpsertPlanningGoalInput): Promise<UUID> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<string>(
      "finance_upsert_goal",
      {
        p_goal_id: input.goalId ?? null,
        p_name: input.name,
        p_kind: input.kind,
        p_target_minor: input.targetMinor,
        p_currency_code: input.currencyCode ?? "EUR",
        p_target_date: input.targetDate ?? null,
        p_linked_account_id: input.linkedAccountId ?? null,
        p_planned_contribution_minor:
          input.plannedContributionMinor ?? null,
        p_note: input.note ?? null,
        p_status: input.status ?? "active",
      },
    );
    rpcError(result, "upsertGoal");
    if (!result.data) throw new Error("Goal upsert returned no id");
    return String(result.data);
  }

  async addGoalMovement(
    goalId: UUID,
    amountMinor: number,
    movementKind: PlanningGoalMovementKind,
    occurredAt: string | null = null,
    note: string | null = null,
  ): Promise<UUID> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<string>(
      "finance_add_goal_movement",
      {
        p_goal_id: goalId,
        p_amount_minor: amountMinor,
        p_movement_kind: movementKind,
        p_occurred_at: occurredAt,
        p_transaction_id: null,
        p_note: note,
      },
    );
    rpcError(result, "addGoalMovement");
    if (!result.data) throw new Error("Goal movement returned no id");
    return String(result.data);
  }

  async setGoalStatus(
    goalId: UUID,
    status: PlanningGoalStatus,
  ): Promise<void> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_set_goal_status",
      {
        p_goal_id: goalId,
        p_status: status,
      },
    );
    rpcError(result, "setGoalStatus");
  }
}
