# P26 — Signal Current Design System Implementation

**Status:** Reusable React/CSS design system implemented. **Live Finance page migration intentionally deferred to P27–P37.**  
**Approved identity:** B — Signal Current, [P25L lock](P25L_SIGNAL_CURRENT_LOCK.md).  
**Scope:** Finance presentation layer only; no THIEPN Core service/auth/ledger/schema changes.

## Implementation inventory

| Deliverable | Files | What it does |
| --- | --- | --- |
| Locked palettes | `src/ui/v2/signal-current.tokens.css` | Generated directly from `design/p25/signal-current.tokens.json`; `--sc-*` tokens in dark/light scopes |
| Token generator & drift gate | `scripts/generate-finance-p26-tokens.mjs` | Generates the one CSS source; `--check` fails if output differs from P25L |
| Scoping and component styling | `src/ui/v2/signal-current.css` | `.sc-root` isolation, responsive data tables/mobile rows, compact financial sections, no CSS overrides of legacy `.f-*` |
| Monetary presentation | `src/ui/v2/finance-presentation.ts` | Validated safe minor units, currency exponent for EUR/JPY/KWD, number formatting, bounded progress, provenance labels |
| React design system | `src/ui/v2/SignalCurrent.tsx` | Composable accessible financial primitives listed below |
| Integration contract fixtures | `src/ui/v2/signal-current.test.ts` | Invariants for numbers, status, progress, SSR HTML/roles, ledger/receipt distinction |
| Component dev preview | `p26-showcase.html`, `src/ui/v2/showcase-main.tsx`, `showcase.css` | Interactive synthetic finance scenarios; no production authentication or backend operations |
| Visual QA | `scripts/capture-finance-p26.mjs`, `.github/workflows/finance-p26-visual-qa.yml` | Playwright/axe screens across 1440px, 1024px, 390px and 320px in both locked themes |

## Finance-native React primitives

Components are exported by `src/ui/v2/SignalCurrent.tsx`:

- **SignalCurrentScope**: explicit `theme="dark" | "light"`; theme inherits only inside the subtree. This is the migration boundary.
- **FinancePageHeader**: compact semantic heading, optional context and real actions, no hero.
- **MoneyValue**: safe integer minor-unit display with `Intl.NumberFormat`; tabular numeric alignment and meaningful colors; do not infer user-provided currency from locale.
- **MoneyMetric**: headline money with explicit `source` distinguishing posted, planned, forecast, receipt evidence or valuation.
- **DataProvenance**: visible labels rather than color-only data states; receipt evidence is never another posted expense.
- **FinancialState**: sign-in, loading, empty, offline, error, forbidden and processing; optional real callbacks; no backend RPC text exposure.
- **AttentionRow / LedgerRow / BudgetAllocationRow**: accessible link or read-only row; allocation progress clamps display without hiding overspending.
- **FinanceTable**: semantic `table`/caption/header scopes, row links and a focusable named scroll region for narrow viewports.
- **FinanceTrend**: neutral SVG for actual/plan values; missing data stays missing; expandable accessible numeric table.
- **ReceiptCompare**: side-by-side editable evidence and original image; clear missing-evidence fallback and status.
- **FinanceButton, PeriodPicker, AccountSwitcher, FilterBar, ActionMenu**: native HTML controls with labels and state.

These are **presentation components**: they cannot create/mutate ledger records or bypass account-level permissions. Pages must pass trusted data from existing services into them.

## Isolation and deployment policy

The code intentionally does **not** import any P26 CSS, components or demo data in `src/app/main.tsx`, `index.html` or `FinanceApp.tsx`. It is **not** correct to apply `--sc-*` to `:root` or replace the old `--f-*` theme globally; doing so would create an incoherent hybrid until routes, components and styles are migrated together.

Run the real React showcase in the repository development server:

```sh
npm ci
npm run dev
# Open http://localhost:5173/p26-showcase.html
```

The showcase is a **separate HTML entrypoint, served by Vite in development**. The configured production build still uses only the existing `index.html` entrypoint, so synthetic ledger data and illustrative disabled financial actions do **not** replace real Finance UI. No live-service tokens are needed to view the demo. Do not use this demo as a personal-finance application.

## UI specification and design discipline

**Dark primary:** midnight canvas `#0a1426`, deep navy panels `#12233b`, cyan actions `#43d6da`. **Light alternate:** pale-blue canvas `#f2f7fc`, white content, cobalt `#135ab3` actions. P25L contains the full locked token reference.

- Desktop screen titles 24px; mobile 23px. Never use an oversized marketing headline instead of a finance function.
- Table and category rows provide information density; use bordered panels **only** for distinct financial regions, not every label.
- Finance numbers use semantic currency and actual source labeling, not arbitrary red/green coloring.
- All available financial data must be real from the account-scoped backend in the production app. Showcase numbers are synthetic.
- Mobile uses full-page context, native links/selects/buttons, a persistent five-action nav (actual router moves in P27), and focusable scroll regions.
- Respect reduced motion, zoom and touch targets. Do not introduce gradients, parallax, glows or default animated cards.
- Default dark; provide the complete light variant and user/system preference integration when migrating pages.

## Tests and qualification

```sh
npm run validate:p25l
npm run validate:p26
npm run typecheck
npm test
npm run build
```

`npm run validate:p26` verifies generated tokens, scope isolation, component inventory and non-mounted production entrypoint. `npm test` includes SSR presentation tests for exact minor units, zero/three-decimal currencies, receipt source semantics, accessible details and no double-post implication.

The **Finance P26 React Visual QA** workflow launches the actual React showcase (not static HTML from P25) and captures 28 viewport/screen/theme combinations: desktop/mobile core pages plus 1024px/320px stress cases. It runs axe WCAG A/AA tags, catches uncaught browser errors, page overflow and wrong theme. The final artifact supplies `index.html`, PNGs and `report.json`. The verified [P26 React Visual QA run](https://github.com/thiepn/finance/actions/runs/37769597318) captured **28/28 real React views**, with **zero page overflow cases**, **zero uncaught errors** and **zero tagged axe A/AA violations** in the tested states. These are synthetic fixtures, not an authenticated production qualification.

Automated axe checks do **not** certify WCAG conformance; authenticated journeys, keyboard traversal, real phone camera, screen reader use and actual ledger data remain for P27–P39.

## Next integration order

**P27:** new pathname router and session boundary, six desktop destinations, five mobile tabs and More/account, all behind controlled migration. Mount `SignalCurrentScope` on an entire new V2 route subtree, **not** a random legacy card.

**P28:** Home and financial position, sourced from existing finance services.

**P29:** Activity and full transaction editor with splits/currencies/validation.

**P30:** Camera, OCR, receipt matching and correction flow.

**P31–P37:** Planning, reports/merchants, recurring, accounts/wealth, imports, optional AI.

**P38–P40:** Performance and authorization qualification, cross-device visual regression, stable launch.

## Acceptance checklist

- [x] Official dark/light palettes are generated from P25L lock and checked in CI.
- [x] Finance-specific semantic React components implemented.
- [x] Amounts handle currency-specific minor-unit scaling safely.
- [x] No global replacement of old application styles.
- [x] Isolated, interactive, synthetic app preview exists.
- [x] Strict TypeScript and SSR component tests in CI.
- [x] Automated desktop/mobile/narrow visual and axe checks.
- [ ] Actual authenticated Finance routes use the new design (P27 onward).
- [ ] Complete mobile capture/ledger edit/real account QA (P29–P39).

**Conclusion:** P26 builds and qualifies the real reusable visual foundation, not a finished Finance V2.0 application.
