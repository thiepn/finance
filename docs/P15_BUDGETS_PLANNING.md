# P15 — Budgets, Planning, Sinking Funds & Forecasting

P15 turns the existing budget/goal foundation into the active planning layer for THIEPN Finance.

## Planning invariants

- the posted ledger remains financial truth;
- budgets never create transactions;
- category allocations are planning envelopes, not accounting entries;
- goal funding is earmarked money and is not treated as consumption;
- recurring commitments come from confirmed P14 recurring patterns;
- forecasts separate scheduled recurring spend from variable-spend pace;
- category allocation roots cannot overlap by ancestry inside one period;
- one active budget exists per user to prevent double planning.

## Budget periods

Supported budget cadences:

~~~text
weekly
monthly
quarterly
yearly
custom (explicit dates only)
~~~

`finance.ensure_budget_period` creates canonical period boundaries for weekly, monthly, quarterly, and yearly plans. Custom periods continue to use explicit start/end dates.

## Category allocations

Each allocation targets one category-tree root. Spending in all descendants belongs to that allocation.

Example:

~~~text
Food & Drink  €400
├─ Groceries
├─ Snacks
└─ Eating out
~~~

Allocating both `Food & Drink` and `Snacks` in the same period is rejected because it would double-count descendant spending.

Refunds and reimbursements reduce attributable category spend because the allocation read model uses the posted ledger's net category entries.

## Rollover

`rollover=true` carries the prior period's actual closing allocation balance into the next period.

~~~text
September planned       €300
September net spent     €200
September closing       +€100
October base plan       €400
October effective plan  €500
~~~

Overspending carries as a negative balance rather than being silently reset:

~~~text
September planned       €300
September net spent     €350
September closing       -€50
October base plan       €400
October effective plan  €350
~~~

Disabling rollover on a prior allocation resets the carry chain at that period.

## Safe to spend

P15 exposes a conservative period-level safe-to-spend value:

~~~text
planned resource
- actual net spend
- remaining known recurring expenses in the period
- remaining goal/sinking-fund funding reserved for the period
= safe to spend
~~~

When planned income is configured it is the resource basis. If it is absent, the effective category plan becomes the fallback planning ceiling.

Goal funding is subtracted as reserved cash but is not recorded as expense.

## Forecast model

P15 does not linearly extrapolate every transaction.

Actual spend is separated into:

1. recurring linked spend;
2. non-recurring/variable spend.

Recurring future cost is projected from P14 cadence, next expected date, and latest observed/expected amount. Only the variable portion is pace-projected.

The period forecast returns cumulative:

- actual spend;
- forecast spend;
- planned category envelope.

Periods up to 62 days use daily buckets; longer periods use weekly buckets.

## Category pacing

Each allocation returns:

- base planned amount;
- rollover carry-in;
- effective planned amount;
- actual spend;
- remaining balance;
- utilization ratio;
- projected spend;
- known future recurring amount in the category;
- status: `on_track`, `watch`, `at_risk`, `over`, or `empty`.

## Goals and sinking funds

`goals` now distinguish:

~~~text
savings
sinking_fund
~~~

A sinking fund represents money reserved for a known future cost such as annual insurance, travel, device replacement, or a predictable irregular bill.

`goal_contributions` now use explicit movement kinds:

~~~text
opening
contribution
withdrawal
~~~

Amounts remain positive; direction comes from movement kind. A withdrawal cannot exceed the currently funded balance.

## Goal funding pace

A goal may define an explicit planned monthly contribution. If omitted and a future target date exists, Finance calculates the monthly amount required to reach the target.

Monthly targets are normalized to the active budget cadence:

~~~text
weekly     → monthly target × 12 / 52
monthly    → monthly target
quarterly  → monthly target × 3
yearly     → monthly target × 12
custom     → day-proportional
~~~

This prevents a 31-day month from turning an explicit €100/month plan into €101.86.

Goal health states include:

- funded;
- on track;
- needs more;
- overdue;
- no schedule;
- paused/completed/cancelled.

## Planning dashboard

`finance.get_planning_dashboard` returns:

- current active budget and period;
- income/spending reconciliation;
- safe-to-spend;
- projected period spend/surplus;
- recurring commitments still expected;
- rollover-aware category allocations;
- savings/sinking-fund status;
- cumulative forecast series;
- available expense categories for plan configuration;
- available active accounts for optional goal linking.

## Browser-facing API

~~~text
public.finance_upsert_budget(...)
public.finance_upsert_budget_period(...)
public.finance_ensure_budget_period(...)
public.finance_upsert_budget_allocation(...)
public.finance_delete_budget_allocation(...)

public.finance_upsert_goal(...)
public.finance_add_goal_movement(...)
public.finance_set_goal_status(...)

public.finance_get_planning_dashboard(...)
~~~

All browser-facing functions are SECURITY INVOKER. Anonymous/public execution is revoked and authenticated/service-role execution is explicit.

## Budget UI

The Budget route now provides:

- active period setup;
- expected-income editing;
- safe-to-spend headline;
- remaining effective budget;
- projected period spend;
- reserved goal funding;
- actual/forecast/plan chart with table parity;
- editable category allocations;
- rollover controls;
- allocation progress/status;
- known recurring commitments;
- cash-plan reconciliation;
- sinking-fund preview and management.

## Goals UI

The Goals route reuses the same planning model and focuses on:

- total target and funded balance;
- remaining required funding this period;
- savings and sinking-fund cards;
- progress bars;
- target-date pressure;
- required monthly pace;
- contributions;
- withdrawals;
- pause/resume;
- new fund creation;
- optional linked account.

## Verification

Live rollback fixtures verify:

- category-tree descendant spending;
- parent/child allocation overlap rejection;
- positive rollover;
- effective allocation balances;
- recurring future commitments;
- exact monthly goal funding targets;
- safe-to-spend arithmetic;
- sinking-fund progress;
- contribution/withdrawal behavior;
- excessive withdrawal rejection;
- cumulative forecast production;
- canonical monthly period generation;
- configuration category/account reference data;
- cross-user RLS isolation.

## Advisors

~~~text
Supabase Security advisor     clean
Supabase Performance advisor  clean
~~~

## P16 handoff

P16 should implement Net Worth, Account Balance History, Savings Rate & Long-Term Wealth Tracking. P15 already owns short/medium-term earmarked savings and sinking funds; P16 should focus on balance-sheet and longitudinal wealth views rather than duplicating goal planning.