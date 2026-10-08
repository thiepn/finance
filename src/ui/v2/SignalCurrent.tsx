import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "../icons/Icon.js";
import {
  assertMinorUnits,
  boundedPercent,
  formatSignalMoney,
  moneySourceLabels,
  type MoneySource,
} from "./finance-presentation.js";

/**
 * P26 Signal Current component kit. Everything is explicitly scoped in
 * SignalCurrentScope so no legacy Finance styles or session behavior change.
 * P27-P37 will connect these components to authenticated runtime services.
 */
function classes(...names: Array<string | false | undefined | null>): string {
  return names.filter(Boolean).join(" ");
}

export interface SignalCurrentScopeProps extends HTMLAttributes<HTMLDivElement> {
  theme?: "dark" | "light";
  children: ReactNode;
}
export function SignalCurrentScope({ theme = "dark", className, children, ...props }: SignalCurrentScopeProps) {
  return <div className={classes("sc-root", className)} data-sc-theme={theme} {...props}>{children}</div>;
}

export function FinanceButton({
  variant = "primary",
  children,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger" }) {
  return <button className={classes("sc-button", "sc-button--" + variant, className)} type={type} {...props}>{children}</button>;
}

export interface FinancePageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  supplementary?: ReactNode;
}
export function FinancePageHeader({ title, eyebrow, description, action, supplementary }: FinancePageHeaderProps) {
  return <header className="sc-page-header">
    <div className="sc-page-header__identity">
      {eyebrow ? <span className="sc-eyebrow">{eyebrow}</span> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {action || supplementary ? <div className="sc-page-header__actions">{supplementary}{action}</div> : null}
  </header>;
}

export interface MoneyValueProps extends HTMLAttributes<HTMLSpanElement> {
  amountMinor: number;
  currency?: string;
  locale?: string;
  sign?: "auto" | "always" | "exceptZero";
  tone?: "default" | "positive" | "negative" | "warning" | "muted";
  size?: "inline" | "medium" | "large";
}
export function MoneyValue({
  amountMinor, currency = "EUR", locale = "de-DE", sign = "auto",
  tone = "default", size = "inline", className, ...props
}: MoneyValueProps) {
  const formatted = formatSignalMoney(amountMinor, currency, locale, sign);
  return <span className={classes("sc-money", "sc-money--" + tone, "sc-money--" + size, className)}
    {...props}>{formatted}</span>;
}

export interface DataProvenanceProps {
  source: MoneySource;
  updatedAt?: string;
  className?: string;
}
export function DataProvenance({ source, updatedAt, className }: DataProvenanceProps) {
  return <div className={classes("sc-provenance", className)} data-sc-source={source}>
    <span className="sc-provenance__dot" aria-hidden="true" />
    <span>{moneySourceLabels[source]}{updatedAt ? " · " + updatedAt : ""}</span>
  </div>;
}

export interface MoneyMetricProps {
  label: string;
  amountMinor: number;
  currency?: string;
  description?: string;
  source: MoneySource;
  emphasis?: boolean;
  tone?: MoneyValueProps["tone"];
  action?: ReactNode;
}
export function MoneyMetric({ label, amountMinor, currency = "EUR", description, source,
  emphasis = false, tone, action }: MoneyMetricProps) {
  return <section className={classes("sc-metric", emphasis && "sc-metric--emphasis")} aria-label={label}>
    <div className="sc-metric__heading"><span className="sc-eyebrow">{label}</span>{action}</div>
    <MoneyValue amountMinor={amountMinor} currency={currency} tone={tone ?? "default"} size="large" />
    {description ? <span className="sc-metric__support">{description}</span> : null}
    <DataProvenance source={source} />
  </section>;
}

export type FinancialStateKind =
  "sign-in" | "loading" | "empty" | "offline" | "error" | "forbidden" | "processing";
interface StateAction { label: string; onClick: () => void; }
export interface FinancialStateProps {
  kind: FinancialStateKind;
  title: string;
  description: string;
  primaryAction?: StateAction | undefined;
  secondaryAction?: StateAction | undefined;
}
export function FinancialState({ kind, title, description, primaryAction, secondaryAction }: FinancialStateProps) {
  const liveRole = kind === "error" || kind === "forbidden" ? "alert" : "status";
  return <section className={"sc-financial-state sc-financial-state--" + kind}
    role={liveRole} aria-label={title}>
    <span className="sc-eyebrow">{kind.replace("-", " ")}</span>
    <h2>{title}</h2>
    <p>{description}</p>
    {kind === "loading" || kind === "processing" ? <div className="sc-loading-track" aria-hidden="true" /> : null}
    {primaryAction || secondaryAction ? <div className="sc-financial-state__actions">
      {primaryAction ? <FinanceButton onClick={primaryAction.onClick}>{primaryAction.label}</FinanceButton> : null}
      {secondaryAction ? <FinanceButton onClick={secondaryAction.onClick} variant="secondary">{secondaryAction.label}</FinanceButton> : null}
    </div> : null}
  </section>;
}

export interface AttentionRowProps {
  title: string;
  detail: string;
  status?: string;
  icon?: IconName;
  href?: string;
  onClick?: () => void;
}
export function AttentionRow({ title, detail, status, icon = "alert", href, onClick }: AttentionRowProps) {
  const content = <><span className="sc-attention-row__icon"><Icon name={icon} size={18} /></span>
    <span className="sc-attention-row__body"><strong>{title}</strong><small>{detail}</small></span>
    {status ? <span className="sc-attention-row__status">{status}</span> : null}
    {href || onClick ? <Icon name="chevronRight" size={16} /> : null}</>;
  if (href) return <a className="sc-attention-row" href={href}>{content}</a>;
  if (onClick) return <button className="sc-attention-row" onClick={onClick} type="button">{content}</button>;
  return <div className="sc-attention-row">{content}</div>;
}

export interface PeriodOption { value: string; label: string; }
export interface PeriodPickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly PeriodOption[];
}
export function PeriodPicker({ label = "Period", value, onChange, options }: PeriodPickerProps) {
  const id = useId();
  return <div className="sc-control"><label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={e => onChange(e.currentTarget.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select></div>;
}

export interface AccountOption { id: string; name: string; }
export interface AccountSwitcherProps {
  value: string;
  options: readonly AccountOption[];
  onChange: (id: string) => void;
  label?: string;
}
export function AccountSwitcher({ label = "Account", value, options, onChange }: AccountSwitcherProps) {
  const id = useId();
  return <div className="sc-control"><label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={e => onChange(e.currentTarget.value)}>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select></div>;
}

export function ActionMenu({ label = "More", children }: { label?: string; children: ReactNode }) {
  return <details className="sc-action-menu"><summary>{label}</summary><div className="sc-action-menu__items">{children}</div></details>;
}

export function FilterBar({ label = "Filters", children }: { label?: string; children: ReactNode }) {
  return <div aria-label={label} className="sc-filter-bar" role="group">{children}</div>;
}

export interface FinanceColumn<T> {
  id: string;
  label: string;
  render: (row: T) => ReactNode;
  align?: "start" | "end";
}
export interface FinanceTableProps<T> {
  caption: string;
  rows: readonly T[];
  columns: readonly FinanceColumn<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  emptyMessage?: string;
}
export function FinanceTable<T>({ caption, rows, columns, rowKey, rowHref, emptyMessage = "No records found." }: FinanceTableProps<T>) {
  return <div className="sc-table-scroll" role="region" aria-label={caption + " table"} tabIndex={0}><table className="sc-table">
    <caption>{caption}</caption>
    <thead><tr>{columns.map(c => <th key={c.id} scope="col" className={c.align === "end" ? "sc-align-end" : undefined}>{c.label}</th>)}
      {rowHref ? <th scope="col"><span className="sc-visually-hidden">Details</span></th> : null}</tr></thead>
    <tbody>{rows.length ? rows.map(row => <tr key={rowKey(row)}>{columns.map(c =>
      <td key={c.id} className={c.align === "end" ? "sc-align-end" : undefined}>{c.render(row)}</td>)}
      {rowHref ? <td className="sc-align-end"><a className="sc-row-detail-link" href={rowHref(row)}>View<span className="sc-visually-hidden"> record {rowKey(row)}</span></a></td> : null}
    </tr>) : <tr><td colSpan={columns.length + (rowHref ? 1 : 0)} className="sc-table__empty">{emptyMessage}</td></tr>}</tbody>
  </table></div>;
}

export interface LedgerRowProps {
  merchant: string;
  dateLabel: string;
  category: string;
  amountMinor: number;
  currency?: string;
  status?: string;
  href?: string;
}
export function LedgerRow({ merchant, dateLabel, category, amountMinor, currency = "EUR", status, href }: LedgerRowProps) {
  assertMinorUnits(amountMinor);
  const content = <><span className="sc-ledger-row__marker" aria-hidden="true">{merchant.charAt(0).toLocaleUpperCase()}</span>
    <span className="sc-ledger-row__text"><strong>{merchant}</strong><small>{dateLabel} · {category}{status ? " · " + status : ""}</small></span>
    <MoneyValue amountMinor={amountMinor} currency={currency} tone={amountMinor < 0 ? "negative" : amountMinor > 0 ? "positive" : "default"} /></>;
  return href ? <a className="sc-ledger-row" href={href}>{content}</a> : <div className="sc-ledger-row">{content}</div>;
}

export interface BudgetAllocationRowProps {
  label: string;
  plannedMinor: number;
  spentMinor: number;
  currency?: string;
  href?: string;
}
export function BudgetAllocationRow({ label, plannedMinor, spentMinor, currency = "EUR", href }: BudgetAllocationRowProps) {
  assertMinorUnits(plannedMinor);
  assertMinorUnits(spentMinor);
  const remaining = plannedMinor - spentMinor;
  if (!Number.isSafeInteger(remaining)) throw new RangeError("Budget remainder outside safe minor units");
  const content = <>
    <div className="sc-budget-row__heading"><strong>{label}</strong>
      <MoneyValue amountMinor={remaining} currency={currency} tone={remaining < 0 ? "negative" : "default"} /></div>
    <small><MoneyValue amountMinor={spentMinor} currency={currency} /> of <MoneyValue amountMinor={plannedMinor} currency={currency} /> allocated</small>
    <div className="sc-budget-row__track" role="progressbar" aria-label={label + " budget used"}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(boundedPercent(spentMinor, plannedMinor))}>
      <span style={{ width: boundedPercent(spentMinor, plannedMinor) + "%" }} /></div>
    {remaining < 0 ? <span className="sc-budget-row__warning">Overspent</span> : null}
  </>;
  return href ? <a href={href} className="sc-budget-row">{content}</a> : <div className="sc-budget-row">{content}</div>;
}

export interface ReceiptCompareProps {
  title: string;
  sourceUrl?: string;
  sourceAlt?: string;
  details: ReactNode;
  status: "needs-review" | "matched" | "unmatched" | "processing";
  footer?: ReactNode;
}
export function ReceiptCompare({ title, sourceUrl, sourceAlt, details, status, footer }: ReceiptCompareProps) {
  return <section className="sc-receipt" aria-label={title}>
    <div className="sc-receipt__editor"><div className="sc-receipt__heading"><h2>{title}</h2>
      <span className={"sc-receipt__status sc-receipt__status--" + status}>{status.replace("-", " ")}</span></div>
      {details}
      <DataProvenance source="receipt" />
      {footer ? <div className="sc-receipt__footer">{footer}</div> : null}
    </div>
    <div className="sc-receipt__source"><h3>Original document</h3>
      {sourceUrl ? <img alt={sourceAlt ?? "Original receipt document"} src={sourceUrl} /> :
        <div className="sc-receipt__missing">Original document not available. Review cannot be confirmed without source evidence.</div>}
    </div>
  </section>;
}

export interface FinanceTrendPoint { label: string; actualMinor: number | null; plannedMinor?: number | null; }
export interface FinanceTrendProps {
  title: string;
  points: readonly FinanceTrendPoint[];
  currency?: string;
  description?: string;
}
export function FinanceTrend({ title, points, currency = "EUR", description }: FinanceTrendProps) {
  const hasPlanned = points.some(p => p.plannedMinor != null);
  const valid = points.flatMap(p => [p.actualMinor, p.plannedMinor].filter((v): v is number => v != null));
  valid.forEach(assertMinorUnits);
  const max = Math.max(1, ...valid.map(Math.abs));
  const x = (i: number) => 30 + (points.length < 2 ? 0 : (i / (points.length - 1)) * 540);
  const y = (value: number) => 163 - ((value / max) * 125);
  const actual = points.filter(p => p.actualMinor != null);
  const actualCoords = actual.map(p => ({ i: points.indexOf(p), v: p.actualMinor as number }));
  const plannedCoords = points.map((p, i) => ({ i, v: p.plannedMinor })).filter((p): p is {i: number; v: number} => p.v != null);
  const path = (coords: Array<{i:number;v:number}>) => coords.map((p, idx) => (idx ? "L" : "M") + x(p.i).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
  return <section className="sc-trend" aria-label={title}><div className="sc-trend__header"><div><h2>{title}</h2>
    {description ? <p>{description}</p> : null}</div><div className="sc-trend__key"><span>Actual</span>{hasPlanned ? <span>Planned</span> : null}</div></div>
    {valid.length === 0 ? <div className="sc-trend__empty">No verified values to chart.</div> :
      <svg className="sc-trend__svg" viewBox="0 0 600 188" aria-hidden="true" focusable="false">
        {[40,81,122,163].map(pos => <line key={pos} x1="30" x2="570" y1={pos} y2={pos} className="sc-trend__grid" />)}
        {hasPlanned && plannedCoords.length ? <path d={path(plannedCoords)} className="sc-trend__planned" /> : null}
        {actualCoords.length ? <path d={path(actualCoords)} className="sc-trend__actual" /> : null}
      </svg>}
    <details className="sc-trend__data"><summary>View data table</summary>
      <FinanceTable caption={title + " source values"} rows={points} rowKey={p => p.label}
        columns={[{id:"period",label:"Period",render:p=>p.label},
          {id:"actual",label:"Actual",align:"end",render:p=>p.actualMinor == null ? "Unavailable" : formatSignalMoney(p.actualMinor,currency)},
          {id:"planned",label:"Planned",align:"end",render:p=>p.plannedMinor == null ? "Not planned" : formatSignalMoney(p.plannedMinor,currency)}]} />
    </details></section>;
}
