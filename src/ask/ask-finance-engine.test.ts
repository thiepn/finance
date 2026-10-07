import type { ActivityFilterCatalog } from "../domain/activity.js";
import type { SpendingExplorer } from "../domain/spending-explorer.js";
import {
  AskFinanceEngine,
  type AskFinanceDependencies,
  parseAskFinanceQuestion,
} from "./ask-finance-engine.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const now = new Date("2026-10-06T12:00:00Z");

const lastMonth = parseAskFinanceQuestion(
  "What did I actually spend last month?",
  now,
);
assert(lastMonth.query?.intent === "spending", "spending intent failed");
assert(lastMonth.query.period.kind === "month", "month period failed");
assert(
  lastMonth.query.period.anchorDate === "2026-09-06",
  "last-month anchor failed",
);

const productPrice = parseAskFinanceQuestion(
  "Which grocery products increased most in price?",
  now,
);
assert(
  productPrice.query?.intent === "product_prices",
  "product price intent failed",
);

const receipts = parseAskFinanceQuestion(
  "Which expenses still have unmatched receipts?",
  now,
);
assert(
  receipts.query?.intent === "receipt_reconciliation",
  "receipt reconciliation intent failed",
);

const budget = parseAskFinanceQuestion("How much is safe to spend?", now);
assert(budget.query?.intent === "budget", "safe-to-spend intent failed");

const catalog: ActivityFilterCatalog = {
  accounts: [],
  merchants: [
    {
      id: "merchant-rewe",
      name: "REWE",
      merchantGroup: null,
    },
  ],
  categories: [
    {
      id: "category-snacks",
      parentId: null,
      name: "Snacks",
      kind: "expense",
      necessityDefault: "discretionary",
      systemKey: null,
    },
  ],
  tags: [],
  products: [],
};

const explorerRequests: Record<string, unknown>[] = [];

const explorer: SpendingExplorer = {
  periodKind: "month",
  anchorDate: "2026-10-06",
  profile: {
    currencyCode: "EUR",
    locale: "de-DE",
    timeZone: "Europe/Berlin",
  },
  period: {
    start: "2026-10-01T00:00:00+02:00",
    end: "2026-11-01T00:00:00+01:00",
    compareStart: "2026-09-01T00:00:00+02:00",
    compareEnd: "2026-10-01T00:00:00+02:00",
  },
  bucketKind: "day",
  scope: {
    categoryId: "category-snacks",
    merchantId: "merchant-rewe",
    necessity: null,
    categoryName: "Snacks",
    merchantName: "REWE",
    breadcrumb: [],
  },
  summary: {
    current: {
      grossSpendMinor: 1000,
      recoveriesMinor: 200,
      netSpendMinor: 800,
      transactionCount: 2,
    },
    comparison: {
      grossSpendMinor: 900,
      recoveriesMinor: 0,
      netSpendMinor: 900,
      transactionCount: 2,
    },
    deltaMinor: -100,
    deltaRatio: -1 / 9,
    itemizedEvidenceMinor: 800,
    itemizedCoverageRatio: 1,
  },
  series: {
    current: [],
    comparison: [],
  },
  children: [],
  directCategoryMinor: 800,
  merchants: [
    {
      merchantId: "merchant-rewe",
      name: "REWE",
      currentMinor: 800,
      previousMinor: 900,
      deltaMinor: -100,
      deltaRatio: -1 / 9,
      share: 1,
      transactionCount: 2,
    },
  ],
  necessities: [],
  products: [],
};

const deps = {
  activity: {
    async getFilterCatalog() {
      return catalog;
    },
  },
  spendingExplorer: {
    async getExplorer(request: Record<string, unknown>) {
      explorerRequests.push(request);
      return explorer;
    },
  },
  overview: {},
  productIntelligence: {},
  recurring: {},
  planning: {},
  wealth: {},
  receiptMatching: {},
} as unknown as AskFinanceDependencies;

const engine = new AskFinanceEngine(deps);
const answer = await engine.ask(
  "How much did I spend on Snacks at REWE?",
  now,
);

const explorerRequest = explorerRequests[0];
assert(
  explorerRequest?.categoryId === "category-snacks" &&
    explorerRequest.merchantId === "merchant-rewe",
  "entity resolution did not scope the explorer query",
);
assert(
  answer.metrics[0]?.valueMinor === 800,
  "Ask Finance must return net effective spend, not gross receipt totals",
);
assert(
  answer.provenance[0]?.source === "spending_explorer",
  "Ask Finance must expose deterministic provenance",
);

const aiEngine = new AskFinanceEngine({
  ...deps,
  interpretQuestion: async (question) => ({
    query: {
      intent: "spending",
      question,
      period: {
        kind: "month",
        anchorDate: "2026-09-15",
        label: "last month",
      },
      limit: 8,
    },
    reason: null,
  }),
});

const germanAnswer = await aiEngine.ask(
  "Was habe ich letzten Monat bei REWE ausgegeben?",
  now,
);
assert(
  germanAnswer.query.question ===
    "Was habe ich letzten Monat bei REWE ausgegeben?",
  "AI interpretation must preserve the original question",
);
assert(
  germanAnswer.query.intent === "spending",
  "AI interpretation did not reach deterministic execution",
);

let unnecessaryAiCalls = 0;
const fallbackEngine = new AskFinanceEngine({
  ...deps,
  interpretQuestion: async () => {
    unnecessaryAiCalls += 1;
    throw new Error("AI unavailable");
  },
});
const fallbackAnswer = await fallbackEngine.ask(
  "How much did I spend on Snacks at REWE?",
  now,
);
assert(
  fallbackAnswer.metrics[0]?.valueMinor === 800,
  "deterministic P19 behavior must remain available without AI",
);
assert(
  unnecessaryAiCalls === 0,
  "supported deterministic questions must not spend an AI request",
);

console.log("Ask Finance P19/P21 fixtures passed");
