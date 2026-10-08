# P31 — Signal Current Plan & Budget Workspace

**Status:** Code implemented in the authenticated `thiepn/finance` application. Merging requires CI and actual-component browser verification.

## Purpose
Replace the generic `/plan` dashboard with a **task-first financial planning workstation**. Keep small functional page titles, highly legible monetary figures, compact editable category rows, and a practical right-side forecast/commitment panel. Do not invent a bank balance or use a marketing/SaaS hero.

## Implementation

- **Canonical Plan:** `src/app/FinanceAppV2.tsx` mounts `SignalPlanPage` at `/plan`. The existing `/plan/goals` remains on the established Goals implementation. No migration of the Goals write workflows occurs here.
- **Budget position:** uses server-calculated `safeToSpendMinor` (clearly a budget estimate, not account cash), `effectivePlannedMinor`, `actualSpendMinor`, `remainingMinor`, `projectedSpendMinor`, and verified budget status.
- **Period browsing:** `/plan?period=YYYY-MM-DD` supports back/forward and shareable period selection using the configured cadence. Weekly/quarterly/yearly date stepping, month-end clamping, and custom-period non-navigation are tested.
- **Initial setup:** real `finance_upsert_budget` followed by `finance_ensure_budget_period` via `usePlanningWorkspace`. Both are existing account-scoped RPCs; their sequential nature is not claimed to be atomic.
- **Income edits:** persistent period-level `finance_upsert_budget_period`. Blank means unknown/unset, not zero.
- **Category allocations:** full server-backed list sorted by overspending risk, visible posted spending, limit, remaining, forecast, carry, recurring exposure; inline create/edit/rollover, with explicit two-stage removal confirmation, account-scoped RPC persistence. No client-side optimistic balance mutations.
- **Forecast:** existing `planning.forecast`, showing only backed posted actuals; future posted values remain absent. Screen labels forecasts as planning estimates. A keyboard-reachable financial table accompanies the chart.
- **Commitments and Goals:** future expense rows with real date/category/amount, plus true goal-period target/contributed/remaining and navigation to the working savings-goals route.
- **Reconciliation:** server values for allocated/unallocated spending and unassigned plan are shown separately to expose incomplete budget coverage.
- **Session and privacy:** the P27 verified session gate stays responsible for identity; `usePlanningWorkspace` no longer performs duplicate `getSession` or mutates recurring patterns on a page read. It still calls the account-scoped planning RPC; RLS/permissions remain authoritative. Backend error text is redacted into safe user messages.
- **Currency precision:** manual budgeting editing is disabled for currencies without exactly two minor decimal digits. Never round typed money or confuse a forecast with a posted transaction.

## Qualification
```sh
npm run validate:p31
npm run typecheck
npm test
npm run build
```

`src/planning/signal-plan-model.test.ts` verifies exact decimal parsing, unsafe values, future actual null, risk sorting, invalid categories/periods, and calendar navigation.

`Finance P31 Plan React QA` captures the **actual SignalPlanView** in dark/light at desktop 1440px, tablet 1024px, mobile 390px and narrow 320px, including unconfigured, overspent and no-allocation scenarios. It checks overflow, clipped amounts, interactive allocation editing, browser JS errors, and axe WCAG audits. All QA values are synthetic and isolated from production.

## Honest limits and next phases
- Existing Savings Goals functionality remains available but retains its older visual implementation; an additional dedicated Goals UX migration is distinct from P31.
- The dashboard's obligation/forecast freshness depends on existing recurring synchronization elsewhere. P31 intentionally does **not** run a hidden synchronization write on every read.
- No direct bank balance assertion, automated account transfer, multi-currency planning conversion, or recurring edit action is invented.
- Real authenticated account isolation, actual persisted budget mutations, true balances, and cross-device/mobile testing are reserved for the reliability and real-device qualifications (P38–P39).

**Next:** P32 — Insights and Drill-down.
