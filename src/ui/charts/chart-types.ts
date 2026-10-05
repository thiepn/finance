export type FinanceChartTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "quaternary"
  | "positive"
  | "negative"
  | "warning";

export interface FinanceChartDatum {
  key: string;
  label: string;
  [key: string]: string | number | null | undefined;
}

export interface FinanceChartSeries {
  dataKey: string;
  label: string;
  tone?: FinanceChartTone;
  comparison?: boolean;
  stackId?: string;
}

export type ChartViewMode = "chart" | "table";

export interface HeatmapDatum {
  key: string;
  label: string;
  value: number;
  detail?: string;
}
