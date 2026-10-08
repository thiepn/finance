# P31 — Signal Current Plan & Budget Workspace

**Status:** Implemented against Finance's existing account-scoped Supabase planning and goal RPCs. Automated CI, synthetic browser qualification and authenticated-real-account QA are separate release gates.

## Scope

- **Planning routes**: `/plan` budget/categories and `/plan/goals` goals are full-page Signal Current workspaces, with preserved `?period=YYYY-MM-DD` canonical period anchors. Existing `/plan/recurring` stays functional until P34.
- **Budget position**: existing backend-calculated `safeToSpendMinor`, `remainingMinor`, `actualSpendMinor`, `futureRecurringExpenseMinor` remain separate, source-labelled figures; null means unavailable, not zero. An allocation-based safe-to-spend value is not a verified bank balance.
- **Spending pace**: real server forecast points show cumulative **actual posted** spend versus cumulative **plan**. Future actuals are null, not synthetic forecasts. The server's period-end projected value is explicitly labelled an estimate; the chart includes a data table.
- **Budget allocation editor**: overspent and at-risk categories appear first. Each row has actual spent, effective plan (including carry), remaining, projected spend, optional rollover, edit/confirmed delete. All amount inputs use exact integer minor units and reject more than two decimals, negative values, invalid strings and unsafe sizes.
- **Plan setup/income**: name, cadence and expected income use existing `upsertBudget`, `ensureBudgetPeriod` and `upsertBudgetPeriod` RPCs. Creating or updating plans does not post a ledger transaction.
- **Goals**: savings/sinking-fund goals, target date and persisted status, contribution and withdrawal **planning movements** (not bank transfers). Withdrawals require an explicit second confirmation and cannot exceed recorded funded balance. The backend remains the authority for every mutation.
- **Recurring obligations**: upcoming forecast expense entries from `PlanningDashboard.commitments` with each currency separately. Missing obligations do not produce fabricated amounts. No automated recurring sync during Plan read.

## High-value architecture fix

Previously `usePlanningWorkspace.refresh()` invoked `runtime.recurring.syncPatterns(...)` before fetching Plan. That silently modified state on a read and could prevent the entire screen from loading if recurring synchronization failed. P31 removes that operation. P27 handles verified session auth at the private route boundary; no redundant `getSession` lock inside the Plan loader. Existing Supabase RLS/Finance RPC permissions remain authoritative.

## Known limits

- The existing manual allocation/goal RPCs should be tested end-to-end with two distinct authorized accounts to verify owner isolation, persistent rollover behavior and failure recovery. Visual QA uses synthetic values and never exercises real ledger mutations.
- Two-decimal entry inputs are suitable for EUR; P31 must not be described as a generalized FX/cross-currency budget editor. The goal editor should reject unsupported currency exponents rather than perform unverified conversions.
- Existing goals are tracking records; contributing/withdrawing **does not move bank money**. The UI says so.
- The existing budget RPC may store a change to one period; there is no bulk budget template or automatic prior-month allocation copy in P31. Those would require supported audited contracts.

## Qualification

```sh
npm run validate:p31
npm run typecheck
npm test
npm run build
```

Visit `/p31-plan-preview.html` from the Vite dev server for the actual React Plan UI with *synthetic* budget/goals data and separate normal, over-budget and unconfigured states.

The P31 browser workflow exercises 1440/1024/390/320 widths, dark/light themes, goals and unconfigured states, checks every visible amount against cell clipping and horizontal scroll, axe WCAG violations, and real navigation/filter controls without touching account data.

**Next:** P32 — Insights and contextual drill-down (the budget/goal/recurring sources are now distinct).
