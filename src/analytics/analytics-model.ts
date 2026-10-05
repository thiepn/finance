import type {
  AnalyticsChartRange,
  AnalyticsComparisonDatum,
  AnalyticsMetric,
  AnalyticsMetricDescriptor,
  AnalyticsPoint,
  AnalyticsTimeSeries,
} from "../domain/analytics.js";
import type { OverviewPeriodKind } from "../domain/overview.js";

const descriptors: Record<AnalyticsMetric, AnalyticsMetricDescriptor> = {
  net_spend: {
    key: "net_spend",
    label: "Net spending",
    shortLabel: "Spending",
    favorableDirection: "lower",
  },
  gross_spend: {
    key: "gross_spend",
    label: "Gross spending",
    shortLabel: "Gross",
    favorableDirection: "lower",
  },
  recoveries: {
    key: "recoveries",
    label: "Refunds & reimbursements",
    shortLabel: "Recoveries",
    favorableDirection: "neutral",
  },
  income: {
    key: "income",
    label: "Income",
    shortLabel: "Income",
    favorableDirection: "higher",
  },
  cash_flow: {
    key: "cash_flow",
    label: "Net cash flow",
    shortLabel: "Cash flow",
    favorableDirection: "higher",
  },
};

export function analyticsMetricDescriptor(
  metric: AnalyticsMetric,
): AnalyticsMetricDescriptor {
  return descriptors[metric];
}

export function analyticsMetricValue(
  point: AnalyticsPoint,
  metric: AnalyticsMetric,
): number {
  switch (metric) {
    case "net_spend":
      return point.netSpendMinor;
    case "gross_spend":
      return point.grossSpendMinor;
    case "recoveries":
      return point.recoveriesMinor;
    case "income":
      return point.incomeMinor;
    case "cash_flow":
      return point.cashFlowMinor;
  }
}

export function analyticsTotalValue(
  series: AnalyticsTimeSeries,
  period: "current" | "comparison",
  metric: AnalyticsMetric,
): number {
  const totals = series.totals[period];
  switch (metric) {
    case "net_spend":
      return totals.netSpendMinor;
    case "gross_spend":
      return totals.grossSpendMinor;
    case "recoveries":
      return totals.recoveriesMinor;
    case "income":
      return totals.incomeMinor;
    case "cash_flow":
      return totals.cashFlowMinor;
  }
}

export function recommendedAnalyticsRange(
  periodKind: OverviewPeriodKind,
): AnalyticsChartRange {
  switch (periodKind) {
    case "week":
      return { periodKind, bucketKind: "day" };
    case "month":
      return { periodKind, bucketKind: "day" };
    case "quarter":
      return { periodKind, bucketKind: "week" };
    case "year":
      return { periodKind, bucketKind: "month" };
  }
}

export function comparisonSeries(
  series: AnalyticsTimeSeries,
  metric: AnalyticsMetric,
): readonly AnalyticsComparisonDatum[] {
  const comparisonByIndex = new Map(
    series.comparison.map((point) => [point.bucketIndex, point]),
  );

  return series.current.map((current) => {
    const comparison = comparisonByIndex.get(current.bucketIndex);
    return {
      key: String(current.bucketIndex),
      index: current.bucketIndex,
      currentStart: current.bucketStart,
      comparisonStart: comparison?.bucketStart ?? null,
      current: analyticsMetricValue(current, metric),
      comparison: comparison
        ? analyticsMetricValue(comparison, metric)
        : null,
    };
  });
}

export function cumulativeMetric(
  points: readonly AnalyticsPoint[],
  metric: AnalyticsMetric,
): readonly number[] {
  let total = 0;
  return points.map((point) => {
    total += analyticsMetricValue(point, metric);
    return total;
  });
}

export function favorableDeltaTone(
  metric: AnalyticsMetric,
  current: number,
  previous: number,
): "positive" | "negative" | "neutral" {
  if (current === previous) return "neutral";
  const direction = analyticsMetricDescriptor(metric).favorableDirection;
  if (direction === "neutral") return "neutral";
  const higher = current > previous;
  return direction === "higher"
    ? higher
      ? "positive"
      : "negative"
    : higher
      ? "negative"
      : "positive";
}
