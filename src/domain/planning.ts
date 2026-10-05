import type { UUID } from "./finance.js";

export type BudgetPeriodKind =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "custom";

export type PlanningGoalKind = "savings" | "sinking_fund";
export type PlanningGoalStatus =
  | "active"
  | "completed"
  | "paused"
  | "cancelled";
export type PlanningGoalMovementKind =
  | "opening"
  | "contribution"
  | "withdrawal";

export interface PlanningProfile {
  currencyCode: string;
  locale: string;
  timeZone: string;
}

export interface PlanningBudget {
  configured: boolean;
  budgetId: UUID | null;
  budgetName: string | null;
  periodKind: BudgetPeriodKind | null;
  periodId: UUID | null;
  startsOn: string | null;
  endsOn: string | null;
  plannedIncomeMinor: number | null;
  actualIncomeMinor: number;
  basePlannedMinor: number | null;
  carryInMinor: number | null;
  effectivePlannedMinor: number | null;
  actualSpendMinor: number | null;
  allocatedSpendMinor: number | null;
  unallocatedSpendMinor: number | null;
  remainingMinor: number | null;
  elapsedRatio: number | null;
  paceRatio: number | null;
  projectedSpendMinor: number | null;
  futureRecurringExpenseMinor: number | null;
  futureRecurringIncomeMinor: number | null;
  goalPeriodTargetMinor: number | null;
  goalPeriodContributedMinor: number | null;
  goalFundingRemainingMinor: number | null;
  safeToSpendMinor: number | null;
  unallocatedPlanMinor: number | null;
  projectedSurplusMinor: number | null;
  status:
    | "unconfigured"
    | "needs_allocations"
    | "overplanned"
    | "at_risk"
    | "over"
    | "on_track";
}

export interface PlanningAllocation {
  allocationId: UUID;
  categoryId: UUID;
  categoryName: string;
  categoryPath: readonly string[];
  plannedMinor: number;
  rollover: boolean;
  carryInMinor: number;
  effectivePlannedMinor: number;
  spentMinor: number;
  remainingMinor: number;
  utilizationRatio: number | null;
  projectedSpendMinor: number;
  futureRecurringMinor: number;
  status: "over" | "at_risk" | "empty" | "on_track" | "watch";
}

export interface PlanningGoal {
  goalId: UUID;
  name: string;
  kind: PlanningGoalKind;
  targetMinor: number;
  currencyCode: string;
  targetDate: string | null;
  linkedAccountId: UUID | null;
  linkedAccountName: string | null;
  plannedContributionMinor: number | null;
  requiredMonthlyMinor: number;
  periodTargetMinor: number;
  periodContributedMinor: number;
  periodRemainingMinor: number;
  fundedMinor: number;
  remainingMinor: number;
  progressRatio: number;
  status: PlanningGoalStatus;
  health:
    | "funded"
    | "overdue"
    | "needs_more"
    | "on_track"
    | "no_schedule"
    | "paused"
    | "completed"
    | "cancelled";
  note: string | null;
}

export interface PlanningForecastPoint {
  bucketIndex: number;
  bucketStart: string;
  bucketEnd: string;
  actualCumulativeMinor: number | null;
  forecastCumulativeMinor: number;
  plannedCumulativeMinor: number;
}

export interface PlanningCommitment {
  patternId: UUID;
  transactionType: "expense" | "income";
  categoryId: UUID | null;
  currencyCode: string;
  amountMinor: number;
  expectedAt: string;
}

export interface PlanningCategoryOption {
  categoryId: UUID;
  parentId: UUID | null;
  name: string;
  depth: number;
  path: readonly string[];
}

export interface PlanningAccountOption {
  accountId: UUID;
  name: string;
  accountType: string;
  currencyCode: string;
}

export interface PlanningDashboard {
  profile: PlanningProfile;
  anchorDate: string;
  budget: PlanningBudget;
  allocations: readonly PlanningAllocation[];
  goals: readonly PlanningGoal[];
  forecast: readonly PlanningForecastPoint[];
  commitments: readonly PlanningCommitment[];
  availableCategories: readonly PlanningCategoryOption[];
  availableAccounts: readonly PlanningAccountOption[];
}

export interface UpsertBudgetInput {
  budgetId?: UUID | null;
  name: string;
  periodKind?: BudgetPeriodKind;
  isActive?: boolean;
}

export interface UpsertBudgetPeriodInput {
  periodId?: UUID | null;
  budgetId: UUID;
  startsOn: string;
  endsOn: string;
  plannedIncomeMinor?: number | null;
  notes?: string | null;
}

export interface UpsertPlanningAllocationInput {
  allocationId?: UUID | null;
  budgetPeriodId: UUID;
  categoryId: UUID;
  plannedMinor: number;
  rollover?: boolean;
}

export interface UpsertPlanningGoalInput {
  goalId?: UUID | null;
  name: string;
  kind: PlanningGoalKind;
  targetMinor: number;
  currencyCode?: string;
  targetDate?: string | null;
  linkedAccountId?: UUID | null;
  plannedContributionMinor?: number | null;
  note?: string | null;
  status?: PlanningGoalStatus;
}
