
# P32 — Financial Insights & Chart System V2

**Status:** Implemented on the independent P32 development branch; pending exact-head CI and browser QA.

## User-visible work
- `/explore` and `/explore/categories` mount Signal Current financial insights in the authenticated P27 shell.
- Four honest measures: scoped posted net spending, preceding-period posted spending, distinct posted transaction count, and **separate** itemized receipt evidence. Receipt amounts are never summed into ledger spending.
- Current-versus-previous bucket trend with a data-table toggle; missing prior buckets are null, not zero; negative refund buckets are drawn below zero.
- Cash flow and income are requested from the **existing** account-scoped analytics time-series RPC for the exact explorer period. The interface labels them **all-account metrics**, even with merchant/category filters; mismatched currency/period and errors show unavailable, not approximations.
- Recursive category breadcrumbs, merchant spending comparisons, necessity filters, shareable URL state and separate deep links for products and canonical activity records.
- Activity links use the user's Finance time zone and inclusive ledger dates, including DST transitions. Unsupported category filtering on Activity is not claimed.
- No new financial writes, SQL migrations, service tokens or financial AI authority.

## QA and limits
- `npm run typecheck`, `npm test`, `npm run build`, and `npm run validate:p32` via CI.
- Isolated synthetic React view in `p32-insights-preview.html` and Chromium/axe checks at 1440/1024/390/320px in dark/light and no-data/refund/long-label scenarios.
- Real authenticated data correctness, live bank balances, real devices, data isolation, and deployment require P38–P40 qualification. Screenshots use synthetic amounts only.
- Product and merchant detail editor redesign remains P33. Receipt extraction/reconciliation stays under the established Finance services.
- Original P31 Vercel status was failing due to a build-rate-limit; P32 must not be presented as deployed.

**Next:** P33 — Product & Merchant Intelligence V2.
