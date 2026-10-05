import { useMemo, useState } from "react";
import type {
  AnalyticsMetric,
  AnalyticsTimeSeriesRequest,
} from "../domain/analytics.js";
import type { OverviewDashboard } from "../domain/overview.js";
import {
  Badge,
  FilterChip,
  SegmentedControl,
  Skeleton,
} from "../ui/components/Primitives.js";
import { formatMoneyMinor, formatPercent } from "../ui/format/money.js";
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
  analyticsMetricDescriptor,
  analyticsTotalValue,
  comparisonSeries,
  favorableDeltaTone,
  recommendedAnalyticsRange,
} from "./analytics-model.js";
import { useAnalyticsTimeSeries } from "./use-analytics.js";

const metricOptions = [
  { value: "net_spend", label: "Spending" },
  { value: "income", label: "Income" },
  { value: "cash_flow", label: "Cash flow" },
] as const;

function compactMoney(
  valueMinor: number,
  currencyCode: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valueMinor / 100);
}

function ratioDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

function bucketLabel(
  iso: string,
  bucketKind: AnalyticsTimeSeriesRequest["bucketKind"],
  locale: string,
  timeZone: string,
): string {
  const date = new Date(iso);

  if (bucketKind === "month" || bucketKind === "quarter") {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      timeZone,
    }).format(date);
  }

  if (bucketKind === "year") {
    return new Intl.DateTimeFormat(locale, {
      year: "2-digit",
      timeZone,
    }).format(date);
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
}

export function OverviewTrendPanel({
  dashboard,
  onNavigate,
}: {
  dashboard: OverviewDashboard;
  onNavigate: (key: string) => void;
}) {
  const [metric, setMetric] = useState<AnalyticsMetric>("net_spend");
  const [showComparison, setShowComparison] = useState(true);
  const [viewMode, setViewMode] = useState<ChartViewMode>("chart");

  const bucketKind = recommendedAnalyticsRange(
    dashboard.periodKind,
  ).bucketKind;

  const request = useMemo<AnalyticsTimeSeriesRequest>(
    () => ({
      periodStart: dashboard.period.start,
      periodEnd: dashboard.period.end,
      compareStart: dashboard.period.compareStart,
      compareEnd: dashboard.period.compareEnd,
      bucketKind,
    }),
    [
      bucketKind,
      dashboard.period.compareEnd,
      dashboard.period.compareStart,
      dashboard.period.end,
      dashboard.period.start,
    ],
  );

  const loader = useAnalyticsTimeSeries(request);

  if (loader.state === "loading" || loader.state === "idle") {
    return (
      <div className="f-overview-trend-loading">
        <Skeleton className="f-overview-skeleton--short" />
        <Skeleton className="f-overview-skeleton--panel" />
      </div>
    );
  }

  if (loader.state !== "ready" || !loader.series) {
    return (
      <div className="f-overview-inline-empty">
        {loader.error ?? "Trend data is unavailable."}
      </div>
    );
  }

  const series = loader.series;
  const descriptor = analyticsMetricDescriptor(metric);
  const currentTotal = analyticsTotalValue(series, "current", metric);
  const previousTotal = analyticsTotalValue(series, "comparison", metric);
  const deltaRatio = ratioDelta(currentTotal, previousTotal);
  const deltaTone = favorableDeltaTone(metric, currentTotal, previousTotal);

  const data: FinanceChartDatum[] = comparisonSeries(series, metric).map(
    (point) => ({
      key: point.key,
      label: bucketLabel(
        point.currentStart,
        series.bucketKind,
        series.profile.locale,
        series.profile.timeZone,
      ),
      current: point.current,
      comparison: showComparison ? point.comparison : null,
      currentStart: point.currentStart,
      comparisonStart: point.comparisonStart,
    }),
  );

  const chartSeries: FinanceChartSeries[] = [
    {
      dataKey: "current",
      label: "Current period",
      tone: "primary",
    },
    ...(showComparison
      ? [
          {
            dataKey: "comparison",
            label: "Previous period",
            tone: "secondary" as const,
            comparison: true,
          },
        ]
      : []),
  ];

  const deltaLabel =
    deltaRatio === null
      ? "No baseline"
      : (deltaRatio > 0 ? "↑ " : deltaRatio < 0 ? "↓ " : "") +
        formatPercent(
          Math.abs(deltaRatio),
          series.profile.locale,
          1,
        );

  return (
    <ChartFrame
      actions={
        <div className="f-chart-toolbar">
          <SegmentedControl
            label="Trend metric"
            onChange={setMetric}
            options={metricOptions}
            value={metric}
          />
          <FilterChip
            active={showComparison}
            onClick={() => setShowComparison((value) => !value)}
          >
            Previous period
          </FilterChip>
        </div>
      }
      description={
        "Grouped by " +
        series.bucketKind +
        ". Values come from posted ledger entries."
      }
      eyebrow="Trend"
      onViewModeChange={setViewMode}
      summary={
        <div className="f-chart-summary">
          <div>
            <span>{descriptor.label}</span>
            <strong>
              {formatMoneyMinor(
                currentTotal,
                series.profile.currencyCode,
                { locale: series.profile.locale },
              )}
            </strong>
          </div>
          {showComparison ? (
            <Badge
              tone={
                deltaTone === "positive"
                  ? "positive"
                  : deltaTone === "negative"
                    ? "negative"
                    : "neutral"
              }
            >
              {deltaLabel}
            </Badge>
          ) : null}
        </div>
      }
      title="Money over time"
      viewMode={viewMode}
    >
      {viewMode === "chart" ? (
        <FinanceLineChart
          ariaLabel={descriptor.label + " over the selected period"}
          data={data}
          onDatumActivate={() => onNavigate("activity")}
          series={chartSeries}
          tickFormatter={(value) =>
            compactMoney(
              value,
              series.profile.currencyCode,
              series.profile.locale,
            )
          }
          valueFormatter={(value) =>
            formatMoneyMinor(
              value,
              series.profile.currencyCode,
              { locale: series.profile.locale },
            )
          }
        />
      ) : (
        <FinanceChartTable
          data={data}
          onDatumActivate={() => onNavigate("activity")}
          series={chartSeries}
          valueFormatter={(value) =>
            formatMoneyMinor(
              value,
              series.profile.currencyCode,
              { locale: series.profile.locale },
            )
          }
        />
      )}
    </ChartFrame>
  );
}
