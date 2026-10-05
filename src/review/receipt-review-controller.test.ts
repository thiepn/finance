import type { ReceiptReviewItem, ReceiptReviewIssue } from "../domain/receipt-review.js";
import {
  choosePrimaryReceiptIssue,
  receiptItemNeedsAttention,
} from "./receipt-review-controller.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const issues: ReceiptReviewIssue[] = [
  {
    code: "product_normalization_required",
    severity: "error",
    blocking: true,
    action: "assign_or_skip_products",
  },
  {
    code: "arithmetic_mismatch",
    severity: "warning",
    blocking: true,
    action: "review_amounts_or_waive",
  },
  {
    code: "purchase_time_missing",
    severity: "error",
    blocking: true,
    action: "edit_header",
  },
];

const primary = choosePrimaryReceiptIssue(issues);
assert(primary?.code === "purchase_time_missing", "header blockers should be prioritized");

const item: ReceiptReviewItem = {
  id: "11111111-1111-4111-8111-111111111111",
  lineIndex: 0,
  rawName: "MMS PNUT 250G",
  normalizedName: null,
  quantity: 1,
  unitPriceMinor: null,
  lineTotalMinor: 349,
  discountMinor: 0,
  depositMinor: 0,
  effectiveTotalMinor: 349,
  confidence: 0.7,
  ocrReviewRequired: true,
  reviewedAt: null,
  reviewNote: null,
  isExcluded: false,
  normalizationStatus: "review_required",
  normalizationSource: null,
  normalizationConfidence: null,
  normalizationReviewRequired: true,
  userCorrected: false,
  productId: null,
  productName: null,
  brand: null,
  familyId: null,
  familyName: null,
  productType: null,
  sizeValue: null,
  sizeUnit: null,
  categoryId: null,
  categoryName: null,
  necessity: "unclassified",
  sourceLine: null,
};

assert(receiptItemNeedsAttention(item), "unreviewed uncertain item should be highlighted");

const accepted = {
  ...item,
  reviewedAt: "2026-10-05T12:00:00.000Z",
  normalizationStatus: "skipped" as const,
  normalizationReviewRequired: false,
};
assert(!receiptItemNeedsAttention(accepted), "accepted/skipped item should no longer need attention");

const excluded = {
  ...item,
  isExcluded: true,
};
assert(!receiptItemNeedsAttention(excluded), "excluded OCR artifact should not remain highlighted");

console.log("Receipt review controller fixtures passed");
