import type {
  ExplorerCategoryRow,
  ExplorerMerchantRow,
  ExplorerNecessityRow,
  ExplorerProductRow,
  ExplorerSeriesPoint,
  ProductPurchaseEvidence,
  ProductPurchaseEvidenceRequest,
  SpendingExplorer,
  SpendingExplorerRequest,
} from "../domain/spending-explorer.js";
import type { FinanceSpendingExplorerService } from "./spending-explorer.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function assertResult<T>(
  result: { data: T | null; error: { message: string } | null },
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

function parseSeriesPoint(value: unknown): ExplorerSeriesPoint {
  const raw = record(value, "explorer series point");
  return {
    bucketIndex: Number(raw.bucket_index),
    bucketStart: String(raw.bucket_start),
    bucketEnd: String(raw.bucket_end),
    netSpendMinor: Number(raw.net_spend_minor),
    grossSpendMinor: Number(raw.gross_spend_minor),
    recoveriesMinor: Number(raw.recoveries_minor),
    transactionCount: Number(raw.transaction_count),
  };
}

function parseCategory(value: unknown): ExplorerCategoryRow {
  const raw = record(value, "explorer category row");
  return {
    categoryId: String(raw.category_id),
    name: String(raw.name),
    currentMinor: Number(raw.current_minor),
    previousMinor: Number(raw.previous_minor),
    deltaMinor: Number(raw.delta_minor),
    deltaRatio: nullableNumber(raw.delta_ratio),
    share: nullableNumber(raw.share),
    transactionCount: Number(raw.transaction_count),
    hasChildren: Boolean(raw.has_children),
  };
}

function parseMerchant(value: unknown): ExplorerMerchantRow {
  const raw = record(value, "explorer merchant row");
  return {
    merchantId: nullableString(raw.merchant_id),
    name: String(raw.name),
    currentMinor: Number(raw.current_minor),
    previousMinor: Number(raw.previous_minor),
    deltaMinor: Number(raw.delta_minor),
    deltaRatio: nullableNumber(raw.delta_ratio),
    share: nullableNumber(raw.share),
    transactionCount: Number(raw.transaction_count),
  };
}

function parseNecessity(value: unknown): ExplorerNecessityRow {
  const raw = record(value, "explorer necessity row");
  return {
    necessity: String(raw.necessity) as ExplorerNecessityRow["necessity"],
    label: String(raw.label),
    currentMinor: Number(raw.current_minor),
    previousMinor: Number(raw.previous_minor),
    deltaMinor: Number(raw.delta_minor),
    deltaRatio: nullableNumber(raw.delta_ratio),
    share: nullableNumber(raw.share),
  };
}

function parseProduct(value: unknown): ExplorerProductRow {
  const raw = record(value, "explorer product row");
  return {
    productId: String(raw.product_id),
    name: String(raw.name),
    brand: nullableString(raw.brand),
    familyId: nullableString(raw.family_id),
    familyName: nullableString(raw.family_name),
    productType: nullableString(raw.product_type),
    currentItemizedMinor: Number(raw.current_itemized_minor),
    previousItemizedMinor: Number(raw.previous_itemized_minor),
    deltaMinor: Number(raw.delta_minor),
    deltaRatio: nullableNumber(raw.delta_ratio),
    purchaseCount: Number(raw.purchase_count),
    quantity: Number(raw.quantity),
    shareOfItemized: nullableNumber(raw.share_of_itemized),
  };
}

function parseExplorer(raw: Record<string, unknown>): SpendingExplorer {
  const profile = record(raw.profile, "explorer profile");
  const period = record(raw.period, "explorer period");
  const scope = record(raw.scope, "explorer scope");
  const summary = record(raw.summary, "explorer summary");
  const current = record(summary.current, "explorer current summary");
  const comparison = record(summary.comparison, "explorer comparison summary");
  const series = record(raw.series, "explorer series");

  return {
    periodKind: String(raw.period_kind) as SpendingExplorer["periodKind"],
    anchorDate: String(raw.anchor_date),
    profile: {
      currencyCode: String(profile.currency_code),
      locale: String(profile.locale),
      timeZone: String(profile.time_zone),
    },
    period: {
      start: String(period.start),
      end: String(period.end),
      compareStart: String(period.compare_start),
      compareEnd: String(period.compare_end),
    },
    bucketKind: String(raw.bucket_kind) as SpendingExplorer["bucketKind"],
    scope: {
      categoryId: nullableString(scope.category_id),
      merchantId: nullableString(scope.merchant_id),
      necessity:
        scope.necessity === null || scope.necessity === undefined
          ? null
          : (String(scope.necessity) as SpendingExplorer["scope"]["necessity"]),
      categoryName: nullableString(scope.category_name),
      merchantName: nullableString(scope.merchant_name),
      breadcrumb: Array.isArray(scope.breadcrumb)
        ? scope.breadcrumb.map((item) => {
            const row = record(item, "explorer breadcrumb");
            return {
              categoryId: String(row.category_id),
              name: String(row.name),
            };
          })
        : [],
    },
    summary: {
      current: {
        grossSpendMinor: Number(current.gross_spend_minor),
        recoveriesMinor: Number(current.recoveries_minor),
        netSpendMinor: Number(current.net_spend_minor),
        transactionCount: Number(current.transaction_count),
      },
      comparison: {
        grossSpendMinor: Number(comparison.gross_spend_minor),
        recoveriesMinor: Number(comparison.recoveries_minor),
        netSpendMinor: Number(comparison.net_spend_minor),
        transactionCount: Number(comparison.transaction_count),
      },
      deltaMinor: Number(summary.delta_minor),
      deltaRatio: nullableNumber(summary.delta_ratio),
      itemizedEvidenceMinor: Number(summary.itemized_evidence_minor),
      itemizedCoverageRatio: nullableNumber(summary.itemized_coverage_ratio),
    },
    series: {
      current: Array.isArray(series.current)
        ? series.current.map(parseSeriesPoint)
        : [],
      comparison: Array.isArray(series.comparison)
        ? series.comparison.map(parseSeriesPoint)
        : [],
    },
    children: Array.isArray(raw.children)
      ? raw.children.map(parseCategory)
      : [],
    directCategoryMinor: nullableNumber(raw.direct_category_minor),
    merchants: Array.isArray(raw.merchants)
      ? raw.merchants.map(parseMerchant)
      : [],
    necessities: Array.isArray(raw.necessities)
      ? raw.necessities.map(parseNecessity)
      : [],
    products: Array.isArray(raw.products)
      ? raw.products.map(parseProduct)
      : [],
  };
}

function parseEvidence(raw: Record<string, unknown>): ProductPurchaseEvidence {
  const product = record(raw.product, "product evidence product");
  const period = record(raw.period, "product evidence period");

  return {
    product: {
      productId: String(product.product_id),
      name: String(product.name),
      brand: nullableString(product.brand),
      familyId: nullableString(product.family_id),
      familyName: nullableString(product.family_name),
      productType: nullableString(product.product_type),
      sizeValue: nullableNumber(product.size_value),
      sizeUnit: nullableString(product.size_unit),
    },
    period: {
      start: String(period.start),
      end: String(period.end),
    },
    purchases: Array.isArray(raw.purchases)
      ? raw.purchases.map((item) => {
          const row = record(item, "product purchase evidence");
          return {
            receiptItemId: String(row.receipt_item_id),
            receiptId: String(row.receipt_id),
            occurredAt: String(row.occurred_at),
            transactionIds: Array.isArray(row.transaction_ids)
              ? row.transaction_ids.map(String)
              : [],
            merchantId: nullableString(row.merchant_id),
            merchantName: String(row.merchant_name),
            quantity: Number(row.quantity),
            unitPriceMinor: nullableNumber(row.unit_price_minor),
            effectiveTotalMinor: Number(row.effective_total_minor),
            discountMinor: Number(row.discount_minor),
            depositMinor: Number(row.deposit_minor),
            categoryId: nullableString(row.category_id),
            categoryName: nullableString(row.category_name),
            necessity: String(row.necessity) as ProductPurchaseEvidence["purchases"][number]["necessity"],
          };
        })
      : [],
  };
}

export class SupabaseFinanceSpendingExplorerService
  implements FinanceSpendingExplorerService
{
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async getExplorer(
    request: SpendingExplorerRequest = {},
  ): Promise<SpendingExplorer> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_spending_explorer_period",
      {
        p_period_kind: request.periodKind ?? "month",
        p_anchor_date: request.anchorDate ?? null,
        p_category_id: request.categoryId ?? null,
        p_merchant_id: request.merchantId ?? null,
        p_necessity: request.necessity ?? null,
        p_limit: request.limit ?? 8,
      },
    );

    return parseExplorer(assertResult(result, "getSpendingExplorer"));
  }

  async getProductEvidence(
    request: ProductPurchaseEvidenceRequest,
  ): Promise<ProductPurchaseEvidence> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_product_purchase_evidence",
      {
        p_product_id: request.productId,
        p_period_start: request.periodStart,
        p_period_end: request.periodEnd,
        p_merchant_id: request.merchantId ?? null,
        p_limit: request.limit ?? 30,
      },
    );

    return parseEvidence(assertResult(result, "getProductPurchaseEvidence"));
  }
}
