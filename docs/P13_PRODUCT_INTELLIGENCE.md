# P13 — Product Intelligence & Price Analytics

P13 turns normalized receipt products from P6 and confirmed evidence from P12 into a dedicated product analytics surface.

## Product evidence boundary

All P13 purchase and price analytics use only:

- confirmed receipts;
- confirmed receipt-to-transaction matches;
- posted expense transactions;
- non-excluded normalized receipt items;
- active price observations tied to those receipt items.

Refund/reimbursement transactions continue to affect financial spending in the ledger, but they do not create fake product purchases or price observations.

## Product catalog

P13 adds a searchable product catalog backed by `finance.get_product_catalog` / `public.finance_get_product_catalog`.

Search covers product name, brand, family, product type, and barcode. Catalog metrics include trusted purchase count, spend, quantity, first/last purchase, latest exact-product price, latest merchant, and normalized package price where size data is available.

Unconfirmed/unmatched receipt items do not contribute to catalog purchase or price metrics.

## Product analytics ranges

Supported rolling ranges:

~~~text
1M  → day buckets
3M  → week buckets
6M  → week buckets
1Y  → month buckets
ALL → month or quarter buckets depending on history length
~~~

1M/3M/6M/1Y compare against the immediately preceding equal-length range. ALL intentionally has no fabricated comparison baseline.

## Product summary

Each product detail returns:

- purchase count;
- total itemized spend;
- total quantity;
- first/last purchase;
- minimum unit price;
- maximum unit price;
- average unit price;
- price observation count;
- spend change vs previous range;
- purchase-frequency change;
- quantity change.

These are separate dimensions: buying a product more frequently is not automatically treated as price inflation.

## Price change semantics

The headline latest-price change is merchant-consistent.

Example:

~~~text
Aug Lidl  €2.50
Oct REWE  €3.30
Oct Lidl  €3.10  ← latest observation
~~~

The latest Lidl price is compared with the previous Lidl price (€2.50), not the immediately previous REWE observation (€3.30). This prevents merchant switching from being mislabeled as inflation or deflation.

A 5% threshold is used for directional price-change status:

- ≥ +5% → up;
- ≤ −5% → down;
- within ±5% → stable;
- missing same-merchant history → insufficient history.

Merchant-specific rows independently return each merchant's latest, previous, average, minimum, maximum, and change.

## Cheapest merchant

The cheapest merchant is selected from merchants with a confirmed price observation inside the selected range, using each merchant's latest exact-product price.

This is deliberately an observed-history statement, not a live retail-price claim.

## Package-size normalization

Family variants may have different package sizes, so package prices are not compared naively.

For products with canonical sizes:

~~~text
g     → price per 100 g
ml    → price per 100 ml
count → price per 1 count
~~~

Example:

~~~text
250 g package €3.10 → €1.24 / 100 g
500 g package €5.00 → €1.00 / 100 g
~~~

This allows meaningful family-variant comparison while still showing the real package price.

## Price history

The product detail response includes confirmed effective-unit-price observations with merchant, receipt item, date, package quantity, and normalized basis price.

Up to the latest 500 observations are returned in the interactive history payload. The API also returns the total observation count and a truncation flag.

## Purchase frequency

P13 returns zero-filled range buckets containing:

- purchase-event count;
- quantity;
- spend.

Current and previous ranges are aligned by bucket index for comparison.

## Merchant comparison

Each merchant row contains:

- purchase count;
- spend;
- latest exact-product price;
- previous price at that merchant;
- price change;
- average price;
- observed min/max range.

## Family variants

When a product belongs to a normalized family, P13 returns sibling variants with range purchase/spend data, latest package price, merchant, and normalized basis price.

## Backend API

~~~text
finance.get_product_catalog(query, limit)
public.finance_get_product_catalog(query, limit)

finance.get_product_intelligence(product_id, range, anchor_date)
public.finance_get_product_intelligence(product_id, range, anchor_date)
~~~

All functions are SECURITY INVOKER. Public/anonymous execute permission is revoked and authenticated/service-role execution is explicitly granted. Raw Finance tables remain outside the browser-facing API.

## Browser/runtime

P13 extends the existing P6 `FinanceProductIntelligenceService` rather than creating a competing product service.

The shared browser runtime now exposes `runtime.productIntelligence`.

## UI

The Products route now provides:

- searchable product catalog;
- deep-linkable selection via `#products?product=<id>`;
- 1M / 3M / 6M / 1Y / All controls;
- spend, purchases, latest price, cheapest merchant summary;
- price-history chart/table;
- purchase-frequency chart/table;
- merchant price-comparison table;
- family/package comparison;
- individual purchase evidence reused from P12;
- handoff to Activity.

P12 Spending Explorer can open the selected product directly in P13.

## Verification

Live rollback fixtures verify:

- current-vs-comparison purchase/spend totals;
- min/max/average prices;
- latest price and normalized price per 100 g;
- cheapest current merchant;
- merchant-specific previous price;
- family variant normalized pricing;
- 1M / 3M / 6M / 1Y / ALL range behavior;
- cross-user isolation;
- searchable catalog behavior;
- unconfirmed receipt evidence exclusion;
- same-merchant headline price-change semantics.

## Advisors

~~~text
Supabase Security advisor     clean
Supabase Performance advisor  clean
~~~

## P14 handoff

P14 should implement Bills, Subscriptions & Recurring-Cost Analytics: recurring detection, monthly/annualized cost, upcoming timeline, price-increase detection, missing expected charges, and subscription-creep analysis.