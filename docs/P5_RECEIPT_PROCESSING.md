# P5 — OCR, Structured Extraction & Receipt Reconciliation

P5 turns finalized receipt images into auditable structured financial data.

## Pipeline

```text
finalized receipt
  ↓
private page download
  ↓
OCR
  ↓
raw page text
  ↓
deterministic receipt parser
  ↓
header + raw lines + items
  ↓
database validation
  ↓
arithmetic reconciliation
  ↓
normalizing OR review_required
```

## Default processing path

The default path is free and local-first:

- OCR: Tesseract.js 7
- languages: German + English
- parser: deterministic German retail receipt parser
- database: THIEPN Core
- no paid AI API required

The OCR worker is reused across pages and receipts until explicitly closed.

## Supported local image types

- JPEG
- PNG
- WebP

HEIC, HEIF, and PDF remain valid capture formats but are not passed to the local browser OCR engine. They require a configured multimodal fallback provider.

## Multimodal fallback contract

The processing pipeline accepts a `ReceiptMultimodalExtractor`.

It can take over when:

- one or more pages use an unsupported local format;
- OCR confidence is below the configured threshold;
- a future caller explicitly chooses a cloud/hybrid path.

No paid provider is hard-coded into Finance.

## Raw evidence versus analytical items

P5 deliberately preserves two layers.

### `receipt_lines`

Every meaningful detected receipt line can be stored, including:

- products
- discounts
- Pfand
- returns
- fees
- subtotal
- VAT
- total
- payment lines
- informational text

### `receipt_items`

Only analytical purchase/recovery items are projected into the item table.

This prevents lines such as `SUMME` or `MWST` from becoming fake products while keeping the original extraction auditable.

## Extraction runs

Each run stores:

- pipeline mode
- pipeline version
- OCR provider/model
- parser provider/version
- input digest
- confidence
- duration
- success/failure
- metadata

Raw page OCR belongs to the run.

Historical runs remain available.

A new processing run becomes the receipt's current extraction only after its full payload validates and commits successfully.

A failed rerun therefore cannot replace or delete the previous successful projection.

## Detected receipt fields

The P5 schema supports:

- merchant raw name
- merchant address
- merchant alias resolution
- purchase date/time
- receipt number
- payment method
- locale
- currency
- subtotal
- tax
- discount
- deposit/Pfand
- total
- overall extraction confidence

## German deterministic parser

The first parser recognizes common German receipt structures including:

- `SUMME`
- `GESAMT`
- `ZU ZAHLEN`
- `ZWISCHENSUMME`
- `RABATT`
- `COUPON`
- `PFAND`
- `LEERGUT`
- `MWST` / `UST`
- `GIROCARD`
- card/cash payment terms
- DD.MM.YYYY dates
- HH:MM times
- Bon / Beleg numbers
- quantity × unit-price patterns
- weighted kg items

This parser is intentionally conservative. Ambiguous or low-confidence items are flagged for review rather than silently accepted.

## Reconciliation

Finance evaluates several plausible formulas rather than assuming every store prints totals the same way.

Candidates currently include:

- sum of effective item totals
- item sum minus receipt-level discount
- subtotal minus discount plus deposit

The candidate closest to the detected receipt total wins.

Result states:

- exact
- within_tolerance
- mismatch
- insufficient_data

Tolerance is 2 minor currency units.

## Review reasons

P5 can mark a receipt for review when:

- total is missing
- no items were extracted
- arithmetic does not reconcile
- reconciliation lacks enough data
- overall confidence is low
- one or more items are low-confidence
- merchant is missing
- merchant could not be resolved
- purchase time is missing

## Transactional ingest

Structured extraction is submitted in one validated transaction.

The submit routine stages item candidates before replacing the current item projection.

If validation fails at any point:

- the candidate run fails;
- the transaction rolls back;
- the previous successful items remain intact.

## Public API

Browser-facing operations remain narrow:

- `finance_begin_receipt_processing`
- `finance_submit_receipt_extraction`
- `finance_fail_receipt_processing`
- `finance_get_receipt_processing`

Raw Finance tables remain outside the Data API.

## Tests

P5 includes:

- live database integration test for structured extraction
- exact arithmetic reconciliation test
- merchant alias resolution test
- failed-rerun atomicity test
- deterministic German parser fixture
- strict TypeScript CI
- parser test CI

## P6 handoff

Successful high-confidence P5 output moves to `normalizing`.

P6 can then perform:

- product normalization
- product-family matching
- aliases
- brand/size extraction
- category learning
- repeat-product intelligence
