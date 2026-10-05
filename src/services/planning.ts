import type {
  BudgetPeriodKind,
  PlanningDashboard,
  PlanningGoalMovementKind,
  PlanningGoalStatus,
  UpsertBudgetInput,
  UpsertBudgetPeriodInput,
  UpsertPlanningAllocationInput,
  UpsertPlanningGoalInput,
} from "../domain/planning.js";
import type { UUID } from "../domain/finance.js";

export interface FinancePlanningService {
  getDashboard(anchorDate?: string | null): Promise<PlanningDashboard>;

  upsertBudget(input: UpsertBudgetInput): Promise<UUID>;

  ensureBudgetPeriod(
    budgetId: UUID,
    anchorDate?: string | null,
    plannedIncomeMinor?: number | null,
  ): Promise<UUID>;

  upsertBudgetPeriod(input: UpsertBudgetPeriodInput): Promise<UUID>;

  upsertAllocation(
    input: UpsertPlanningAllocationInput,
  ): Promise<UUID>;

  deleteAllocation(allocationId: UUID): Promise<void>;

  upsertGoal(input: UpsertPlanningGoalInput): Promise<UUID>;

  addGoalMovement(
    goalId: UUID,
    amountMinor: number,
    movementKind: PlanningGoalMovementKind,
    occurredAt?: string | null,
    note?: string | null,
  ): Promise<UUID>;

  setGoalStatus(
    goalId: UUID,
    status: PlanningGoalStatus,
  ): Promise<void>;
}

export interface SetupPlanningBudgetInput {
  name: string;
  periodKind: BudgetPeriodKind;
  anchorDate?: string | null;
  plannedIncomeMinor?: number | null;
}
