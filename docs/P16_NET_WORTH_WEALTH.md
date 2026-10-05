# P16 — Net Worth, Account Balance History, Savings Rate & Long-Term Wealth Tracking

P16 is the balance-sheet layer for THIEPN Finance.

## Core principle

The ledger remains the source of truth for money movement. Balance observations are valuation anchors, not transactions.

That means:

- income and spending continue to come only from posted ledger/category entries;
- own-account transfers never become income or spending;
- statement balances and market values do not create fake income;
- a balance observation re-anchors one account at one point in time;
- later posted ledger movement is added on top of the latest observation;
- net worth uses signed reporting-currency balances.

## Balance observations

`finance.account_balance_observations` stores explicit account-value anchors.

Sources:

~~~text
manual
statement
import
market
~~~

Each observation stores:

- account-currency balance;
- reporting-currency balance;
- optional exchange rate;
- observation time;
- source;
- optional note.

For an account in the Finance reporting currency, reporting balance must equal account balance. For foreign-currency accounts, the observation requires either an explicit reporting balance or an exchange rate.

## Effective balance

`finance.account_balance_at(account, as_of)` uses:

~~~text
latest observation at/before as_of
+ posted account-ledger movement after that observation
= effective account balance
~~~

If no observation exists, the balance is fully ledger-derived.

This model supports:

- checking/savings/cash balances;
- card and loan debt;
- externally imported statement balances;
- investment-market value updates;
- later transactions without immediately requiring another observation.

## Net worth

Current net worth is:

~~~text
sum(signed reporting balances of accounts included in net worth)
~~~

Assets and liabilities are position-based rather than hard-coded solely by account kind:

- positive included balances contribute to assets;
- negative included balances contribute to liabilities;
- net worth remains assets minus liabilities.

This correctly handles unusual cases such as a credit balance on a card or an overdrawn cash/checking account.

## History

`finance.get_net_worth_dashboard` supports 3–60 months; the product UI exposes:

~~~text
12M
24M
5Y
~~~

Each month-end history point includes:

- net worth;
- assets;
- liabilities.

The current partial month uses the selected/current anchor date instead of pretending the month has finished.

## Savings rate

Savings is deterministic ledger cash flow:

~~~text
posted income
- net spending after refunds/reimbursements
= savings
~~~

~~~text
savings / income = savings rate
~~~

Transfers between owned accounts do not affect savings.

P16 returns current-month, YTD and monthly historical savings metrics.

## Wealth bridge

P16 reconciles long-term net-worth change into:

~~~text
opening net worth
+ ledger savings
+ valuation & other balance change
= closing net worth
~~~

`valuation & other balance change` is intentionally not called investment return.

It is the residual after deterministic cash-flow savings and may contain:

- investment revaluation;
- statement/import balance anchors;
- opening balances;
- FX effects;
- adjustments or other non-category balance changes.

## Investment balance bridge

For included investment accounts, P16 separately shows:

~~~text
opening balance
+ net posted account-ledger flow
+ residual value change
= closing balance
~~~

This is a reconciliation bridge, not a time-weighted or money-weighted performance calculation. Holdings/cost-basis/market-return analytics require a later dedicated investment layer.

## Account management

P16 also activates the existing Accounts route.

Users can:

- create accounts through the P2 ledger service;
- set opening balances;
- include/exclude accounts from net worth;
- archive/restore accounts;
- record manual/statement/import/market observations;
- provide explicit FX for foreign-currency observations;
- inspect account-specific balance history.

For liability-style accounts, the UI accepts a positive amount owed and stores the canonical signed negative balance.

Foreign-currency accounts with a non-zero opening value are created at zero through the P2 convenience API and then anchored with a P16 observation plus exchange rate.

## UI

The Net Worth route now contains:

- net-worth headline;
- month-over-month change;
- total assets;
- total liabilities;
- current-month savings rate;
- 12M / 24M / 5Y history selector;
- net worth/assets/liabilities chart + table view;
- balance-sheet composition donut;
- wealth bridge;
- income/spending/savings chart + table view;
- investment reconciliation cards;
- complete account list;
- account observation controls;
- account-history drill-down.

The Accounts route reuses the same model but puts account creation and balance-source management first.

## Public RPC surface

~~~text
public.finance_record_account_balance_observation(...)
public.finance_delete_account_balance_observation(...)
public.finance_get_account_wealth_history(...)
public.finance_set_account_net_worth_inclusion(...)
public.finance_get_net_worth_dashboard(...)
~~~

All functions are SECURITY INVOKER. Public/anonymous execution is revoked. The private observation table is protected with own-user RLS.

## Verification

Rollback fixtures verify:

- current asset/liability/net-worth arithmetic;
- previous-month change;
- YTD and current-month savings;
- transfers excluded from savings;
- observation re-anchoring;
- ledger movement after observations;
- investment flow vs residual value change;
- account history;
- net-worth inclusion toggle;
- cross-user observation isolation;
- cross-user dashboard isolation.

A representative fixture reconciled:

~~~text
Checking                         170,000
Investment                       65,000
Credit-card liability           -10,000
---------------------------------------
Net worth                       225,000

Ledger savings                  220,000
Valuation/other change            5,000
Net-worth change                225,000
~~~

## Advisors

~~~text
Supabase Security advisor       clean
Supabase Performance advisor    clean
~~~

## P17 handoff

P17 should implement bank/file imports and ingestion quality: CSV, CAMT, OFX/QFX, field mapping, import previews, deduplication keys, source lineage, error handling, and safe creation of ledger transactions. P16 balance observations can then serve as statement reconciliation anchors for imported accounts.