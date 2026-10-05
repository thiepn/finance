import type { UUID } from "../domain/finance.js";
import type {
  ReceiptProcessingResult,
  StructuredReceiptExtraction,
} from "../domain/receipt-processing.js";
import type {
  BeginReceiptProcessingInput,
  FinanceReceiptProcessingService,
} from "./receipt-processing.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}

function extractionPayload(extraction: StructuredReceiptExtraction): Record<string, unknown> {
  return {
    header: {
      ...(extraction.header.merchantName
        ? { merchant_name: extraction.header.merchantName }
        : {}),
      ...(extraction.header.merchantAddress
        ? { merchant_address: extraction.header.merchantAddress }
        : {}),
      ...(extraction.header.purchasedAt
        ? { purchased_at: extraction.header.purchasedAt }
        : {}),
      ...(extraction.header.currencyCode
        ? { currency_code: extraction.header.currencyCode }
        : {}),
      ...(extraction.header.subtotalMinor !== undefined
        ? { subtotal_minor: extraction.header.subtotalMinor }
        : {}),
      ...(extraction.header.taxMinor !== undefined
        ? { tax_minor: extraction.header.taxMinor }
        : {}),
      ...(extraction.header.discountMinor !== undefined
        ? { discount_minor: extraction.header.discountMinor }
        : {}),
      ...(extraction.header.depositMinor !== undefined
        ? { deposit_minor: extraction.header.depositMinor }
        : {}),
      ...(extraction.header.totalMinor !== undefined
        ? { total_minor: extraction.header.totalMinor }
        : {}),
      ...(extraction.header.receiptNumber
        ? { receipt_number: extraction.header.receiptNumber }
        : {}),
      ...(extraction.header.paymentMethod
        ? { payment_method: extraction.header.paymentMethod }
        : {}),
      ...(extraction.header.locale ? { locale: extraction.header.locale } : {}),
      ...(extraction.header.confidence !== undefined
        ? { confidence: extraction.header.confidence }
        : {}),
    },
    pages: extraction.pages.map((page) => ({
      page_id: page.pageId,
      page_index: page.pageIndex,
      raw_text: page.rawText,
      confidence: page.confidence,
      ...(page.blocks !== undefined ? { blocks: page.blocks } : {}),
      metadata: page.metadata,
    })),
    lines: extraction.lines.map((line) => ({
      page_id: line.pageId,
      line_index: line.lineIndex,
      page_line_index: line.pageLineIndex,
      raw_text: line.rawText,
      ...(line.normalizedText ? { normalized_text: line.normalizedText } : {}),
      kind: line.kind,
      ...(line.amountMinor !== undefined
        ? { amount_minor: line.amountMinor }
        : {}),
      ...(line.quantity !== undefined ? { quantity: line.quantity } : {}),
      ...(line.unitPriceMinor !== undefined
        ? { unit_price_minor: line.unitPriceMinor }
        : {}),
      ...(line.confidence !== undefined
        ? { confidence: line.confidence }
        : {}),
      ...(line.bbox !== undefined ? { bbox: line.bbox } : {}),
      metadata: line.metadata,
    })),
    items: extraction.items.map((item) => ({
      line_index: item.lineIndex,
      source_line_index: item.sourceLineIndex,
      raw_name: item.rawName,
      ...(item.normalizedName
        ? { normalized_name: item.normalizedName }
        : {}),
      quantity: item.quantity,
      ...(item.unitPriceMinor !== undefined
        ? { unit_price_minor: item.unitPriceMinor }
        : {}),
      line_total_minor: item.lineTotalMinor,
      discount_minor: item.discountMinor,
      deposit_minor: item.depositMinor,
      effective_total_minor: item.effectiveTotalMinor,
      ...(item.confidence !== undefined
        ? { confidence: item.confidence }
        : {}),
      review_required: item.reviewRequired,
      metadata: item.metadata,
    })),
  };
}

function parseResult(raw: Record<string, unknown>): ReceiptProcessingResult {
  const summaryRaw = (raw.summary ?? {}) as Record<string, unknown>;

  return {
    summary: {
      receiptId: String(summaryRaw.receipt_id),
      processingStatus: String(summaryRaw.processing_status),
      currentProcessingRunId:
        summaryRaw.current_processing_run_id === null
          ? null
          : String(summaryRaw.current_processing_run_id),
      merchantId:
        summaryRaw.merchant_id === null ? null : String(summaryRaw.merchant_id),
      merchantRawName:
        summaryRaw.merchant_raw_name === null
          ? null
          : String(summaryRaw.merchant_raw_name),
      merchantAddressRaw:
        summaryRaw.merchant_address_raw === null
          ? null
          : String(summaryRaw.merchant_address_raw),
      purchasedAt:
        summaryRaw.purchased_at === null ? null : String(summaryRaw.purchased_at),
      receiptNumber:
        summaryRaw.receipt_number === null
          ? null
          : String(summaryRaw.receipt_number),
      paymentMethodRaw:
        summaryRaw.payment_method_raw === null
          ? null
          : String(summaryRaw.payment_method_raw),
      locale: summaryRaw.locale === null ? null : String(summaryRaw.locale),
      currencyCode: String(summaryRaw.currency_code),
      subtotalMinor:
        summaryRaw.subtotal_minor === null
          ? null
          : Number(summaryRaw.subtotal_minor),
      taxMinor:
        summaryRaw.tax_minor === null ? null : Number(summaryRaw.tax_minor),
      discountMinor: Number(summaryRaw.discount_minor ?? 0),
      depositMinor: Number(summaryRaw.deposit_minor ?? 0),
      totalMinor:
        summaryRaw.total_minor === null ? null : Number(summaryRaw.total_minor),
      overallConfidence:
        summaryRaw.overall_confidence === null
          ? null
          : Number(summaryRaw.overall_confidence),
      reconciliationStatus: String(
        summaryRaw.reconciliation_status,
      ) as ReceiptProcessingResult["summary"]["reconciliationStatus"],
      reconciliationDeltaMinor:
        summaryRaw.reconciliation_delta_minor === null
          ? null
          : Number(summaryRaw.reconciliation_delta_minor),
      reviewReasons: Array.isArray(summaryRaw.review_reasons)
        ? summaryRaw.review_reasons.map(String)
        : [],
    },
    run:
      raw.run && typeof raw.run === "object"
        ? (raw.run as Record<string, unknown>)
        : null,
    pages: Array.isArray(raw.pages)
      ? (raw.pages as Record<string, unknown>[])
      : [],
    lines: Array.isArray(raw.lines)
      ? (raw.lines as Record<string, unknown>[])
      : [],
    items: Array.isArray(raw.items)
      ? (raw.items as Record<string, unknown>[])
      : [],
  };
}

export class SupabaseFinanceReceiptProcessingService
  implements FinanceReceiptProcessingService
{
  constructor(private readonly client: SupabaseRpcClient) {}

  async begin(input: BeginReceiptProcessingInput): Promise<UUID> {
    const result = await this.client.rpc<UUID>(
      "finance_begin_receipt_processing",
      {
        p_receipt_id: input.receiptId,
        p_mode: input.mode,
        p_pipeline_version: input.pipelineVersion,
        p_ocr_provider: input.ocrProvider,
        p_ocr_model: input.ocrModel,
        p_parser_version: input.parserVersion,
        p_input_digest: input.inputDigest ?? null,
        p_metadata: input.metadata ?? {},
      },
    );
    rpcError(result, "beginReceiptProcessing");
    if (!result.data) throw new Error("Receipt processing did not return a run id");
    return result.data;
  }

  async submit(
    runId: UUID,
    extraction: StructuredReceiptExtraction,
  ): Promise<ReceiptProcessingResult> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_submit_receipt_extraction",
      {
        p_run_id: runId,
        p_payload: extractionPayload(extraction),
      },
    );
    rpcError(result, "submitReceiptExtraction");
    if (!result.data) throw new Error("Receipt extraction returned no data");
    return parseResult(result.data);
  }

  async fail(
    runId: UUID,
    errorText: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const result = await this.client.rpc("finance_fail_receipt_processing", {
      p_run_id: runId,
      p_error_text: errorText,
      p_metadata: metadata,
    });
    rpcError(result, "failReceiptProcessing");
  }

  async get(receiptId: UUID): Promise<ReceiptProcessingResult> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_receipt_processing",
      { p_receipt_id: receiptId },
    );
    rpcError(result, "getReceiptProcessing");
    if (!result.data) throw new Error("Receipt processing result not found");
    return parseResult(result.data);
  }
}
