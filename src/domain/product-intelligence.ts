import type { RuleSource } from "./classification.js";
import type { Necessity, UUID } from "./finance.js";

export type ProductNormalizationStatus =
  | "pending"
  | "matched"
  | "created"
  | "review_required"
  | "corrected"
  | "skipped";

export interface ProductFamily {
  id: UUID;
  name: string;
  brand: string | null;
  productType: string | null;
  defaultCategoryId: UUID | null;
  defaultNecessity: Necessity;
  isArchived: boolean;
  productCount: number;
}

export interface ProductSummary {
  id: UUID;
  name: string;
  normalizedName: string;
  brand: string | null;
  familyId: UUID | null;
  familyName: string | null;
  variantName: string | null;
  productType: string | null;
  barcode: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  defaultCategoryId: UUID | null;
  defaultNecessity: Necessity;
  source: RuleSource;
  confidence: number | null;
  purchaseCount: number;
  totalSpendMinor: number;
  totalQuantity: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  minUnitPriceMinor: number | null;
  maxUnitPriceMinor: number | null;
  avgUnitPriceMinor: number | null;
}

export interface ProductAliasResolution {
  productId: UUID | null;
  productName: string | null;
  familyId: UUID | null;
  aliasId: UUID | null;
  matchType: "merchant_alias" | "global_alias" | "canonical_name" | "none";
  source: RuleSource | null;
  confidence: number | null;
  normalizedInput: string;
}

export interface ProductNormalizationQueueItem {
  receiptItemId: UUID;
  receiptId: UUID;
  lineIndex: number;
  rawName: string;
  normalizedName: string | null;
  productId: UUID | null;
  normalizationStatus: ProductNormalizationStatus;
  normalizationSource: RuleSource | null;
  normalizationConfidence: number | null;
  normalizationReviewRequired: boolean;
  itemConfidence: number | null;
  merchantId: UUID | null;
  merchantName: string | null;
  purchasedAt: string | null;
  amountMinor: number;
  currencyCode: string;
  exactMatch: ProductAliasResolution;
}

export interface ProductCandidate {
  name: string;
  brand?: string;
  familyName?: string;
  variantName?: string;
  productType?: string;
  barcode?: string;
  sizeValue?: number;
  sizeUnit?: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface CreateProductInput extends ProductCandidate {
  familyId?: UUID | null;
  defaultCategoryId?: UUID | null;
  defaultNecessity?: Necessity;
  source?: RuleSource;
}

export interface ProductAssignmentResult {
  receiptItemId: UUID;
  productId: UUID;
  productName: string;
  familyId: UUID | null;
  aliasId: UUID | null;
  normalizationStatus: ProductNormalizationStatus;
  normalizationReviewRequired: boolean;
  categoryId: UUID | null;
  necessity: Necessity;
  matchType?: ProductAliasResolution["matchType"];
}

export interface ProductDetail {
  product: ProductSummary;
  aliases: readonly Record<string, unknown>[];
  priceHistory: readonly Record<string, unknown>[];
  recentPurchases: readonly Record<string, unknown>[];
}

export interface ProductNormalizationReviewCandidate {
  item: ProductNormalizationQueueItem;
  candidate: ProductCandidate;
  reason: "low_confidence" | "auto_create_failed";
  errorText?: string;
}

export interface ReceiptProductNormalizationOutcome {
  receiptId: UUID;
  aliasMatchedCount: number;
  autoCreatedCount: number;
  reviewCandidates: readonly ProductNormalizationReviewCandidate[];
  remainingQueue: readonly ProductNormalizationQueueItem[];
}


export type ProductAnalyticsRange = "1m" | "3m" | "6m" | "1y" | "all";

export type ProductPriceDirection =
  | "up"
  | "down"
  | "stable"
  | "insufficient_history";

export interface ProductAnalyticsProfile {
  currencyCode: string;
  locale: string;
  timeZone: string;
}

export interface ProductCatalogItem {
  productId: UUID;
  name: string;
  brand: string | null;
  familyId: UUID | null;
  familyName: string | null;
  variantName: string | null;
  productType: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  categoryId: UUID | null;
  categoryName: string | null;
  necessity: Necessity;
  purchaseCount: number;
  totalSpendMinor: number;
  totalQuantity: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  latestUnitPriceMinor: number | null;
  priceCurrencyCode: string;
  latestMerchantId: UUID | null;
  latestMerchantName: string | null;
  latestPriceAt: string | null;
  latestBasisPriceMinor: number | null;
  basisLabel: string | null;
}

export interface ProductCatalog {
  profile: ProductAnalyticsProfile;
  query: string | null;
  products: readonly ProductCatalogItem[];
}

export interface ProductAnalyticsProduct {
  id: UUID;
  name: string;
  brand: string | null;
  familyId: UUID | null;
  familyName: string | null;
  variantName: string | null;
  productType: string | null;
  barcode: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  defaultCategoryId: UUID | null;
  categoryName: string | null;
  necessity: Necessity;
}

export interface ProductPeriodSummary {
  purchaseCount: number;
  totalSpendMinor: number;
  totalQuantity: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  minUnitPriceMinor: number | null;
  maxUnitPriceMinor: number | null;
  avgUnitPriceMinor: number | null;
  priceObservationCount: number;
}

export interface ProductAnalyticsSummary {
  current: ProductPeriodSummary;
  comparison: ProductPeriodSummary;
  spendDeltaMinor: number;
  spendDeltaRatio: number | null;
  purchaseDelta: number;
  purchaseDeltaRatio: number | null;
  quantityDelta: number;
  quantityDeltaRatio: number | null;
}

export interface ProductLatestPrice {
  latestUnitPriceMinor: number | null;
  previousUnitPriceMinor: number | null;
  changeMinor: number | null;
  changeRatio: number | null;
  direction: ProductPriceDirection;
  observedAt: string | null;
  merchantId: UUID | null;
  merchantName: string | null;
  basisPriceMinor: number | null;
  basisLabel: string | null;
}

export interface ProductFrequencyPoint {
  bucketIndex: number;
  bucketStart: string;
  bucketEnd: string;
  purchaseCount: number;
  quantity: number;
  spendMinor: number;
}

export interface ProductPricePoint {
  receiptItemId: UUID;
  receiptId: UUID;
  observedAt: string;
  merchantId: UUID | null;
  merchantName: string;
  currencyCode: string;
  listUnitPriceMinor: number | null;
  effectiveUnitPriceMinor: number;
  quantity: number;
  basisPriceMinor: number | null;
  basisLabel: string | null;
}

export interface ProductMerchantPrice {
  merchantId: UUID | null;
  merchantName: string;
  purchaseCount: number;
  spendMinor: number;
  minUnitPriceMinor: number | null;
  maxUnitPriceMinor: number | null;
  avgUnitPriceMinor: number | null;
  latestUnitPriceMinor: number | null;
  latestPriceAt: string | null;
  previousUnitPriceMinor: number | null;
  priceChangeMinor: number | null;
  priceChangeRatio: number | null;
}

export interface ProductCheapestMerchant {
  merchantId: UUID | null;
  merchantName: string;
  latestUnitPriceMinor: number;
  latestPriceAt: string;
  purchaseCount: number;
}

export interface ProductFamilyVariant {
  productId: UUID;
  name: string;
  variantName: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  purchaseCount: number;
  spendMinor: number;
  lastPurchaseAt: string | null;
  latestUnitPriceMinor: number | null;
  latestMerchantId: UUID | null;
  latestMerchantName: string | null;
  latestPriceAt: string | null;
  basisPriceMinor: number | null;
  basisLabel: string | null;
  isCurrent: boolean;
}

export interface ProductAnalytics {
  profile: ProductAnalyticsProfile;
  range: ProductAnalyticsRange;
  anchorDate: string;
  bucketKind: "day" | "week" | "month" | "quarter" | "year";
  period: {
    start: string;
    end: string;
    compareStart: string | null;
    compareEnd: string | null;
  };
  product: ProductAnalyticsProduct;
  summary: ProductAnalyticsSummary;
  latestPrice: ProductLatestPrice;
  frequency: {
    current: readonly ProductFrequencyPoint[];
    comparison: readonly ProductFrequencyPoint[];
  };
  priceHistory: readonly ProductPricePoint[];
  priceHistoryCount: number;
  priceHistoryTruncated: boolean;
  merchants: readonly ProductMerchantPrice[];
  cheapestMerchant: ProductCheapestMerchant | null;
  familyVariants: readonly ProductFamilyVariant[];
}

export interface ProductCatalogRequest {
  query?: string | null;
  limit?: number;
}

export interface ProductAnalyticsRequest {
  productId: UUID;
  range?: ProductAnalyticsRange;
  anchorDate?: string | null;
}
