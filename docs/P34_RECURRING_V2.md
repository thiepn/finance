# P34 — Recurring & Commitments V2

Stacked on qualified P33 draft PR #28; no merges, production deployment, database migration or human approval.

## New live UX
- `/plan/recurring` loads Signal Current recurring commitments with authenticated `FinanceRecurringService` and a real read-only dashboard.
- The backend's existing normalized monthly, annualized and subscription totals remain authoritative. Subscriptions are a **subset** of expenses, never summed again. Monthly expense run rate is distinct from confirmed future bank payments.
- Scheduled upcoming **expense** events only, missed/late/price-increase alerts, historical linked posted transactions, confidence and source evidence, and protected Activity, Merchant and Budget navigation.
- Account-currency gating for per-pattern money, safe integer minor units, safe private UUID links, missing data abstention, responsive mobile styles, accessible tables, dark/light themes.
- Explicit operator confirmation before pausing/resuming, creating recurring patterns or subscription matches, and calling the transaction-linking sync RPC. Opening or refreshing the page **never** automatically calls the sync RPC. A suggestion's confidence is not human approval.
- Existing Supabase RLS/service contracts remain unchanged. No inferred bank cancellation, charge authorization or new remote price observation.

## Acceptance boundary
P34 automated CI, unit/service validations and synthetic actual-React Chromium/axe captures are distinct from authenticated private ledger, physical-device, assistive-tech and owner visual/release review.

Next P35 — Accounts & Net Worth V2.
