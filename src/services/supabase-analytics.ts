import type {
  AnalyticsBreakdown,
  AnalyticsBreakdownItem,
  AnalyticsBreakdownRequest,
  AnalyticsPoint,
  AnalyticsTimeSeries,
  AnalyticsTimeSeriesRequest,
  AnalyticsTotals,
} from "../domain/analytics.js";
import type { FinanceAnalyticsService } from "./analytics.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function parsePoint(value: unknown): AnalyticsPoint {
  const raw = record(value, "analytics point");
  return {
    bucketIndex: Number(raw.bucket_index),
    bucketStart: String(raw.bucket_start),
    bucketEnd: String(raw.bucket_end),
    grossSpendMinor: Number(raw.gross_spend_minor),
    recoveriesMinor: Number(raw.recoveries_minor),
    netSpendMinor: Number(raw.net_spend_minor),
    incomeMinor: Number(raw.income_minor),
    cashFlowMinor: Number(raw.cash_flow_minor),
    transactionCount: Number(raw.transaction_count),
  };
}

function parseTotals(value: unknown): AnalyticsTotals {
  const raw = record(value, "analytics totals");
  return {
    grossSpendMinor: Number(raw.gross_spend_minor),
    recoveriesMinor: Number(raw.recoveries_minor),
    netSpendMinor: Number(raw.net_spend_minor),
    incomeMinor: Number(raw.income_minor),
    cashFlowMinor: Number(raw.cash_flow_minor),
    transactionCount: Number(raw.transaction_count),
  };
}

function parseTimeSeries(raw: Record<string, unknown>): AnalyticsTimeSeries {
  const profile = record(raw.profile, "analytics profile");
  const period = record(raw.period, "analytics period");
  const totals = record(raw.totals, "analytics totals envelope");

  return {
    profile: {
      currencyCode: String(profile.currency_code),
      locale: String(profile.locale),
      timeZone: String(profile.time_zone),
    },
    bucketKind: String(raw.bucket_kind) as AnalyticsTimeSeries["bucketKind"],
    period: {
      start: String(period.start),
      end: String(period.end),
      compareStart: String(period.compare_start),
      compareEnd: String(period.compare_end),
    },
    current: Array.isArray(raw.current) ? raw.current.map(parsePoint) : [],
    comparison: Array.isArray(raw.comparison)
      ? raw.comparison.map(parsePoint)
      : [],
    totals: {
      current: parseTotals(totals.current),
      comparison: parseTotals(totals.comparison),
    },
  };
}

function parseBreakdownItem(value: unknown): AnalyticsBreakdownItem {
  const raw = record(value, "analytics breakdown item");
  return {
    key: String(raw.key),
    label: String(raw.label),
    currentMinor: Number(raw.current_minor),
    previousMinor: Number(raw.previous_minor),
    deltaMinor: Number(raw.delta_minor),
    deltaRatio: nullableNumber(raw.delta_ratio),
    share: nullableNumber(raw.share),
    currentTransactionCount: Number(raw.current_transaction_count),
    previousTransactionCount: Number(raw.previous_transaction_count),
  };
}

function parseBreakdown(raw: Record<string, unknown>): AnalyticsBreakdown {
  const period = record(raw.period, "analytics breakdown period");
  return {
    dimension: String(raw.dimension) as AnalyticsBreakdown["dimension"],
    period: {
      start: String(period.start),
      end: String(period.end),
      compareStart: String(period.compare_start),
      compareEnd: String(period.compare_end),
    },
    currentTotalMinor: Number(raw.current_total_minor),
    items: Array.isArray(raw.items)
      ? raw.items.map(parseBreakdownItem)
      : [],
  };
}

function assertResult<T>(
  result: {
    data: T | null;
    error: { message: string } | null;
  },
  operation: string,
): T {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error(`Finance ${operation} returned no data`);
  }
  return result.data;
}

export class SupabaseFinanceAnalyticsService
  implements FinanceAnalyticsService
{
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async getTimeSeries(
    request: AnalyticsTimeSeriesRequest,
  ): Promise<AnalyticsTimeSeries> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_analytics_time_series",
      {
        p_period_start: request.periodStart,
        p_period_end: request.periodEnd,
        p_compare_start: request.compareStart,
        p_compare_end: request.compareEnd,
        p_bucket_kind: request.bucketKind,
      },
    );

    return parseTimeSeries(assertResult(result, "getAnalyticsTimeSeries"));
  }

  async getBreakdown(
    request: AnalyticsBreakdownRequest,
  ): Promise<AnalyticsBreakdown> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_analytics_breakdown",
      {
        p_period_start: request.periodStart,
        p_period_end: request.periodEnd,
        p_compare_start: request.compareStart,
        p_compare_end: request.compareEnd,
        p_dimension: request.dimension,
        p_limit: request.limit ?? 8,
      },
    );

    return parseBreakdown(assertResult(result, "getAnalyticsBreakdown"));
  }
}
