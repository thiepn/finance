import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import type {
  BudgetPeriodKind,
  PlanningAllocation,
  PlanningDashboard,
  PlanningGoal,
  PlanningGoalKind,
} from "../domain/planning.js";
import {
  Badge,
  Button,
  Money,
  ProgressBar,
  Skeleton,
  StatCard,
  Surface,
} from "../ui/components/Primitives.js";
import {
  ChartFrame,
  FinanceChartTable,
} from "../ui/charts/ChartFrame.js";
import { FinanceLineChart } from "../ui/charts/FinanceCharts.js";
import type {
  ChartViewMode,
  FinanceChartDatum,
  FinanceChartSeries,
} from "../ui/charts/chart-types.js";
import {
  formatMoneyMinor,
  formatPercent,
} from "../ui/format/money.js";
import { Icon } from "../ui/icons/Icon.js";
import { usePlanningWorkspace } from "./use-planning.js";

export type PlanningPageMode = "budget" | "goals";

function toMinor(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function fromMinor(value: number | null): string {
  if (value === null) return "";
  return (value / 100).toFixed(2);
}

function formatDate(
  value: string | null,
  dashboard: PlanningDashboard,
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(dashboard.profile.locale, {
    dateStyle: "medium",
    timeZone: dashboard.profile.timeZone,
  }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`));
}

function budgetStatusTone(
  status: PlanningDashboard["budget"]["status"],
): "positive" | "negative" | "warning" | "accent" | "neutral" {
  switch (status) {
    case "on_track":
      return "positive";
    case "over":
    case "at_risk":
    case "overplanned":
      return "negative";
    case "needs_allocations":
      return "warning";
    default:
      return "neutral";
  }
}

function allocationTone(
  status: PlanningAllocation["status"],
): "accent" | "positive" | "warning" | "negative" {
  if (status === "over") return "negative";
  if (status === "at_risk" || status === "watch") return "warning";
  if (status === "on_track") return "positive";
  return "accent";
}

function goalTone(
  goal: PlanningGoal,
): "accent" | "positive" | "warning" | "negative" | "neutral" {
  if (goal.health === "funded" || goal.status === "completed") return "positive";
  if (goal.health === "overdue") return "negative";
  if (goal.health === "needs_more") return "warning";
  if (goal.status !== "active") return "neutral";
  return "accent";
}

function goalHealthLabel(goal: PlanningGoal): string {
  return {
    funded: "Funded",
    overdue: "Overdue",
    needs_more: "Needs more",
    on_track: "On track",
    no_schedule: "No schedule",
    paused: "Paused",
    completed: "Completed",
    cancelled: "Cancelled",
  }[goal.health];
}

function PlanningLoading() {
  return (
    <div className="f-planning">
      <div className="f-planning-heading">
        <div>
          <Skeleton className="f-overview-skeleton--short" />
          <Skeleton className="f-overview-skeleton--title" />
        </div>
      </div>
      <div className="f-overview-stats">
        {Array.from({ length: 4 }).map((_, index) => (
          <Surface key={index}>
            <Skeleton className="f-overview-skeleton--short" />
            <Skeleton className="f-overview-skeleton--value" />
          </Surface>
        ))}
      </div>
      <Surface>
        <Skeleton className="f-overview-skeleton--panel" />
      </Surface>
    </div>
  );
}

function BudgetSetup({
  dashboard,
  busy,
  onSetup,
}: {
  dashboard: PlanningDashboard;
  busy: boolean;
  onSetup: (input: {
    name: string;
    periodKind: BudgetPeriodKind;
    plannedIncomeMinor: number | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(
    dashboard.budget.budgetName ?? "Monthly plan",
  );
  const [periodKind, setPeriodKind] =
    useState<BudgetPeriodKind>(
      dashboard.budget.periodKind ?? "monthly",
    );
  const [income, setIncome] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSetup({
      name,
      periodKind,
      plannedIncomeMinor: toMinor(income),
    });
  };

  return (
    <Surface className="f-planning-setup">
      <div className="f-route-foundation__icon">
        <Icon name="plan" size={22} />
      </div>
      <Badge tone="accent">Set up your plan</Badge>
      <h2>Create the active budget period</h2>
      <p>
        Start with expected income and a cadence. Category limits,
        recurring commitments, rollover and sinking funds can then
        be layered onto the period.
      </p>

      <form className="f-planning-form" onSubmit={submit}>
        <label>
          <span>Plan name</span>
          <input
            maxLength={120}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            value={name}
          />
        </label>

        <label>
          <span>Cadence</span>
          <select
            onChange={(event) =>
              setPeriodKind(
                event.currentTarget.value as BudgetPeriodKind,
              )
            }
            value={periodKind}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>

        <label>
          <span>Expected income</span>
          <div className="f-planning-money-input">
            <span>{dashboard.profile.currencyCode}</span>
            <input
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setIncome(event.currentTarget.value)
              }
              placeholder="0.00"
              step="0.01"
              type="number"
              value={income}
            />
          </div>
        </label>

        <Button disabled={busy} type="submit" variant="primary">
          {busy ? "Creating…" : "Create plan"}
        </Button>
      </form>
    </Surface>
  );
}

function IncomeEditor({
  dashboard,
  busy,
  onSave,
}: {
  dashboard: PlanningDashboard;
  busy: boolean;
  onSave: (amount: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState(
    fromMinor(dashboard.budget.plannedIncomeMinor),
  );

  useEffect(() => {
    setValue(fromMinor(dashboard.budget.plannedIncomeMinor));
  }, [dashboard.budget.plannedIncomeMinor]);

  return (
    <form
      className="f-planning-inline-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(toMinor(value));
      }}
    >
      <label>
        <span>Planned income</span>
        <div className="f-planning-money-input">
          <span>{dashboard.profile.currencyCode}</span>
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) =>
              setValue(event.currentTarget.value)
            }
            step="0.01"
            type="number"
            value={value}
          />
        </div>
      </label>
      <Button disabled={busy} size="sm" type="submit">
        Save income
      </Button>
    </form>
  );
}

function AllocationRow({
  allocation,
  dashboard,
  busy,
  onSave,
  onDelete,
}: {
  allocation: PlanningAllocation;
  dashboard: PlanningDashboard;
  busy: boolean;
  onSave: (allocation: PlanningAllocation, amount: number, rollover: boolean) => Promise<void>;
  onDelete: (allocationId: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(
    fromMinor(allocation.plannedMinor),
  );
  const [rollover, setRollover] = useState(allocation.rollover);

  useEffect(() => {
    setAmount(fromMinor(allocation.plannedMinor));
    setRollover(allocation.rollover);
  }, [allocation.plannedMinor, allocation.rollover]);

  const utilization = allocation.effectivePlannedMinor > 0
    ? Math.max(0, allocation.spentMinor / allocation.effectivePlannedMinor)
    : 0;

  return (
    <div className="f-planning-allocation">
      <div className="f-planning-allocation__identity">
        <div className="f-planning-allocation__badges">
          <Badge tone={allocationTone(allocation.status)}>
            {allocation.status.replace("_", " ")}
          </Badge>
          {allocation.rollover ? (
            <Badge tone="neutral">Rollover</Badge>
          ) : null}
        </div>
        <strong>{allocation.categoryName}</strong>
        <small>{allocation.categoryPath.join(" › ")}</small>
      </div>

      <div className="f-planning-allocation__progress">
        <ProgressBar
          detail={
            formatMoneyMinor(
              allocation.spentMinor,
              dashboard.profile.currencyCode,
              { locale: dashboard.profile.locale },
            ) +
            " of " +
            formatMoneyMinor(
              allocation.effectivePlannedMinor,
              dashboard.profile.currencyCode,
              { locale: dashboard.profile.locale },
            )
          }
          label="Used"
          tone={allocationTone(allocation.status)}
          value={utilization}
        />
        <div className="f-planning-allocation__facts">
          <span>
            Remaining{" "}
            <Money
              amountMinor={allocation.remainingMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
            />
          </span>
          <span>
            Projected{" "}
            <Money
              amountMinor={allocation.projectedSpendMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
            />
          </span>
          {allocation.carryInMinor !== 0 ? (
            <span>
              Carry{" "}
              <Money
                amountMinor={allocation.carryInMinor}
                currencyCode={dashboard.profile.currencyCode}
                locale={dashboard.profile.locale}
                showSign
              />
            </span>
          ) : null}
        </div>
      </div>

      <form
        className="f-planning-allocation__edit"
        onSubmit={(event) => {
          event.preventDefault();
          const planned = toMinor(amount);
          if (planned === null) return;
          void onSave(allocation, planned, rollover);
        }}
      >
        <div className="f-planning-money-input">
          <span>{dashboard.profile.currencyCode}</span>
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) =>
              setAmount(event.currentTarget.value)
            }
            step="0.01"
            type="number"
            value={amount}
          />
        </div>
        <label className="f-planning-checkbox">
          <input
            checked={rollover}
            onChange={(event) =>
              setRollover(event.currentTarget.checked)
            }
            type="checkbox"
          />
          <span>Roll over</span>
        </label>
        <Button disabled={busy} size="sm" type="submit">
          Save
        </Button>
        <Button
          disabled={busy}
          onClick={() => void onDelete(allocation.allocationId)}
          size="sm"
          variant="ghost"
        >
          Remove
        </Button>
      </form>
    </div>
  );
}

function AddAllocation({
  dashboard,
  busy,
  onSave,
}: {
  dashboard: PlanningDashboard;
  busy: boolean;
  onSave: (input: {
    categoryId: string;
    plannedMinor: number;
    rollover: boolean;
  }) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [rollover, setRollover] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const plannedMinor = toMinor(amount);
    if (!categoryId || plannedMinor === null) return;
    void onSave({ categoryId, plannedMinor, rollover });
    setAmount("");
  };

  return (
    <form className="f-planning-add-row" onSubmit={submit}>
      <label>
        <span>Category</span>
        <select
          onChange={(event) =>
            setCategoryId(event.currentTarget.value)
          }
          required
          value={categoryId}
        >
          <option value="">Choose category…</option>
          {dashboard.availableCategories.map((category) => (
            <option
              key={category.categoryId}
              value={category.categoryId}
            >
              {"— ".repeat(category.depth)}
              {category.path.join(" › ")}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Planned amount</span>
        <div className="f-planning-money-input">
          <span>{dashboard.profile.currencyCode}</span>
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) =>
              setAmount(event.currentTarget.value)
            }
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </div>
      </label>

      <label className="f-planning-checkbox f-planning-checkbox--field">
        <input
          checked={rollover}
          onChange={(event) =>
            setRollover(event.currentTarget.checked)
          }
          type="checkbox"
        />
        <span>Carry remaining balance forward</span>
      </label>

      <Button disabled={busy} type="submit" variant="secondary">
        Add allocation
      </Button>
    </form>
  );
}

function GoalCard({
  goal,
  dashboard,
  busy,
  onMovement,
  onStatus,
}: {
  goal: PlanningGoal;
  dashboard: PlanningDashboard;
  busy: boolean;
  onMovement: (
    goalId: string,
    amountMinor: number,
    kind: "contribution" | "withdrawal",
  ) => Promise<void>;
  onStatus: (
    goalId: string,
    status: "active" | "paused" | "completed" | "cancelled",
  ) => Promise<void>;
}) {
  const [movement, setMovement] = useState("");

  const submitMovement = (
    kind: "contribution" | "withdrawal",
  ) => {
    const amount = toMinor(movement);
    if (!amount || amount <= 0) return;
    void onMovement(goal.goalId, amount, kind);
    setMovement("");
  };

  return (
    <Surface className="f-planning-goal" density="compact">
      <div className="f-planning-goal__top">
        <div>
          <div className="f-planning-allocation__badges">
            <Badge tone={goalTone(goal)}>
              {goalHealthLabel(goal)}
            </Badge>
            <Badge tone="neutral">
              {goal.kind === "sinking_fund"
                ? "Sinking fund"
                : "Savings"}
            </Badge>
          </div>
          <h3>{goal.name}</h3>
          <p>
            {goal.targetDate
              ? "Target " + formatDate(goal.targetDate, dashboard)
              : "No target date"}
            {goal.linkedAccountName
              ? " · " + goal.linkedAccountName
              : ""}
          </p>
        </div>
        <div className="f-planning-goal__amount">
          <Money
            amountMinor={goal.fundedMinor}
            currencyCode={goal.currencyCode}
            locale={dashboard.profile.locale}
          />
          <span>
            of{" "}
            {formatMoneyMinor(
              goal.targetMinor,
              goal.currencyCode,
              { locale: dashboard.profile.locale },
            )}
          </span>
        </div>
      </div>

      <ProgressBar
        detail={formatPercent(
          goal.progressRatio,
          dashboard.profile.locale,
          0,
        )}
        label="Funded"
        tone={
          goal.health === "funded"
            ? "positive"
            : goal.health === "overdue"
              ? "negative"
              : goal.health === "needs_more"
                ? "warning"
                : "accent"
        }
        value={goal.progressRatio}
      />

      <div className="f-planning-goal__facts">
        <span>
          Remaining{" "}
          <Money
            amountMinor={goal.remainingMinor}
            currencyCode={goal.currencyCode}
            locale={dashboard.profile.locale}
          />
        </span>
        <span>
          This period{" "}
          <Money
            amountMinor={goal.periodRemainingMinor}
            currencyCode={goal.currencyCode}
            locale={dashboard.profile.locale}
          />{" "}
          left
        </span>
        {goal.requiredMonthlyMinor > 0 ? (
          <span>
            Required pace{" "}
            <Money
              amountMinor={goal.requiredMonthlyMinor}
              currencyCode={goal.currencyCode}
              locale={dashboard.profile.locale}
            />{" "}
            / month
          </span>
        ) : null}
      </div>

      <div className="f-planning-goal__actions">
        <div className="f-planning-money-input">
          <span>{goal.currencyCode}</span>
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) =>
              setMovement(event.currentTarget.value)
            }
            placeholder="0.00"
            step="0.01"
            type="number"
            value={movement}
          />
        </div>
        <Button
          disabled={busy || goal.status !== "active"}
          onClick={() => submitMovement("contribution")}
          size="sm"
          variant="primary"
        >
          Fund
        </Button>
        <Button
          disabled={
            busy ||
            goal.status !== "active" ||
            goal.fundedMinor <= 0
          }
          onClick={() => submitMovement("withdrawal")}
          size="sm"
          variant="secondary"
        >
          Withdraw
        </Button>

        {goal.status === "active" ? (
          <Button
            disabled={busy}
            onClick={() =>
              void onStatus(goal.goalId, "paused")
            }
            size="sm"
            variant="ghost"
          >
            Pause
          </Button>
        ) : goal.status === "paused" ? (
          <Button
            disabled={busy}
            onClick={() =>
              void onStatus(goal.goalId, "active")
            }
            size="sm"
            variant="ghost"
          >
            Resume
          </Button>
        ) : null}
      </div>
    </Surface>
  );
}

function CreateGoal({
  dashboard,
  busy,
  onSave,
}: {
  dashboard: PlanningDashboard;
  busy: boolean;
  onSave: (input: {
    name: string;
    kind: PlanningGoalKind;
    targetMinor: number;
    targetDate: string | null;
    plannedContributionMinor: number | null;
    linkedAccountId: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] =
    useState<PlanningGoalKind>("sinking_fund");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [monthly, setMonthly] = useState("");
  const [accountId, setAccountId] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const targetMinor = toMinor(target);
    if (!name.trim() || !targetMinor || targetMinor <= 0) return;

    void onSave({
      name: name.trim(),
      kind,
      targetMinor,
      targetDate: targetDate || null,
      plannedContributionMinor: toMinor(monthly),
      linkedAccountId: accountId || null,
    });

    setName("");
    setTarget("");
    setTargetDate("");
    setMonthly("");
  };

  return (
    <Surface className="f-planning-create-goal">
      <div className="f-section-heading">
        <div>
          <span className="f-section-heading__kicker">
            New fund
          </span>
          <h2>Create savings or sinking fund</h2>
        </div>
      </div>

      <form className="f-planning-goal-form" onSubmit={submit}>
        <label>
          <span>Name</span>
          <input
            maxLength={160}
            onChange={(event) =>
              setName(event.currentTarget.value)
            }
            placeholder="Annual insurance"
            required
            value={name}
          />
        </label>

        <label>
          <span>Type</span>
          <select
            onChange={(event) =>
              setKind(
                event.currentTarget.value as PlanningGoalKind,
              )
            }
            value={kind}
          >
            <option value="sinking_fund">Sinking fund</option>
            <option value="savings">Savings goal</option>
          </select>
        </label>

        <label>
          <span>Target amount</span>
          <div className="f-planning-money-input">
            <span>{dashboard.profile.currencyCode}</span>
            <input
              inputMode="decimal"
              min="0.01"
              onChange={(event) =>
                setTarget(event.currentTarget.value)
              }
              required
              step="0.01"
              type="number"
              value={target}
            />
          </div>
        </label>

        <label>
          <span>Target date</span>
          <input
            onChange={(event) =>
              setTargetDate(event.currentTarget.value)
            }
            type="date"
            value={targetDate}
          />
        </label>

        <label>
          <span>Planned monthly funding</span>
          <div className="f-planning-money-input">
            <span>{dashboard.profile.currencyCode}</span>
            <input
              inputMode="decimal"
              min="0"
              onChange={(event) =>
                setMonthly(event.currentTarget.value)
              }
              placeholder="Automatic if omitted"
              step="0.01"
              type="number"
              value={monthly}
            />
          </div>
        </label>

        <label>
          <span>Linked account</span>
          <select
            onChange={(event) =>
              setAccountId(event.currentTarget.value)
            }
            value={accountId}
          >
            <option value="">None</option>
            {dashboard.availableAccounts.map((account) => (
              <option
                key={account.accountId}
                value={account.accountId}
              >
                {account.name} · {account.currencyCode}
              </option>
            ))}
          </select>
        </label>

        <Button disabled={busy} type="submit" variant="primary">
          Create fund
        </Button>
      </form>
    </Surface>
  );
}

export interface PlanningPageProps {
  mode: PlanningPageMode;
  onNavigate: (key: string) => void;
}

export function PlanningPage({
  mode,
  onNavigate,
}: PlanningPageProps) {
  const workspace = usePlanningWorkspace();
  const [forecastView, setForecastView] =
    useState<ChartViewMode>("chart");

  if (workspace.state === "loading") {
    return <PlanningLoading />;
  }

  if (
    workspace.state !== "ready" ||
    !workspace.dashboard
  ) {
    return (
      <div className="f-overview-empty">
        <Surface>
          <div className="f-route-foundation__icon">
            <Icon
              name={
                workspace.state === "error"
                  ? "alert"
                  : "plan"
              }
              size={22}
            />
          </div>
          <Badge tone="accent">Planning</Badge>
          <h1>
            {workspace.state === "unauthenticated"
              ? "A Finance session is required."
              : workspace.state === "unconfigured"
                ? "Finance backend is not configured."
                : "Planning could not be loaded."}
          </h1>
          <p>{workspace.error ?? "Planning data is unavailable."}</p>
          {workspace.state === "error" ? (
            <Button
              onClick={() => void workspace.refresh()}
              variant="primary"
            >
              Retry
            </Button>
          ) : null}
        </Surface>
      </div>
    );
  }

  const dashboard = workspace.dashboard;
  const budget = dashboard.budget;

  const goalTotals = dashboard.goals.reduce(
    (acc, goal) => {
      acc.target += goal.targetMinor;
      acc.funded += goal.fundedMinor;
      acc.periodRemaining +=
        goal.status === "active"
          ? goal.periodRemainingMinor
          : 0;
      if (goal.kind === "sinking_fund") acc.sinking += 1;
      return acc;
    },
    {
      target: 0,
      funded: 0,
      periodRemaining: 0,
      sinking: 0,
    },
  );

  const forecastData: FinanceChartDatum[] =
    dashboard.forecast.map((point) => ({
      key: String(point.bucketIndex),
      label: new Intl.DateTimeFormat(
        dashboard.profile.locale,
        {
          day: "numeric",
          month: "short",
          timeZone: dashboard.profile.timeZone,
        },
      ).format(new Date(point.bucketStart)),
      actual: point.actualCumulativeMinor,
      forecast: point.forecastCumulativeMinor,
      plan: point.plannedCumulativeMinor,
    }));

  const forecastSeries: FinanceChartSeries[] = [
    {
      dataKey: "actual",
      label: "Actual",
      tone: "primary",
    },
    {
      dataKey: "forecast",
      label: "Forecast",
      tone: "secondary",
      comparison: true,
    },
    {
      dataKey: "plan",
      label: "Plan",
      tone: "tertiary",
      comparison: true,
    },
  ];

  const goalSection = (
    <div className="f-planning-goals-stack">
      <Surface>
        <div className="f-section-heading">
          <div>
            <span className="f-section-heading__kicker">
              Reserved money
            </span>
            <h2>Savings & sinking funds</h2>
          </div>
          <Badge tone="neutral">
            {dashboard.goals.length} fund
            {dashboard.goals.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {dashboard.goals.length === 0 ? (
          <div className="f-overview-inline-empty">
            No savings goals or sinking funds yet.
          </div>
        ) : (
          <div className="f-planning-goal-grid">
            {dashboard.goals.map((goal) => (
              <GoalCard
                busy={
                  workspace.busyKey === `goal:${goal.goalId}`
                }
                dashboard={dashboard}
                goal={goal}
                key={goal.goalId}
                onMovement={async (goalId, amount, kind) =>
                  workspace.addGoalMovement(
                    goalId,
                    amount,
                    kind,
                  )
                }
                onStatus={workspace.setGoalStatus}
              />
            ))}
          </div>
        )}
      </Surface>

      <CreateGoal
        busy={workspace.busyKey === "goal:new"}
        dashboard={dashboard}
        onSave={async (input) =>
          workspace.saveGoal({
            ...input,
            currencyCode: dashboard.profile.currencyCode,
            status: "active",
          })
        }
      />
    </div>
  );

  return (
    <div className="f-planning">
      <div className="f-planning-heading">
        <div>
          <div className="f-planning-heading__meta">
            <Badge tone="accent">
              {mode === "goals" ? "Funds" : "Planning"}
            </Badge>
            <span>
              Ledger truth · recurring commitments · reserved goals
            </span>
          </div>
          <h1>
            {mode === "goals"
              ? "Goals & sinking funds"
              : "Budget & forecast"}
          </h1>
          <p>
            {mode === "goals"
              ? "Earmark money for known future costs and savings targets without treating transfers into those funds as spending."
              : "Plan the current period, carry balances forward intentionally, and forecast what remains after known recurring charges and goal funding."}
          </p>
        </div>

        <div className="f-planning-heading__actions">
          <Button
            icon={mode === "goals" ? "plan" : "goals"}
            onClick={() =>
              onNavigate(mode === "goals" ? "budget" : "goals")
            }
            variant="secondary"
          >
            {mode === "goals" ? "Open budget" : "Open goals"}
          </Button>
          {budget.configured ? (
            <Badge tone={budgetStatusTone(budget.status)}>
              {budget.status.replace("_", " ")}
            </Badge>
          ) : null}
        </div>
      </div>

      {workspace.actionError ? (
        <Surface className="f-planning-action-error">
          <Badge tone="negative">Action failed</Badge>
          <span>{workspace.actionError}</span>
        </Surface>
      ) : null}

      {mode === "goals" ? (
        <>
          <div className="f-overview-stats">
            <StatCard
              label="Funded"
              supporting="Across all goals"
              value={
                <Money
                  amountMinor={goalTotals.funded}
                  currencyCode={dashboard.profile.currencyCode}
                  locale={dashboard.profile.locale}
                />
              }
            />
            <StatCard
              label="Target"
              supporting="Total earmarked target"
              value={
                <Money
                  amountMinor={goalTotals.target}
                  currencyCode={dashboard.profile.currencyCode}
                  locale={dashboard.profile.locale}
                />
              }
            />
            <StatCard
              label="Still fund this period"
              supporting="Reserved before safe-to-spend"
              value={
                <Money
                  amountMinor={goalTotals.periodRemaining}
                  currencyCode={dashboard.profile.currencyCode}
                  locale={dashboard.profile.locale}
                />
              }
            />
            <StatCard
              label="Sinking funds"
              supporting="Known future costs"
              value={
                <span className="f-tabular">
                  {goalTotals.sinking}
                </span>
              }
            />
          </div>
          {goalSection}
        </>
      ) : !budget.configured ? (
        <>
          <BudgetSetup
            busy={workspace.busyKey === "budget:setup"}
            dashboard={dashboard}
            onSetup={workspace.setupBudget}
          />
          {goalSection}
        </>
      ) : (
        <>
          <div className="f-overview-stats">
            <StatCard
              emphasis
              label="Safe to spend"
              supporting="After current spend, remaining recurring commitments and this period’s goal funding"
              trend={
                <Badge tone={budgetStatusTone(budget.status)}>
                  {budget.status.replace("_", " ")}
                </Badge>
              }
              value={
                <Money
                  amountMinor={budget.safeToSpendMinor ?? 0}
                  currencyCode={dashboard.profile.currencyCode}
                  locale={dashboard.profile.locale}
                  tone={
                    (budget.safeToSpendMinor ?? 0) < 0
                      ? "negative"
                      : "default"
                  }
                />
              }
            />
            <StatCard
              label="Budget remaining"
              supporting={
                "Includes " +
                formatMoneyMinor(
                  budget.carryInMinor ?? 0,
                  dashboard.profile.currencyCode,
                  { locale: dashboard.profile.locale },
                ) +
                " rollover"
              }
              value={
                <Money
                  amountMinor={budget.remainingMinor ?? 0}
                  currencyCode={dashboard.profile.currencyCode}
                  locale={dashboard.profile.locale}
                />
              }
            />
            <StatCard
              label="Projected spend"
              supporting={
                budget.effectivePlannedMinor
                  ? formatPercent(
                      (budget.projectedSpendMinor ?? 0) /
                        Math.max(
                          budget.effectivePlannedMinor,
                          1,
                        ),
                      dashboard.profile.locale,
                      0,
                    ) + " of effective plan"
                  : "No category plan yet"
              }
              value={
                <Money
                  amountMinor={budget.projectedSpendMinor ?? 0}
                  currencyCode={dashboard.profile.currencyCode}
                  locale={dashboard.profile.locale}
                />
              }
            />
            <StatCard
              label="Goal funding left"
              supporting="Reserved this period"
              value={
                <Money
                  amountMinor={
                    budget.goalFundingRemainingMinor ?? 0
                  }
                  currencyCode={dashboard.profile.currencyCode}
                  locale={dashboard.profile.locale}
                />
              }
            />
          </div>

          <Surface>
            <div className="f-section-heading">
              <div>
                <span className="f-section-heading__kicker">
                  Active period
                </span>
                <h2>{budget.budgetName}</h2>
                <p className="f-planning-section-note">
                  {budget.startsOn} – {budget.endsOn} ·{" "}
                  {budget.periodKind}
                </p>
              </div>
              <IncomeEditor
                busy={workspace.busyKey === "budget:income"}
                dashboard={dashboard}
                onSave={workspace.updatePlannedIncome}
              />
            </div>
          </Surface>

          <Surface>
            <ChartFrame
              description="Forecast separates scheduled recurring charges from variable spending pace. Goal funding is reserved separately from consumption."
              eyebrow="Period forecast"
              onViewModeChange={setForecastView}
              summary={
                <div className="f-planning-forecast-summary">
                  <div>
                    <span>Actual spend</span>
                    <strong>
                      {formatMoneyMinor(
                        budget.actualSpendMinor ?? 0,
                        dashboard.profile.currencyCode,
                        { locale: dashboard.profile.locale },
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Recurring still due</span>
                    <strong>
                      {formatMoneyMinor(
                        budget.futureRecurringExpenseMinor ?? 0,
                        dashboard.profile.currencyCode,
                        { locale: dashboard.profile.locale },
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Projected surplus</span>
                    <strong>
                      {formatMoneyMinor(
                        budget.projectedSurplusMinor ?? 0,
                        dashboard.profile.currencyCode,
                        { locale: dashboard.profile.locale },
                      )}
                    </strong>
                  </div>
                </div>
              }
              title="Actual vs forecast vs plan"
              viewMode={forecastView}
            >
              {forecastView === "chart" ? (
                <FinanceLineChart
                  ariaLabel="Budget period cumulative spending forecast"
                  data={forecastData}
                  onDatumActivate={() => onNavigate("activity")}
                  series={forecastSeries}
                  tickFormatter={(value) =>
                    new Intl.NumberFormat(
                      dashboard.profile.locale,
                      {
                        style: "currency",
                        currency: dashboard.profile.currencyCode,
                        notation: "compact",
                        maximumFractionDigits: 1,
                      },
                    ).format(value / 100)
                  }
                  valueFormatter={(value) =>
                    formatMoneyMinor(
                      value,
                      dashboard.profile.currencyCode,
                      { locale: dashboard.profile.locale },
                    )
                  }
                />
              ) : (
                <FinanceChartTable
                  data={forecastData}
                  onDatumActivate={() => onNavigate("activity")}
                  series={forecastSeries}
                  valueFormatter={(value) =>
                    formatMoneyMinor(
                      value,
                      dashboard.profile.currencyCode,
                      { locale: dashboard.profile.locale },
                    )
                  }
                />
              )}
            </ChartFrame>
          </Surface>

          <Surface>
            <div className="f-section-heading">
              <div>
                <span className="f-section-heading__kicker">
                  Category plan
                </span>
                <h2>Allocations</h2>
              </div>
              <div className="f-planning-summary-chips">
                <Badge tone="neutral">
                  Base{" "}
                  {formatMoneyMinor(
                    budget.basePlannedMinor ?? 0,
                    dashboard.profile.currencyCode,
                    { locale: dashboard.profile.locale },
                  )}
                </Badge>
                <Badge tone="neutral">
                  Effective{" "}
                  {formatMoneyMinor(
                    budget.effectivePlannedMinor ?? 0,
                    dashboard.profile.currencyCode,
                    { locale: dashboard.profile.locale },
                  )}
                </Badge>
                {(budget.unallocatedPlanMinor ?? 0) !== 0 ? (
                  <Badge
                    tone={
                      (budget.unallocatedPlanMinor ?? 0) < 0
                        ? "negative"
                        : "accent"
                    }
                  >
                    Unassigned{" "}
                    {formatMoneyMinor(
                      budget.unallocatedPlanMinor ?? 0,
                      dashboard.profile.currencyCode,
                      { locale: dashboard.profile.locale },
                    )}
                  </Badge>
                ) : null}
              </div>
            </div>

            {dashboard.allocations.length === 0 ? (
              <div className="f-overview-inline-empty">
                No category allocations yet.
              </div>
            ) : (
              <div className="f-planning-allocation-list">
                {dashboard.allocations.map((allocation) => (
                  <AllocationRow
                    allocation={allocation}
                    busy={
                      workspace.busyKey ===
                      `allocation:${allocation.allocationId}`
                    }
                    dashboard={dashboard}
                    key={allocation.allocationId}
                    onDelete={workspace.deleteAllocation}
                    onSave={async (
                      current,
                      plannedMinor,
                      rollover,
                    ) => {
                      if (!budget.periodId) return;
                      await workspace.saveAllocation({
                        allocationId: current.allocationId,
                        budgetPeriodId: budget.periodId,
                        categoryId: current.categoryId,
                        plannedMinor,
                        rollover,
                      });
                    }}
                  />
                ))}
              </div>
            )}

            {budget.periodId ? (
              <AddAllocation
                busy={workspace.busyKey === "allocation:new"}
                dashboard={dashboard}
                onSave={async (input) =>
                  workspace.saveAllocation({
                    budgetPeriodId: budget.periodId!,
                    ...input,
                  })
                }
              />
            ) : null}
          </Surface>

          <div className="f-planning-grid">
            <Surface>
              <div className="f-section-heading">
                <div>
                  <span className="f-section-heading__kicker">
                    Reserved
                  </span>
                  <h2>Known commitments</h2>
                </div>
                <Badge tone="neutral">
                  {dashboard.commitments.length} remaining
                </Badge>
              </div>

              {dashboard.commitments.length === 0 ? (
                <div className="f-overview-inline-empty">
                  No known recurring commitments remain in this period.
                </div>
              ) : (
                <div className="f-planning-commitment-list">
                  {dashboard.commitments.map(
                    (commitment, index) => (
                      <button
                        className="f-planning-commitment"
                        key={
                          commitment.patternId +
                          commitment.expectedAt +
                          index
                        }
                        onClick={() => onNavigate("recurring")}
                        type="button"
                      >
                        <span>
                          <strong>
                            {formatDate(
                              commitment.expectedAt,
                              dashboard,
                            )}
                          </strong>
                          <small>
                            {commitment.transactionType}
                          </small>
                        </span>
                        <Money
                          amountMinor={commitment.amountMinor}
                          currencyCode={commitment.currencyCode}
                          locale={dashboard.profile.locale}
                        />
                        <Icon name="chevronRight" size={15} />
                      </button>
                    ),
                  )}
                </div>
              )}
            </Surface>

            <Surface>
              <div className="f-section-heading">
                <div>
                  <span className="f-section-heading__kicker">
                    Cash plan
                  </span>
                  <h2>Period reconciliation</h2>
                </div>
              </div>
              <div className="f-planning-reconciliation">
                <div>
                  <span>Planned income</span>
                  <Money
                    amountMinor={budget.plannedIncomeMinor ?? 0}
                    currencyCode={dashboard.profile.currencyCode}
                    locale={dashboard.profile.locale}
                  />
                </div>
                <div>
                  <span>Actual spend</span>
                  <Money
                    amountMinor={budget.actualSpendMinor ?? 0}
                    currencyCode={dashboard.profile.currencyCode}
                    locale={dashboard.profile.locale}
                  />
                </div>
                <div>
                  <span>Future recurring</span>
                  <Money
                    amountMinor={
                      budget.futureRecurringExpenseMinor ?? 0
                    }
                    currencyCode={dashboard.profile.currencyCode}
                    locale={dashboard.profile.locale}
                  />
                </div>
                <div>
                  <span>Goal funding left</span>
                  <Money
                    amountMinor={
                      budget.goalFundingRemainingMinor ?? 0
                    }
                    currencyCode={dashboard.profile.currencyCode}
                    locale={dashboard.profile.locale}
                  />
                </div>
                <div className="f-planning-reconciliation__total">
                  <strong>Safe to spend</strong>
                  <Money
                    amountMinor={budget.safeToSpendMinor ?? 0}
                    currencyCode={dashboard.profile.currencyCode}
                    locale={dashboard.profile.locale}
                  />
                </div>
              </div>
            </Surface>
          </div>

          {goalSection}
        </>
      )}
    </div>
  );
}
