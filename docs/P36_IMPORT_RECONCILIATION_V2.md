# THIEPN Finance P36 — Import & Financial Reconciliation V2

## Live authenticated behavior

- Authenticated `/import` presents the actual P17 Finance import service with local-first CSV/CAMT.053/OFX/QFX parsing, exact source-file SHA-256 computed before private upload, file size/format guards, explicit source-custody consent, and pending staged server preview. Saved CSV mapping profiles may be loaded from already persisted account-specific signatures; mappings can be manually corrected. No upload occurs on file selection.
- Review original source custody, account ID/currency, statement period, closing balance, individual rows, strong duplicate evidence and explicit currency/FX issues. Private storage is account/user-scoped by original SQL RLS and RPC, not invented by P36.
- Decisions persist through audited `updateRecord` RPC. No automatic import decision override of strong duplicates. Transfers must point to another authenticated same-currency account, and their backend RPC atomically posts two legs. Cross-currency import intake is default-denied where no trustworthy explicit conversion is supported.
- Strict preflight blocks unknown/unresolved rows, incomplete provenance, duplicate-to-post attempts, unsafe IDs, invalid currency and missing category/transfer mapping. Final two-stage user-controlled authorization requires consent and `POST N` typing.
- **Important side effect:** P17 commit RPC may create an account balance observation from statement closing balance on successful complete same-currency posting. User approval explicitly includes that documented behavior. The RPC may report partial import/failure and requires operator reconciliation; no guarantee of external bank validity or reversal.
- No new migrations/production writes/credentials/owner approvals in P36. P35 remains separate draft ancestry. Provider Vercel rate-limit remains unresolved.

## Evidence boundary

Automated synthetic real-component Chromium/axe/screenshot checks are distinct from authenticated production user and bank data, physical device/manual assistive technology, source-bank authenticity, independent custody, owner finance signoff and production release.

Next: P37 — Finance Release Acceptance & Evidence-Based Consolidation.
