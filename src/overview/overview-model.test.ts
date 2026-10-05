import type { OverviewDashboard } from "../domain/overview.js";
import {
  attentionCopy,
  overviewMetricTrend,
  overviewStatusCopy,
  ratioDelta,
} from "./overview-model.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const dashboard: OverviewDashboard = {
  periodKind: "month",
  anchorDate: "2026-10-05",
  profile: {
    currencyCode: "EUR",
    locale: "de-DE",
    timeZone: "Europe/Berlin",
  },
  period: {
    start: "2026-09-30T22:00:00Z",
    end: "2026-10-31T23:00:00Z",
    compareStart: "2026-08-31T22:00:00Z",
    compareEnd: "2026-09-30T22:00:00Z",
    asOf: "2026-10-05T13:19:00Z",
    elapsedRatio: 0.15,
  },
  summary: {
    incomeMinor: 200000,
    grossSpendMinor: 70000,
    recoveriesMinor: 10000,
    netSpentMinor: 60000,
    netCashFlowMinor: 140000,
    savingsRate: 0.7,
    transactionCount: 4,
    expenseCount: 2,
    availableToSpendMinor: 40000,
  },
  comparison: {
    incomeMinor: 180000,
    grossSpendMinor: 80000,
    recoveriesMinor: 0,
    netSpentMinor: 80000,
    netCashFlowMinor: 100000,
    savingsRate: 100000 / 180000,
    transactionCount: 2,
    expenseCount: 1,
  },
  planning: {
    configured: true,
    budgetPeriodCount: 1,
    plannedIncomeMinor: 200000,
    plannedSpendMinor: 100000,
    budgetedSpentMinor: 60000,
    remainingMinor: 40000,
    paceRatio: 0.6,
    elapsedRatio: 0.15,
    projectedSpendMinor: 400000,
  },
  financialStatus: { code: "at_risk", tone: "warning" },
  topCategories: [],
  attention: {
    totalCount: 1,
    items: [
      {
        code: "receipt_review_required",
        severity: "warning",
        entityId: "11111111-1111-4111-8111-111111111111",
        entityKind: "receipt",
        subject: "REWE",
        detailCode: "2",
        action: "review_receipt",
        occurredAt: "2026-10-05T12:00:00Z",
      },
    ],
  },
  recentActivity: [],
  accounts: { activeCount: 1, trackedNetWorthMinor: 240000 },
};

assert(ratioDelta(120, 100) === 0.2, "ratio delta failed");
assert(ratioDelta(1, 0) === null, "zero baseline must not invent ratio");

const spending = overviewMetricTrend(dashboard, "spending");
assert(spending.delta === -20000, "spending delta failed");
assert(spending.tone === "positive", "lower spending should be positive");

const income = overviewMetricTrend(dashboard, "income");
assert(income.delta === 20000, "income delta failed");
assert(income.tone === "positive", "higher income should be positive");

const status = overviewStatusCopy(dashboard.financialStatus, dashboard);
assert(status.title.includes("above plan"), "status copy failed");

const attention = attentionCopy(dashboard.attention.items[0]!);
assert(attention.routeKey === "receipts", "attention route failed");
assert(attention.detail.includes("2 review issues"), "attention detail failed");

console.log("Overview presentation fixtures passed");
