# THIEPN Finance

Personal finance ledger, receipt-intelligence system, product-level purchase database, and visual analytics platform.

## Architecture

Finance uses the shared THIEPN account identity and a private `finance` namespace in **THIEPN Core**.

Core principles:

- balanced ledger is the financial source of truth;
- receipts explain transactions and never double-count them;
- receipt items preserve product-level detail;
- posted ledger history is immutable;
- refunds and reimbursements reduce attributable spending instead of being treated as ordinary income;
- transfers between owned accounts are never income or expense;
- AI can classify and explain, but deterministic finance data remains authoritative.

## Current implementation

- **P0** — product architecture and finance invariants: complete
- **P1** — Supabase domain foundation, RLS, balanced ledger, audit trail: complete
- **P2** — ledger services, account lifecycle, transfers, refunds, reimbursements and split transactions: complete
- **P3** — categories, tags, merchant intelligence, split-level necessity and deterministic classification rules: complete
- **P4** — private receipt capture, multi-page uploads, offline drafts and camera/storage pipeline: complete
- **P5** — local OCR, structured receipt extraction, line-item parsing, reconciliation and versioned processing: complete
- **P6** — product normalization, families, aliases, correction learning and price intelligence: complete
- **P7** — exception-driven receipt review, corrections, waivers, audit trail and confirmation gate: complete
- **P8** — unified Activity ledger, deduplicated receipt evidence, structured search, filters, keyset pagination and detail expansion: complete
- **P9** — React/Vite application shell, Finance design system, responsive navigation, themes, financial typography and reusable UI primitives: complete
- **P10** — live deterministic Overview, period comparison, financial status, attention engine, planning pace and P1–P9 data integration: complete
- **P11** — deterministic analytics read models, comparison engine, responsive chart primitives, chart/table parity and live Overview trend visualization: complete
- **P12** — recursive Spending Explorer, scoped trends, category/merchant/necessity drill-down, product evidence and individual purchase navigation: complete
- **P13** — searchable product catalog, price/frequency analytics, merchant comparison, normalized family variants and deep-linked product detail: complete
- **P14** — recurring detection, subscription analytics, monthly/annualized commitments, creep, upcoming/missing-charge intelligence and price-change alerts: complete
- **P15** — rollover-aware budgets, safe-to-spend, recurring-aware forecasting, category pacing, savings goals and sinking funds: complete
- **P16** — net worth, balance observations, account history, savings-rate trends, wealth bridge and investment balance reconciliation: complete
- **P17** — CSV/CAMT/OFX/QFX bank imports, private source files, deduplication, staged review, ledger ingestion and closing-balance reconciliation: complete
- **P18** — receipt ↔ transaction matching, deterministic candidate scoring, split-payment reconciliation, receipt-derived analytics and Activity de-duplication: complete
- **P19** — Ask Finance deterministic query engine, typed AI boundary, evidence/provenance answers, entity resolution and responsive question workspace: complete
- **P20** — read-only ChatGPT/MCP boundary, THIEPN Account OAuth verification, canonical Account UUID gateway, typed Finance tools, prompt-injection hardening and public Plugin Directory packaging for personal/Plus distribution: implementation complete; public plugin review/publishing pending
- **P21** — subscription-independent native Ask Finance: GPT-6 Luna intent interpretation through THIEPN Core, no Finance records sent to the model, deterministic P19 execution remains authoritative, and deterministic P19 questions remain available without AI: implementation complete; production secret/browser qualification pending

- **P22** — complete core UI workflows (Activity, manual posting, Scan, Merchants, Rules, Settings), route wiring, TSX type checks: released
- **P23** — source-confirmed product/UX audit, 17-route inventory, anonymous desktop/mobile screenshots, automated accessibility checks and V2.0 redesign brief: completed for public/anonymous surfaces; authenticated UX qualification pending. See [P23 audit](docs/P23_UX_VISUAL_AUDIT.md) and [visual evidence](docs/P23_VISUAL_CAPTURE_RESULTS.md)

Backend project: THIEPN Core  
Product namespace: `finance`  
Target origin: `https://finance.thiepn.dev`
