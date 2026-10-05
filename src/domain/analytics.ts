import type { OverviewPeriodKind } from "./overview.js";

export type AnalyticsBucketKind =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

export type AnalyticsMetric =
  | "net_spend"
  | "gross_spend"
  | "recoveries"
  | "income"
  | "cash_flow";

export type AnalyticsBreakdownDimension =
  | "category"
  | "merchant"
  | "necessity";

export interface AnalyticsProfile {
  currencyCode: string;
  locale: string;
  timeZone: string;
}

export interface AnalyticsPeriod {
  start: string;
  end: string;
  compareStart: string;
  compareEnd: string;
}

export interface AnalyticsPoint {
  bucketIndex: number;
  bucketStart: string;
  bucketEnd: string;
  grossSpendMinor: number;
  recoveriesMinor: number;
  netSpendMinor: number;
  incomeMinor: number;
  cashFlowMinor: number;
  transactionCount: number;
}

export interface AnalyticsTotals {
  grossSpendMinor: number;
  recoveriesMinor: number;
  netSpendMinor: number;
  incomeMinor: number;
  cashFlowMinor: number;
  transactionCount: number;
}

export interface AnalyticsTimeSeries {
  profile: AnalyticsProfile;
  bucketKind: AnalyticsBucketKind;
  period: AnalyticsPeriod;
  current: readonly AnalyticsPoint[];
  comparison: readonly AnalyticsPoint[];
  totals: {
    current: AnalyticsTotals;
    comparison: AnalyticsTotals;
  };
}

export interface AnalyticsBreakdownItem {
  key: string;
  label: string;
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  deltaRatio: number | null;
  share: number | null;
  currentTransactionCount: number;
  previousTransactionCount: number;
}

export interface AnalyticsBreakdown {
  dimension: AnalyticsBreakdownDimension;
  period: AnalyticsPeriod;
  currentTotalMinor: number;
  items: readonly AnalyticsBreakdownItem[];
}

export interface AnalyticsRangeRequest {
  periodStart: string;
  periodEnd: string;
  compareStart: string;
  compareEnd: string;
}

export interface AnalyticsTimeSeriesRequest extends AnalyticsRangeRequest {
  bucketKind: AnalyticsBucketKind;
}

export interface AnalyticsBreakdownRequest extends AnalyticsRangeRequest {
  dimension: AnalyticsBreakdownDimension;
  limit?: number;
}

export interface AnalyticsMetricDescriptor {
  key: AnalyticsMetric;
  label: string;
  shortLabel: string;
  favorableDirection: "higher" | "lower" | "neutral";
}

export interface AnalyticsComparisonDatum {
  key: string;
  index: number;
  currentStart: string;
  comparisonStart: string | null;
  current: number;
  comparison: number | null;
}

export interface AnalyticsChartRange {
  periodKind: OverviewPeriodKind;
  bucketKind: AnalyticsBucketKind;
}
