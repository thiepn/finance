import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinanceAnalyticsService } from "../services/supabase-analytics.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];

const client: SupabaseRpcClient = {
  async rpc<T>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: null }> {
    calls.push(args ? { name: functionName, args } : { name: functionName });

    if (functionName === "finance_get_analytics_time_series") {
      return {
        data: {
          profile: {
            currency_code: "EUR",
            locale: "de-DE",
            time_zone: "Europe/Berlin",
          },
          bucket_kind: "day",
          period: {
            start: "2026-10-01T00:00:00+02:00",
            end: "2026-11-01T00:00:00+01:00",
            compare_start: "2026-09-01T00:00:00+02:00",
            compare_end: "2026-10-01T00:00:00+02:00",
          },
          current: [
            {
              bucket_index: 1,
              bucket_start: "2026-09-30T22:00:00Z",
              bucket_end: "2026-10-01T22:00:00Z",
              gross_spend_minor: 5000,
              recoveries_minor: 0,
              net_spend_minor: 5000,
              income_minor: 0,
              cash_flow_minor: -5000,
              transaction_count: 1,
            },
          ],
          comparison: [],
          totals: {
            current: {
              gross_spend_minor: 5000,
              recoveries_minor: 0,
              net_spend_minor: 5000,
              income_minor: 0,
              cash_flow_minor: -5000,
              transaction_count: 1,
            },
            comparison: {
              gross_spend_minor: 0,
              recoveries_minor: 0,
              net_spend_minor: 0,
              income_minor: 0,
              cash_flow_minor: 0,
              transaction_count: 0,
            },
          },
        } as T,
        error: null,
      };
    }

    return {
      data: {
        dimension: "category",
        period: {
          start: "2026-10-01T00:00:00+02:00",
          end: "2026-11-01T00:00:00+01:00",
          compare_start: "2026-09-01T00:00:00+02:00",
          compare_end: "2026-10-01T00:00:00+02:00",
        },
        current_total_minor: 5000,
        items: [
          {
            key: "category-1",
            label: "Food",
            current_minor: 5000,
            previous_minor: 3000,
            delta_minor: 2000,
            delta_ratio: 0.666666,
            share: 1,
            current_transaction_count: 1,
            previous_transaction_count: 1,
          },
        ],
      } as T,
      error: null,
    };
  },
};

let initialized = 0;
const service = new SupabaseFinanceAnalyticsService(
  client,
  async () => {
    initialized += 1;
  },
);

const request = {
  periodStart: "2026-10-01T00:00:00+02:00",
  periodEnd: "2026-11-01T00:00:00+01:00",
  compareStart: "2026-09-01T00:00:00+02:00",
  compareEnd: "2026-10-01T00:00:00+02:00",
} as const;

const series = await service.getTimeSeries({
  ...request,
  bucketKind: "day",
});
assert(series.current[0]?.netSpendMinor === 5000, "series parsing failed");
assert(series.totals.current.cashFlowMinor === -5000, "totals parsing failed");

const breakdown = await service.getBreakdown({
  ...request,
  dimension: "category",
  limit: 5,
});
assert(breakdown.items[0]?.label === "Food", "breakdown parsing failed");
assert(breakdown.items[0]?.deltaRatio === 0.666666, "ratio parsing failed");

assert(initialized === 2, "analytics initialization hook failed");
assert(
  calls[0]?.name === "finance_get_analytics_time_series",
  "time-series RPC name failed",
);
assert(calls[0]?.args?.p_bucket_kind === "day", "bucket RPC arg failed");
assert(
  calls[1]?.name === "finance_get_analytics_breakdown",
  "breakdown RPC name failed",
);
assert(calls[1]?.args?.p_limit === 5, "breakdown limit arg failed");

console.log("Supabase analytics adapter fixtures passed");
