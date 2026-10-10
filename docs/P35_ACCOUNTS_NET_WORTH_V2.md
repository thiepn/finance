# P35 — Accounts & Net Worth V2
Stacked separately from qualified P34 draft PR #29 at ee9e24a8f7356ac8231a90be2f8b705cb5ed6036. P32–P34 draft ancestry retained.

## Actual implementation
- Protected authenticated `/wealth/accounts`, `/wealth/accounts/:accountId`, `/wealth/net-worth` use existing account-scoped Supabase Finance wealth service and real dashboard/history responses.
- Backend-provided reported net worth/assets/liabilities and monthly changes; separates cash-like accounts, other assets, debt and excluded accounts. **No client-aggregated available cash** and no claim that valuation is posted income or spendable money.
- Net-worth source bridge shows **posted ledger savings** independently of **valuation/other change** with safe integer and arithmetic consistency checks. Own-account transfers are not treated as income or spending.
- Foreign-currency accounts show native balance independently, and reporting value is withheld without a qualified observation. Real exchange rates aren't fetched or assumed; explicitly supplied observation rates go to audited existing RPC.
- Account detail uses authenticated account-history RPC, observed balance provenance, ledger delta and safe linked Activity filter.
- Account creation defaults to zero opening balance in profile currency, observation recording, inclusion changes, and archive/restore each demand a deliberate two-stage review. No automatic writes on account reads.
- Browser accessibility/interaction screenshots use entirely synthetic fixture values, not live accounts; desktop, tablet, mobile, 320 px, light/dark, empty, negative debt, mixed FX, long labels.

## Qualifications
Real owner identity/RLS, bank balance reconciliation, native physical device and screen-reader signoff, financial owner acceptance and production deployment remain OPEN. No migrations, credentials, bank connectivity, imports or live protected data.

Next P36: Import & Financial Reconciliation V2.
