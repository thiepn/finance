# P7 — Exception-Driven Receipt Review

P7 defines the receipt-review workflow that sits between extraction/product normalization and final confirmation.

The review experience is intentionally exception-driven:

```text
clean fields stay quiet
uncertain fields are highlighted
blocking issues are ordered
user resolves only what needs attention
receipt becomes confirmable
```

The visual component layer can render this contract later without duplicating finance logic.

## Review screen contract

A receipt review view contains:

- receipt header
- reconciliation status
- blocking issue list
- receipt image/page previews
- all receipt items
- attention flags only on unresolved items
- product suggestions for unresolved products
- excluded OCR artifacts
- review history
- final confirmation state

Clean lines remain visible but do not demand interaction.

## Issue priority

The controller prioritizes issues roughly as follows:

1. missing total
2. missing purchase time
3. missing/unresolved merchant
4. missing items
5. arithmetic mismatch
6. insufficient reconciliation
7. OCR item review
8. product normalization
9. generic low confidence

This keeps the user on fields that can invalidate the entire receipt before asking for lower-level cleanup.

## Header review

Users can either:

- accept the extracted header as-is; or
- edit only specific fields.

Editable fields include:

- merchant
- purchase timestamp
- currency
- subtotal
- tax
- receipt discount
- deposit/Pfand
- total
- receipt number
- payment method

A corrected merchant can learn the original OCR merchant string as a merchant alias.

Header acceptance clears generic low-confidence blocking because a human has explicitly reviewed the extracted header.

## Item review

An item can be:

- accepted as extracted
- numerically corrected
- assigned to an existing product
- turned into a new canonical product
- explicitly left without a product identity
- excluded as a false OCR line
- restored after exclusion

Editable numeric projection fields include:

- quantity
- unit price
- line total
- item discount
- deposit/Pfand
- effective total

Raw OCR evidence remains unchanged in `receipt_lines`.

## Non-destructive exclusion

False OCR items are not deleted.

Instead:

```text
receipt_items.is_excluded = true
```

Excluded items:

- do not count toward reconciliation
- do not count toward product purchase statistics
- disable their product-price observation
- remain visible in review history
- can be restored

This preserves auditability while keeping analytics correct.

## Product review

P7 connects directly to P6.

The review screen can:

- choose an existing product and learn the merchant alias
- accept a deterministic product suggestion
- create a user-confirmed canonical product
- skip product normalization for a one-off or unimportant item

A product skip is explicit and auditable; it is never treated as a successful inferred match.

## Reconciliation

P7 recalculates arithmetic after every relevant review action.

The calculation ignores excluded OCR artifacts.

Possible states remain:

- exact
- within_tolerance
- mismatch
- insufficient_data

If correcting or excluding an item fixes the arithmetic, the mismatch issue disappears automatically.

## Waivers

Only explicitly safe review reasons can be waived:

- arithmetic_mismatch
- reconciliation_insufficient
- low_confidence

A waiver requires a note.

Reasons such as these cannot be silently waived:

- total_missing
- items_missing
- purchase_time_missing
- merchant_missing
- merchant_unresolved
- product_normalization_required

Those must be resolved through the corresponding review action.

Waivers are stored separately from active blockers and are part of the review audit trail.

## Confirmation gate

A receipt may enter `confirmed` only when no blocking review reasons remain.

Confirmation therefore cannot occur while an unresolved product, missing date, missing total, or other blocking issue still exists.

## Review audit log

`finance.receipt_review_events` is append-only for authenticated users.

Events include:

- review started
- header accepted
- header corrected
- item accepted
- item corrected
- item excluded
- item restored
- product skipped
- review reason waived
- receipt confirmed

Events record:

- receipt
- receipt item when relevant
- processing run
- field
- before/after values
- note/reason
- metadata
- timestamp

## Reprocessing safety

Human approval belongs to a specific extraction.

When `current_processing_run_id` changes after a new OCR/parser run, P7 automatically clears:

- review start timestamp
- header review timestamp
- last reviewed timestamp
- confirmation timestamp
- review waivers

The review revision is advanced.

Historical review events remain intact and retain their processing-run provenance.

This prevents an old approval from accidentally validating newly extracted data.

## Review revisions

Each review mutation increments `review_revision`.

This gives the UI a monotonic revision marker for stale-state detection and future optimistic concurrency support.

## Price and product integrity

Changing item amounts updates the existing product-price observation.

Excluding an item marks that price observation inactive.

Restoring a normalized item reactivates/rebuilds its observation.

Product analytics now ignore:

- excluded receipt items
- inactive price observations

## Review queue

The backend exposes a compact review queue containing:

- receipt
- merchant
- date
- total
- confidence
- reconciliation state
- blockers
- item count
- unresolved item count
- ready-to-confirm state

Both receipts that require attention and clean receipts awaiting final confirmation can appear.

## Signed page previews

The database returns private receipt-page storage paths.

`ReceiptReviewController` uses the existing P4 capture service to create short-lived signed preview URLs.

Receipt binaries therefore remain private.

## Application architecture

P7 adds:

```text
src/domain/receipt-review.ts

src/services/receipt-review.ts
src/services/supabase-receipt-review.ts

src/review/receipt-review-controller.ts
src/review/receipt-review-controller.test.ts
```

The controller converts backend review state into a UI-ready model containing:

- signed page previews
- primary blocking issue
- attention item IDs
- local deterministic product suggestions
- full receipt state

## Public RPC surface

P7 adds authenticated RPCs for:

- review detail
- review queue
- start review
- accept header
- correct header
- accept item
- correct item
- exclude/restore item
- skip product
- assign existing product
- create user-confirmed product
- waive supported review reason
- confirm receipt

Raw Finance tables remain outside the public Data API.

## Tests

P7 includes live database tests for:

- multi-issue review state
- merchant/date correction
- low-confidence acknowledgement
- false OCR item exclusion
- arithmetic reconciliation after exclusion
- product skip
- product creation from review
- final confirmation gate
- active product-price behavior
- review audit trail
- waiver isolation
- RLS isolation
- review-state reset after a new processing run
- processing-run provenance
- UI issue prioritization
- item attention state

## UI handoff

The workflow is now stable enough for the later visual implementation.

A rendered review page should follow this interaction model:

```text
receipt image
      |
      v
header summary   [only problematic fields highlighted]

reconciliation
€5.24 detected
€5.49 item sum
-€0.25 difference

items
✓ MILCH                         €2.00
! MMS PNUT 250G                 €3.49
  Suggested: M&M's Peanut 250 g

× PFAND?                        €0.25
  Exclude OCR artifact

[Confirm receipt]
```

The confirm action stays disabled until the review contract reports `canConfirm = true`.

## P8 handoff

P8 can now build the universal Activity/ledger browsing layer on top of confirmed receipts, normalized products, categories, merchants, and transactions without forcing review concerns into the activity architecture.
