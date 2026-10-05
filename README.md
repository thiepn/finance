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

Backend project: THIEPN Core  
Product namespace: `finance`  
Target origin: `https://finance.thiepn.dev`
