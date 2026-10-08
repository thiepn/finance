import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  FinanceChartDatum,
  FinanceChartSeries,
  FinanceChartTone,
  HeatmapDatum,
} from "./chart-types.js";

function chartColor(tone: FinanceChartTone = "primary"): string {
  const map: Record<FinanceChartTone, string> = {
    primary: "var(--f-chart-1)",
    secondary: "var(--f-chart-2)",
    tertiary: "var(--f-chart-3)",
    quaternary: "var(--f-chart-4)",
    positive: "var(--f-positive)",
    negative: "var(--f-negative)",
    warning: "var(--f-warning)",
  };
  return map[tone];
}

function tooltipStyle() {
  return {
    background: "var(--f-surface-raised)",
    border: "1px solid var(--f-border)",
    borderRadius: "var(--f-radius-sm)",
    boxShadow: "var(--f-shadow-sm)",
    color: "var(--f-text)",
    fontSize: "0.75rem",
  };
}

function tooltipFormatter(
  valueFormatter?: (value: number) => string,
) {
  return (value: unknown, name: unknown) => [
    valueFormatter ? valueFormatter(Number(value)) : String(value),
    String(name),
  ];
}

function ChartLegend({
  series,
}: {
  series: readonly FinanceChartSeries[];
}) {
  return (
    <div className="f-chart-legend" aria-label="Chart legend">
      {series.map((item) => (
        <span className="f-chart-legend__item" key={item.dataKey}>
          <span
            className="f-chart-legend__swatch"
            style={{ background: chartColor(item.tone) }}
          />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

export interface CartesianFinanceChartProps {
  data: readonly FinanceChartDatum[];
  series: readonly FinanceChartSeries[];
  height?: number;
  ariaLabel: string;
  valueFormatter?: (value: number) => string;
  tickFormatter?: (value: number) => string;
  onDatumActivate?: (datum: FinanceChartDatum) => void;
}

function extractDatum(value: unknown): FinanceChartDatum | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    payload?: unknown;
  };
  const payload = candidate.payload;
  if (!payload || typeof payload !== "object") return null;
  const datum = payload as FinanceChartDatum;
  return typeof datum.key === "string" ? datum : null;
}

export function FinanceLineChart({
  data,
  series,
  height = 280,
  ariaLabel,
  valueFormatter,
  tickFormatter,
  onDatumActivate,
}: CartesianFinanceChartProps) {
  return (
    <div className="f-chart" aria-label={ariaLabel}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer
            data={[...data]}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            title={ariaLabel}
          >
            <CartesianGrid
              stroke="var(--f-chart-grid)"
              strokeDasharray="3 5"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="label"
              minTickGap={24}
              tick={{ fill: "var(--f-text-tertiary)", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--f-text-tertiary)", fontSize: 11 }}
              {...(tickFormatter ? { tickFormatter } : {})}
              tickLine={false}
              width={56}
            />
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={tooltipFormatter(valueFormatter)}
              labelStyle={{ color: "var(--f-text-secondary)" }}
            />
            {series.map((item) => (
              <Line
                activeDot={{ r: 5 }}
                connectNulls={false}
                dataKey={item.dataKey}
                dot={false}
                key={item.dataKey}
                name={item.label}
                {...(onDatumActivate ? { onClick: (value: unknown) => {
                  const datum = extractDatum(value);
                  if (datum) onDatumActivate(datum);
                } } : {})}
                stroke={chartColor(item.tone)}
                {...(item.comparison ? { strokeDasharray: "5 5" } : {})}
                strokeWidth={item.comparison ? 1.75 : 2.4}
                type="monotone"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend series={series} />
    </div>
  );
}

export function FinanceBarChart({
  data,
  series,
  height = 280,
  ariaLabel,
  valueFormatter,
  tickFormatter,
  onDatumActivate,
}: CartesianFinanceChartProps) {
  return (
    <div className="f-chart" aria-label={ariaLabel}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            accessibilityLayer
            data={[...data]}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
            title={ariaLabel}
          >
            <CartesianGrid
              stroke="var(--f-chart-grid)"
              strokeDasharray="3 5"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="label"
              minTickGap={24}
              tick={{ fill: "var(--f-text-tertiary)", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--f-text-tertiary)", fontSize: 11 }}
              {...(tickFormatter ? { tickFormatter } : {})}
              tickLine={false}
              width={56}
            />
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={tooltipFormatter(valueFormatter)}
              labelStyle={{ color: "var(--f-text-secondary)" }}
            />
            {series.map((item) => (
              <Bar
                dataKey={item.dataKey}
                fill={chartColor(item.tone)}
                key={item.dataKey}
                name={item.label}
                {...(onDatumActivate ? { onClick: (value: unknown) => {
                  const datum = extractDatum(value);
                  if (datum) onDatumActivate(datum);
                } } : {})}
                radius={[4, 4, 0, 0]}
                {...(item.stackId ? { stackId: item.stackId } : {})}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend series={series} />
    </div>
  );
}

export function FinanceStackedBarChart(
  props: CartesianFinanceChartProps,
) {
  return <FinanceBarChart {...props} />;
}

export interface FinanceDonutDatum {
  key: string;
  label: string;
  value: number;
  tone?: FinanceChartTone;
}

export interface FinanceDonutChartProps {
  data: readonly FinanceDonutDatum[];
  ariaLabel: string;
  height?: number;
  valueFormatter?: (value: number) => string;
  onDatumActivate?: (datum: FinanceDonutDatum) => void;
}

export function FinanceDonutChart({
  data,
  ariaLabel,
  height = 260,
  valueFormatter,
  onDatumActivate,
}: FinanceDonutChartProps) {
  return (
    <div className="f-chart" aria-label={ariaLabel}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer title={ariaLabel}>
            <Tooltip
              contentStyle={tooltipStyle()}
              formatter={tooltipFormatter(valueFormatter)}
            />
            <Pie
              data={[...data]}
              dataKey="value"
              innerRadius="58%"
              nameKey="label"
              {...(onDatumActivate ? { onClick: (datum: unknown) => {
                if (datum && typeof datum === "object" && "key" in datum) {
                  onDatumActivate(datum as FinanceDonutDatum);
                }
              } } : {})}
              outerRadius="82%"
              paddingAngle={2}
              stroke="var(--f-surface)"
              strokeWidth={2}
            >
              {data.map((item, index) => (
                <Cell
                  fill={chartColor(
                    item.tone ??
                      (["primary", "secondary", "tertiary", "quaternary"][
                        index % 4
                      ] as FinanceChartTone),
                  )}
                  key={item.key}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="f-chart-legend">
        {data.map((item, index) => (
          <span className="f-chart-legend__item" key={item.key}>
            <span
              className="f-chart-legend__swatch"
              style={{
                background: chartColor(
                  item.tone ??
                    (["primary", "secondary", "tertiary", "quaternary"][
                      index % 4
                    ] as FinanceChartTone),
                ),
              }}
            />
            <span>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export interface FinanceSparklineProps {
  data: readonly FinanceChartDatum[];
  dataKey: string;
  ariaLabel: string;
  tone?: FinanceChartTone;
  height?: number;
}

export function FinanceSparkline({
  data,
  dataKey,
  ariaLabel,
  tone = "primary",
  height = 48,
}: FinanceSparklineProps) {
  return (
    <div className="f-sparkline" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart accessibilityLayer data={[...data]} title={ariaLabel}>
          <Line
            dataKey={dataKey}
            dot={false}
            isAnimationActive={false}
            stroke={chartColor(tone)}
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface FinanceHeatmapProps {
  data: readonly HeatmapDatum[];
  ariaLabel: string;
  valueFormatter?: (value: number) => string;
  onDatumActivate?: (datum: HeatmapDatum) => void;
}

export function FinanceHeatmap({
  data,
  ariaLabel,
  valueFormatter = (value) => String(value),
  onDatumActivate,
}: FinanceHeatmapProps) {
  const max = Math.max(1, ...data.map((item) => Math.abs(item.value)));

  return (
    <div className="f-heatmap" aria-label={ariaLabel} role="list">
      {data.map((item) => {
        const intensity = Math.min(1, Math.abs(item.value) / max);
        return (
          <button
            aria-label={`${item.label}: ${valueFormatter(item.value)}`}
            className="f-heatmap__cell"
            disabled={!onDatumActivate}
            key={item.key}
            onClick={() => onDatumActivate?.(item)}
            role="listitem"
            style={{
              background: `color-mix(in srgb, var(--f-chart-1) ${Math.round(
                12 + intensity * 68,
              )}%, var(--f-surface-pressed))`,
            }}
            title={item.detail ?? `${item.label}: ${valueFormatter(item.value)}`}
            type="button"
          >
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
