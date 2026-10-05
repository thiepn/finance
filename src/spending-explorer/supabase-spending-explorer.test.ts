import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinanceSpendingExplorerService } from "../services/supabase-spending-explorer.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
const client: SupabaseRpcClient = {
  async rpc<T>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: null }> {
    calls.push(args ? { name: functionName, args } : { name: functionName });

    if (functionName === "finance_get_spending_explorer_period") {
      return {
        data: {
          period_kind: "month",
          anchor_date: "2026-10-05",
          profile: {
            currency_code: "EUR",
            locale: "de-DE",
            time_zone: "Europe/Berlin",
          },
          period: {
            start: "2026-09-30T22:00:00Z",
            end: "2026-10-31T23:00:00Z",
            compare_start: "2026-08-31T22:00:00Z",
            compare_end: "2026-09-30T22:00:00Z",
          },
          bucket_kind: "day",
          scope: {
            category_id: "cat-food",
            merchant_id: null,
            necessity: null,
            category_name: "Food & Drink",
            merchant_name: null,
            breadcrumb: [
              { category_id: "cat-food", name: "Food & Drink" },
            ],
          },
          summary: {
            current: {
              gross_spend_minor: 65000,
              recoveries_minor: 5000,
              net_spend_minor: 60000,
              transaction_count: 3,
            },
            comparison: {
              gross_spend_minor: 50000,
              recoveries_minor: 0,
              net_spend_minor: 50000,
              transaction_count: 1,
            },
            delta_minor: 10000,
            delta_ratio: 0.2,
            itemized_evidence_minor: 50000,
            itemized_coverage_ratio: 0.833333,
          },
          series: {
            current: [
              {
                bucket_index: 1,
                bucket_start: "2026-09-30T22:00:00Z",
                bucket_end: "2026-10-01T22:00:00Z",
                net_spend_minor: 0,
                gross_spend_minor: 0,
                recoveries_minor: 0,
                transaction_count: 0,
              },
            ],
            comparison: [],
          },
          children: [
            {
              category_id: "cat-snacks",
              name: "Snacks",
              current_minor: 40000,
              previous_minor: 20000,
              delta_minor: 20000,
              delta_ratio: 1,
              share: 0.666667,
              transaction_count: 3,
              has_children: true,
            },
          ],
          direct_category_minor: 0,
          merchants: [],
          necessities: [],
          products: [],
        } as T,
        error: null,
      };
    }

    return {
      data: {
        product: {
          product_id: "product-1",
          name: "M&M's Peanut 250 g",
          brand: "M&M's",
          family_id: null,
          family_name: "M&M's Peanut",
          product_type: "Chocolate",
          size_value: 250,
          size_unit: "g",
        },
        period: {
          start: "2026-09-30T22:00:00Z",
          end: "2026-10-31T23:00:00Z",
        },
        purchases: [
          {
            receipt_item_id: "item-1",
            receipt_id: "receipt-1",
            occurred_at: "2026-10-05T14:00:00Z",
            transaction_ids: ["transaction-1"],
            merchant_id: "merchant-1",
            merchant_name: "REWE",
            quantity: 1,
            unit_price_minor: 349,
            effective_total_minor: 349,
            discount_minor: 0,
            deposit_minor: 0,
            category_id: "cat-choc",
            category_name: "Chocolate",
            necessity: "discretionary",
          },
        ],
      } as T,
      error: null,
    };
  },
};

let initialized = 0;
const service = new SupabaseFinanceSpendingExplorerService(
  client,
  async () => {
    initialized += 1;
  },
);

const explorer = await service.getExplorer({
  periodKind: "month",
  categoryId: "cat-food",
});

assert(explorer.summary.current.netSpendMinor === 60000, "summary parse failed");
assert(explorer.children[0]?.name === "Snacks", "child category parse failed");
assert(explorer.scope.breadcrumb[0]?.name === "Food & Drink", "breadcrumb parse failed");
assert(explorer.summary.itemizedCoverageRatio === 0.833333, "coverage parse failed");

const evidence = await service.getProductEvidence({
  productId: "product-1",
  periodStart: explorer.period.start,
  periodEnd: explorer.period.end,
});

assert(evidence.product.brand === "M&M's", "product evidence parse failed");
assert(evidence.purchases[0]?.merchantName === "REWE", "purchase evidence parse failed");
assert(evidence.purchases[0]?.transactionIds[0] === "transaction-1", "transaction evidence parse failed");
assert(initialized === 2, "initialization hook failed");
assert(calls[0]?.name === "finance_get_spending_explorer_period", "explorer RPC name failed");
assert(calls[1]?.name === "finance_get_product_purchase_evidence", "evidence RPC name failed");

console.log("Spending Explorer Supabase adapter fixtures passed");
