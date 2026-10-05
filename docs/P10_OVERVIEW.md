# P10 — Real Overview Dashboard

P10 replaces the P9 sample dashboard with a live, deterministic Overview backed by Finance ledger, receipt, review, activity, account, and planning data.

## Source-of-truth rules

Overview does not calculate financial metrics from receipt totals, merchant summaries, or AI output.

The posted double-entry ledger remains authoritative.

### Income

Income is the magnitude of posted category ledger flows belonging to transactions with type `income`.

Transfers, refunds, and reimbursements are not counted as income.

### Gross spending

Gross spending is the positive category flow from posted `expense` transactions.

### Recoveries

Refunds and reimbursements are measured from negative category flows and reduce attributable spending.

### Net spending

```text
net spending =
  expense category flow
  + refund category flow
  + reimbursement category flow
```

The result is clamped at zero for summary presentation.

### Net cash flow

```text
net cash flow = income - net spending
```

### Savings rate

When recorded income is positive:

```text
savings rate = net cash flow / income
```

Otherwise the savings rate is unknown rather than fabricated.

### Transfers

Transfers are excluded from income and spending.

They can appear in recent Activity as neutral account movements.

## Periods

The Overview supports:

- Week
- Month
- Quarter
- Year

Calendar boundaries are derived inside Postgres from the user's Finance profile timezone.

For the default Europe/Berlin profile this correctly handles daylight-saving transitions.

Week periods begin on Monday.

Each selected period is compared to the immediately preceding equivalent calendar period.

## Planning semantics

P10 consumes the budget structures already present in the Finance foundation, but does not invent a plan.

If no active budget period overlaps the selected period:

- `available_to_spend_minor` is null;
- the UI displays no synthetic available-to-spend number;
- the planning panel explains that no plan is configured.

When a real plan exists:

- planned spend = sum of budget allocations;
- budgeted actual = net expense/refund/reimbursement category flow for categories present in the allocations;
- remaining = planned spend - budgeted actual;
- pace = budgeted actual / planned spend;
- projection is calculated only after at least 5% of the selected period has elapsed.

## Financial status model

P10 produces one deterministic status.

### on_track

A configured plan exists and current/projected spending remains within plan.

### at_risk

Projected spending is more than 5% above the configured period plan.

### over_plan

Actual budgeted spending already exceeds the configured plan.

### positive_cash_flow

No usable plan exists, but current net cash flow is non-negative.

### negative_cash_flow

No usable plan exists and current net spending exceeds recorded income.

### no_activity

No posted income/spending ledger flow exists in the selected period.

The status is computed in the database and only translated into human-facing copy in the presentation model.

## Attention engine

Overview exposes actionable exceptions instead of generic engagement cards.

Current attention candidates include:

1. failed or incomplete receipt processing;
2. receipts requiring review;
3. receipts whose blockers are resolved and are ready for final confirmation;
4. suggested receipt-to-transaction matches;
5. confirmed receipts that remain unmatched;
6. budget over-plan or projected at-risk status;
7. posted spending whose necessity is still unclassified.

Attention entries carry:

- code;
- severity;
- entity ID;
- entity kind;
- subject;
- deterministic detail value;
- action target;
- occurrence/update time.

The UI maps those actions to Receipts, Activity, or Plan.

## Category movement

Overview returns the five largest current-period spending categories.

Each row contains:

- current net spend;
- previous-period net spend;
- absolute change;
- percentage change when a previous baseline exists;
- share of current net spending.

No percentage is invented for a zero baseline.

## Recent Activity

P10 reuses the P8 `finance.search_activity` read model.

This preserves the P8 invariant:

> a confirmed receipt attached to a transaction is evidence, not a second financial event.

The Overview therefore cannot double-count a purchase merely because both a transaction and receipt exist.

## Account position

Overview exposes:

- count of active accounts;
- tracked net position across active accounts marked `include_in_net_worth`.

This is a lightweight current position derived from posted account ledger entries.

The dedicated net-worth phase remains responsible for richer asset/liability history.

## Backend API

P10 adds:

```text
finance.get_overview_dashboard(...)
public.finance_get_overview_dashboard(...)

finance.get_overview_dashboard_period(...)
public.finance_get_overview_dashboard_period(...)
```

All functions are SECURITY INVOKER.

Public/anon execute privileges are revoked. Authenticated users and service role receive execute permission.

Underlying RLS remains the ownership boundary.

## Browser runtime

P10 introduces the live browser Supabase runtime using:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Only the publishable browser key is used.

The frontend never receives a service-role or secret key.

The runtime:

- persists the authenticated Supabase session;
- auto-refreshes tokens;
- initializes the Finance user namespace through the public RPC;
- calls only narrow public Finance RPCs.

If deployment configuration is absent, Overview renders an explicit configuration state.

If no authenticated session exists, Overview renders an explicit authentication-required state.

It never falls back to sample balances or demo spending.

## Application files

P10 adds:

```text
src/domain/overview.ts

src/services/overview.ts
src/services/supabase-overview.ts

src/integrations/supabase-client.ts

src/overview/OverviewPage.tsx
src/overview/use-overview.ts
src/overview/overview-model.ts
src/overview/overview.css
src/overview/overview-model.test.ts
src/overview/supabase-overview.test.ts

src/vite-env.d.ts
.env.example
```

The P9 sample Overview is removed from `FinanceApp`.

## Live verification

The rollback-only database fixture verifies:

- €2,000 current income;
- €700 gross spending;
- €100 refund;
- €600 net spending;
- €1,400 net cash flow;
- 70% savings rate;
- previous-period comparison;
- real monthly budget allocations;
- €400 budget remaining;
- at-risk projected pacing;
- receipt-review attention;
- unmatched-receipt attention;
- recent P8 Activity reuse;
- account aggregation;
- cross-user RLS isolation.

A separate timezone fixture verifies Europe/Berlin calendar month/week boundaries through the October daylight-saving transition.

## Frontend verification

Tests cover:

- spending/income/cash-flow trend semantics;
- zero-baseline handling;
- status copy;
- attention routing;
- Supabase RPC arguments;
- snake_case RPC response parsing;
- summary/planning/status/category/attention/account mapping.

CI verifies strict TypeScript, all Finance fixture groups, and a production Vite build.

## Next handoff

P11 can build the reusable quantitative visualization engine and richer dashboard/analytics charts on top of the stable live Overview metrics instead of recomputing financial meaning inside chart components.
