import type {
  ConfirmReceiptMatchInput,
  ReceiptMatchAllocation,
  ReceiptMatchDashboard,
  ReceiptMatchItem,
  ReceiptMatchQueueItem,
  ReceiptMatchTransaction,
  ReceiptMatchWorkspace,
  ReceiptTransactionMatch,
} from "../domain/receipt-matching.js";
import type { UUID } from "../domain/finance.js";
import type { FinanceReceiptMatchingService } from "./receipt-matching.js";
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

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}

function parseQueueItem(value: unknown): ReceiptMatchQueueItem {
  const raw = record(value, "receipt match queue item");
  return {
    receiptId: String(raw.receipt_id),
    merchantId: nullableString(raw.merchant_id),
    merchantName: String(raw.merchant_name),
    purchasedAt: nullableString(raw.purchased_at),
    currencyCode: String(raw.currency_code),
    totalMinor: nullableNumber(raw.total_minor),
    matchStatus: String(raw.match_status) as ReceiptMatchQueueItem["matchStatus"],
    coveredMinor: Number(raw.covered_minor),
    remainingMinor: nullableNumber(raw.remaining_minor),
    suggestedCount: Number(raw.suggested_count),
    confirmedCount: Number(raw.confirmed_count),
    topConfidence: nullableNumber(raw.top_confidence),
    topTransactionId: nullableString(raw.top_transaction_id),
    topTransactionAt: nullableString(raw.top_transaction_at),
    topTransactionDescription: nullableString(raw.top_transaction_description),
    topTransactionAmountMinor: nullableNumber(raw.top_transaction_amount_minor),
    updatedAt: String(raw.updated_at),
  };
}

function parseItem(value: unknown): ReceiptMatchItem {
  const raw = record(value, "receipt match item");
  return {
    itemId: String(raw.item_id),
    lineIndex: Number(raw.line_index),
    rawName: String(raw.raw_name),
    normalizedName: nullableString(raw.normalized_name),
    productId: nullableString(raw.product_id),
    productName: nullableString(raw.product_name),
    categoryId: nullableString(raw.category_id),
    categoryName: nullableString(raw.category_name),
    necessity: String(raw.necessity),
    quantity: Number(raw.quantity),
    effectiveTotalMinor: Number(raw.effective_total_minor),
  };
}

function parseTransaction(value: unknown): ReceiptMatchTransaction {
  const raw = record(value, "receipt match transaction");
  return {
    transactionId: String(raw.transaction_id),
    type: String(raw.type),
    status: String(raw.status),
    source: String(raw.source),
    occurredAt: String(raw.occurred_at),
    description: nullableString(raw.description),
    merchantId: nullableString(raw.merchant_id),
    merchantName: nullableString(raw.merchant_name),
    merchantSource: nullableString(raw.merchant_source),
    reportingCurrency: String(raw.reporting_currency),
    displayAmountMinor: Number(raw.display_amount_minor),
    matchableAmountMinor: nullableNumber(raw.matchable_amount_minor),
    accounts: Array.isArray(raw.accounts)
      ? raw.accounts.map((value) => {
          const account = record(value, "receipt match account");
          return {
            accountId: String(account.account_id),
            name: String(account.name),
            kind: String(account.kind),
            currencyCode: String(account.currency_code),
            signedAmountMinor: Number(account.signed_amount_minor),
          };
        })
      : [],
  };
}

function parseMatch(value: unknown): ReceiptTransactionMatch {
  const raw = record(value, "receipt transaction match");
  return {
    matchId: String(raw.match_id),
    status: String(raw.status) as ReceiptTransactionMatch["status"],
    matchedAmountMinor: Number(raw.matched_amount_minor),
    confidence: nullableNumber(raw.confidence),
    candidateRank: nullableNumber(raw.candidate_rank),
    amountDeltaMinor: nullableNumber(raw.amount_delta_minor),
    dateDeltaDays: nullableNumber(raw.date_delta_days),
    amountScore: nullableNumber(raw.amount_score),
    dateScore: nullableNumber(raw.date_score),
    merchantScore: nullableNumber(raw.merchant_score),
    currencyScore: nullableNumber(raw.currency_score),
    scoreVersion: nullableString(raw.score_version),
    decisionSource: nullableString(raw.decision_source),
    decisionNote: nullableString(raw.decision_note),
    confirmedAt: nullableString(raw.confirmed_at),
    rejectedAt: nullableString(raw.rejected_at),
    transaction: parseTransaction(raw.transaction),
    reason:
      raw.reason && typeof raw.reason === "object" && !Array.isArray(raw.reason)
        ? (raw.reason as Record<string, unknown>)
        : {},
  };
}

function parseAllocation(value: unknown): ReceiptMatchAllocation {
  const raw = record(value, "receipt match allocation");
  return {
    transactionId: String(raw.transaction_id),
    matchId: String(raw.match_id),
    categoryId: nullableString(raw.category_id),
    categoryName: nullableString(raw.category_name),
    necessity: String(raw.necessity),
    sourceCurrencyCode: String(raw.source_currency_code),
    sourceAmountMinor: Number(raw.source_amount_minor),
    reportingCurrency: String(raw.reporting_currency),
    reportingAmountMinor: Number(raw.reporting_amount_minor),
  };
}

export class SupabaseFinanceReceiptMatchingService
  implements FinanceReceiptMatchingService
{
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async getDashboard(limit = 50): Promise<ReceiptMatchDashboard> {
    await this.ensureInitialized?.();
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_receipt_match_dashboard",
      { p_limit: limit },
    );
    rpcError(result, "getReceiptMatchDashboard");
    if (!result.data) throw new Error("Receipt match dashboard returned no data");

    const summary = record(result.data.summary, "receipt match summary");
    return {
      summary: {
        unmatchedCount: Number(summary.unmatched_count),
        suggestedCount: Number(summary.suggested_count),
        partialCount: Number(summary.partial_count),
        matchedCount: Number(summary.matched_count),
      },
      receipts: Array.isArray(result.data.receipts)
        ? result.data.receipts.map(parseQueueItem)
        : [],
    };
  }

  async getWorkspace(receiptId: UUID): Promise<ReceiptMatchWorkspace> {
    await this.ensureInitialized?.();
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_receipt_match_workspace",
      { p_receipt_id: receiptId },
    );
    rpcError(result, "getReceiptMatchWorkspace");
    if (!result.data) throw new Error("Receipt match workspace returned no data");

    const rawReceipt = record(result.data.receipt, "receipt match receipt");
    return {
      receipt: {
        receiptId: String(rawReceipt.receipt_id),
        merchantId: nullableString(rawReceipt.merchant_id),
        merchantName: String(rawReceipt.merchant_name),
        merchantRawName: nullableString(rawReceipt.merchant_raw_name),
        purchasedAt: nullableString(rawReceipt.purchased_at),
        currencyCode: String(rawReceipt.currency_code),
        totalMinor: nullableNumber(rawReceipt.total_minor),
        paymentMethodRaw: nullableString(rawReceipt.payment_method_raw),
        receiptNumber: nullableString(rawReceipt.receipt_number),
        processingStatus: String(rawReceipt.processing_status),
        matchStatus: String(rawReceipt.match_status) as ReceiptMatchWorkspace["receipt"]["matchStatus"],
        coveredMinor: Number(rawReceipt.covered_minor),
        remainingMinor: nullableNumber(rawReceipt.remaining_minor),
        matchUpdatedAt: nullableString(rawReceipt.match_updated_at),
      },
      items: Array.isArray(result.data.items)
        ? result.data.items.map(parseItem)
        : [],
      matches: Array.isArray(result.data.matches)
        ? result.data.matches.map(parseMatch)
        : [],
      effectiveAllocations: Array.isArray(result.data.effective_allocations)
        ? result.data.effective_allocations.map(parseAllocation)
        : [],
    };
  }

  async refreshReceipt(
    receiptId: UUID,
    autoConfirm = true,
  ): Promise<Record<string, unknown>> {
    await this.ensureInitialized?.();
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_refresh_receipt_match_candidates",
      {
        p_receipt_id: receiptId,
        p_auto_confirm: autoConfirm,
      },
    );
    rpcError(result, "refreshReceiptMatchCandidates");
    return result.data ?? {};
  }

  async refreshQueue(
    limit = 100,
    autoConfirm = true,
  ): Promise<Record<string, unknown>> {
    await this.ensureInitialized?.();
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_refresh_receipt_match_queue",
      {
        p_limit: limit,
        p_auto_confirm: autoConfirm,
      },
    );
    rpcError(result, "refreshReceiptMatchQueue");
    return result.data ?? {};
  }

  async confirm(
    input: ConfirmReceiptMatchInput,
  ): Promise<Record<string, unknown>> {
    await this.ensureInitialized?.();
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_confirm_receipt_transaction_match",
      {
        p_match_id: input.matchId,
        p_matched_amount_minor: input.matchedAmountMinor ?? null,
        p_note: input.note ?? null,
      },
    );
    rpcError(result, "confirmReceiptTransactionMatch");
    return result.data ?? {};
  }

  async reject(matchId: UUID, note: string | null = null): Promise<void> {
    await this.ensureInitialized?.();
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_reject_receipt_transaction_match",
      {
        p_match_id: matchId,
        p_note: note,
      },
    );
    rpcError(result, "rejectReceiptTransactionMatch");
  }

  async unconfirm(matchId: UUID, note: string | null = null): Promise<void> {
    await this.ensureInitialized?.();
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_unconfirm_receipt_transaction_match",
      {
        p_match_id: matchId,
        p_note: note,
      },
    );
    rpcError(result, "unconfirmReceiptTransactionMatch");
  }
}
