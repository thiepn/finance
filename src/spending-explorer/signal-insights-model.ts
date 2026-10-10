
import type { AnalyticsTimeSeries } from "../domain/analytics.js";
import type { OverviewPeriodKind } from "../domain/overview.js";
import type { ExplorerNecessity, SpendingExplorer } from "../domain/spending-explorer.js";

export type InsightsMetric = "net_spend" | "income" | "cash_flow";
export interface InsightsFilters {
  periodKind: OverviewPeriodKind;
  categoryId: string | null;
  merchantId: string | null;
  necessity: ExplorerNecessity | null;
}
export const defaultInsightsFilters: InsightsFilters = {
  periodKind: "month", categoryId: null, merchantId: null, necessity: null,
};
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const needs: readonly string[] = ["essential", "flexible", "discretionary", "unclassified"];
const periods: readonly string[] = ["week", "month", "quarter", "year"];
export function parseInsightsFilters(search: string): InsightsFilters {
  const q = new URLSearchParams(search);
  const period = q.get("period");
  const necessity = q.get("necessity");
  const category = q.get("category");
  const merchant = q.get("merchant");
  return {
    periodKind: periods.includes(period ?? "") ? period as OverviewPeriodKind : "month",
    categoryId: category && idPattern.test(category) ? category : null,
    merchantId: merchant && idPattern.test(merchant) ? merchant : null,
    necessity: needs.includes(necessity ?? "") ? necessity as ExplorerNecessity : null,
  };
}
export function insightsHref(filters: InsightsFilters, path: "/explore" | "/explore/categories" = "/explore"): string {
  const q = new URLSearchParams();
  if (filters.periodKind !== "month") q.set("period", filters.periodKind);
  if (filters.categoryId && idPattern.test(filters.categoryId)) q.set("category", filters.categoryId);
  if (filters.merchantId && idPattern.test(filters.merchantId)) q.set("merchant", filters.merchantId);
  if (filters.necessity) q.set("necessity", filters.necessity);
  const search = q.toString();
  return path + (search ? "?" + search : "");
}
export interface InsightsChartPoint {
  key: string; label: string;
  previousLabel: string | null;
  current: number;
  previous: number | null;
}
export function validMinor(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError("Analytics must use safe integer minor units");
  return value;
}
function dateLabel(iso: string, locale: string, zone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) throw new RangeError("Invalid analytics period");
  return new Intl.DateTimeFormat(locale, {timeZone: zone, month: "short", day: "numeric"}).format(date);
}
export function insightsChartPoints(
  explorer: SpendingExplorer,
  analytics: AnalyticsTimeSeries | null,
  metric: InsightsMetric,
): InsightsChartPoint[] {
  // The scoped explorer is always the source of spending. Income/cash flow
  // come from the separate unscoped, authoritative ledger analytics RPC.
  const global = metric !== "net_spend";
  if (global && (!analytics ||
    analytics.profile.currencyCode !== explorer.profile.currencyCode ||
    analytics.period.start !== explorer.period.start ||
    analytics.period.end !== explorer.period.end)) return [];
  const current = global ? analytics!.current : explorer.series.current;
  const comparison = global ? analytics!.comparison : explorer.series.comparison;
  const previous = new Map(comparison.map(p => [p.bucketIndex, p]));
  const read = (p: typeof current[number]): number => {
    if (metric === "net_spend") return validMinor(p.netSpendMinor);
    if (metric === "income" && "incomeMinor" in p && typeof p.incomeMinor === "number")
      return validMinor(p.incomeMinor);
    if (metric === "cash_flow" && "cashFlowMinor" in p && typeof p.cashFlowMinor === "number")
      return validMinor(p.cashFlowMinor);
    throw new TypeError("Required ledger analytics metric is missing");
  };
  return current.map(p => {
    const old = previous.get(p.bucketIndex);
    return {
      key: String(p.bucketIndex),
      label: dateLabel(p.bucketStart, explorer.profile.locale, explorer.profile.timeZone),
      previousLabel: old ? dateLabel(old.bucketStart, explorer.profile.locale, explorer.profile.timeZone) : null,
      current: read(p),
      previous: old ? read(old) : null,
    };
  });
}
function localDate(iso: string, zone: string, endExclusive: boolean): string {
  const epoch = new Date(iso).valueOf();
  if (!Number.isFinite(epoch)) throw new RangeError("Invalid ledger date boundary");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(epoch - (endExclusive ? 1 : 0)));
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  return [get("year"), get("month"), get("day")].join("-");
}
export function activityHref(explorer: SpendingExplorer, merchantId: string | null = null): string {
  const params = new URLSearchParams({
    from: localDate(explorer.period.start, explorer.profile.timeZone, false),
    to: localDate(explorer.period.end, explorer.profile.timeZone, true),
  });
  const merchant = merchantId ?? explorer.scope.merchantId;
  if (merchant && idPattern.test(merchant)) params.set("merchant", merchant);
  // Activity has no safe category filter yet; do not pretend it does.
  return "/activity?" + params.toString();
}
