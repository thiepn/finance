import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BudgetPeriodKind,
  PlanningDashboard,
  PlanningGoalMovementKind,
  PlanningGoalStatus,
  UpsertPlanningAllocationInput,
  UpsertPlanningGoalInput,
} from "../domain/planning.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export type PlanningLoadState =
  | "loading"
  | "ready"
  | "unconfigured"
  | "unauthenticated"
  | "error";

export interface PlanningWorkspace {
  state: PlanningLoadState;
  dashboard: PlanningDashboard | null;
  error: string | null;
  actionError: string | null;
  busyKey: string | null;
  refresh(): Promise<void>;
  setupBudget(input: {
    name: string;
    periodKind: BudgetPeriodKind;
    plannedIncomeMinor: number | null;
  }): Promise<void>;
  updatePlannedIncome(plannedIncomeMinor: number | null): Promise<void>;
  saveAllocation(input: UpsertPlanningAllocationInput): Promise<void>;
  deleteAllocation(allocationId: string): Promise<void>;
  saveGoal(input: UpsertPlanningGoalInput): Promise<void>;
  addGoalMovement(
    goalId: string,
    amountMinor: number,
    movementKind: PlanningGoalMovementKind,
    note?: string | null,
  ): Promise<void>;
  setGoalStatus(
    goalId: string,
    status: PlanningGoalStatus,
  ): Promise<void>;
}

export function usePlanningWorkspace(): PlanningWorkspace {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] = useState<PlanningLoadState>(
    runtime ? "loading" : "unconfigured",
  );
  const [dashboard, setDashboard] =
    useState<PlanningDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!runtime) {
      setState("unconfigured");
      setDashboard(null);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setState("loading");
    setError(null);

    const session = await runtime.client.auth.getSession();
    if (id !== requestId.current) return;

    if (session.error) {
      setState("error");
      setDashboard(null);
      setError(session.error.message);
      return;
    }

    if (!session.data.session) {
      setState("unauthenticated");
      setDashboard(null);
      return;
    }

    try {
      await runtime.recurring.syncPatterns(
        null,
        new Date().toISOString(),
      );
      const next = await runtime.planning.getDashboard();
      if (id !== requestId.current) return;
      setDashboard(next);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setDashboard(null);
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Planning data could not be loaded.",
      );
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key);
      setActionError(null);
      try {
        await action();
        await refresh();
      } catch (cause) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Planning action failed.",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [refresh],
  );

  const setupBudget = useCallback(
    async (input: {
      name: string;
      periodKind: BudgetPeriodKind;
      plannedIncomeMinor: number | null;
    }) => {
      if (!runtime) return;
      await runAction("budget:setup", async () => {
        const budgetId = await runtime.planning.upsertBudget({
          name: input.name,
          periodKind: input.periodKind,
          isActive: true,
        });
        await runtime.planning.ensureBudgetPeriod(
          budgetId,
          null,
          input.plannedIncomeMinor,
        );
      });
    },
    [runAction, runtime],
  );

  const updatePlannedIncome = useCallback(
    async (plannedIncomeMinor: number | null) => {
      if (!runtime || !dashboard?.budget.periodId || !dashboard.budget.budgetId) {
        return;
      }
      const budget = dashboard.budget;
      if (!budget.startsOn || !budget.endsOn) return;

      await runAction("budget:income", async () => {
        await runtime.planning.upsertBudgetPeriod({
          periodId: budget.periodId,
          budgetId: budget.budgetId!,
          startsOn: budget.startsOn!,
          endsOn: budget.endsOn!,
          plannedIncomeMinor,
        });
      });
    },
    [dashboard, runAction, runtime],
  );

  const saveAllocation = useCallback(
    async (input: UpsertPlanningAllocationInput) => {
      if (!runtime) return;
      await runAction(
        `allocation:${input.allocationId ?? "new"}`,
        async () => {
          await runtime.planning.upsertAllocation(input);
        },
      );
    },
    [runAction, runtime],
  );

  const deleteAllocation = useCallback(
    async (allocationId: string) => {
      if (!runtime) return;
      await runAction(`allocation:${allocationId}`, async () => {
        await runtime.planning.deleteAllocation(allocationId);
      });
    },
    [runAction, runtime],
  );

  const saveGoal = useCallback(
    async (input: UpsertPlanningGoalInput) => {
      if (!runtime) return;
      await runAction(
        `goal:${input.goalId ?? "new"}`,
        async () => {
          await runtime.planning.upsertGoal(input);
        },
      );
    },
    [runAction, runtime],
  );

  const addGoalMovement = useCallback(
    async (
      goalId: string,
      amountMinor: number,
      movementKind: PlanningGoalMovementKind,
      note: string | null = null,
    ) => {
      if (!runtime) return;
      await runAction(`goal:${goalId}`, async () => {
        await runtime.planning.addGoalMovement(
          goalId,
          amountMinor,
          movementKind,
          null,
          note,
        );
      });
    },
    [runAction, runtime],
  );

  const setGoalStatus = useCallback(
    async (goalId: string, status: PlanningGoalStatus) => {
      if (!runtime) return;
      await runAction(`goal:${goalId}`, async () => {
        await runtime.planning.setGoalStatus(goalId, status);
      });
    },
    [runAction, runtime],
  );

  return {
    state,
    dashboard,
    error,
    actionError,
    busyKey,
    refresh,
    setupBudget,
    updatePlannedIncome,
    saveAllocation,
    deleteAllocation,
    saveGoal,
    addGoalMovement,
    setGoalStatus,
  };
}
