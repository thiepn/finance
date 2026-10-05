import type { RuleSource } from "../domain/classification.js";
import type { Necessity, UUID } from "../domain/finance.js";
import type {
  CreateProductInput,
  ProductAliasResolution,
  ProductAssignmentResult,
  ProductCandidate,
  ProductDetail,
  ProductFamily,
  ProductNormalizationQueueItem,
  ProductSummary,
  ProductAnalytics,
  ProductAnalyticsRequest,
  ProductCatalog,
  ProductCatalogItem,
  ProductCatalogRequest,
  ProductCheapestMerchant,
  ProductFamilyVariant,
  ProductFrequencyPoint,
  ProductLatestPrice,
  ProductMerchantPrice,
  ProductPeriodSummary,
  ProductPricePoint,
} from "../domain/product-intelligence.js";
import type {
  FinanceProductIntelligenceService,
  UpsertProductFamilyInput,
} from "./product-intelligence.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}


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

function parseAliasResolution(
  raw: Record<string, unknown> | null,
): ProductAliasResolution {
  if (!raw) {
    return {
      productId: null,
      productName: null,
      familyId: null,
      aliasId: null,
      matchType: "none",
      source: null,
      confidence: null,
      normalizedInput: "",
    };
  }

  return {
    productId: raw.product_id === null ? null : String(raw.product_id),
    productName:
      raw.product_name === null || raw.product_name === undefined
        ? null
        : String(raw.product_name),
    familyId:
      raw.family_id === null || raw.family_id === undefined
        ? null
        : String(raw.family_id),
    aliasId:
      raw.alias_id === null || raw.alias_id === undefined
        ? null
        : String(raw.alias_id),
    matchType: String(raw.match_type ?? "none") as ProductAliasResolution["matchType"],
    source:
      raw.source === null || raw.source === undefined
        ? null
        : (String(raw.source) as RuleSource),
    confidence:
      raw.confidence === null || raw.confidence === undefined
        ? null
        : Number(raw.confidence),
    normalizedInput: String(raw.normalized_input ?? ""),
  };
}

function parseAssignment(raw: Record<string, unknown>): ProductAssignmentResult {
  const base = {
    receiptItemId: String(raw.receipt_item_id),
    productId: String(raw.product_id),
    productName: String(raw.product_name),
    familyId:
      raw.family_id === null || raw.family_id === undefined
        ? null
        : String(raw.family_id),
    aliasId:
      raw.alias_id === null || raw.alias_id === undefined
        ? null
        : String(raw.alias_id),
    normalizationStatus: String(
      raw.normalization_status,
    ) as ProductAssignmentResult["normalizationStatus"],
    normalizationReviewRequired: Boolean(
      raw.normalization_review_required,
    ),
    categoryId:
      raw.category_id === null || raw.category_id === undefined
        ? null
        : String(raw.category_id),
    necessity: String(raw.necessity) as Necessity,
  };

  if (raw.match_type) {
    return {
      ...base,
      matchType: String(
        raw.match_type,
      ) as NonNullable<ProductAssignmentResult["matchType"]>,
    };
  }

  return base;
}

function parseQueueItem(raw: Record<string, unknown>): ProductNormalizationQueueItem {
  return {
    receiptItemId: String(raw.receipt_item_id),
    receiptId: String(raw.receipt_id),
    lineIndex: Number(raw.line_index),
    rawName: String(raw.raw_name),
    normalizedName:
      raw.normalized_name === null ? null : String(raw.normalized_name),
    productId: raw.product_id === null ? null : String(raw.product_id),
    normalizationStatus: String(
      raw.normalization_status,
    ) as ProductNormalizationQueueItem["normalizationStatus"],
    normalizationSource:
      raw.normalization_source === null
        ? null
        : (String(raw.normalization_source) as RuleSource),
    normalizationConfidence:
      raw.normalization_confidence === null
        ? null
        : Number(raw.normalization_confidence),
    normalizationReviewRequired: Boolean(
      raw.normalization_review_required,
    ),
    itemConfidence:
      raw.item_confidence === null ? null : Number(raw.item_confidence),
    merchantId: raw.merchant_id === null ? null : String(raw.merchant_id),
    merchantName:
      raw.merchant_name === null ? null : String(raw.merchant_name),
    purchasedAt:
      raw.purchased_at === null ? null : String(raw.purchased_at),
    amountMinor: Number(raw.amount_minor),
    currencyCode: String(raw.currency_code),
    exactMatch: parseAliasResolution(
      raw.exact_match && typeof raw.exact_match === "object"
        ? (raw.exact_match as Record<string, unknown>)
        : null,
    ),
  };
}

function parseProduct(raw: Record<string, unknown>): ProductSummary {
  return {
    id: String(raw.id),
    name: String(raw.name),
    normalizedName: String(raw.normalized_name),
    brand: raw.brand === null ? null : String(raw.brand),
    familyId: raw.family_id === null ? null : String(raw.family_id),
    familyName: raw.family_name === null ? null : String(raw.family_name),
    variantName:
      raw.variant_name === null ? null : String(raw.variant_name),
    productType:
      raw.product_type === null ? null : String(raw.product_type),
    barcode: raw.barcode === null ? null : String(raw.barcode),
    sizeValue: raw.size_value === null ? null : Number(raw.size_value),
    sizeUnit: raw.size_unit === null ? null : String(raw.size_unit),
    defaultCategoryId:
      raw.default_category_id === null
        ? null
        : String(raw.default_category_id),
    defaultNecessity: String(raw.default_necessity) as Necessity,
    source: String(raw.source) as RuleSource,
    confidence: raw.confidence === null ? null : Number(raw.confidence),
    purchaseCount: Number(raw.purchase_count ?? 0),
    totalSpendMinor: Number(raw.total_spend_minor ?? 0),
    totalQuantity: Number(raw.total_quantity ?? 0),
    firstPurchaseAt:
      raw.first_purchase_at === null ? null : String(raw.first_purchase_at),
    lastPurchaseAt:
      raw.last_purchase_at === null ? null : String(raw.last_purchase_at),
    minUnitPriceMinor:
      raw.min_unit_price_minor === null
        ? null
        : Number(raw.min_unit_price_minor),
    maxUnitPriceMinor:
      raw.max_unit_price_minor === null
        ? null
        : Number(raw.max_unit_price_minor),
    avgUnitPriceMinor:
      raw.avg_unit_price_minor === null
        ? null
        : Number(raw.avg_unit_price_minor),
  };
}


function parseCatalogItem(value: unknown): ProductCatalogItem {
  const raw = record(value, "product catalog item");
  return {
    productId: String(raw.product_id),
    name: String(raw.name),
    brand: nullableString(raw.brand),
    familyId: nullableString(raw.family_id),
    familyName: nullableString(raw.family_name),
    variantName: nullableString(raw.variant_name),
    productType: nullableString(raw.product_type),
    sizeValue: nullableNumber(raw.size_value),
    sizeUnit: nullableString(raw.size_unit),
    categoryId: nullableString(raw.category_id),
    categoryName: nullableString(raw.category_name),
    necessity: String(raw.necessity) as Necessity,
    purchaseCount: Number(raw.purchase_count),
    totalSpendMinor: Number(raw.total_spend_minor),
    totalQuantity: Number(raw.total_quantity),
    firstPurchaseAt: nullableString(raw.first_purchase_at),
    lastPurchaseAt: nullableString(raw.last_purchase_at),
    latestUnitPriceMinor: nullableNumber(raw.latest_unit_price_minor),
    priceCurrencyCode: String(raw.price_currency_code),
    latestMerchantId: nullableString(raw.latest_merchant_id),
    latestMerchantName: nullableString(raw.latest_merchant_name),
    latestPriceAt: nullableString(raw.latest_price_at),
    latestBasisPriceMinor: nullableNumber(raw.latest_basis_price_minor),
    basisLabel: nullableString(raw.basis_label),
  };
}

function parsePeriodSummary(value: unknown): ProductPeriodSummary {
  const raw = record(value, "product period summary");
  return {
    purchaseCount: Number(raw.purchase_count),
    totalSpendMinor: Number(raw.total_spend_minor),
    totalQuantity: Number(raw.total_quantity),
    firstPurchaseAt: nullableString(raw.first_purchase_at),
    lastPurchaseAt: nullableString(raw.last_purchase_at),
    minUnitPriceMinor: nullableNumber(raw.min_unit_price_minor),
    maxUnitPriceMinor: nullableNumber(raw.max_unit_price_minor),
    avgUnitPriceMinor: nullableNumber(raw.avg_unit_price_minor),
    priceObservationCount: Number(raw.price_observation_count),
  };
}

function parseFrequency(value: unknown): ProductFrequencyPoint {
  const raw = record(value, "product frequency point");
  return {
    bucketIndex: Number(raw.bucket_index),
    bucketStart: String(raw.bucket_start),
    bucketEnd: String(raw.bucket_end),
    purchaseCount: Number(raw.purchase_count),
    quantity: Number(raw.quantity),
    spendMinor: Number(raw.spend_minor),
  };
}

function parsePricePoint(value: unknown): ProductPricePoint {
  const raw = record(value, "product price point");
  return {
    receiptItemId: String(raw.receipt_item_id),
    receiptId: String(raw.receipt_id),
    observedAt: String(raw.observed_at),
    merchantId: nullableString(raw.merchant_id),
    merchantName: String(raw.merchant_name),
    currencyCode: String(raw.currency_code),
    listUnitPriceMinor: nullableNumber(raw.list_unit_price_minor),
    effectiveUnitPriceMinor: Number(raw.effective_unit_price_minor),
    quantity: Number(raw.quantity),
    basisPriceMinor: nullableNumber(raw.basis_price_minor),
    basisLabel: nullableString(raw.basis_label),
  };
}

function parseMerchantPrice(value: unknown): ProductMerchantPrice {
  const raw = record(value, "product merchant price");
  return {
    merchantId: nullableString(raw.merchant_id),
    merchantName: String(raw.merchant_name),
    purchaseCount: Number(raw.purchase_count),
    spendMinor: Number(raw.spend_minor),
    minUnitPriceMinor: nullableNumber(raw.min_unit_price_minor),
    maxUnitPriceMinor: nullableNumber(raw.max_unit_price_minor),
    avgUnitPriceMinor: nullableNumber(raw.avg_unit_price_minor),
    latestUnitPriceMinor: nullableNumber(raw.latest_unit_price_minor),
    latestPriceAt: nullableString(raw.latest_price_at),
    previousUnitPriceMinor: nullableNumber(raw.previous_unit_price_minor),
    priceChangeMinor: nullableNumber(raw.price_change_minor),
    priceChangeRatio: nullableNumber(raw.price_change_ratio),
  };
}

function parseFamilyVariant(value: unknown): ProductFamilyVariant {
  const raw = record(value, "product family variant");
  return {
    productId: String(raw.product_id),
    name: String(raw.name),
    variantName: nullableString(raw.variant_name),
    sizeValue: nullableNumber(raw.size_value),
    sizeUnit: nullableString(raw.size_unit),
    purchaseCount: Number(raw.purchase_count),
    spendMinor: Number(raw.spend_minor),
    lastPurchaseAt: nullableString(raw.last_purchase_at),
    latestUnitPriceMinor: nullableNumber(raw.latest_unit_price_minor),
    latestMerchantId: nullableString(raw.latest_merchant_id),
    latestMerchantName: nullableString(raw.latest_merchant_name),
    latestPriceAt: nullableString(raw.latest_price_at),
    basisPriceMinor: nullableNumber(raw.basis_price_minor),
    basisLabel: nullableString(raw.basis_label),
    isCurrent: Boolean(raw.is_current),
  };
}

function parseCatalog(raw: Record<string, unknown>): ProductCatalog {
  const profile = record(raw.profile, "product catalog profile");
  return {
    profile: {
      currencyCode: String(profile.currency_code),
      locale: String(profile.locale),
      timeZone: String(profile.time_zone),
    },
    query: nullableString(raw.query),
    products: Array.isArray(raw.products)
      ? raw.products.map(parseCatalogItem)
      : [],
  };
}

function parseAnalytics(raw: Record<string, unknown>): ProductAnalytics {
  const profile = record(raw.profile, "product analytics profile");
  const period = record(raw.period, "product analytics period");
  const product = record(raw.product, "product analytics product");
  const summary = record(raw.summary, "product analytics summary");
  const latest = record(raw.latest_price, "latest product price");
  const frequency = record(raw.frequency, "product frequency");
  const current = parsePeriodSummary(summary.current);
  const comparison = parsePeriodSummary(summary.comparison);

  const latestPrice: ProductLatestPrice = {
    latestUnitPriceMinor: nullableNumber(latest.latest_unit_price_minor),
    previousUnitPriceMinor: nullableNumber(latest.previous_unit_price_minor),
    changeMinor: nullableNumber(latest.change_minor),
    changeRatio: nullableNumber(latest.change_ratio),
    direction: String(latest.direction) as ProductLatestPrice["direction"],
    observedAt: nullableString(latest.observed_at),
    merchantId: nullableString(latest.merchant_id),
    merchantName: nullableString(latest.merchant_name),
    basisPriceMinor: nullableNumber(latest.basis_price_minor),
    basisLabel: nullableString(latest.basis_label),
  };

  let cheapestMerchant: ProductCheapestMerchant | null = null;
  if (raw.cheapest_merchant !== null && raw.cheapest_merchant !== undefined) {
    const cheapest = record(raw.cheapest_merchant, "cheapest merchant");
    cheapestMerchant = {
      merchantId: nullableString(cheapest.merchant_id),
      merchantName: String(cheapest.merchant_name),
      latestUnitPriceMinor: Number(cheapest.latest_unit_price_minor),
      latestPriceAt: String(cheapest.latest_price_at),
      purchaseCount: Number(cheapest.purchase_count),
    };
  }

  return {
    profile: {
      currencyCode: String(profile.currency_code),
      locale: String(profile.locale),
      timeZone: String(profile.time_zone),
    },
    range: String(raw.range) as ProductAnalytics["range"],
    anchorDate: String(raw.anchor_date),
    bucketKind: String(raw.bucket_kind) as ProductAnalytics["bucketKind"],
    period: {
      start: String(period.start),
      end: String(period.end),
      compareStart: nullableString(period.compare_start),
      compareEnd: nullableString(period.compare_end),
    },
    product: {
      id: String(product.id),
      name: String(product.name),
      brand: nullableString(product.brand),
      familyId: nullableString(product.family_id),
      familyName: nullableString(product.family_name),
      variantName: nullableString(product.variant_name),
      productType: nullableString(product.product_type),
      barcode: nullableString(product.barcode),
      sizeValue: nullableNumber(product.size_value),
      sizeUnit: nullableString(product.size_unit),
      defaultCategoryId: nullableString(product.default_category_id),
      categoryName: nullableString(product.category_name),
      necessity: String(product.necessity) as Necessity,
    },
    summary: {
      current,
      comparison,
      spendDeltaMinor: Number(summary.spend_delta_minor),
      spendDeltaRatio: nullableNumber(summary.spend_delta_ratio),
      purchaseDelta: Number(summary.purchase_delta),
      purchaseDeltaRatio: nullableNumber(summary.purchase_delta_ratio),
      quantityDelta: Number(summary.quantity_delta),
      quantityDeltaRatio: nullableNumber(summary.quantity_delta_ratio),
    },
    latestPrice,
    frequency: {
      current: Array.isArray(frequency.current)
        ? frequency.current.map(parseFrequency)
        : [],
      comparison: Array.isArray(frequency.comparison)
        ? frequency.comparison.map(parseFrequency)
        : [],
    },
    priceHistory: Array.isArray(raw.price_history)
      ? raw.price_history.map(parsePricePoint)
      : [],
    priceHistoryCount: Number(raw.price_history_count),
    priceHistoryTruncated: Boolean(raw.price_history_truncated),
    merchants: Array.isArray(raw.merchants)
      ? raw.merchants.map(parseMerchantPrice)
      : [],
    cheapestMerchant,
    familyVariants: Array.isArray(raw.family_variants)
      ? raw.family_variants.map(parseFamilyVariant)
      : [],
  };
}

export class SupabaseFinanceProductIntelligenceService
  implements FinanceProductIntelligenceService
{
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async upsertFamily(input: UpsertProductFamilyInput): Promise<UUID> {
    const result = await this.client.rpc<UUID>(
      "finance_upsert_product_family",
      {
        p_name: input.name,
        p_brand: input.brand ?? null,
        p_product_type: input.productType ?? null,
        p_default_category_id: input.defaultCategoryId ?? null,
        p_default_necessity:
          input.defaultNecessity ?? "unclassified",
        p_metadata: input.metadata ?? {},
      },
    );
    rpcError(result, "upsertProductFamily");
    if (!result.data) throw new Error("Product family upsert returned no id");
    return result.data;
  }

  async upsertProduct(input: CreateProductInput): Promise<UUID> {
    const result = await this.client.rpc<UUID>("finance_upsert_product", {
      p_name: input.name,
      p_brand: input.brand ?? null,
      p_family_id: input.familyId ?? null,
      p_variant_name: input.variantName ?? null,
      p_product_type: input.productType ?? null,
      p_barcode: input.barcode ?? null,
      p_size_value: input.sizeValue ?? null,
      p_size_unit: input.sizeUnit ?? null,
      p_default_category_id: input.defaultCategoryId ?? null,
      p_default_necessity: input.defaultNecessity ?? "unclassified",
      p_source: input.source ?? "user",
      p_confidence: input.confidence,
      p_metadata: input.metadata,
    });
    rpcError(result, "upsertProduct");
    if (!result.data) throw new Error("Product upsert returned no id");
    return result.data;
  }

  async addAlias(input: {
    productId: UUID;
    rawAlias: string;
    merchantId?: UUID | null;
    source?: RuleSource;
    confidence?: number | null;
    confirm?: boolean;
  }): Promise<UUID> {
    const result = await this.client.rpc<UUID>("finance_add_product_alias", {
      p_product_id: input.productId,
      p_raw_alias: input.rawAlias,
      p_merchant_id: input.merchantId ?? null,
      p_source: input.source ?? "user",
      p_confidence: input.confidence ?? null,
      p_confirm: input.confirm ?? true,
    });
    rpcError(result, "addProductAlias");
    if (!result.data) throw new Error("Product alias insert returned no id");
    return result.data;
  }

  async resolveAlias(
    rawName: string,
    merchantId: UUID | null = null,
  ): Promise<ProductAliasResolution> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_resolve_product_alias",
      {
        p_raw_name: rawName,
        p_merchant_id: merchantId,
      },
    );
    rpcError(result, "resolveProductAlias");
    return parseAliasResolution(result.data);
  }

  async normalizeItemByAlias(
    receiptItemId: UUID,
    normalizationVersion = "alias-1",
  ): Promise<ProductAssignmentResult | ProductAliasResolution> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_normalize_receipt_item_by_alias",
      {
        p_receipt_item_id: receiptItemId,
        p_normalization_version: normalizationVersion,
      },
    );
    rpcError(result, "normalizeReceiptItemByAlias");
    if (!result.data) throw new Error("Product normalization returned no data");

    if (result.data.product_id) {
      return parseAssignment(result.data);
    }
    return parseAliasResolution(result.data);
  }

  async normalizeReceiptByAlias(
    receiptId: UUID,
    normalizationVersion = "alias-1",
  ): Promise<{
    receiptId: UUID;
    matchedCount: number;
    reviewCount: number;
    queue: readonly ProductNormalizationQueueItem[];
  }> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_normalize_receipt_products_by_alias",
      {
        p_receipt_id: receiptId,
        p_normalization_version: normalizationVersion,
      },
    );
    rpcError(result, "normalizeReceiptProductsByAlias");
    if (!result.data) throw new Error("Receipt normalization returned no data");

    const queue = Array.isArray(result.data.queue)
      ? (result.data.queue as Record<string, unknown>[]).map(parseQueueItem)
      : [];

    return {
      receiptId: String(result.data.receipt_id),
      matchedCount: Number(result.data.matched_count ?? 0),
      reviewCount: Number(result.data.review_count ?? 0),
      queue,
    };
  }

  async createAndAssignCandidate(
    receiptItemId: UUID,
    candidate: ProductCandidate,
    options: {
      normalizationVersion?: string;
      userConfirmed?: boolean;
    } = {},
  ): Promise<ProductAssignmentResult> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_create_and_assign_product_candidate",
      {
        p_receipt_item_id: receiptItemId,
        p_name: candidate.name,
        p_brand: candidate.brand ?? null,
        p_family_name: candidate.familyName ?? null,
        p_variant_name: candidate.variantName ?? null,
        p_product_type: candidate.productType ?? null,
        p_barcode: candidate.barcode ?? null,
        p_size_value: candidate.sizeValue ?? null,
        p_size_unit: candidate.sizeUnit ?? null,
        p_confidence: candidate.confidence,
        p_normalization_version:
          options.normalizationVersion ?? "deterministic-1",
        p_user_confirmed: options.userConfirmed ?? false,
      },
    );
    rpcError(result, "createAndAssignProductCandidate");
    if (!result.data) throw new Error("Product candidate assignment returned no data");
    return parseAssignment(result.data);
  }

  async correctItemProduct(
    receiptItemId: UUID,
    productId: UUID,
    learnMerchantAlias = true,
    normalizationVersion = "user-correction-1",
  ): Promise<ProductAssignmentResult> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_correct_receipt_item_product",
      {
        p_receipt_item_id: receiptItemId,
        p_product_id: productId,
        p_learn_merchant_alias: learnMerchantAlias,
        p_normalization_version: normalizationVersion,
      },
    );
    rpcError(result, "correctReceiptItemProduct");
    if (!result.data) throw new Error("Product correction returned no data");
    return parseAssignment(result.data);
  }

  async getQueue(
    receiptId: UUID | null = null,
    limit = 100,
  ): Promise<readonly ProductNormalizationQueueItem[]> {
    const result = await this.client.rpc<Record<string, unknown>[]>(
      "finance_get_product_normalization_queue",
      {
        p_receipt_id: receiptId,
        p_limit: limit,
      },
    );
    rpcError(result, "getProductNormalizationQueue");
    return (result.data ?? []).map(parseQueueItem);
  }

  async getProducts(): Promise<readonly ProductSummary[]> {
    const result = await this.client.rpc<Record<string, unknown>[]>(
      "finance_get_products",
    );
    rpcError(result, "getProducts");
    return (result.data ?? []).map(parseProduct);
  }

  async getFamilies(): Promise<readonly ProductFamily[]> {
    const result = await this.client.rpc<Record<string, unknown>[]>(
      "finance_get_product_families",
    );
    rpcError(result, "getProductFamilies");

    return (result.data ?? []).map((raw) => ({
      id: String(raw.id),
      name: String(raw.name),
      brand: raw.brand === null ? null : String(raw.brand),
      productType:
        raw.product_type === null ? null : String(raw.product_type),
      defaultCategoryId:
        raw.default_category_id === null
          ? null
          : String(raw.default_category_id),
      defaultNecessity: String(raw.default_necessity) as Necessity,
      isArchived: Boolean(raw.is_archived),
      productCount: Number(raw.product_count ?? 0),
    }));
  }

  async getProductDetail(productId: UUID): Promise<ProductDetail> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_product_detail",
      { p_product_id: productId },
    );
    rpcError(result, "getProductDetail");
    if (!result.data) throw new Error("Product detail not found");

    const productRaw = result.data.product;
    if (!productRaw || typeof productRaw !== "object") {
      throw new Error("Product detail is missing its product payload");
    }

    return {
      product: parseProduct(productRaw as Record<string, unknown>),
      aliases: Array.isArray(result.data.aliases)
        ? (result.data.aliases as Record<string, unknown>[])
        : [],
      priceHistory: Array.isArray(result.data.price_history)
        ? (result.data.price_history as Record<string, unknown>[])
        : [],
      recentPurchases: Array.isArray(result.data.recent_purchases)
        ? (result.data.recent_purchases as Record<string, unknown>[])
        : [],
    };
  }

  async getCatalog(
    request: ProductCatalogRequest = {},
  ): Promise<ProductCatalog> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_product_catalog",
      {
        p_query: request.query ?? null,
        p_limit: request.limit ?? 100,
      },
    );
    rpcError(result, "getProductCatalog");
    if (!result.data) throw new Error("Product catalog returned no data");
    return parseCatalog(result.data);
  }

  async getProductAnalytics(
    request: ProductAnalyticsRequest,
  ): Promise<ProductAnalytics> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_product_intelligence",
      {
        p_product_id: request.productId,
        p_range: request.range ?? "1y",
        p_anchor_date: request.anchorDate ?? null,
      },
    );
    rpcError(result, "getProductIntelligence");
    if (!result.data) throw new Error("Product analytics returned no data");
    return parseAnalytics(result.data);
  }

}
