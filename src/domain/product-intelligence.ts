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
