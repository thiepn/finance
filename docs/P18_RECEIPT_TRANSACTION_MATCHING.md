# P18 — Receipt ↔ Bank Transaction Matching & Reconciliation

P18 connects receipt evidence to authoritative Finance money movement without creating duplicate expenses.

## Core invariant

The posted transaction ledger remains the source of truth for money movement.

A receipt explains a transaction:

~~~text
bank / posted transaction
= money movement truth

receipt
= merchant + item + product + category + necessity evidence
~~~

A confirmed receipt match never creates another expense and never rewrites posted ledger entries.

## Why P18 uses an analytical overlay

Posted ledger entries are intentionally immutable.

P18 therefore does not:

- delete and recreate imported transactions;
- rewrite account entries;
- silently mutate bank provenance;
- create synthetic correction transactions merely to improve categorization.

Instead, a confirmed and fully covered transaction receives receipt-derived analytical allocations in:

~~~text
finance.receipt_match_allocations
~~~

The original ledger remains available for audit.

## Receipt match state

P18 uses the existing receipt match states:

~~~text
unmatched
suggested_match
partially_matched
matched
multi_payment_matched
~~~

Additional coverage state is stored separately from P8 receipt arithmetic reconciliation:

~~~text
match_covered_minor
match_remaining_minor
match_updated_at
~~~

P8 `reconciliation_status` continues to mean receipt-header/item arithmetic integrity. P18 does not overload it with bank matching state.

## Candidate scoring

Candidate search looks at posted expense transactions within ±7 days of the receipt.

A transaction must expose a matchable amount in the receipt currency.

Deterministic score version:

~~~text
p18-v1

amount       55%
date         20%
merchant     20%
currency      5%
-------------
total       100%
~~~

Amount score strongly favors exact totals.

Date score favors same-day and adjacent-day transactions.

Merchant score uses normalized canonical merchant/raw counterparty text.

Currency must be compatible with the receipt.

Up to eight ranked candidates are retained.

## Automatic confirmation

P18 may automatically confirm only when all of these are true:

~~~text
receipt has no prior confirmed coverage
top confidence >= 92%
amount delta = 0
date delta <= 1 day
merchant score >= 75%
next-best candidate absent
  OR confidence margin >= 12 percentage points
~~~

Ambiguous, partial, and split-payment cases remain explicit review work.

## Manual decisions

Each candidate can be:

~~~text
Confirm
Reject
Unlink
~~~

Confirm:
- creates a confirmed evidence link;
- accepts an explicit matched amount;
- cannot exceed the remaining receipt amount;
- cannot exceed the remaining transaction amount.

Reject:
- permanently suppresses that receipt/transaction candidate pair from deterministic suggestions.

Unlink:
- reverses a confirmed link;
- removes the corresponding analytical overlay;
- makes the pair eligible for matching again.

Reject and Unlink are intentionally separate operations.

## Split payments

One receipt may be matched to multiple transactions.

Example:

~~~text
Receipt total       €100
Card transaction     €60
Cash/other payment   €40
-------------------------
Receipt coverage     €100
Status               multi_payment_matched
~~~

After the first €60 confirmation:

~~~text
covered       €60
remaining     €40
status        partially_matched
~~~

After the second €40 confirmation:

~~~text
covered       €100
remaining      €0
status        multi_payment_matched
~~~

## Multiple receipts for one transaction

A transaction may be covered by multiple confirmed receipts when the combined confirmed amount exactly covers its matchable amount.

Confirmed receipts attached to one transaction must currently use the same source currency.

This prevents ambiguous cross-currency allocation math while retaining foreign-currency transaction support where Finance can derive a matchable source amount.

## Matchable transaction amount

`finance.transaction_matchable_amount(transaction,currency)` uses:

1. the transaction's negative account entry in the requested receipt currency, when available;
2. otherwise the transaction display amount when reporting currency equals receipt currency;
3. otherwise no automatic matchable amount.

This lets a receipt match against merchant/account-currency movement without confusing it with reporting-currency analytics.

## Receipt-derived analytical allocation

Receipt item categories become analytically authoritative only when the transaction is fully covered by confirmed receipt evidence.

Until full coverage:

~~~text
effective classification = original ledger classification
~~~

After full coverage:

~~~text
effective classification = receipt-derived category / necessity allocation
~~~

The transaction's reporting amount is allocated:

1. across confirmed receipt matches;
2. across each receipt's category + necessity item groups.

Rounding remainder is assigned deterministically so both source-currency and reporting-currency allocations reconcile exactly.

## Effective analytical views

### finance.effective_transaction_categories

Returns:

~~~text
receipt-derived categories when a complete P18 allocation exists
ledger categories otherwise
~~~

It also exposes:

~~~text
classification_source = receipt | ledger
~~~

### finance.effective_transaction_merchants

Uses a receipt merchant when fully reconciled receipt evidence agrees on the merchant.

Otherwise it falls back to the original transaction merchant/description.

## Analytics integration

The following existing Finance read models now consume effective receipt classifications:

- category-period spending;
- analytics breakdown;
- analytics time series;
- Overview dashboard;
- Spending Explorer.

Merchant analytics in Analytics and Spending Explorer also use the effective merchant.

Total spending never changes because P18 changes analytical dimensions, not money movement.

## Activity integration

A confirmed matched receipt no longer appears as a second standalone financial activity row.

The surviving transaction activity row exposes:

- authoritative transaction amount/account;
- receipt-derived merchant where applicable;
- receipt-derived categories;
- receipt-derived necessities;
- receipt products;
- receipt item tags;
- linked receipt IDs;
- item count.

Raw ledger entries remain available in transaction detail for audit.

## Automatic refresh

P18 is self-maintaining.

### Receipt confirmation/change

When a receipt becomes confirmed, or matching-relevant receipt data changes, Finance rescans nearby posted expenses.

Relevant fields include:

- total;
- purchase date;
- merchant;
- raw merchant text;
- currency;
- processing status.

### Transaction posting/change

When a new expense becomes posted, including a P17 imported bank transaction, Finance automatically rescans unresolved nearby confirmed receipts.

This is the main P17 → P18 integration path.

### Receipt item correction

When confirmed receipt items are inserted, corrected, excluded, or deleted, P18 rebuilds receipt-derived analytical allocations for linked transactions.

Category analytics therefore do not retain stale receipt item detail.

## Matching workspace

The Receipts route is now a complete reconciliation workspace.

It contains:

- Suggested / Unmatched / Partial / Matched counters;
- Attention, Suggested, Unmatched, Partial, Matched, All filters;
- merchant/date/total queue;
- top candidate confidence;
- receipt coverage;
- candidate rescanning;
- confirmed transaction links;
- candidate confidence and score components;
- amount delta and date delta;
- partial match amount entry;
- Confirm, Reject, and Unlink actions;
- receipt item detail;
- effective analytical allocations;
- rejected-candidate history;
- link to bank Imports.

## Public RPC surface

~~~text
public.finance_refresh_receipt_match_candidates(...)
public.finance_refresh_receipt_match_queue(...)
public.finance_confirm_receipt_transaction_match(...)
public.finance_reject_receipt_transaction_match(...)
public.finance_unconfirm_receipt_transaction_match(...)
public.finance_get_receipt_match_dashboard(...)
public.finance_get_receipt_match_workspace(...)
~~~

All browser-facing functions are SECURITY INVOKER.

## Security

P18 retains own-user RLS on receipt match rows and adds own-user RLS to analytical allocation rows.

Cross-user verification confirms users cannot:

- see another user's reconciliation queue;
- open another user's match workspace;
- confirm another user's match;
- reject another user's match.

## Verification

### Exact match fixture

~~~text
Posted transaction          €42.37

Receipt
  Groceries                 €30.00
  Cleaning                  €12.37
                            ------
                            €42.37
~~~

Verified:

- deterministic auto-confirm;
- receipt status = matched;
- coverage = €42.37;
- remaining = €0;
- receipt analytical allocations = €30.00 + €12.37;
- transaction remains the original posted transaction;
- no void/replacement;
- no duplicate activity row.

### Split-payment fixture

~~~text
Receipt                    €100
Transaction A               €60
Transaction B               €40
~~~

Verified:

- first confirmation → partially_matched;
- second confirmation → multi_payment_matched;
- allocation totals remain exact;
- category analytics switch from original ledger classification to receipt item classification;
- Activity inherits receipt categories;
- Unlink removes only the affected overlay;
- rejected candidates are not suggested again.

### Final post-migration fixture

Verified again after the final migration definitions were recorded:

- automatic trigger-driven matching;
- exact analytical allocation;
- Activity double-count prevention;
- receipt dimensions on transaction activity;
- match workspace state;
- unlink cleanup.

## Advisors

~~~text
Supabase Security advisor       clean
Supabase Performance advisor    clean
RLS isolation                   passed
Post-migration fixture          passed
~~~

## P19 handoff

P19 should implement Ask Finance & the deterministic analytics/query engine.

P18 now makes receipt-enriched transactions trustworthy enough that Ask Finance can answer queries such as:

- How much did I spend on snacks at REWE?
- Which grocery products increased most in price?
- What did I actually spend last month?
- Which expenses still have unmatched receipts?

without double-counting scanned receipts and bank transactions.
