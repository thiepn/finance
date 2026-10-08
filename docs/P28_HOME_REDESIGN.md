# P28 — Real-Data Home Experience (Signal Current)

**Status:** Implemented in `thiepn/finance` on the Finance V2 app shell.  
**Design:** P25L B — Signal Current, **not** a generic hero-and-cards SaaS template.  
**User data:** The real Home consumes the existing per-user Supabase Finance services. The separate browser screenshot fixture is synthetic and excluded from the production entrypoint.

## Experience

| Region | Actual behavior | Source / caution |
| --- | --- | --- |
| **Available to spend** | Remaining from configured budget allocations; clear unavailable state if no active budget. Negative amounts are visible. | `overview.summary.availableToSpendMinor`, `planning.configured`; planned, **not** bank cash |
| **Tracked net position** | Accounts designated for net-worth tracking, not relabeled as checking balance. | `overview.accounts.trackedNetWorthMinor`; valuation/ledger-derived, **not** cash-on-hand |
| **Upcoming · 30 days** | Estimated expenses from real tracked recurring patterns, with up to two upcoming names/dates. Loading/error state is **not** zero. | `recurring.getDashboard(null, 30)`; forecast, **not** posted spending |
| **Net spending** | Actual posted expenses, refunds already reconciled in backend; compact mobile spending strip. | `overview.summary.netSpentMinor`; posted |
| **Spending pace** | Cumulative posted expenses compared against a linear planned allocation across the selected period. Future posted points are **null**, never invented. | `analytics.getTimeSeries` + configured `planning.plannedSpendMinor`; chart includes a keyboard-reachable data table |
| **Needs attention** | Receipt review, matching, unclassified entries and budget attention with real actions. | `overview.attention`; actions route to their existing sections |
| **Budget progress** | Configured planned, spent, remainder and overrun disclosure; no-plan leads to budget setup. | `overview.planning` |
| **Recent activity** | Actual transaction/receipt rows with signs, dates, categories and separate receipt evidence states. | `overview.recentActivity`; receipt-only records have **no posted amount** |
| **Categories** | Actual ranked categories, five with shares and magnitudes, navigate to Explore Categories. | `overview.topCategories` |
| **Period & refresh** | Week, month, quarter, year, real period date and data freshness timestamp. | existing `useOverview` and independent recurring/analytics loaders |

The Home prioritizes financial values, actionable follow-ups and the spending chart. Header is the small functional **Home** title; there is no giant welcome message, ornamental animation or AI-chat hero.

## Architecture

- `src/overview/OverviewPage.tsx` now forwards to `SignalHome.tsx`; the P27 live route remains `/` inside the verified account boundary.
- `src/overview/signal-home-model.ts` contains pure domain-to-display contracts; no ledger write or inferred backfill.
- `src/overview/SignalHome.tsx` fetches the existing dashboard, plus independent recurring and analytics sources. Failure in a supplementary RPC does **not** replace the verified dashboard balances with zeros.
- `src/overview/signal-home.css` scopes the responsive layout under Signal Current, with dedicated 320px and 390px financial-number legibility rules.
- `useOverview` no longer redundantly calls Supabase `getSession` inside auth change callbacks. P27 already verifies the account before Home mounts, and backend RLS/RPC enforces authorization.
- `src/overview/signal-home.fixture.ts` and `p28-home-preview.html` exist **only** for a synthetic visual QA entry; they are not imported into the live app.

### Fidelity & remaining work

The existing backend does not expose a cash-only Home balance in the Overview DTO. Instead of inventing one or calling tracked net worth cash, P28 labels the present value **Tracked net position**. A validated cross-account cash metric can replace/add this in P35 when the required source guarantees are complete.

The projected spending amount (where available) is labelled as an **estimate**, with planned-vs-actual graph explicitly identified as comparison rather than a prediction.

Transaction detail editing, better Activity routing, and detailed receipt controls are scheduled for P29–P30. Banks syncing directly, full cross-product SSO, authenticated real-device verification, and user-specific financial accuracy tests are separate gates; P28 does not claim those are finished.

## Tests

```sh
npm run validate:p28
npm run typecheck
npm test
npm run build
```

`src/overview/signal-home-model.test.ts` covers absent/unconfigured budgets, overspending, zero and invalid amounts, account absence, receipt-only evidence, income/refund/transfer display semantics and chart period/currency consistency.

The **Finance P28 Home Visual QA** workflow runs Chromium + axe on the actual React `SignalHomeView` and Signal Current shell with synthetic fixtures. It exercises dark/light at 1440px, 1024px, 390px and 320px; no-plan, empty, overrun, and optional data-source outage scenarios. It checks horizontal overflow, actual text clipping (especially EUR on half-width phone metrics), theme correctness, JS failures and tagged accessibility errors. Gallery PNGs, a report and HTML index are exported as a run artifact.

**Browser QA is not authenticated backend QA.** Test genuine user accounts (including two isolated identities), real session completion, real ledger amounts and phone input workflows in P38–P39. No actual banking or private financial values are used in screenshots.

## Acceptance

- [x] No fake available-to-spend or unverified cash totals
- [x] Source-labelled real dashboard metrics and independent recurring/analytics sources
- [x] Small functional Home heading, real account action routes, useful daily hierarchy
- [x] Source outage/empty/overrun and 320px mobile states implemented
- [x] Financial logic unit tests, route/fixture isolation checks and browser workflow added
- [ ] Verified with real production account financial values (P38–P39)
- [ ] Extended record detail/editor workspaces (P29–P35)
