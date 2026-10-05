# P2 — Core Ledger Services

P2 turns the P1 schema into an executable finance engine.

## Implemented operations

- create / archive / restore account
- optional opening balance
- split expense posting
- split income posting
- same-currency account transfers
- full and partial refunds
- reimbursements
- transaction voiding
- account-balance projection
- transaction summary projection

## Sign convention

| Event | Account entry | Category entry |
| --- | ---: | ---: |
| Expense | negative | positive |
| Income | positive | negative |
| Refund | positive | negative |
| Reimbursement | positive | negative |
| Transfer | source negative / destination positive | none |

Every posted transaction must balance to zero in reporting minor units.

## Posted history

Once a transaction is posted, its ledger entries are immutable.

Corrections are represented explicitly:

- refund
- reimbursement
- void + replacement
- later adjustment workflows

This is deliberate. Historical finance data must be explainable and auditable rather than silently rewritten.

## Mixed supermarket example

A €40 purchase can be represented as:

- Checking account: -4000
- Groceries: +2000
- Snacks: +1000
- Household cleaning: +1000

The ledger balances to zero while analytics retain all three spending dimensions.

## Refund example

A €5 cleaning-item refund from that transaction becomes:

- Checking account: +500
- Household cleaning: -500
- relation: `refund_of` original transaction

It reduces net household spending rather than appearing as income.

## Reimbursement example

If a friend repays €10 of groceries:

- Checking account: +1000
- Groceries: -1000
- relation: `reimbursement_of` original transaction

This makes personal spending €10 lower instead of inflating both spending and income.

## Current P2 limitation

The convenience operations intentionally support EUR/reporting-currency flows only.

The P1 ledger schema already has original currency, reporting currency and exchange-rate fields. Cross-currency transaction creation will be added as a dedicated flow rather than approximated inside the initial P2 convenience functions.

## Live backend

Supabase project: THIEPN Core  
Schema: `finance`  
Live migration: `20261005100417_finance_p2_ledger_services`
