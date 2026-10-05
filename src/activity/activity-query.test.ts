import { parseActivityQuery } from "./activity-query.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parsed = parseActivityQuery(
  'merchant:rewe category:snacks amount:>20 month:september "M&M"',
  { now: new Date(2026, 9, 5, 12, 0, 0) },
);

assert(parsed.filters.merchantName === "rewe", "merchant token failed");
assert(parsed.filters.categoryName === "snacks", "category token failed");
assert(parsed.filters.amountMinMinor === 2001, "amount comparator failed");
assert(parsed.filters.from?.includes("2026-09"), "month start failed");
assert(parsed.filters.to?.includes("2026-09-30") || parsed.filters.to?.includes("2026-10-01"), "month end failed");
assert(parsed.filters.q === "M&M", "free text preservation failed");

const product = parseActivityQuery(
  'product:"M&M\'s Peanut" necessity:discretionary receipt:true kind:transaction type:expense,refund',
);

assert(product.filters.productName === "M&M's Peanut", "quoted product failed");
assert(product.filters.necessities?.[0] === "discretionary", "necessity failed");
assert(product.filters.hasReceipt === true, "receipt boolean failed");
assert(product.filters.entityKinds?.[0] === "transaction", "kind failed");
assert(product.filters.transactionTypes?.length === 2, "type list failed");

const review = parseActivityQuery("receipt:review unknown:token plain");
assert(
  review.filters.receiptStatuses?.[0] === "review_required",
  "receipt review shortcut failed",
);
assert(
  review.filters.includeUnconfirmedReceipts === true,
  "review shortcut should reveal unconfirmed receipts",
);
assert(
  review.filters.q === "unknown:token plain",
  "unknown structured token should remain searchable free text",
);

const amountRange = parseActivityQuery("amount:12,50..20");
assert(amountRange.filters.amountMinMinor === 1250, "amount range minimum failed");
assert(amountRange.filters.amountMaxMinor === 2000, "amount range maximum failed");

console.log("Activity query parser fixtures passed");
