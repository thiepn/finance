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

- **P24** — [information architecture & navigation spec](docs/P24_INFORMATION_ARCHITECTURE.md), [low-fidelity wireframes](docs/P24_LOFI_WIREFRAMES.md), [delivery handoff](docs/P24_IMPLEMENTATION_HANDOFF.md), and 12 [user journeys](design/p24/journey-contract.json): specification only, not implemented in production

Backend project: THIEPN Core  
Product namespace: `finance`  
Target origin: `https://finance.thiepn.dev`

- **P25** — [visual direction exploration](docs/P25_VISUAL_DIRECTIONS.md) with [A/B/C static design lab](design/p25/visual-lab/index.html), 48 screenshot references and 3× light/dark treatments; **Signal Current (B) selected and locked in P25L**.

- **P25L** — [Signal Current reference lock](docs/P25L_SIGNAL_CURRENT_LOCK.md), approved dark/light [design tokens](design/p25/signal-current.tokens.json), [pixel-reference manifest](design/p25/signal-current-reference-manifest.json). Implementation is P26+; live Finance UI unchanged.


- **P26** — [Signal Current React design system](docs/P26_SIGNAL_CURRENT_DESIGN_SYSTEM.md): scoped dark/light tokens generated from P25L, accessible money/ledger/budget/chart/receipt/state primitives, [synthetic Vite showcase](p26-showcase.html), SSR and real-browser QA; integration with production routes begins in P27.

- **P27** — [Signal Current navigation, canonical routing and account guard](docs/P27_NAVIGATION_AUTH_AND_SHELL.md): real application shell with six desktop areas, five mobile tabs + More, 17 hash migrations, verified Supabase session boundary, and restricted Vercel SPA refresh rewrites; existing financial page bodies continue until P28–P37.

- **P28** — [Signal Current real-data Home](docs/P28_HOME_REDESIGN.md): source-labelled posted/plan/valuation/recurring totals, real spending pace, attention/receipt evidence, budget/category/activity flows, responsive 320px–desktop and synthetic-only browser QA. Follow-on screen detail migrations remain P29+.

- **P29** — [Signal Current Activity & transaction workspace](docs/P29_ACTIVITY_TRANSACTION_WORKSPACE.md): real searchable/paginated ledger, protected record details, audited void, exact category splits, synthetic-only visual QA. EUR-only new posting and no unsupported in-place edits.

- **P30** — [Signal Current Receipt Studio](docs/P30_RECEIPT_STUDIO.md): private receipt inbox, signed original evidence, manual reconciliation, device-local multi-page capture, and explicit extraction-correction limitations.

- **P31** — [Signal Current Plan & Budget Workspace](docs/P31_PLAN_BUDGET_WORKSPACE.md): real period-specific budgets, exact category allocations/rollover, safe-to-spend distinction, spending pace, recurring and goal context; existing Goals route preserved.

- **P32** — [Signal Current Insights and financial chart system](docs/P32_INSIGHTS_V2.md): real posted spending comparisons, source-labelled all-account income/cash flow, category and merchant drill-down, protected canonical URL filters, accessible source tables, synthetic React browser QA; authenticated real-device acceptance pending.
- **P33** — [Signal Current Product & Merchant Intelligence](docs/P33_PRODUCT_MERCHANT_V2.md): real account-scoped products, source receipts, normalized variants, merchant directory and practical rules with explicit user actions; pending physical-device and authenticated real-account acceptance.
- **P34** — [Signal Current Recurring & Commitments](docs/P34_RECURRING_V2.md): authenticated read-only recurring intelligence, explicit operator-gated synchronization, forecast/ledger separation and responsive synthetic browser qualification.
