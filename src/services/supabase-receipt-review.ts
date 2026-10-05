import type { Necessity, UUID } from "../domain/finance.js";
import type { RuleSource } from "../domain/classification.js";
import type { ProductNormalizationStatus } from "../domain/product-intelligence.js";
import type {
  ReceiptHeaderReviewPatch,
  ReceiptItemReviewPatch,
  ReceiptReviewEvent,
  ReceiptReviewHeader,
  ReceiptReviewIssue,
  ReceiptReviewPage,
  ReceiptReviewQueueEntry,
  ReceiptReviewSnapshot,
  ReceiptReviewSourceLine,
  ReceiptReviewItem,
  ReceiptReviewSummary,
} from "../domain/receipt-review.js";
import type { ReceiptReconciliationStatus } from "../domain/receipt-processing.js";
import type { FinanceReceiptReviewService } from "./receipt-review.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";
import type { ProductCandidate } from "../domain/product-intelligence.js";

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

function parseHeader(raw: Record<string, unknown>): ReceiptReviewHeader {
  const reasons = Array.isArray(raw.review_reasons)
    ? raw.review_reasons.map(String)
    : [];

  return {
    id: String(raw.id),
    merchantId: nullableString(raw.merchant_id),
    merchantName: nullableString(raw.merchant_name),
    merchantRawName: nullableString(raw.merchant_raw_name),
    merchantAddressRaw: nullableString(raw.merchant_address_raw),
    purchasedAt: nullableString(raw.purchased_at),
    currencyCode: String(raw.currency_code),
    subtotalMinor: nullableNumber(raw.subtotal_minor),
    taxMinor: nullableNumber(raw.tax_minor),
    discountMinor: Number(raw.discount_minor ?? 0),
    depositMinor: Number(raw.deposit_minor ?? 0),
    totalMinor: nullableNumber(raw.total_minor),
    receiptNumber: nullableString(raw.receipt_number),
    paymentMethodRaw: nullableString(raw.payment_method_raw),
    overallConfidence: nullableNumber(raw.overall_confidence),
    processingStatus: String(raw.processing_status),
    reconciliationStatus: String(
      raw.reconciliation_status,
    ) as ReceiptReconciliationStatus,
    reconciliationDeltaMinor: nullableNumber(raw.reconciliation_delta_minor),
    reconciliationFormula: nullableString(raw.reconciliation_formula),
    reconciliationExpectedMinor: nullableNumber(
      raw.reconciliation_expected_minor,
    ),
    reviewReasons:
      reasons as ReceiptReviewHeader["reviewReasons"],
    reviewWaivers:
      raw.review_waivers && typeof raw.review_waivers === "object"
        ? (raw.review_waivers as Record<string, unknown>)
        : {},
    reviewStartedAt: nullableString(raw.review_started_at),
    headerReviewedAt: nullableString(raw.header_reviewed_at),
    lastReviewedAt: nullableString(raw.last_reviewed_at),
    reviewRevision: Number(raw.review_revision ?? 0),
    confirmedAt: nullableString(raw.confirmed_at),
  };
}

function parseIssue(raw: Record<string, unknown>): ReceiptReviewIssue {
  return {
    code: String(raw.code) as ReceiptReviewIssue["code"],
    severity: String(raw.severity) as ReceiptReviewIssue["severity"],
    blocking: Boolean(raw.blocking),
    action: String(raw.action) as ReceiptReviewIssue["action"],
  };
}

function parsePage(raw: Record<string, unknown>): ReceiptReviewPage {
  return {
    id: String(raw.id),
    pageIndex: Number(raw.page_index),
    storagePath: String(raw.storage_path),
    mimeType: String(raw.mime_type),
    widthPx: nullableNumber(raw.width_px),
    heightPx: nullableNumber(raw.height_px),
    status: String(raw.status),
  };
}

function parseSourceLine(value: unknown): ReceiptReviewSourceLine | null {
  if (value === null || value === undefined) return null;
  const raw = record(value, "source line");

  return {
    id: String(raw.id),
    rawText: String(raw.raw_text),
    normalizedText: nullableString(raw.normalized_text),
    kind: String(raw.kind),
    amountMinor: nullableNumber(raw.amount_minor),
    confidence: nullableNumber(raw.confidence),
    pageId: nullableString(raw.page_id),
    pageLineIndex: nullableNumber(raw.page_line_index),
    bbox: raw.bbox ?? null,
  };
}

function parseItem(raw: Record<string, unknown>): ReceiptReviewItem {
  return {
    id: String(raw.id),
    lineIndex: Number(raw.line_index),
    rawName: String(raw.raw_name),
    normalizedName: nullableString(raw.normalized_name),
    quantity: Number(raw.quantity),
    unitPriceMinor: nullableNumber(raw.unit_price_minor),
    lineTotalMinor: Number(raw.line_total_minor),
    discountMinor: Number(raw.discount_minor ?? 0),
    depositMinor: Number(raw.deposit_minor ?? 0),
    effectiveTotalMinor: Number(raw.effective_total_minor),
    confidence: nullableNumber(raw.confidence),
    ocrReviewRequired: Boolean(raw.ocr_review_required),
    reviewedAt: nullableString(raw.reviewed_at),
    reviewNote: nullableString(raw.review_note),
    isExcluded: Boolean(raw.is_excluded),
    normalizationStatus: String(
      raw.normalization_status,
    ) as ProductNormalizationStatus,
    normalizationSource:
      raw.normalization_source === null ||
      raw.normalization_source === undefined
        ? null
        : (String(raw.normalization_source) as RuleSource),
    normalizationConfidence: nullableNumber(raw.normalization_confidence),
    normalizationReviewRequired: Boolean(
      raw.normalization_review_required,
    ),
    userCorrected: Boolean(raw.user_corrected),
    productId: nullableString(raw.product_id),
    productName: nullableString(raw.product_name),
    brand: nullableString(raw.brand),
    familyId: nullableString(raw.family_id),
    familyName: nullableString(raw.family_name),
    productType: nullableString(raw.product_type),
    sizeValue: nullableNumber(raw.size_value),
    sizeUnit: nullableString(raw.size_unit),
    categoryId: nullableString(raw.category_id),
    categoryName: nullableString(raw.category_name),
    necessity: String(raw.necessity) as Necessity,
    sourceLine: parseSourceLine(raw.source_line),
  };
}

function parseEvent(raw: Record<string, unknown>): ReceiptReviewEvent {
  return {
    id: String(raw.id),
    receiptItemId: nullableString(raw.receipt_item_id),
    eventType: String(raw.event_type),
    fieldName: nullableString(raw.field_name),
    beforeValue: raw.before_value ?? null,
    afterValue: raw.after_value ?? null,
    reason: nullableString(raw.reason),
    metadata:
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Record<string, unknown>)
        : {},
    createdAt: String(raw.created_at),
  };
}

function parseSummary(raw: Record<string, unknown>): ReceiptReviewSummary {
  return {
    itemCount: Number(raw.item_count ?? 0),
    excludedItemCount: Number(raw.excluded_item_count ?? 0),
    ocrReviewCount: Number(raw.ocr_review_count ?? 0),
    normalizationReviewCount: Number(raw.normalization_review_count ?? 0),
    activeItemSumMinor: nullableNumber(raw.active_item_sum_minor),
    canConfirm: Boolean(raw.can_confirm),
  };
}

function parseSnapshot(raw: Record<string, unknown>): ReceiptReviewSnapshot {
  const receipt = record(raw.receipt, "receipt review header");
  const summary = record(raw.summary, "receipt review summary");

  return {
    receipt: parseHeader(receipt),
    issues: Array.isArray(raw.issues)
      ? raw.issues.map((value) => parseIssue(record(value, "review issue")))
      : [],
    pages: Array.isArray(raw.pages)
      ? raw.pages.map((value) => parsePage(record(value, "receipt page")))
      : [],
    items: Array.isArray(raw.items)
      ? raw.items.map((value) => parseItem(record(value, "receipt item")))
      : [],
    events: Array.isArray(raw.events)
      ? raw.events.map((value) => parseEvent(record(value, "review event")))
      : [],
    summary: parseSummary(summary),
  };
}

function headerPatchPayload(
  patch: ReceiptHeaderReviewPatch,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if ("merchantId" in patch) payload.merchant_id = patch.merchantId ?? null;
  if ("merchantName" in patch) payload.merchant_name = patch.merchantName ?? null;
  if ("purchasedAt" in patch) payload.purchased_at = patch.purchasedAt ?? null;
  if ("currencyCode" in patch) payload.currency_code = patch.currencyCode;
  if ("subtotalMinor" in patch) payload.subtotal_minor = patch.subtotalMinor ?? null;
  if ("taxMinor" in patch) payload.tax_minor = patch.taxMinor ?? null;
  if ("discountMinor" in patch) payload.discount_minor = patch.discountMinor ?? null;
  if ("depositMinor" in patch) payload.deposit_minor = patch.depositMinor ?? null;
  if ("totalMinor" in patch) payload.total_minor = patch.totalMinor ?? null;
  if ("receiptNumber" in patch) payload.receipt_number = patch.receiptNumber ?? null;
  if ("paymentMethodRaw" in patch) {
    payload.payment_method_raw = patch.paymentMethodRaw ?? null;
  }
  return payload;
}

function itemPatchPayload(
  patch: ReceiptItemReviewPatch,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if ("quantity" in patch) payload.quantity = patch.quantity;
  if ("unitPriceMinor" in patch) {
    payload.unit_price_minor = patch.unitPriceMinor ?? null;
  }
  if ("lineTotalMinor" in patch) payload.line_total_minor = patch.lineTotalMinor;
  if ("discountMinor" in patch) payload.discount_minor = patch.discountMinor;
  if ("depositMinor" in patch) payload.deposit_minor = patch.depositMinor;
  if ("effectiveTotalMinor" in patch) {
    payload.effective_total_minor = patch.effectiveTotalMinor;
  }
  return payload;
}

function candidatePayload(candidate: ProductCandidate): Record<string, unknown> {
  return {
    name: candidate.name,
    ...(candidate.brand ? { brand: candidate.brand } : {}),
    ...(candidate.familyName ? { family_name: candidate.familyName } : {}),
    ...(candidate.variantName ? { variant_name: candidate.variantName } : {}),
    ...(candidate.productType ? { product_type: candidate.productType } : {}),
    ...(candidate.barcode ? { barcode: candidate.barcode } : {}),
    ...(candidate.sizeValue !== undefined
      ? { size_value: candidate.sizeValue }
      : {}),
    ...(candidate.sizeUnit ? { size_unit: candidate.sizeUnit } : {}),
  };
}

export class SupabaseFinanceReceiptReviewService
  implements FinanceReceiptReviewService
{
  constructor(private readonly client: SupabaseRpcClient) {}

  private async snapshotRpc(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<ReceiptReviewSnapshot> {
    const result = await this.client.rpc<Record<string, unknown>>(
      functionName,
      args,
    );
    rpcError(result, functionName);
    if (!result.data) throw new Error(`${functionName} returned no data`);
    return parseSnapshot(result.data);
  }

  async get(receiptId: UUID): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_get_receipt_review", {
      p_receipt_id: receiptId,
    });
  }

  async getQueue(limit = 50): Promise<readonly ReceiptReviewQueueEntry[]> {
    const result = await this.client.rpc<Record<string, unknown>[]>(
      "finance_get_receipt_review_queue",
      { p_limit: limit },
    );
    rpcError(result, "getReceiptReviewQueue");

    return (result.data ?? []).map((raw) => ({
      receiptId: String(raw.receipt_id),
      merchantId: nullableString(raw.merchant_id),
      merchantName: nullableString(raw.merchant_name),
      merchantRawName: nullableString(raw.merchant_raw_name),
      purchasedAt: nullableString(raw.purchased_at),
      currencyCode: String(raw.currency_code),
      totalMinor: nullableNumber(raw.total_minor),
      processingStatus: String(raw.processing_status),
      overallConfidence: nullableNumber(raw.overall_confidence),
      reconciliationStatus: String(
        raw.reconciliation_status,
      ) as ReceiptReconciliationStatus,
      reconciliationDeltaMinor: nullableNumber(raw.reconciliation_delta_minor),
      reviewReasons: Array.isArray(raw.review_reasons)
        ? (raw.review_reasons.map(String) as ReceiptReviewQueueEntry["reviewReasons"])
        : [],
      reviewRevision: Number(raw.review_revision ?? 0),
      reviewStartedAt: nullableString(raw.review_started_at),
      itemCount: Number(raw.item_count ?? 0),
      unresolvedItemCount: Number(raw.unresolved_item_count ?? 0),
      readyToConfirm: Boolean(raw.ready_to_confirm),
    }));
  }

  async start(receiptId: UUID): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_start_receipt_review", {
      p_receipt_id: receiptId,
    });
  }

  async acceptHeader(
    receiptId: UUID,
    note: string | null = null,
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_accept_receipt_header", {
      p_receipt_id: receiptId,
      p_note: note,
    });
  }

  async updateHeader(
    receiptId: UUID,
    patch: ReceiptHeaderReviewPatch,
    note: string | null = null,
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_update_receipt_header_review", {
      p_receipt_id: receiptId,
      p_patch: headerPatchPayload(patch),
      p_note: note,
    });
  }

  async acceptItem(
    receiptItemId: UUID,
    note: string | null = null,
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_accept_receipt_item_review", {
      p_receipt_item_id: receiptItemId,
      p_note: note,
    });
  }

  async updateItem(
    receiptItemId: UUID,
    patch: ReceiptItemReviewPatch,
    note: string | null = null,
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_update_receipt_item_review", {
      p_receipt_item_id: receiptItemId,
      p_patch: itemPatchPayload(patch),
      p_note: note,
    });
  }

  async setItemExcluded(
    receiptItemId: UUID,
    excluded: boolean,
    note: string | null = null,
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_set_receipt_item_excluded", {
      p_receipt_item_id: receiptItemId,
      p_excluded: excluded,
      p_note: note,
    });
  }

  async skipProduct(
    receiptItemId: UUID,
    note: string | null = null,
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_skip_receipt_item_product", {
      p_receipt_item_id: receiptItemId,
      p_note: note,
    });
  }

  async assignProduct(
    receiptItemId: UUID,
    productId: UUID,
    options: {
      learnMerchantAlias?: boolean;
      note?: string | null;
    } = {},
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_review_assign_product", {
      p_receipt_item_id: receiptItemId,
      p_product_id: productId,
      p_learn_merchant_alias: options.learnMerchantAlias ?? true,
      p_note: options.note ?? null,
    });
  }

  async createProduct(
    receiptItemId: UUID,
    candidate: ProductCandidate,
    note: string | null = null,
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_review_create_product_candidate", {
      p_receipt_item_id: receiptItemId,
      p_candidate: candidatePayload(candidate),
      p_note: note,
    });
  }

  async waive(
    receiptId: UUID,
    reason:
      | "arithmetic_mismatch"
      | "reconciliation_insufficient"
      | "low_confidence",
    note: string,
  ): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_waive_receipt_review_reason", {
      p_receipt_id: receiptId,
      p_reason: reason,
      p_note: note,
    });
  }

  async confirm(receiptId: UUID): Promise<ReceiptReviewSnapshot> {
    return this.snapshotRpc("finance_confirm_receipt_review", {
      p_receipt_id: receiptId,
    });
  }
}
