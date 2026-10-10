# P33 — Signal Current Product & Merchant Intelligence V2
**Scope:** Authenticated application routes /explore/products, /explore/products/:productId, /explore/merchants, /settings/rules.
**Branch:** Stacked from qualified P32 PR #27 at 70fcf4a5f49b4a0d7c0a41a2426debb16702a4da; must remain draft until independent acceptance.

## Implemented
- Product search, normalized families/variants and detail workspace connected to existing Finance product catalog/intelligence RPCs.
- Source-linked purchase timeline via protected receipt/transaction routes; evidence receipts are explanations, never additional ledger postings.
- Observed historical prices by currency and per-exact-product merchant comparisons. Cross-package prices appear only where normalized basis units match; absent or noncomparable data is not fabricated.
- Account-scoped merchant directory with alias search, normalized merchants, real merchant creation and confirmation before learning aliases. Net spending displays only when an authenticated Finance product profile supplies the reporting currency, replacing the previous unconditional EUR assertion.
- Explicit classification rule creation with field/condition/category validation, illustrative *local sample substring preview* (not a claim of backend matching), persistent pause/enable with server response, and two-step delete confirmation without window.confirm.
- Preserves the original RPCs, P27 session gate, P32 Insights filters, ledger posting invariants and RLS; no migrations, new secrets or automatic classification writes on reads.

## Qualification
- npm run validate:p33, npm run typecheck, npm test, npm run build.
- Synthetic-only actual React component Playwright/axe checks for desktop/tablet/mobile/narrow in light/dark and key interactions, screenshots and JSON reports.
- No real account, currency reconciliation across production accounts, physical device or human signoff claimed. No merge or production deploy.
- P34 is Recurring & Commitments V2.
