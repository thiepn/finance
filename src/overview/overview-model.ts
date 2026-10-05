import type {
  OverviewAttentionCode,
  OverviewAttentionItem,
  OverviewDashboard,
  OverviewFinancialStatus,
  OverviewStatusCode,
} from "../domain/overview.js";

export type OverviewMetricKey =
  | "income"
  | "spending"
  | "cash_flow"
  | "savings_rate";

export type TrendTone = "positive" | "negative" | "neutral";

export interface OverviewTrend {
  delta: number;
  ratio: number | null;
  tone: TrendTone;
}

export interface OverviewStatusCopy {
  title: string;
  detail: string;
}

export interface AttentionCopy {
  title: string;
  detail: string;
  routeKey: "receipts" | "budget" | "activity";
}

export function ratioDelta(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function overviewMetricTrend(
  dashboard: OverviewDashboard,
  metric: OverviewMetricKey,
): OverviewTrend {
  if (metric === "income") {
    const delta =
      dashboard.summary.incomeMinor - dashboard.comparison.incomeMinor;
    return {
      delta,
      ratio: ratioDelta(
        dashboard.summary.incomeMinor,
        dashboard.comparison.incomeMinor,
      ),
      tone: delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
    };
  }

  if (metric === "spending") {
    const delta =
      dashboard.summary.netSpentMinor - dashboard.comparison.netSpentMinor;
    return {
      delta,
      ratio: ratioDelta(
        dashboard.summary.netSpentMinor,
        dashboard.comparison.netSpentMinor,
      ),
      tone: delta < 0 ? "positive" : delta > 0 ? "negative" : "neutral",
    };
  }

  if (metric === "cash_flow") {
    const delta =
      dashboard.summary.netCashFlowMinor -
      dashboard.comparison.netCashFlowMinor;
    return {
      delta,
      ratio: ratioDelta(
        dashboard.summary.netCashFlowMinor,
        dashboard.comparison.netCashFlowMinor,
      ),
      tone: delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
    };
  }

  const current = dashboard.summary.savingsRate;
  const previous = dashboard.comparison.savingsRate;

  if (current === null || previous === null) {
    return { delta: 0, ratio: null, tone: "neutral" };
  }

  const delta = current - previous;
  return {
    delta,
    ratio: ratioDelta(current, previous),
    tone: delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
  };
}

export function overviewStatusCopy(
  status: OverviewFinancialStatus,
  dashboard: OverviewDashboard,
): OverviewStatusCopy {
  const copy: Record<OverviewStatusCode, OverviewStatusCopy> = {
    on_track: {
      title: "On track",
      detail: "Current spending pace is within the configured plan.",
    },
    at_risk: {
      title: "Spending pace is above plan",
      detail:
        dashboard.planning.projectedSpendMinor === null
          ? "Current spending is running ahead of the period plan."
          : "At the current pace, projected spending is above the configured plan.",
    },
    over_plan: {
      title: "Plan exceeded",
      detail: "Budgeted spending is already above the configured period plan.",
    },
    positive_cash_flow: {
      title: "Positive cash flow",
      detail: "Income is currently above net spending for this period.",
    },
    negative_cash_flow: {
      title: "Negative cash flow",
      detail: "Net spending is currently above recorded income for this period.",
    },
    no_activity: {
      title: "No activity yet",
      detail: "No posted financial activity exists in the selected period.",
    },
  };

  return copy[status.code];
}

function attentionTitle(code: OverviewAttentionCode): string {
  const titles: Record<OverviewAttentionCode, string> = {
    receipt_processing_failed: "Receipt processing failed",
    receipt_ready_to_confirm: "Receipt ready to confirm",
    receipt_review_required: "Receipt needs review",
    receipt_match_suggested: "Suggested receipt match",
    receipt_unmatched: "Unmatched confirmed receipt",
    budget_over_plan: "Plan exceeded",
    budget_at_risk: "Spending pace above plan",
    unclassified_spending: "Spending needs classification",
  };
  return titles[code];
}

export function attentionCopy(item: OverviewAttentionItem): AttentionCopy {
  let detail: string;
  let routeKey: AttentionCopy["routeKey"];

  switch (item.code) {
    case "receipt_processing_failed":
      detail =
        item.detailCode === "incomplete"
          ? "Receipt capture is incomplete."
          : "The receipt pipeline could not finish processing.";
      routeKey = "receipts";
      break;
    case "receipt_ready_to_confirm":
      detail = "All blockers are resolved; final confirmation is available.";
      routeKey = "receipts";
      break;
    case "receipt_review_required":
      detail = `${item.detailCode} review issue${item.detailCode === "1" ? "" : "s"} remain.`;
      routeKey = "receipts";
      break;
    case "receipt_match_suggested":
      detail = item.detailCode
        ? `A transaction match is available at ${item.detailCode}% confidence.`
        : "A possible matching transaction is available.";
      routeKey = "receipts";
      break;
    case "receipt_unmatched":
      detail = "This confirmed receipt is not linked to a transaction yet.";
      routeKey = "receipts";
      break;
    case "budget_over_plan":
      detail = "Budgeted spending is already above the configured plan.";
      routeKey = "budget";
      break;
    case "budget_at_risk":
      detail = "Projected spending is above the configured plan.";
      routeKey = "budget";
      break;
    case "unclassified_spending":
      detail = "Some posted spending still has unclassified necessity.";
      routeKey = "activity";
      break;
  }

  return {
    title: attentionTitle(item.code),
    detail,
    routeKey,
  };
}
