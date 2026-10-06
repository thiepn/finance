import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinanceReceiptMatchingService } from "../services/supabase-receipt-matching.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: string[] = [];

const client: SupabaseRpcClient = {
  async rpc<T>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: null }> {
    calls.push(functionName);

    if (functionName === "finance_get_receipt_match_dashboard") {
      return {
        data: {
          summary: {
            unmatched_count: 1,
            suggested_count: 2,
            partial_count: 0,
            matched_count: 5,
          },
          receipts: [{
            receipt_id: "receipt-1",
            merchant_id: "merchant-1",
            merchant_name: "REWE",
            purchased_at: "2026-10-05T18:00:00Z",
            currency_code: "EUR",
            total_minor: 4237,
            match_status: "suggested_match",
            covered_minor: 0,
            remaining_minor: 4237,
            suggested_count: 1,
            confirmed_count: 0,
            top_confidence: 0.95,
            top_transaction_id: "tx-1",
            top_transaction_at: "2026-10-05T18:05:00Z",
            top_transaction_description: "REWE",
            top_transaction_amount_minor: 4237,
            updated_at: "2026-10-05T18:10:00Z",
          }],
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_get_receipt_match_workspace") {
      return {
        data: {
          receipt: {
            receipt_id: "receipt-1",
            merchant_id: "merchant-1",
            merchant_name: "REWE",
            merchant_raw_name: "REWE MARKT",
            purchased_at: "2026-10-05T18:00:00Z",
            currency_code: "EUR",
            total_minor: 4237,
            payment_method_raw: "VISA",
            receipt_number: "123",
            processing_status: "confirmed",
            match_status: "suggested_match",
            covered_minor: 0,
            remaining_minor: 4237,
            match_updated_at: "2026-10-05T18:10:00Z",
          },
          items: [{
            item_id: "item-1",
            line_index: 0,
            raw_name: "MILCH",
            normalized_name: "Milch",
            product_id: "product-1",
            product_name: "Milk",
            category_id: "category-1",
            category_name: "Groceries",
            necessity: "essential",
            quantity: 1,
            effective_total_minor: 199,
          }],
          matches: [{
            match_id: "match-1",
            status: "suggested",
            matched_amount_minor: 4237,
            confidence: 0.95,
            candidate_rank: 1,
            amount_delta_minor: 0,
            date_delta_days: 0,
            amount_score: 1,
            date_score: 1,
            merchant_score: 1,
            currency_score: 1,
            score_version: "p18-v1",
            decision_source: "deterministic",
            decision_note: null,
            confirmed_at: null,
            rejected_at: null,
            transaction: {
              transaction_id: "tx-1",
              type: "expense",
              status: "posted",
              source: "import",
              occurred_at: "2026-10-05T18:05:00Z",
              description: "REWE",
              merchant_id: "merchant-1",
              merchant_name: "REWE",
              merchant_source: "transaction",
              reporting_currency: "EUR",
              display_amount_minor: 4237,
              matchable_amount_minor: 4237,
              accounts: [{
                account_id: "account-1",
                name: "Visa",
                kind: "credit_card",
                currency_code: "EUR",
                signed_amount_minor: -4237,
              }],
            },
            reason: {},
          }],
          effective_allocations: [],
        } as T,
        error: null,
      };
    }

    if (
      functionName === "finance_refresh_receipt_match_candidates" ||
      functionName === "finance_refresh_receipt_match_queue" ||
      functionName === "finance_confirm_receipt_transaction_match" ||
      functionName === "finance_reject_receipt_transaction_match"
    ) {
      return { data: {} as T, error: null };
    }

    return { data: null, error: null };
  },
};

let initialized = 0;
const service = new SupabaseFinanceReceiptMatchingService(
  client,
  async () => { initialized += 1; },
);

const dashboard = await service.getDashboard();
assert(dashboard.summary.matchedCount === 5, "dashboard summary parse failed");
assert(dashboard.receipts[0]?.topConfidence === 0.95, "queue parse failed");

const workspace = await service.getWorkspace("receipt-1");
assert(workspace.receipt.totalMinor === 4237, "workspace receipt parse failed");
assert(workspace.items[0]?.productName === "Milk", "workspace item parse failed");
assert(workspace.matches[0]?.transaction.source === "import", "transaction parse failed");

await service.refreshReceipt("receipt-1", false);
await service.refreshQueue(50, true);
await service.confirm({ matchId: "match-1", matchedAmountMinor: 4237 });
await service.reject("match-1", "wrong transaction");

assert(initialized === 6, "initialization hook count failed");
assert(calls[0] === "finance_get_receipt_match_dashboard", "dashboard RPC mismatch");
assert(calls[1] === "finance_get_receipt_match_workspace", "workspace RPC mismatch");
assert(calls[2] === "finance_refresh_receipt_match_candidates", "refresh receipt RPC mismatch");
assert(calls[3] === "finance_refresh_receipt_match_queue", "refresh queue RPC mismatch");
assert(calls[4] === "finance_confirm_receipt_transaction_match", "confirm RPC mismatch");
assert(calls[5] === "finance_reject_receipt_transaction_match", "reject RPC mismatch");

console.log("P18 receipt matching Supabase adapter fixtures passed");
