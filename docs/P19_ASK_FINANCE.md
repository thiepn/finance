# P19 — Ask Finance & Deterministic Query Engine

P19 turns the Finance data model into a question-answering surface without making a language model authoritative over money.

## Core invariant

Ask Finance may interpret a question, but Finance computes every financial value.

~~~text
question
  ↓
typed Finance query
  ↓
existing deterministic read model
  ↓
answer + evidence + provenance
~~~

No P19 answer calculates money from generated prose.

## Scope

P19 is intentionally read-only.

It does not:

- create or edit transactions;
- mutate budgets, recurring patterns, receipts, or accounts;
- add a second analytical ledger;
- call an LLM;
- duplicate P18 receipt matching;
- infer product prices from transaction totals.

P20 can later translate ChatGPT/MCP requests into the same typed query contract.

## Why no new database migration was required

P10–P18 already expose the authoritative read models P19 needs:

- Overview for income, spending, recoveries, cash flow, and savings rate;
- Spending Explorer for scoped category, merchant, necessity, and product evidence;
- Product Intelligence for unit-price history and price comparisons;
- Recurring for monthly commitments, subscriptions, upcoming charges, and price changes;
- Planning for budgets, safe-to-spend, forecasts, and goals;
- Wealth for net worth, account balances, and savings;
- Receipt Matching for unresolved receipt ↔ transaction reconciliation;
- Activity filter catalogs for deterministic entity-name resolution.

P18 already ensures that receipt-enriched analytics do not double-count scanned receipts and matched bank transactions.

## Typed query contract

P19 defines:

~~~text
AskFinanceQuery
AskFinanceAnswer
AskFinanceMetric
AskFinanceEvidence
AskFinanceProvenance
~~~

Supported intents:

~~~text
spending
top_spending
cash_flow
product_prices
recurring
budget
net_worth
receipt_reconciliation
~~~

A future caller may either:

1. submit a natural-language question through the P19 deterministic parser; or
2. call the structured query contract directly.

The second path is the P20 MCP/ChatGPT boundary.

## Deterministic interpretation

P19 recognizes:

- this / last week;
- this / last month;
- this / last quarter;
- this / last year;
- category names;
- merchant names;
- normalized product names;
- necessity labels.

Entity resolution uses the existing Finance Activity filter catalog rather than inventing IDs or fuzzy values.

When a question cannot be mapped safely to a supported intent, Ask Finance returns an explicit unsupported-question error.

It does not guess.

## Spending questions

Example:

~~~text
How much did I spend on Snacks at REWE?
~~~

P19 resolves:

~~~text
intent        spending
category      Snacks
merchant      REWE
period        current month
~~~

The result comes from Spending Explorer using effective P18 classifications.

Returned evidence includes the strongest relevant merchants/categories and the calculation provenance.

### Product-level spending

A product can only be attributed when itemized receipt evidence exists.

Therefore product-spending answers explicitly state that limitation instead of pretending that an unitemized bank transaction identifies a product.

## Cash-flow questions

Example:

~~~text
What was my cash flow last month?
~~~

Returns:

- income;
- net spending;
- net cash flow;
- savings rate;
- recent activity evidence.

All values come from the Overview ledger summary.

## Ranking questions

Examples:

~~~text
What were my biggest spending categories?
Which merchants cost me the most?
Which products did I spend most on?
~~~

P19 ranks the corresponding Spending Explorer dimension inside the requested scope and period.

## Product-price questions

Examples:

~~~text
How has Coke Zero changed in price?
Which grocery products increased most in price?
~~~

Price answers use normalized receipt product unit prices.

For broad rankings, P19:

1. retrieves the user's product catalog;
2. optionally limits it to the resolved category;
3. fetches comparable product analytics;
4. keeps only products with a prior comparable unit-price observation;
5. ranks the observed percentage change.

This avoids deriving a product price from a whole transaction or receipt total.

## Recurring questions

Examples:

~~~text
What are my monthly subscriptions?
How much do recurring expenses cost?
~~~

Returns recurring monthly equivalent, annualized expense, next-30-day commitments, and attention count.

## Budget questions

Examples:

~~~text
How much is safe to spend?
How much is left in my Groceries budget?
~~~

Uses the P15 planning engine.

Category-specific questions use the matching allocation when one exists.

## Net-worth questions

Example:

~~~text
What is my net worth?
~~~

Uses the P16 wealth engine and exposes the contributing included accounts as evidence.

## Receipt-reconciliation questions

Example:

~~~text
Which expenses still have unmatched receipts?
~~~

Returns:

- unmatched count;
- suggested-match count;
- partial-match count;
- matched count;
- unresolved receipt evidence.

The answer reports P18 match state only. It does not conflate matching with receipt arithmetic review.

## Provenance

Every successful P19 answer returns a provenance block describing the authoritative read model used.

Examples:

~~~text
Effective spending ledger
Normalized product price history
Recurring-pattern engine
Budget planning model
Net-worth engine
P18 receipt ↔ transaction reconciliation
~~~

This is a product requirement, not debug metadata.

The UI shows provenance directly beside answer evidence.

## UI

The existing Ask Finance navigation route is now a real workspace.

It includes:

- natural-language question composer;
- example questions;
- deterministic-answer trust label;
- calculation metrics;
- evidence rows linked back into Finance;
- provenance;
- explicit caveats where coverage is incomplete;
- loading and unsupported-question states;
- responsive desktop/mobile layout.

The top-bar Ask action now opens this workspace.

## Runtime integration

The Finance browser runtime now exposes:

~~~text
activity
askFinance
~~~

Activity also participates in Finance initialization so entity resolution is safe on a fresh account/session.

## Verification targets

P19 fixtures cover:

- last-month period resolution;
- product-price intent selection;
- unmatched-receipt intent selection;
- safe-to-spend intent selection;
- simultaneous category + merchant resolution;
- use of net effective spend rather than gross receipt totals;
- provenance presence.

CI runs:

~~~text
npm run typecheck
npm test
npm run build
~~~

## Security boundary

P19 introduces no new database tables, views, RPCs, storage objects, or write operations.

It reuses the existing SECURITY INVOKER Finance RPC surface and user-scoped RLS/read models.

No service-role credential is added to the browser.

## P20 handoff

P20 should implement the ChatGPT/MCP integration around the structured P19 query contract.

P20 should not give ChatGPT direct SQL or unrestricted database access.

The preferred boundary is:

~~~text
ChatGPT / MCP
  ↓
validated AskFinanceQuery
  ↓
P19 deterministic engine
  ↓
Finance read models
  ↓
AskFinanceAnswer + evidence + provenance
~~~

Any future write tool must remain separate from P19 and require explicit user action/confirmation.
