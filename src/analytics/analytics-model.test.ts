import type { AnalyticsTimeSeries } from "../domain/analytics.js";
import {
  analyticsMetricValue,
  analyticsTotalValue,
  comparisonSeries,
  cumulativeMetric,
  favorableDeltaTone,
  recommendedAnalyticsRange,
} from "./analytics-model.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const series: AnalyticsTimeSeries = {
  profile: {
    currencyCode: "EUR",
    locale: "de-DE",
    timeZone: "Europe/Berlin",
  },
  bucketKind: "day",
  period: {
    start: "2026-10-01T00:00:00+02:00",
    end: "2026-11-01T00:00:00+01:00",
    compareStart: "2026-09-01T00:00:00+02:00",
    compareEnd: "2026-10-01T00:00:00+02:00",
  },
  current: [
    {
      bucketIndex: 1,
      bucketStart: "2026-09-30T22:00:00Z",
      bucketEnd: "2026-10-01T22:00:00Z",
      grossSpendMinor: 1000,
      recoveriesMinor: 0,
      netSpendMinor: 1000,
      incomeMinor: 0,
      cashFlowMinor: -1000,
      transactionCount: 1,
    },
    {
      bucketIndex: 2,
      bucketStart: "2026-10-01T22:00:00Z",
      bucketEnd: "2026-10-02T22:00:00Z",
      grossSpendMinor: 0,
      recoveriesMinor: 200,
      netSpendMinor: -200,
      incomeMinor: 2000,
      cashFlowMinor: 2200,
      transactionCount: 2,
    },
  ],
  comparison: [
    {
      bucketIndex: 1,
      bucketStart: "2026-08-31T22:00:00Z",
      bucketEnd: "2026-09-01T22:00:00Z",
      grossSpendMinor: 1400,
      recoveriesMinor: 0,
      netSpendMinor: 1400,
      incomeMinor: 0,
      cashFlowMinor: -1400,
      transactionCount: 1,
    },
  ],
  totals: {
    current: {
      grossSpendMinor: 1000,
      recoveriesMinor: 200,
      netSpendMinor: 800,
      incomeMinor: 2000,
      cashFlowMinor: 1200,
      transactionCount: 3,
    },
    comparison: {
      grossSpendMinor: 1400,
      recoveriesMinor: 0,
      netSpendMinor: 1400,
      incomeMinor: 0,
      cashFlowMinor: -1400,
      transactionCount: 1,
    },
  },
};

assert(
  analyticsMetricValue(series.current[1]!, "net_spend") === -200,
  "refund bucket must stay negative",
);
assert(
  analyticsTotalValue(series, "current", "cash_flow") === 1200,
  "analytics total selection failed",
);

const compared = comparisonSeries(series, "net_spend");
assert(compared.length === 2, "comparison row count failed");
assert(compared[0]?.comparison === 1400, "comparison alignment failed");
assert(compared[1]?.comparison === null, "missing comparison must stay null");

const cumulative = cumulativeMetric(series.current, "net_spend");
assert(cumulative[0] === 1000, "cumulative first point failed");
assert(cumulative[1] === 800, "cumulative refund adjustment failed");

assert(
  favorableDeltaTone("net_spend", 800, 1400) === "positive",
  "lower spending should be favorable",
);
assert(
  favorableDeltaTone("income", 2000, 1400) === "positive",
  "higher income should be favorable",
);
assert(
  favorableDeltaTone("recoveries", 200, 0) === "neutral",
  "recoveries are not inherently favorable",
);

assert(
  recommendedAnalyticsRange("week").bucketKind === "day",
  "week bucket recommendation failed",
);
assert(
  recommendedAnalyticsRange("quarter").bucketKind === "week",
  "quarter bucket recommendation failed",
);
assert(
  recommendedAnalyticsRange("year").bucketKind === "month",
  "year bucket recommendation failed",
);

console.log("Analytics presentation fixtures passed");
