# P8 — Universal Activity Ledger, Search & Detail

P8 provides one read model over Finance history without changing the underlying accounting model.

## Core rule

A receipt is evidence about a transaction, not a second expense. When a receipt has a confirmed transaction match, Activity shows the transaction once and attaches receipt/product evidence to it. A confirmed receipt with no confirmed transaction match may appear as a receipt-only financial event until later reconciliation. Unconfirmed receipts are hidden from default financial history unless explicitly requested.

## Activity entities

Transaction rows include transaction type/status/source, merchant, reporting amount, accounts, category splits, necessity, tags, confirmed receipt links, and products found on confirmed linked receipts.

Receipt rows are used only when there is no confirmed transaction match. They include merchant, purchase time, total, processing/review state, categories, necessity, products, and receipt-item tags. Their financial_effect flag is true only when the receipt is confirmed.

## Search and filters

finance.search_activity supports free-text search plus date, amount, account, merchant, category, product, tag, activity kind, transaction type/status/source, necessity, receipt status, receipt presence, financial-effect status, and optional inclusion of unconfirmed receipts.

Multiple free-text terms are ANDed. For example, searching for `rewe peanut` requires both terms somewhere in the activity document.

Client-side structured syntax supports examples such as:

- merchant:rewe
- category:snacks
- product:"M&M's Peanut"
- amount:>20
- amount:12,50..20
- month:september
- type:expense,refund
- source:bank_sync
- necessity:discretionary
- receipt:true
- receipt:false
- receipt:review
- kind:transaction

Unknown structured-looking tokens remain ordinary free text rather than disappearing.

## Keyset pagination

Activity is ordered by occurred_at DESC, entity_kind DESC, id DESC and uses those same fields as its cursor. This avoids offset drift, skipped results, and duplicate rows between pages as new history arrives. Page size is capped at 200.

## Detail views

Transaction detail includes the normalized Activity row, complete ledger entries, account/category movements, tags, receipt match candidates, full linked receipt review/evidence payloads, and related transactions such as refunds or reimbursements.

Receipt detail includes the P7 review snapshot plus every transaction match candidate and matched transaction metadata.

## Deduplication

finance.activity_receipts excludes any receipt with a confirmed row in receipt_transaction_matches. Suggested or rejected candidates do not hide a receipt. This is the read-side guarantee that a purchase cannot appear twice simply because both a transaction and receipt exist.

## Filter catalog

P8 exposes a narrow filter-catalog RPC for active accounts, merchants, categories, tags, and bounded product lookup. The browser does not need direct table access.

## Performance and security

P8 adds index paths for transaction status/date, transaction source/date, receipt processing state/date, receipt matches, transaction necessity, and receipt-item necessity. Both Activity views use security_invoker. Browser access remains through authenticated public.finance_* RPC functions and underlying Finance RLS remains the ownership boundary.

## Application layer

P8 adds:

- src/domain/activity.ts
- src/services/activity.ts
- src/services/supabase-activity.ts
- src/activity/activity-query.ts
- src/activity/activity-controller.ts
- src/activity/activity-query.test.ts

The controller combines parsed query syntax with explicit UI filters and passes the resulting filter object to FinanceActivityService. Explicit UI filters override parsed filters when both set the same field.

## Verification

Live database integration tests verify confirmed receipt/transaction deduplication, product search through linked receipt items, unmatched confirmed receipt visibility, hidden unconfirmed receipts by default, explicit review-receipt filtering, account/product filtering, multi-term search, keyset pagination without overlap, transaction and receipt detail expansion, and RLS isolation.

Client tests cover structured merchant/category/product syntax, amount comparisons and ranges, quoted values, month parsing, type lists, necessity, receipt shortcuts, and preservation of unknown tokens.

## Visual handoff

The later UI phases can now render a proper Activity screen without embedding accounting rules in components. A row can represent a transaction or an unmatched confirmed receipt, and opening it can expand into complete evidence and ledger detail.