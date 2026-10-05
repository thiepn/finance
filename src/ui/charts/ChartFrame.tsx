import type { ReactNode } from "react";
import { Button, SegmentedControl } from "../components/Primitives.js";
import type {
  ChartViewMode,
  FinanceChartDatum,
  FinanceChartSeries,
} from "./chart-types.js";

export interface ChartFrameProps {
  title: string;
  description?: string;
  eyebrow?: string;
  summary?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  viewMode?: ChartViewMode;
  onViewModeChange?: (mode: ChartViewMode) => void;
}

export function ChartFrame({
  title,
  description,
  eyebrow,
  summary,
  actions,
  children,
  viewMode,
  onViewModeChange,
}: ChartFrameProps) {
  return (
    <div className="f-chart-frame">
      <div className="f-chart-frame__header">
        <div className="f-chart-frame__heading">
          {eyebrow ? (
            <span className="f-chart-frame__eyebrow">{eyebrow}</span>
          ) : null}
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="f-chart-frame__header-actions">
          {actions}
          {viewMode && onViewModeChange ? (
            <SegmentedControl
              label="Chart display"
              options={[
                { value: "chart", label: "Chart" },
                { value: "table", label: "Table" },
              ]}
              value={viewMode}
              onChange={onViewModeChange}
            />
          ) : null}
        </div>
      </div>
      {summary ? <div className="f-chart-frame__summary">{summary}</div> : null}
      <div className="f-chart-frame__body">{children}</div>
    </div>
  );
}

export interface FinanceChartTableProps {
  data: readonly FinanceChartDatum[];
  series: readonly FinanceChartSeries[];
  valueFormatter?: (value: number, series: FinanceChartSeries) => string;
  onDatumActivate?: (datum: FinanceChartDatum) => void;
}

export function FinanceChartTable({
  data,
  series,
  valueFormatter = (value) => String(value),
  onDatumActivate,
}: FinanceChartTableProps) {
  return (
    <div className="f-chart-table-wrap">
      <table className="f-chart-table">
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((item) => (
              <th key={item.dataKey} scope="col">
                {item.label}
              </th>
            ))}
            {onDatumActivate ? <th scope="col"><span className="f-sr-only">Action</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.key}>
              <th scope="row">{datum.label}</th>
              {series.map((item) => {
                const raw = datum[item.dataKey];
                const numeric =
                  typeof raw === "number" && Number.isFinite(raw) ? raw : null;
                return (
                  <td key={item.dataKey}>
                    {numeric === null ? "—" : valueFormatter(numeric, item)}
                  </td>
                );
              })}
              {onDatumActivate ? (
                <td>
                  <Button
                    onClick={() => onDatumActivate(datum)}
                    size="sm"
                    variant="ghost"
                  >
                    Open
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
