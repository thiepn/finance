# P6 — Product Normalization, Families & Learning

P6 converts OCR-derived receipt item names into stable product entities that can power repeat-purchase analytics and price history.

## Product identity layers

Finance now distinguishes:

```text
raw receipt item
  ↓
merchant/global alias
  ↓
canonical product
  ↓
product family
  ↓
broader product type/category
```

Example:

```text
MMS PNUT 250G
  ↓
merchant alias at REWE
  ↓
M&M's Peanut 250 g
  ↓
M&M's Peanut
  ↓
Chocolate / Snacks
```

The original raw receipt text remains untouched.

## Matching precedence

Automatic exact matching is intentionally conservative:

1. merchant-specific product alias
2. global product alias
3. exact canonical normalized product name
4. no match

Fuzzy string similarity is not allowed to silently assign a product.

Explicit user corrections outrank learned mappings.

## Product families

`finance.product_families` is a first-class entity.

A family may hold:

- canonical family name
- brand
- product type
- default category
- default necessity
- metadata

Individual product variants point to a family.

Examples:

```text
Family: Coca-Cola Zero
├── Coca-Cola Zero 330 ml
├── Coca-Cola Zero 500 ml
└── Coca-Cola Zero 1500 ml
```

## Products

Canonical products now store:

- canonical display name
- normalized identity
- brand / normalized brand
- family
- variant
- product type
- barcode
- normalized size/value
- default category
- default necessity
- source
- confidence
- first/last seen timestamps

Canonical product size units normalize to:

- g
- ml
- count

Examples:

- 1 kg → 1000 g
- 1.5 l → 1500 ml
- 6 × 330 ml → 1980 ml plus pack metadata on the local candidate

## Product aliases

Aliases can be merchant-specific or global.

Example:

```text
Merchant: REWE
Raw alias: MMS PNUT 250G
Product: M&M's Peanut 250 g
```

The same raw text may therefore map differently at another merchant if needed.

Aliases track:

- source
- confidence
- confirmations
- use count
- last use
- active state

A user correction can replace a lower-priority learned alias.

## First-time products

Exact alias matching cannot handle a product that has never been seen before.

P6 therefore has a guarded candidate-creation path.

A deterministic candidate may be auto-created only when confidence is at least:

```text
0.92
```

Otherwise it remains in review.

User-confirmed candidates bypass the automatic threshold.

## Local deterministic normalizer

`DeterministicProductNormalizer` handles:

- Unicode/whitespace cleanup
- common receipt abbreviations
- brand recognition
- size extraction
- pack size extraction
- canonical unit conversion
- basic product-type inference
- confidence scoring

Examples:

```text
MMS PNUT 250G
→ M&M's Peanut 250 g
→ confidence high enough for automatic creation

MILCH 1L
→ Milch 1000 ml
→ confidence below automatic threshold
→ review unless an alias already exists
```

The brand dictionary is intentionally small and extensible rather than pretending to recognize every brand.

## Correction learning loop

When a user changes an item to another product:

1. the receipt item is updated;
2. the price observation moves to the corrected product;
3. a user-priority merchant alias is learned;
4. the correction is recorded in the normalization event log;
5. later receipts using the same merchant/raw alias resolve automatically.

This implements:

```text
first receipt → learned guess
second receipt → user correction
third receipt → corrected product automatically
```

## Classification integration

After a product is assigned, P6 invokes the P3 classification resolver.

Existing explicit item classification is preserved.

Otherwise Finance may inherit:

- category
- necessity
- tags

from product defaults, merchant defaults, or classification rules.

## Price history

Each receipt item creates at most one price observation.

The price observation is idempotent by receipt item ID.

Effective product unit price excludes Pfand/deposit:

```text
(line total - item discount) / quantity
```

Deposit remains separately stored on the receipt item.

A later product correction updates the existing price observation instead of adding a duplicate.

## Normalization state

Receipt items now have a dedicated normalization lifecycle:

- pending
- matched
- created
- review_required
- corrected
- skipped

They also store:

- normalization source
- normalization confidence
- normalization version
- review flag
- normalized timestamp
- user-corrected flag

## Receipt processing state

When unresolved product items exist, the receipt receives:

```text
product_normalization_required
```

and stays in `review_required`.

When all product identities are resolved, that review reason is removed.

If no other review reason remains, the receipt advances to:

```text
classifying
```

## Auditability

`finance.product_normalization_events` records product assignments and corrections including:

- previous product
- new product
- alias
- source
- status
- confidence
- normalization version
- whether the user corrected it
- classification result metadata

## Product analytics

The product detail API exposes:

- purchase count
- total spend
- quantity
- first/last purchase
- min/max/average unit price
- aliases
- merchant-specific price history
- recent purchases

Aggregate queries avoid purchase × price row multiplication by aggregating those datasets independently.

## Public RPC surface

P6 adds authenticated RPC operations for:

- family upsert
- product upsert
- alias creation/resolution
- exact alias normalization
- receipt-wide alias normalization
- deterministic candidate creation
- explicit product correction
- normalization review queue
- products/families listing
- product detail

Raw Finance tables remain outside the public Data API.

## P7 handoff

P7 can now build a fast receipt-review experience around:

- OCR review flags from P5
- product normalization review flags from P6
- arithmetic reconciliation
- one-tap product corrections
- learned correction reuse
