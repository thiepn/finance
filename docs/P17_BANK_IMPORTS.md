# P17 — Bank & File Imports, Transaction Ingestion, Deduplication & Reconciliation

P17 turns Finance's original import shell into a controlled bank-statement ingestion system.

## Product invariant

Importing a file never mutates the ledger immediately.

~~~text
file
→ local parse
→ private original-file storage
→ normalized staging rows
→ duplicate/classification review
→ explicit commit
→ posted Finance transactions
→ optional closing-balance reconciliation
~~~

## Supported formats

~~~text
CSV
CAMT.053
OFX
QFX
~~~

CSV is mapping-driven because bank exports do not share a stable column schema. CAMT parsing is namespace-independent so older bank-exported camt.053 schema versions remain readable. OFX/QFX prefer FITID as the strong bank-supplied transaction identifier.

## Original source preservation

Original source files are stored in the private `finance-imports` Storage bucket.

Storage path:

~~~text
<user-id>/<import-id>/<safe-file-name>
~~~

The bucket is private, limited to 20 MiB files, and protected by Storage RLS tied to the owning Finance import session.

Each import preserves file name, SHA-256, MIME type, file size, detected format, selected Finance account, parser metadata, CSV mapping where applicable, statement date range, and source/bank label.

## CSV mapping

The browser parser detects common German and English columns including booking date, value date, amount, separate debit/credit columns, currency, description/purpose, counterparty, IBAN, reference, and external transaction ID.

If required fields cannot be mapped safely, the flow stops at a mapping screen instead of guessing.

Mappings can be saved in `finance.import_profiles` and automatically reused when a later CSV has the same normalized header signature.

## CAMT.053

The parser extracts statement entries from `Ntry`, including amount and credit/debit direction, booking/value dates, account-servicer/entry/end-to-end references, remittance information, counterparty name and IBAN where available, statement account identifier, statement currency, and closing booked/available balance when present.

## OFX/QFX

The parser extracts FITID, posted date, signed TRNAMT, NAME/MEMO, reference/check number, account identifier, currency, and ledger closing balance/as-of date.

## Staging model

`finance.import_records` now stores both source evidence and normalized fields: external ID, booking/value date, signed account amount, reporting-currency amount and FX, currency, description, counterparty name/IBAN, reference, raw and normalized payloads, deterministic fingerprint, scoped source hash, proposed transaction type, proposed category/necessity/merchant, transfer target, duplicate evidence, decision/final status, and resulting transaction ID.

## Signed amount semantics

Imported bank rows use account-direction signs:

~~~text
debit from imported account   negative
credit to imported account   positive
~~~

Default proposals therefore become:

~~~text
negative → expense
positive → income
~~~

A reviewed row may instead become an own-account transfer.

## Deduplication

When an external transaction ID exists:

~~~text
SHA256(account + format + external ID)
~~~

This is account-scoped because bank transaction identifiers are not assumed globally unique.

Without a strong external ID:

~~~text
SHA256(
  booking date + signed amount + currency +
  counterparty + IBAN + reference + description
)
~~~

Fallback fingerprints are deliberately conservative: a repeated fingerprint is review evidence, not an automatic deletion.

### Duplicate behavior

~~~text
same strong imported source ID       → automatic duplicate
same fallback fingerprint             → review
same source hash twice in one file    → review
same account/date/amount as
existing manual/receipt transaction   → review
~~~

The user can explicitly choose Import, Review, Duplicate, or Ignore.

## Classification

Staging calls the existing P3 deterministic classification engine using transaction direction, description, and counterparty context.

If no rule resolves a category, Finance falls back to:

~~~text
expense → Other
income  → Other income
~~~

Category and necessity can be corrected before commit.

## Commit semantics

Committed rows create posted transactions with:

~~~text
source = import
source_external_id = scoped deterministic source hash
metadata.import_id
metadata.import_record_id
metadata.import_external_id
metadata.import_source_hash
metadata.import_fingerprint
counterparty/reference lineage
~~~

Posted import history therefore remains auditable back to the exact file and row.

Forced duplicate overrides get a unique transaction source key while retaining the base source hash in metadata.

## Transfers

A staged row can be changed to `transfer` and linked to another owned account.

The current P17 convenience flow supports same-reporting-currency transfers, matching the existing ledger transfer invariant.

## Foreign currency

Foreign-currency rows may be staged safely.

Before posting they require an explicit reporting-currency amount or FX rate. Editing the FX rate recomputes the reporting amount deterministically.

## Closing-balance reconciliation

CAMT/OFX statements can provide a closing balance.

After all selected rows are committed Finance computes:

~~~text
statement closing balance
- ledger-derived balance before anchor
= reconciliation variance
~~~

Only after recording that variance does Finance create a P16 `import` balance observation.

Possible reconciliation status includes:

~~~text
balanced
anchored_with_variance
requires_fx
~~~

This prevents the statement balance from silently hiding missing imported movements.

## UI

The Imports route now provides account selection, bank/source label, CSV/XML/OFX/QFX file selection, local format detection, CSV mapping editor, saved mapping profiles, parsed row/date/closing-balance summary, secure original-file upload, ready/review/duplicate counts, debit/credit totals, duplicate evidence, per-row decision, category/necessity edits, transfer target selection, FX review, explicit commit, reconciliation result, recent import history, and reopenable import evidence.

## Public RPC surface

~~~text
public.finance_start_import(...)
public.finance_register_import_file(...)
public.finance_stage_import_records(...)
public.finance_get_import_preview(...)
public.finance_update_import_record(...)
public.finance_commit_import(...)
public.finance_cancel_import(...)
public.finance_upsert_import_profile(...)
public.finance_get_import_dashboard()
~~~

All functions are SECURITY INVOKER and raw import tables remain protected by own-user RLS.

## Verification

Live rollback fixtures verify clean staging, debit/credit preview totals, classification fallback, import transaction creation, exact source lineage, strong-ID re-import duplicate detection, manual-history collision sent to review, unresolved review blocking final completion, closing-balance variance, P16 import balance observation creation, and cross-user import/profile isolation.

## Advisors

~~~text
Supabase Security advisor       clean
Supabase Performance advisor    clean after P17 FK index hardening
~~~

## P18 handoff

P18 should implement Receipt ↔ Bank Transaction Matching & Reconciliation. Bank imports now provide authoritative money movement, while receipt processing provides merchant/item detail. P18 should merge those two evidence streams without double-counting expenditure.
