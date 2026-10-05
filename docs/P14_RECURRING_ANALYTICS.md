# P14 — Bills, Subscriptions & Recurring-Cost Analytics

P14 adds deterministic recurring-payment intelligence on top of the Finance ledger.

## Domain model

P14 keeps the original separation:

- `recurring_patterns` = authoritative expected cash-flow pattern;
- `subscriptions` = optional semantic overlay for cancelable recurring expenses;
- `recurring_transaction_links` = explicit evidence connecting posted transactions to one recurring pattern.

A transaction can belong to at most one recurring pattern, preventing duplicate recurring spend.

## Recurring pattern metadata

`recurring_patterns` now stores:

- normalized cadence (`daily`, `weekly`, `monthly`, `yearly`);
- cadence interval;
- schedule anchor;
- next expected occurrence;
- source and confidence;
- optional normalized description match;
- amount and timing tolerances.

The existing RRULE remains the portable recurrence representation.

## Supported cadence examples

~~~text
weekly + 1   → weekly
weekly + 2   → every 2 weeks
monthly + 1  → monthly
monthly + 3  → quarterly
monthly + 6  → every 6 months
yearly + 1   → yearly
~~~

## Monthly and annualized equivalents

Recurring costs are normalized so different billing frequencies can be compared.

Examples:

~~~text
€12 monthly       → €12 / month, €144 / year
€36 quarterly     → €12 / month, €144 / year
€120 yearly       → €10 / month, €120 / year
€10 weekly        → about €43.33 / month
~~~

Expense, income and transfer patterns are supported. Only active expense patterns contribute to recurring-cost totals.

## Detection candidates

`finance.get_recurring_detection_candidates` examines unlinked posted transactions from configurable history.

A candidate requires at least three occurrences and a plausible regular interval. Detection currently recognizes:

- daily;
- weekly / multi-week;
- monthly / multi-month;
- yearly.

Confidence combines:

- cadence regularity;
- amount stability;
- number of observed occurrences.

Low-confidence groups are not surfaced.

Detection never silently creates a recurring pattern. The user must confirm a suggestion.

## Candidate confirmation

Confirmation:

1. validates that all source transactions belong to the current user;
2. verifies a single transaction type and currency;
3. retains a stable merchant when present;
4. retains stable category/account context when all source transactions agree;
5. creates one recurring pattern;
6. links historical transactions as confirmed evidence;
7. optionally creates a subscription overlay.

This allows category-based recurring analytics without inventing classifications.

## Forward synchronization

`finance.sync_recurring_patterns` looks for newly posted transactions near the next expected date.

A candidate transaction must satisfy the pattern's deterministic dimensions:

- transaction type;
- merchant when specified;
- account when specified;
- category when specified;
- normalized description when specified;
- broad amount safety bound;
- schedule tolerance window.

The closest valid transaction is linked once, the expected schedule advances, and an active subscription's current observed amount/next charge are updated.

If an expected occurrence cannot be found, synchronization does not skip over it. The expectation remains outstanding so the dashboard can classify it as late or missing.

Explicit null `as_of` values are hardened to server-side `now()`.

## Health states

Active patterns are classified as:

~~~text
on_track
upcoming
due
late
missing
unscheduled
~~~

Paused and ended patterns keep their lifecycle states.

`missing` means the next expected occurrence is beyond its configured tolerance window without a linked posted transaction.

## Price-change alerts

Recurring price changes compare the latest linked occurrence with the immediately previous occurrence of the same pattern.

A change of at least +5% is surfaced as a price increase. A decrease of at least -5% is shown as down; smaller movement is stable.

Because a recurring pattern already represents one contract/stream, this comparison does not mix unrelated merchants or transactions.

## Subscription creep

The current recurring monthly run rate is compared with a historical baseline three months earlier.

For each recurring expense, Finance uses the latest linked amount available at or before the baseline date and normalizes it to a monthly equivalent.

This means creep can reflect both:

- price increases in existing recurring charges;
- new recurring expenses added after the baseline.

The dashboard returns current monthly expense, historical monthly baseline, delta and percentage change.

## Upcoming timeline

Active patterns with a next expected date inside the configured horizon are returned in chronological order with:

- expected amount;
- next date;
- days until expected;
- merchant;
- subscription flag;
- health state.

The dashboard separately calculates expected recurring expense in the next 30 days.

## Category breakdown

Active recurring expense is grouped by retained category and normalized to monthly equivalents.

Each category returns:

- monthly recurring amount;
- annualized amount;
- pattern count;
- share of active monthly recurring expense.

Patterns without a category remain explicitly `Uncategorized` rather than being guessed.

## Evidence history

Each recurring pattern returns its latest linked occurrences with:

- transaction ID;
- actual date;
- expected date;
- amount;
- amount delta;
- timing delta;
- match source;
- confidence.

This keeps all recurring analytics auditable back to Activity.

## Browser-facing API

~~~text
public.finance_upsert_recurring_pattern(...)
public.finance_set_recurring_status(...)
public.finance_get_recurring_detection_candidates(...)
public.finance_confirm_recurring_candidate(...)
public.finance_sync_recurring_patterns(...)
public.finance_get_recurring_dashboard(...)
~~~

All exposed functions are SECURITY INVOKER. Anonymous/public execution is revoked and authenticated/service-role execution is explicit.

## Recurring screen

The Recurring route now includes:

- monthly recurring expense;
- annualized run rate;
- subscription count and monthly subscription cost;
- next-30-day expected cost;
- 12-month actual recurring-spend trend;
- subscription-creep comparison;
- category composition;
- missing/late/price-increase attention queue;
- upcoming timeline;
- filterable recurring ledger;
- per-pattern monthly/yearly impact;
- expandable linked occurrence evidence;
- pause/resume/end controls;
- detected recurring candidates;
- one-click `Track recurring`;
- one-click `Track subscription`.

## Verification

Rollback-only live database fixtures verify:

- monthly recurring candidate detection;
- candidate confidence/cadence;
- subscription confirmation;
- unique historical transaction linking;
- candidate removal after confirmation;
- forward occurrence synchronization;
- subscription current amount and next-charge advancement;
- price increase detection;
- monthly and annualized cost;
- three-month creep baseline;
- upcoming forecast;
- missing expected charge after tolerance;
- pause propagation to subscription;
- stable category/account retention;
- recurring category aggregation;
- cross-user RLS isolation;
- null-sync hardening.

## Advisors

~~~text
Supabase Security advisor     clean
Supabase Performance advisor  clean
~~~

## P15 handoff

P15 should implement Budgets, Planning, Sinking Funds & Forecasting using P10–P14 deterministic ledger, recurring commitments and analytics as inputs.