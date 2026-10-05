import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinanceProductIntelligenceService } from "../services/supabase-product-intelligence.js";

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

    if (functionName === "finance_get_product_catalog") {
      return {
        data: {
          profile: {
            currency_code: "EUR",
            locale: "de-DE",
            time_zone: "Europe/Berlin",
          },
          query: "m&m",
          products: [{
            product_id: "product-1",
            name: "M&M's Peanut 250 g",
            brand: "M&M's",
            family_id: "family-1",
            family_name: "M&M's Peanut",
            variant_name: "250 g",
            product_type: "Chocolate",
            size_value: 250,
            size_unit: "g",
            category_id: "category-1",
            category_name: "Chocolate",
            necessity: "discretionary",
            purchase_count: 5,
            total_spend_minor: 1745,
            total_quantity: 5,
            first_purchase_at: "2026-09-01T10:00:00Z",
            last_purchase_at: "2026-10-04T10:00:00Z",
            latest_unit_price_minor: 349,
            price_currency_code: "EUR",
            latest_merchant_id: "merchant-1",
            latest_merchant_name: "REWE",
            latest_price_at: "2026-10-04T10:00:00Z",
            latest_basis_price_minor: 140,
            basis_label: "100 g",
          }],
        } as T,
        error: null,
      };
    }

    return {
      data: {
        profile: {
          currency_code: "EUR",
          locale: "de-DE",
          time_zone: "Europe/Berlin",
        },
        range: "1m",
        anchor_date: "2026-10-05",
        bucket_kind: "day",
        period: {
          start: "2026-09-06T22:00:00Z",
          end: "2026-10-05T22:00:00Z",
          compare_start: "2026-08-06T22:00:00Z",
          compare_end: "2026-09-06T22:00:00Z",
        },
        product: {
          id: "product-1",
          name: "M&M's Peanut 250 g",
          brand: "M&M's",
          family_id: "family-1",
          family_name: "M&M's Peanut",
          variant_name: "250 g",
          product_type: "Chocolate",
          barcode: null,
          size_value: 250,
          size_unit: "g",
          default_category_id: "category-1",
          category_name: "Chocolate",
          necessity: "discretionary",
        },
        summary: {
          current: {
            purchase_count: 3,
            total_spend_minor: 940,
            total_quantity: 3,
            first_purchase_at: "2026-09-10T10:00:00Z",
            last_purchase_at: "2026-10-04T10:00:00Z",
            min_unit_price_minor: 300,
            max_unit_price_minor: 330,
            avg_unit_price_minor: 313,
            price_observation_count: 3,
          },
          comparison: {
            purchase_count: 1,
            total_spend_minor: 250,
            total_quantity: 1,
            first_purchase_at: "2026-08-20T10:00:00Z",
            last_purchase_at: "2026-08-20T10:00:00Z",
            min_unit_price_minor: 250,
            max_unit_price_minor: 250,
            avg_unit_price_minor: 250,
            price_observation_count: 1,
          },
          spend_delta_minor: 690,
          spend_delta_ratio: 2.76,
          purchase_delta: 2,
          purchase_delta_ratio: 2,
          quantity_delta: 2,
          quantity_delta_ratio: 2,
        },
        latest_price: {
          latest_unit_price_minor: 310,
          previous_unit_price_minor: 330,
          change_minor: -20,
          change_ratio: -0.060606,
          direction: "down",
          observed_at: "2026-10-04T10:00:00Z",
          merchant_id: "merchant-2",
          merchant_name: "Lidl",
          basis_price_minor: 124,
          basis_label: "100 g",
        },
        frequency: {
          current: [{
            bucket_index: 1,
            bucket_start: "2026-09-06T22:00:00Z",
            bucket_end: "2026-09-07T22:00:00Z",
            purchase_count: 0,
            quantity: 0,
            spend_minor: 0,
          }],
          comparison: [],
        },
        price_history: [{
          receipt_item_id: "item-1",
          receipt_id: "receipt-1",
          observed_at: "2026-10-04T10:00:00Z",
          merchant_id: "merchant-2",
          merchant_name: "Lidl",
          currency_code: "EUR",
          list_unit_price_minor: 310,
          effective_unit_price_minor: 310,
          quantity: 1,
          basis_price_minor: 124,
          basis_label: "100 g",
        }],
        price_history_count: 1,
        price_history_truncated: false,
        merchants: [{
          merchant_id: "merchant-2",
          merchant_name: "Lidl",
          purchase_count: 1,
          spend_minor: 310,
          min_unit_price_minor: 310,
          max_unit_price_minor: 310,
          avg_unit_price_minor: 310,
          latest_unit_price_minor: 310,
          latest_price_at: "2026-10-04T10:00:00Z",
          previous_unit_price_minor: 280,
          price_change_minor: 30,
          price_change_ratio: 0.107143,
        }],
        cheapest_merchant: {
          merchant_id: "merchant-2",
          merchant_name: "Lidl",
          latest_unit_price_minor: 310,
          latest_price_at: "2026-10-04T10:00:00Z",
          purchase_count: 1,
        },
        family_variants: [{
          product_id: "product-2",
          name: "M&M's Peanut 500 g",
          variant_name: "500 g",
          size_value: 500,
          size_unit: "g",
          purchase_count: 1,
          spend_minor: 500,
          last_purchase_at: "2026-09-22T10:00:00Z",
          latest_unit_price_minor: 500,
          latest_merchant_id: "merchant-1",
          latest_merchant_name: "REWE",
          latest_price_at: "2026-09-22T10:00:00Z",
          basis_price_minor: 100,
          basis_label: "100 g",
          is_current: false,
        }],
      } as T,
      error: null,
    };
  },
};

let initialized = 0;
const service = new SupabaseFinanceProductIntelligenceService(
  client,
  async () => {
    initialized += 1;
  },
);

const catalog = await service.getCatalog({ query: "m&m", limit: 20 });
assert(catalog.products[0]?.purchaseCount === 5, "catalog parsing failed");
assert(catalog.products[0]?.latestBasisPriceMinor === 140, "catalog basis parse failed");

const detail = await service.getProductAnalytics({
  productId: "product-1",
  range: "1m",
  anchorDate: "2026-10-05",
});
assert(detail.summary.current.totalSpendMinor === 940, "summary parse failed");
assert(detail.latestPrice.direction === "down", "price direction parse failed");
assert(detail.cheapestMerchant?.merchantName === "Lidl", "cheapest merchant parse failed");
assert(detail.familyVariants[0]?.basisPriceMinor === 100, "family basis parse failed");
assert(initialized === 2, "initialization hook failed");
assert(calls[0]?.name === "finance_get_product_catalog", "catalog RPC name failed");
assert(calls[1]?.name === "finance_get_product_intelligence", "detail RPC name failed");
assert(calls[1]?.args?.p_range === "1m", "range RPC argument failed");

console.log("Product Intelligence Supabase adapter fixtures passed");
