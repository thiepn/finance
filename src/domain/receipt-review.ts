import type { Necessity, UUID } from "./finance.js";
import type { ProductCandidate, ProductNormalizationStatus } from "./product-intelligence.js";
import type { ReceiptReconciliationStatus } from "./receipt-processing.js";
import type { RuleSource } from "./classification.js";

export type ReceiptReviewIssueCode =
  | "total_missing"
  | "items_missing"
  | "arithmetic_mismatch"
  | "reconciliation_insufficient"
  | "low_confidence"
  | "item_review_required"
  | "merchant_missing"
  | "merchant_unresolved"
  | "purchase_time_missing"
  | "product_normalization_required";

export type ReceiptReviewIssueAction =
  | "edit_header"
  | "restore_or_review_items"
  | "edit_merchant"
  | "review_amounts_or_waive"
  | "accept_or_edit_header"
  | "review_items"
  | "assign_or_skip_products"
  | "review";

export interface ReceiptReviewIssue {
  code: ReceiptReviewIssueCode;
  severity: "error" | "warning" | "attention";
  blocking: boolean;
  action: ReceiptReviewIssueAction;
}

export interface ReceiptReviewHeader {
  id: UUID;
  merchantId: UUID | null;
  merchantName: string | null;
  merchantRawName: string | null;
  merchantAddressRaw: string | null;
  purchasedAt: string | null;
  currencyCode: string;
  subtotalMinor: number | null;
  taxMinor: number | null;
  discountMinor: number;
  depositMinor: number;
  totalMinor: number | null;
  receiptNumber: string | null;
  paymentMethodRaw: string | null;
  overallConfidence: number | null;
  processingStatus: string;
  reconciliationStatus: ReceiptReconciliationStatus;
  reconciliationDeltaMinor: number | null;
  reconciliationFormula: string | null;
  reconciliationExpectedMinor: number | null;
  reviewReasons: readonly ReceiptReviewIssueCode[];
  reviewWaivers: Readonly<Record<string, unknown>>;
  reviewStartedAt: string | null;
  headerReviewedAt: string | null;
  lastReviewedAt: string | null;
  reviewRevision: number;
  confirmedAt: string | null;
}

export interface ReceiptReviewPage {
  id: UUID;
  pageIndex: number;
  storagePath: string;
  mimeType: string;
  widthPx: number | null;
  heightPx: number | null;
  status: string;
}

export interface ReceiptReviewSourceLine {
  id: UUID;
  rawText: string;
  normalizedText: string | null;
  kind: string;
  amountMinor: number | null;
  confidence: number | null;
  pageId: UUID | null;
  pageLineIndex: number | null;
  bbox: unknown;
}

export interface ReceiptReviewItem {
  id: UUID;
  lineIndex: number;
  rawName: string;
  normalizedName: string | null;
  quantity: number;
  unitPriceMinor: number | null;
  lineTotalMinor: number;
  discountMinor: number;
  depositMinor: number;
  effectiveTotalMinor: number;
  confidence: number | null;
  ocrReviewRequired: boolean;
  reviewedAt: string | null;
  reviewNote: string | null;
  isExcluded: boolean;
  normalizationStatus: ProductNormalizationStatus;
  normalizationSource: RuleSource | null;
  normalizationConfidence: number | null;
  normalizationReviewRequired: boolean;
  userCorrected: boolean;
  productId: UUID | null;
  productName: string | null;
  brand: string | null;
  familyId: UUID | null;
  familyName: string | null;
  productType: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  categoryId: UUID | null;
  categoryName: string | null;
  necessity: Necessity;
  sourceLine: ReceiptReviewSourceLine | null;
}

export interface ReceiptReviewEvent {
  id: UUID;
  receiptItemId: UUID | null;
  processingRunId: UUID | null;
  eventType: string;
  fieldName: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  reason: string | null;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: string;
}

export interface ReceiptReviewSummary {
  itemCount: number;
  excludedItemCount: number;
  ocrReviewCount: number;
  normalizationReviewCount: number;
  activeItemSumMinor: number | null;
  canConfirm: boolean;
}

export interface ReceiptReviewSnapshot {
  receipt: ReceiptReviewHeader;
  issues: readonly ReceiptReviewIssue[];
  pages: readonly ReceiptReviewPage[];
  items: readonly ReceiptReviewItem[];
  events: readonly ReceiptReviewEvent[];
  summary: ReceiptReviewSummary;
}

export interface ReceiptReviewQueueEntry {
  receiptId: UUID;
  merchantId: UUID | null;
  merchantName: string | null;
  merchantRawName: string | null;
  purchasedAt: string | null;
  currencyCode: string;
  totalMinor: number | null;
  processingStatus: string;
  overallConfidence: number | null;
  reconciliationStatus: ReceiptReconciliationStatus;
  reconciliationDeltaMinor: number | null;
  reviewReasons: readonly ReceiptReviewIssueCode[];
  reviewRevision: number;
  reviewStartedAt: string | null;
  itemCount: number;
  unresolvedItemCount: number;
  readyToConfirm: boolean;
}

export interface ReceiptHeaderReviewPatch {
  merchantId?: UUID | null;
  merchantName?: string | null;
  purchasedAt?: string | null;
  currencyCode?: string;
  subtotalMinor?: number | null;
  taxMinor?: number | null;
  discountMinor?: number | null;
  depositMinor?: number | null;
  totalMinor?: number | null;
  receiptNumber?: string | null;
  paymentMethodRaw?: string | null;
}

export interface ReceiptItemReviewPatch {
  quantity?: number;
  unitPriceMinor?: number | null;
  lineTotalMinor?: number;
  discountMinor?: number;
  depositMinor?: number;
  effectiveTotalMinor?: number;
}

export interface ReceiptReviewItemView extends ReceiptReviewItem {
  needsAttention: boolean;
  suggestedProduct: ProductCandidate | null;
}

export interface ReceiptReviewPageView extends ReceiptReviewPage {
  previewUrl: string;
}

export interface ReceiptReviewViewModel
  extends Omit<ReceiptReviewSnapshot, "pages" | "items"> {
  pages: readonly ReceiptReviewPageView[];
  items: readonly ReceiptReviewItemView[];
  primaryIssue: ReceiptReviewIssue | null;
  attentionItemIds: readonly UUID[];
}
