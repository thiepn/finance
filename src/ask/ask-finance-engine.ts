import type {
  ActivityFilterCatalog,
  ActivityFilterCategory,
  ActivityFilterMerchant,
  ActivityFilterProduct,
} from "../domain/activity.js";
import type {
  AskFinanceAnswer,
  AskFinanceDimension,
  AskFinanceMetric,
  AskFinanceParseResult,
  AskFinancePeriod,
  AskFinanceProvenance,
  AskFinanceQuery,
} from "../domain/ask-finance.js";
import type { OverviewPeriodKind } from "../domain/overview.js";
import type { FinanceActivityService } from "../services/activity.js";
import type { FinanceAskService } from "../services/ask-finance.js";
import type { FinanceOverviewService } from "../services/overview.js";
import type { FinancePlanningService } from "../services/planning.js";
import type { FinanceProductIntelligenceService } from "../services/product-intelligence.js";
import type { FinanceReceiptMatchingService } from "../services/receipt-matching.js";
import type { FinanceRecurringService } from "../services/recurring.js";
import type { FinanceSpendingExplorerService } from "../services/spending-explorer.js";
import type { FinanceWealthService } from "../services/wealth.js";

export interface AskFinanceDependencies {
  activity: FinanceActivityService;
  overview: FinanceOverviewService;
  spendingExplorer: FinanceSpendingExplorerService;
  productIntelligence: FinanceProductIntelligenceService;
  recurring: FinanceRecurringService;
  planning: FinancePlanningService;
  wealth: FinanceWealthService;
  receiptMatching: FinanceReceiptMatchingService;
}

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9€$£%]+/g, " ")
    .trim();
}

function dateOnly(date: Date): string {
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

function shiftedAnchor(now: Date, months: number, years = 0): string {
  const shifted = new Date(
    Date.UTC(
      now.getUTCFullYear() + years,
      now.getUTCMonth() + months,
      Math.min(now.getUTCDate(), 28),
      12,
    ),
  );
  return dateOnly(shifted);
}

function detectPeriod(question: string, now: Date): AskFinancePeriod {
  const q = normalized(question);

  if (/\blast year\b/.test(q)) {
    return {
      kind: "year",
      anchorDate: shiftedAnchor(now, 0, -1),
      label: "last year",
    };
  }
  if (/\b(this|current) year\b|\bytd\b/.test(q)) {
    return { kind: "year", anchorDate: dateOnly(now), label: "this year" };
  }
  if (/\blast quarter\b/.test(q)) {
    return {
      kind: "quarter",
      anchorDate: shiftedAnchor(now, -3),
      label: "last quarter",
    };
  }
  if (/\b(this|current) quarter\b/.test(q)) {
    return {
      kind: "quarter",
      anchorDate: dateOnly(now),
      label: "this quarter",
    };
  }
  if (/\blast week\b/.test(q)) {
    const shifted = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { kind: "week", anchorDate: dateOnly(shifted), label: "last week" };
  }
  if (/\b(this|current) week\b/.test(q)) {
    return { kind: "week", anchorDate: dateOnly(now), label: "this week" };
  }
  if (/\blast month\b/.test(q)) {
    return {
      kind: "month",
      anchorDate: shiftedAnchor(now, -1),
      label: "last month",
    };
  }

  return { kind: "month", anchorDate: dateOnly(now), label: "this month" };
}

function detectDimension(question: string): AskFinanceDimension {
  const q = normalized(question);
  if (/\b(product|products|item|items)\b/.test(q)) return "product";
  if (/\b(merchant|merchants|store|stores|shop|shops)\b/.test(q)) {
    return "merchant";
  }
  if (/\b(essential|flexible|discretionary|necessity|necessities)\b/.test(q)) {
    return "necessity";
  }
  return "category";
}

function detectNecessity(
  question: string,
): AskFinanceQuery["necessity"] {
  const q = normalized(question);
  if (/\bessential(s)?\b/.test(q)) return "essential";
  if (/\bflexible\b/.test(q)) return "flexible";
  if (/\bdiscretionary\b/.test(q)) return "discretionary";
  if (/\bunclassified\b/.test(q)) return "unclassified";
  return null;
}

export function parseAskFinanceQuestion(
  question: string,
  now = new Date(),
): AskFinanceParseResult {
  const clean = question.trim();
  if (!clean) {
    return { query: null, reason: "Ask a finance question first." };
  }

  const q = normalized(clean);
  const period = detectPeriod(clean, now);
  const base = {
    question: clean,
    period,
    limit: 8,
  } satisfies Pick<AskFinanceQuery, "question" | "period" | "limit">;

  if (
    /\breceipt(s)?\b/.test(q) &&
    /\b(unmatched|match|matching|partial|reconcile|reconciliation|missing)\b/.test(q)
  ) {
    return {
      query: { ...base, intent: "receipt_reconciliation" },
      reason: null,
    };
  }

  if (/\bnet worth\b|\bassets?\b|\bliabilit(y|ies)\b/.test(q)) {
    return { query: { ...base, intent: "net_worth" }, reason: null };
  }

  if (
    /\bsafe to spend\b|\bbudget(s|ed|ing)?\b|\bover budget\b|\bremaining budget\b/.test(
      q,
    )
  ) {
    return { query: { ...base, intent: "budget" }, reason: null };
  }

  if (
    /\bsubscription(s)?\b|\brecurring\b|\bmonthly commitments?\b|\bupcoming charges?\b/.test(
      q,
    )
  ) {
    return { query: { ...base, intent: "recurring" }, reason: null };
  }

  if (
    /\bprice(s)?\b/.test(q) &&
    /\b(product|products|item|items|increase|increased|change|changed|cheapest|cost)\b/.test(
      q,
    )
  ) {
    return {
      query: {
        ...base,
        intent: "product_prices",
        dimension: "product",
      },
      reason: null,
    };
  }

  if (
    /\b(top|biggest|largest|highest|most)\b/.test(q) &&
    /\b(spend|spent|spending|expense|expenses|category|categories|merchant|merchants|product|products)\b/.test(
      q,
    )
  ) {
    return {
      query: {
        ...base,
        intent: "top_spending",
        dimension: detectDimension(clean),
        necessity: detectNecessity(clean),
      },
      reason: null,
    };
  }

  if (
    /\bcash flow\b|\bincome\b|\bsavings rate\b|\bsaved\b/.test(q)
  ) {
    return { query: { ...base, intent: "cash_flow" }, reason: null };
  }

  if (/\bspend|spent|spending|expense|expenses|cost|costs\b/.test(q)) {
    return {
      query: {
        ...base,
        intent: "spending",
        necessity: detectNecessity(clean),
      },
      reason: null,
    };
  }

  return {
    query: null,
    reason:
      "I can currently answer spending, cash-flow, product-price, recurring, budget, net-worth, and receipt-reconciliation questions.",
  };
}

function containsEntity(question: string, label: string): boolean {
  const q = ` ${normalized(question)} `;
  const candidate = normalized(label);
  if (candidate.length < 2) return false;
  return q.includes(` ${candidate} `) || q.includes(` ${candidate}`);
}

function bestEntity<T extends { name: string }>(
  question: string,
  rows: readonly T[],
): T | null {
  const matches = rows.filter((row) => containsEntity(question, row.name));
  matches.sort((a, b) => normalized(b.name).length - normalized(a.name).length);
  return matches[0] ?? null;
}

function resolveFromCatalog(
  query: AskFinanceQuery,
  catalog: ActivityFilterCatalog,
): AskFinanceQuery {
  const resolved: AskFinanceQuery = { ...query };

  const category = bestEntity<ActivityFilterCategory>(
    query.question,
    catalog.categories,
  );
  if (category) {
    resolved.categoryId = category.id;
    resolved.categoryLabel = category.name;
  }

  const merchant = bestEntity<ActivityFilterMerchant>(
    query.question,
    catalog.merchants,
  );
  if (merchant) {
    resolved.merchantId = merchant.id;
    resolved.merchantLabel = merchant.name;
  }

  const product = bestEntity<ActivityFilterProduct>(
    query.question,
    catalog.products,
  );
  if (product) {
    resolved.productId = product.id;
    resolved.productLabel = product.name;
  }

  return resolved;
}

function money(
  amountMinor: number,
  currencyCode: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function percent(value: number | null, locale: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

function ratioTone(
  value: number | null,
  lowerIsBetter = false,
): AskFinanceMetric["tone"] {
  if (value === null || value === 0) return "muted";
  if (lowerIsBetter) return value < 0 ? "positive" : "negative";
  return value > 0 ? "positive" : "negative";
}

function scopeText(query: AskFinanceQuery): string {
  const parts: string[] = [];
  if (query.categoryLabel) parts.push(query.categoryLabel);
  if (query.productLabel) parts.push(query.productLabel);
  if (query.merchantLabel) parts.push(`at ${query.merchantLabel}`);
  if (query.necessity) parts.push(query.necessity);
  return parts.length ? ` for ${parts.join(" ")}` : "";
}

function explorerProvenance(): AskFinanceProvenance {
  return {
    source: "spending_explorer",
    label: "Effective spending ledger",
    detail:
      "Posted ledger money movement with P18 receipt-derived categories and merchants only when reconciliation is complete.",
  };
}

function periodRangeForProduct(kind: OverviewPeriodKind): "1m" | "3m" | "1y" {
  if (kind === "quarter") return "3m";
  if (kind === "year") return "1y";
  return "1m";
}

export class AskFinanceEngine implements FinanceAskService {
  constructor(private readonly deps: AskFinanceDependencies) {}

  async ask(question: string, now = new Date()): Promise<AskFinanceAnswer> {
    const parsed = parseAskFinanceQuestion(question, now);
    if (!parsed.query) {
      throw new Error(parsed.reason ?? "Finance could not interpret that question.");
    }

    const catalog = await this.deps.activity.getFilterCatalog(null, 100);
    return this.run(resolveFromCatalog(parsed.query, catalog));
  }

  async run(query: AskFinanceQuery): Promise<AskFinanceAnswer> {
    switch (query.intent) {
      case "spending":
        return this.spending(query);
      case "top_spending":
        return this.topSpending(query);
      case "cash_flow":
        return this.cashFlow(query);
      case "product_prices":
        return this.productPrices(query);
      case "recurring":
        return this.recurring(query);
      case "budget":
        return this.budget(query);
      case "net_worth":
        return this.netWorth(query);
      case "receipt_reconciliation":
        return this.receiptReconciliation(query);
    }
  }

  private async spending(query: AskFinanceQuery): Promise<AskFinanceAnswer> {
    const explorer = await this.deps.spendingExplorer.getExplorer({
      periodKind: query.period.kind,
      anchorDate: query.period.anchorDate,
      categoryId: query.categoryId ?? null,
      merchantId: query.merchantId ?? null,
      necessity: query.necessity ?? null,
      limit: query.limit ?? 8,
    });

    if (query.productId) {
      const productEvidence = await this.deps.spendingExplorer.getProductEvidence({
        productId: query.productId,
        periodStart: explorer.period.start,
        periodEnd: explorer.period.end,
        merchantId: query.merchantId ?? null,
        limit: 200,
      });
      const totalMinor = productEvidence.purchases.reduce(
        (sum, purchase) => sum + purchase.effectiveTotalMinor,
        0,
      );
      const purchaseCount = productEvidence.purchases.length;

      return {
        query,
        title: `${query.productLabel ?? productEvidence.product.name} spending`,
        summary: `Itemized receipt evidence totals ${money(
          totalMinor,
          explorer.profile.currencyCode,
          explorer.profile.locale,
        )} ${query.period.label}${query.merchantLabel ? ` at ${query.merchantLabel}` : ""}.`,
        metrics: [
          {
            key: "itemized_spend",
            label: "Itemized spend",
            displayValue: money(
              totalMinor,
              explorer.profile.currencyCode,
              explorer.profile.locale,
            ),
            valueMinor: totalMinor,
          },
          {
            key: "purchases",
            label: "Receipt items",
            displayValue: String(purchaseCount),
            valueNumber: purchaseCount,
          },
        ],
        evidence: productEvidence.purchases.slice(0, 8).map((purchase) => ({
          kind: "receipt" as const,
          id: purchase.receiptId,
          label: purchase.merchantName,
          detail: `${purchase.occurredAt.slice(0, 10)} · ${money(
            purchase.effectiveTotalMinor,
            explorer.profile.currencyCode,
            explorer.profile.locale,
          )}`,
          route: "receipts",
        })),
        provenance: [
          {
            source: "product_evidence",
            label: "Receipt item evidence",
            detail:
              "Product-level answers use normalized receipt items linked to their reconciled transaction context.",
          },
        ],
        followUps: [
          "Which merchant was cheapest for this product?",
          "How has its price changed?",
        ],
        caveat:
          "Product-level totals require itemized receipt evidence; non-itemized purchases cannot be attributed to a specific product.",
      };
    }

    const current = explorer.summary.current;
    const comparison = explorer.summary.comparison;
    const deltaRatio = explorer.summary.deltaRatio;
    const scope = scopeText(query);

    const evidence = [
      ...explorer.merchants.slice(0, 3).map((row) => ({
        kind: "merchant" as const,
        id: row.merchantId,
        label: row.name,
        detail: money(
          row.currentMinor,
          explorer.profile.currencyCode,
          explorer.profile.locale,
        ),
        route: "insights",
      })),
      ...explorer.children.slice(0, 3).map((row) => ({
        kind: "category" as const,
        id: row.categoryId,
        label: row.name,
        detail: money(
          row.currentMinor,
          explorer.profile.currencyCode,
          explorer.profile.locale,
        ),
        route: "categories",
      })),
    ];

    return {
      query,
      title: `Spending ${query.period.label}`,
      summary: `You spent ${money(
        current.netSpendMinor,
        explorer.profile.currencyCode,
        explorer.profile.locale,
      )}${scope} ${query.period.label}. That is ${money(
        explorer.summary.deltaMinor,
        explorer.profile.currencyCode,
        explorer.profile.locale,
      )} versus the comparison period.`,
      metrics: [
        {
          key: "net_spend",
          label: "Net spend",
          displayValue: money(
            current.netSpendMinor,
            explorer.profile.currencyCode,
            explorer.profile.locale,
          ),
          valueMinor: current.netSpendMinor,
        },
        {
          key: "gross_spend",
          label: "Gross spend",
          displayValue: money(
            current.grossSpendMinor,
            explorer.profile.currencyCode,
            explorer.profile.locale,
          ),
          valueMinor: current.grossSpendMinor,
        },
        {
          key: "recoveries",
          label: "Refunds / reimbursements",
          displayValue: money(
            current.recoveriesMinor,
            explorer.profile.currencyCode,
            explorer.profile.locale,
          ),
          valueMinor: current.recoveriesMinor,
        },
        {
          key: "change",
          label: "vs comparison",
          displayValue: percent(deltaRatio, explorer.profile.locale),
          valueNumber: deltaRatio ?? 0,
          tone: ratioTone(deltaRatio, true),
        },
        {
          key: "transactions",
          label: "Transactions",
          displayValue: String(current.transactionCount),
          valueNumber: current.transactionCount,
        },
        {
          key: "comparison_spend",
          label: "Comparison spend",
          displayValue: money(
            comparison.netSpendMinor,
            explorer.profile.currencyCode,
            explorer.profile.locale,
          ),
          valueMinor: comparison.netSpendMinor,
          tone: "muted",
        },
      ],
      evidence,
      provenance: [explorerProvenance()],
      followUps: [
        "What were my biggest spending categories?",
        "Which merchants cost me the most?",
      ],
    };
  }

  private async topSpending(query: AskFinanceQuery): Promise<AskFinanceAnswer> {
    const explorer = await this.deps.spendingExplorer.getExplorer({
      periodKind: query.period.kind,
      anchorDate: query.period.anchorDate,
      categoryId: query.categoryId ?? null,
      merchantId: query.merchantId ?? null,
      necessity: query.necessity ?? null,
      limit: Math.max(query.limit ?? 8, 8),
    });
    const currency = explorer.profile.currencyCode;
    const locale = explorer.profile.locale;
    const dimension = query.dimension ?? "category";

    const rows: Array<{
      id: string | null;
      label: string;
      currentMinor: number;
      detail: string;
      kind: "category" | "merchant" | "product" | "summary";
      route: string;
    }> =
      dimension === "merchant"
        ? explorer.merchants.map((row) => ({
            id: row.merchantId,
            label: row.name,
            currentMinor: row.currentMinor,
            detail: `${row.transactionCount} transactions`,
            kind: "merchant",
            route: "insights",
          }))
        : dimension === "product"
          ? explorer.products.map((row) => ({
              id: row.productId,
              label: row.name,
              currentMinor: row.currentItemizedMinor,
              detail: `${row.purchaseCount} purchases`,
              kind: "product",
              route: `products?product=${encodeURIComponent(row.productId)}`,
            }))
          : dimension === "necessity"
            ? explorer.necessities.map((row) => ({
                id: null,
                label: row.label,
                currentMinor: row.currentMinor,
                detail: row.share === null ? "No share" : percent(row.share, locale),
                kind: "summary",
                route: "insights",
              }))
            : explorer.children.map((row) => ({
                id: row.categoryId,
                label: row.name,
                currentMinor: row.currentMinor,
                detail: `${row.transactionCount} transactions`,
                kind: "category",
                route: "categories",
              }));

    const ranked = rows
      .filter((row) => row.currentMinor !== 0)
      .sort((a, b) => b.currentMinor - a.currentMinor)
      .slice(0, query.limit ?? 8);

    const label =
      dimension === "merchant"
        ? "merchants"
        : dimension === "product"
          ? "products"
          : dimension === "necessity"
            ? "necessity groups"
            : "categories";

    return {
      query,
      title: `Top ${label} ${query.period.label}`,
      summary:
        ranked.length > 0
          ? `${ranked[0]!.label} was the largest ${dimension} at ${money(
              ranked[0]!.currentMinor,
              currency,
              locale,
            )}${scopeText(query)}.`
          : `No ranked ${label} were found ${query.period.label}${scopeText(query)}.`,
      metrics: ranked.slice(0, 5).map((row, index) => ({
        key: `rank_${index + 1}`,
        label: `#${index + 1} ${row.label}`,
        displayValue: money(row.currentMinor, currency, locale),
        valueMinor: row.currentMinor,
      })),
      evidence: ranked.map((row) => ({
        kind: row.kind,
        id: row.id,
        label: row.label,
        detail: `${money(row.currentMinor, currency, locale)} · ${row.detail}`,
        route: row.route,
      })),
      provenance: [explorerProvenance()],
      followUps:
        dimension === "merchant"
          ? ["What did I buy at the top merchant?", "Show top categories instead."]
          : ["Which merchants cost me the most?", "How does this compare with last month?"],
    };
  }

  private async cashFlow(query: AskFinanceQuery): Promise<AskFinanceAnswer> {
    const dashboard = await this.deps.overview.getDashboard({
      periodKind: query.period.kind,
      anchorDate: query.period.anchorDate,
      recentLimit: 6,
    });
    const { currencyCode, locale } = dashboard.profile;

    return {
      query,
      title: `Cash flow ${query.period.label}`,
      summary: `Income was ${money(
        dashboard.summary.incomeMinor,
        currencyCode,
        locale,
      )}, net spending was ${money(
        dashboard.summary.netSpentMinor,
        currencyCode,
        locale,
      )}, and net cash flow was ${money(
        dashboard.summary.netCashFlowMinor,
        currencyCode,
        locale,
      )}.`,
      metrics: [
        {
          key: "income",
          label: "Income",
          displayValue: money(dashboard.summary.incomeMinor, currencyCode, locale),
          valueMinor: dashboard.summary.incomeMinor,
          tone: "positive",
        },
        {
          key: "spending",
          label: "Net spending",
          displayValue: money(dashboard.summary.netSpentMinor, currencyCode, locale),
          valueMinor: dashboard.summary.netSpentMinor,
        },
        {
          key: "cash_flow",
          label: "Net cash flow",
          displayValue: money(
            dashboard.summary.netCashFlowMinor,
            currencyCode,
            locale,
          ),
          valueMinor: dashboard.summary.netCashFlowMinor,
          tone:
            dashboard.summary.netCashFlowMinor >= 0 ? "positive" : "negative",
        },
        {
          key: "savings_rate",
          label: "Savings rate",
          displayValue: percent(dashboard.summary.savingsRate, locale),
          valueNumber: dashboard.summary.savingsRate ?? 0,
        },
      ],
      evidence: dashboard.recentActivity.slice(0, 6).map((item) => ({
        kind: item.entityKind,
        id: item.id,
        label: item.title,
        detail:
          item.amountMinor === null
            ? item.occurredAt.slice(0, 10)
            : `${item.occurredAt.slice(0, 10)} · ${money(
                item.amountMinor,
                item.currencyCode,
                locale,
              )}`,
        route: "activity",
      })),
      provenance: [
        {
          source: "overview",
          label: "Overview ledger summary",
          detail:
            "Income, spending, recoveries, and cash flow come from posted Finance ledger transactions for the requested period.",
        },
      ],
      followUps: [
        "What were my biggest expenses?",
        "How much did I save compared with last month?",
      ],
    };
  }

  private async productPrices(query: AskFinanceQuery): Promise<AskFinanceAnswer> {
    const catalog = await this.deps.productIntelligence.getCatalog({
      limit: 100,
    });
    const range = periodRangeForProduct(query.period.kind);
    const locale = catalog.profile.locale;
    const currency = catalog.profile.currencyCode;

    let candidates = [...catalog.products];
    if (query.categoryId) {
      candidates = candidates.filter(
        (product) => product.categoryId === query.categoryId,
      );
    }
    if (query.productId) {
      candidates = candidates.filter(
        (product) => product.productId === query.productId,
      );
    }

    candidates.sort((a, b) => b.purchaseCount - a.purchaseCount);
    candidates = candidates.slice(0, query.productId ? 1 : 20);

    const analyses = await Promise.all(
      candidates.map(async (product) => {
        try {
          const analytics = await this.deps.productIntelligence.getProductAnalytics({
            productId: product.productId,
            range,
            anchorDate: query.period.anchorDate,
          });
          return { product, analytics };
        } catch {
          return null;
        }
      }),
    );

    const usable = analyses.filter(
      (
        value,
      ): value is NonNullable<(typeof analyses)[number]> => value !== null,
    );

    if (query.productId && usable[0]) {
      const { product, analytics } = usable[0];
      const latest = analytics.latestPrice;
      return {
        query,
        title: `${product.name} price`,
        summary:
          latest.latestUnitPriceMinor === null
            ? `There is not enough price evidence for ${product.name}.`
            : `The latest observed unit price is ${money(
                latest.latestUnitPriceMinor,
                currency,
                locale,
              )}. ${latest.changeRatio === null ? "There is no comparable prior price yet." : `That is ${percent(latest.changeRatio, locale)} versus the previous observation.`}`,
        metrics: [
          {
            key: "latest_price",
            label: "Latest price",
            displayValue:
              latest.latestUnitPriceMinor === null
                ? "—"
                : money(latest.latestUnitPriceMinor, currency, locale),
            valueMinor: latest.latestUnitPriceMinor ?? 0,
          },
          {
            key: "price_change",
            label: "Price change",
            displayValue: percent(latest.changeRatio, locale),
            valueNumber: latest.changeRatio ?? 0,
            tone: ratioTone(latest.changeRatio, true),
          },
          {
            key: "purchases",
            label: "Purchases",
            displayValue: String(analytics.summary.current.purchaseCount),
            valueNumber: analytics.summary.current.purchaseCount,
          },
        ],
        evidence: analytics.priceHistory.slice(-8).reverse().map((row) => ({
          kind: "product" as const,
          id: product.productId,
          label: row.merchantName,
          detail: `${row.observedAt.slice(0, 10)} · ${money(
            row.effectiveUnitPriceMinor,
            row.currencyCode,
            locale,
          )}`,
          route: `products?product=${encodeURIComponent(product.productId)}`,
        })),
        provenance: [
          {
            source: "product_intelligence",
            label: "Normalized product price history",
            detail:
              "Price changes use normalized receipt products and their observed unit prices; comparisons never infer prices from transaction totals.",
          },
        ],
        followUps: [
          "Which merchant was cheapest for this product?",
          "Which products increased most in price?",
        ],
      };
    }

    const increases = usable
      .filter(
        (row) =>
          row.analytics.latestPrice.changeRatio !== null &&
          row.analytics.latestPrice.changeRatio > 0,
      )
      .sort(
        (a, b) =>
          (b.analytics.latestPrice.changeRatio ?? 0) -
          (a.analytics.latestPrice.changeRatio ?? 0),
      )
      .slice(0, query.limit ?? 8);

    return {
      query,
      title: `Largest product price increases ${query.period.label}`,
      summary:
        increases.length > 0
          ? `${increases[0]!.product.name} has the largest observed increase at ${percent(
              increases[0]!.analytics.latestPrice.changeRatio,
              locale,
            )}${query.categoryLabel ? ` among ${query.categoryLabel} products` : ""}.`
          : `No product price increases with enough comparable evidence were found${query.categoryLabel ? ` for ${query.categoryLabel}` : ""}.`,
      metrics: increases.slice(0, 5).map((row, index) => ({
        key: `price_rank_${index + 1}`,
        label: row.product.name,
        displayValue: percent(row.analytics.latestPrice.changeRatio, locale),
        valueNumber: row.analytics.latestPrice.changeRatio ?? 0,
        tone: "negative",
      })),
      evidence: increases.map((row) => ({
        kind: "product" as const,
        id: row.product.productId,
        label: row.product.name,
        detail: `${percent(
          row.analytics.latestPrice.changeRatio,
          locale,
        )} · latest ${row.analytics.latestPrice.latestUnitPriceMinor === null ? "—" : money(row.analytics.latestPrice.latestUnitPriceMinor, currency, locale)}`,
        route: `products?product=${encodeURIComponent(row.product.productId)}`,
      })),
      provenance: [
        {
          source: "product_intelligence",
          label: "Normalized product price history",
          detail:
            "Ranking is based only on products with a comparable previous unit-price observation.",
        },
      ],
      followUps: [
        "Show the price history for the top product.",
        "Which products got cheaper?",
      ],
      caveat:
        "Price intelligence is limited to products captured and normalized from itemized receipts.",
    };
  }

  private async recurring(query: AskFinanceQuery): Promise<AskFinanceAnswer> {
    const dashboard = await this.deps.recurring.getDashboard(
      query.period.anchorDate,
      45,
    );
    const { currencyCode, locale } = dashboard.profile;
    const subscriptionQuestion = /subscription/.test(normalized(query.question));
    const primary = subscriptionQuestion
      ? dashboard.summary.monthlySubscriptionMinor
      : dashboard.summary.monthlyExpenseMinor;

    return {
      query,
      title: subscriptionQuestion ? "Subscriptions" : "Recurring commitments",
      summary: subscriptionQuestion
        ? `Subscriptions currently total about ${money(
            primary,
            currencyCode,
            locale,
          )} per month across ${dashboard.summary.subscriptionCount} subscriptions.`
        : `Recurring expenses currently total about ${money(
            primary,
            currencyCode,
            locale,
          )} per month across ${dashboard.summary.activeCount} active patterns.`,
      metrics: [
        {
          key: "monthly",
          label: subscriptionQuestion
            ? "Monthly subscriptions"
            : "Monthly recurring",
          displayValue: money(primary, currencyCode, locale),
          valueMinor: primary,
        },
        {
          key: "annualized",
          label: "Annualized recurring",
          displayValue: money(
            dashboard.summary.annualizedExpenseMinor,
            currencyCode,
            locale,
          ),
          valueMinor: dashboard.summary.annualizedExpenseMinor,
        },
        {
          key: "next_30d",
          label: "Next 30 days",
          displayValue: money(
            dashboard.summary.next30dExpenseMinor,
            currencyCode,
            locale,
          ),
          valueMinor: dashboard.summary.next30dExpenseMinor,
        },
        {
          key: "attention",
          label: "Needs attention",
          displayValue: String(dashboard.summary.attentionCount),
          valueNumber: dashboard.summary.attentionCount,
          tone: dashboard.summary.attentionCount > 0 ? "warning" : "muted",
        },
      ],
      evidence: dashboard.patterns
        .filter((pattern) => !subscriptionQuestion || pattern.subscription !== null)
        .sort((a, b) => b.monthlyEquivalentMinor - a.monthlyEquivalentMinor)
        .slice(0, 8)
        .map((pattern) => ({
          kind: "recurring" as const,
          id: pattern.patternId,
          label: pattern.name,
          detail: `${money(
            pattern.monthlyEquivalentMinor,
            currencyCode,
            locale,
          )}/month · ${pattern.health.replaceAll("_", " ")}`,
          route: "recurring",
        })),
      provenance: [
        {
          source: "recurring",
          label: "Recurring-pattern engine",
          detail:
            "Monthly equivalents and upcoming charges come from confirmed recurring patterns and linked posted transactions.",
        },
      ],
      followUps: [
        "Which subscriptions increased in price?",
        "What recurring charges are due next?",
      ],
    };
  }

  private async budget(query: AskFinanceQuery): Promise<AskFinanceAnswer> {
    const dashboard = await this.deps.planning.getDashboard(
      query.period.anchorDate,
    );
    const { currencyCode, locale } = dashboard.profile;
    const allocation = query.categoryId
      ? dashboard.allocations.find(
          (row) => row.categoryId === query.categoryId,
        ) ?? null
      : null;

    if (allocation) {
      return {
        query,
        title: `${allocation.categoryName} budget`,
        summary: `${allocation.categoryName} has ${money(
          allocation.remainingMinor,
          currencyCode,
          locale,
        )} remaining after ${money(
          allocation.spentMinor,
          currencyCode,
          locale,
        )} spent.`,
        metrics: [
          {
            key: "planned",
            label: "Plan",
            displayValue: money(
              allocation.effectivePlannedMinor,
              currencyCode,
              locale,
            ),
            valueMinor: allocation.effectivePlannedMinor,
          },
          {
            key: "spent",
            label: "Spent",
            displayValue: money(allocation.spentMinor, currencyCode, locale),
            valueMinor: allocation.spentMinor,
          },
          {
            key: "remaining",
            label: "Remaining",
            displayValue: money(
              allocation.remainingMinor,
              currencyCode,
              locale,
            ),
            valueMinor: allocation.remainingMinor,
            tone: allocation.remainingMinor >= 0 ? "positive" : "negative",
          },
          {
            key: "projected",
            label: "Projected",
            displayValue: money(
              allocation.projectedSpendMinor,
              currencyCode,
              locale,
            ),
            valueMinor: allocation.projectedSpendMinor,
          },
        ],
        evidence: [
          {
            kind: "budget",
            id: allocation.allocationId,
            label: allocation.categoryName,
            detail: allocation.status.replaceAll("_", " "),
            route: "budget",
          },
        ],
        provenance: [
          {
            source: "planning",
            label: "Budget planning model",
            detail:
              "Budget answers combine configured allocations, actual effective spending, rollover, recurring commitments, and pacing.",
          },
        ],
        followUps: ["Am I on track overall?", "How much is safe to spend?"],
      };
    }

    const budget = dashboard.budget;
    const safe = budget.safeToSpendMinor;
    return {
      query,
      title: "Budget status",
      summary: budget.configured
        ? `Your budget is ${budget.status.replaceAll("_", " ")}. ${safe === null ? "Safe-to-spend is not available yet." : `Safe to spend is ${money(safe, currencyCode, locale)}.`}`
        : "No active budget is configured.",
      metrics: [
        {
          key: "safe_to_spend",
          label: "Safe to spend",
          displayValue:
            safe === null ? "—" : money(safe, currencyCode, locale),
          valueMinor: safe ?? 0,
          tone: safe !== null && safe < 0 ? "negative" : "default",
        },
        {
          key: "remaining",
          label: "Budget remaining",
          displayValue:
            budget.remainingMinor === null
              ? "—"
              : money(budget.remainingMinor, currencyCode, locale),
          valueMinor: budget.remainingMinor ?? 0,
        },
        {
          key: "projected_spend",
          label: "Projected spend",
          displayValue:
            budget.projectedSpendMinor === null
              ? "—"
              : money(budget.projectedSpendMinor, currencyCode, locale),
          valueMinor: budget.projectedSpendMinor ?? 0,
        },
        {
          key: "projected_surplus",
          label: "Projected surplus",
          displayValue:
            budget.projectedSurplusMinor === null
              ? "—"
              : money(budget.projectedSurplusMinor, currencyCode, locale),
          valueMinor: budget.projectedSurplusMinor ?? 0,
        },
      ],
      evidence: dashboard.allocations.slice(0, 8).map((row) => ({
        kind: "budget" as const,
        id: row.allocationId,
        label: row.categoryName,
        detail: `${money(row.remainingMinor, currencyCode, locale)} remaining · ${row.status.replaceAll("_", " ")}`,
        route: "budget",
      })),
      provenance: [
        {
          source: "planning",
          label: "Budget planning model",
          detail:
            "Safe-to-spend includes actual spending, remaining plan, recurring commitments, and goal funding where configured.",
        },
      ],
      followUps: [
        "Which budget categories are at risk?",
        "What recurring expenses are still coming?",
      ],
    };
  }

  private async netWorth(query: AskFinanceQuery): Promise<AskFinanceAnswer> {
    const dashboard = await this.deps.wealth.getDashboard(
      query.period.kind === "year" ? 24 : 12,
      query.period.anchorDate,
    );
    const { currencyCode, locale } = dashboard.profile;

    return {
      query,
      title: "Net worth",
      summary: `Net worth is ${money(
        dashboard.summary.netWorthMinor,
        currencyCode,
        locale,
      )}, with ${money(
        dashboard.summary.assetsMinor,
        currencyCode,
        locale,
      )} in assets and ${money(
        dashboard.summary.liabilitiesMinor,
        currencyCode,
        locale,
      )} in liabilities.`,
      metrics: [
        {
          key: "net_worth",
          label: "Net worth",
          displayValue: money(
            dashboard.summary.netWorthMinor,
            currencyCode,
            locale,
          ),
          valueMinor: dashboard.summary.netWorthMinor,
        },
        {
          key: "assets",
          label: "Assets",
          displayValue: money(
            dashboard.summary.assetsMinor,
            currencyCode,
            locale,
          ),
          valueMinor: dashboard.summary.assetsMinor,
        },
        {
          key: "liabilities",
          label: "Liabilities",
          displayValue: money(
            dashboard.summary.liabilitiesMinor,
            currencyCode,
            locale,
          ),
          valueMinor: dashboard.summary.liabilitiesMinor,
        },
        {
          key: "month_change",
          label: "Monthly change",
          displayValue: money(
            dashboard.summary.monthChangeMinor,
            currencyCode,
            locale,
          ),
          valueMinor: dashboard.summary.monthChangeMinor,
          tone:
            dashboard.summary.monthChangeMinor >= 0 ? "positive" : "negative",
        },
        {
          key: "savings_rate",
          label: "Current savings rate",
          displayValue: percent(
            dashboard.savings.currentMonthSavingsRate,
            locale,
          ),
          valueNumber: dashboard.savings.currentMonthSavingsRate ?? 0,
        },
      ],
      evidence: dashboard.accounts
        .filter((account) => account.includeInNetWorth)
        .sort(
          (a, b) =>
            Math.abs(b.displayBalanceMinor) - Math.abs(a.displayBalanceMinor),
        )
        .slice(0, 8)
        .map((account) => ({
          kind: "account" as const,
          id: account.accountId,
          label: account.name,
          detail: `${money(
            account.displayBalanceMinor,
            currencyCode,
            locale,
          )} · ${account.balanceBasis.replaceAll("_", " ")}`,
          route: "accounts",
        })),
      provenance: [
        {
          source: "wealth",
          label: "Net-worth engine",
          detail:
            "Balances combine included account ledger positions with the latest balance observations and valuation bridge where applicable.",
        },
      ],
      followUps: [
        "How much did my net worth change this year?",
        "What is my savings rate?",
      ],
    };
  }

  private async receiptReconciliation(
    query: AskFinanceQuery,
  ): Promise<AskFinanceAnswer> {
    const dashboard = await this.deps.receiptMatching.getDashboard(60);
    const unresolved = dashboard.receipts.filter(
      (receipt) =>
        receipt.matchStatus !== "matched" &&
        receipt.matchStatus !== "multi_payment_matched",
    );

    return {
      query,
      title: "Receipt reconciliation",
      summary: `${dashboard.summary.unmatchedCount} receipts are unmatched, ${dashboard.summary.suggestedCount} have suggested matches, and ${dashboard.summary.partialCount} are partially matched.`,
      metrics: [
        {
          key: "unmatched",
          label: "Unmatched",
          displayValue: String(dashboard.summary.unmatchedCount),
          valueNumber: dashboard.summary.unmatchedCount,
          tone:
            dashboard.summary.unmatchedCount > 0 ? "warning" : "muted",
        },
        {
          key: "suggested",
          label: "Suggested",
          displayValue: String(dashboard.summary.suggestedCount),
          valueNumber: dashboard.summary.suggestedCount,
        },
        {
          key: "partial",
          label: "Partial",
          displayValue: String(dashboard.summary.partialCount),
          valueNumber: dashboard.summary.partialCount,
          tone: dashboard.summary.partialCount > 0 ? "warning" : "muted",
        },
        {
          key: "matched",
          label: "Matched",
          displayValue: String(dashboard.summary.matchedCount),
          valueNumber: dashboard.summary.matchedCount,
          tone: "positive",
        },
      ],
      evidence: unresolved.slice(0, 10).map((receipt) => ({
        kind: "receipt" as const,
        id: receipt.receiptId,
        label: receipt.merchantName,
        detail: `${receipt.purchasedAt?.slice(0, 10) ?? "No date"} · ${receipt.matchStatus.replaceAll("_", " ")}`,
        route: "receipts",
      })),
      provenance: [
        {
          source: "receipt_matching",
          label: "P18 receipt ↔ transaction reconciliation",
          detail:
            "Match state is separate from receipt arithmetic review and does not create or duplicate financial transactions.",
        },
      ],
      followUps: [
        "Open the receipt matching queue.",
        "How much did I actually spend last month?",
      ],
    };
  }
}
