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

Backend project: THIEPN Core  
Product namespace: `finance`  
Target origin: `https://finance.thiepn.dev`
