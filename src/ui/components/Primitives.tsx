import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import { formatMoneyMinor } from "../format/money.js";
import { Icon, type IconName } from "../icons/Icon.js";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconOnly?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconOnly = false,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        "f-button",
        `f-button--${variant}`,
        `f-button--${size}`,
        iconOnly && "f-button--icon",
        className,
      )}
      type={type}
      {...props}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {iconOnly ? <span className="f-sr-only">{children}</span> : children}
    </button>
  );
}

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "article" | "div";
  density?: "default" | "compact";
}

export function Surface({
  as: Element = "section",
  density = "default",
  className,
  ...props
}: SurfaceProps) {
  return (
    <Element
      className={cx(
        "f-surface",
        density === "compact" && "f-surface--compact",
        className,
      )}
      {...props}
    />
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "positive" | "negative" | "warning" | "accent";
  icon?: IconName;
}

export function Badge({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cx("f-badge", `f-badge--${tone}`, className)}
      {...props}
    >
      {icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}

export interface MoneyProps extends HTMLAttributes<HTMLSpanElement> {
  amountMinor: number;
  currencyCode?: string;
  locale?: string;
  showSign?: boolean;
  tone?: "default" | "positive" | "negative" | "muted";
}

export function Money({
  amountMinor,
  currencyCode = "EUR",
  locale = "de-DE",
  showSign = false,
  tone = "default",
  className,
  ...props
}: MoneyProps) {
  return (
    <span
      className={cx("f-money", `f-money--${tone}`, className)}
      {...props}
    >
      {formatMoneyMinor(amountMinor, currencyCode, { locale, showSign })}
    </span>
  );
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  supporting?: ReactNode;
  trend?: ReactNode;
  emphasis?: boolean;
}

export function StatCard({
  label,
  value,
  supporting,
  trend,
  emphasis = false,
}: StatCardProps) {
  return (
    <Surface className={cx("f-stat", emphasis && "f-stat--emphasis")}>
      <div className="f-stat__topline">
        <span className="f-stat__label">{label}</span>
        {trend ? <span className="f-stat__trend">{trend}</span> : null}
      </div>
      <div className="f-stat__value">{value}</div>
      {supporting ? (
        <div className="f-stat__supporting">{supporting}</div>
      ) : null}
    </Surface>
  );
}

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  shortcut?: string;
}

export function SearchField({
  label = "Search",
  shortcut,
  className,
  ...props
}: SearchFieldProps) {
  return (
    <label className={cx("f-search", className)}>
      <span className="f-sr-only">{label}</span>
      <Icon name="search" size={18} />
      <input type="search" {...props} />
      {shortcut ? <kbd>{shortcut}</kbd> : null}
    </label>
  );
}

export interface FilterChipProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  leadingIcon?: IconName;
}

export function FilterChip({
  active = false,
  leadingIcon,
  className,
  children,
  type = "button",
  ...props
}: FilterChipProps) {
  return (
    <button
      aria-pressed={active}
      className={cx("f-chip", active && "f-chip--active", className)}
      type={type}
      {...props}
    >
      {leadingIcon ? <Icon name={leadingIcon} size={15} /> : null}
      {children}
    </button>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div aria-label={label} className="f-segmented" role="group">
      {options.map((option) => (
        <button
          aria-pressed={option.value === value}
          className={cx(
            "f-segmented__item",
            option.value === value && "f-segmented__item--active",
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface ProgressBarProps {
  value: number;
  label: string;
  detail?: string;
  tone?: "accent" | "positive" | "warning" | "negative";
}

export function ProgressBar({
  value,
  label,
  detail,
  tone = "accent",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="f-progress">
      <div className="f-progress__meta">
        <span>{label}</span>
        {detail ? <span>{detail}</span> : null}
      </div>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(clamped * 100)}
        className="f-progress__track"
        role="progressbar"
      >
        <span
          className={cx("f-progress__fill", `f-progress__fill--${tone}`)}
          style={{ width: `${clamped * 100}%` }}
        />
      </div>
    </div>
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("f-skeleton", className)} {...props} />;
}
