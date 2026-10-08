# P24 — Implementation Contract & Delivery Sequence

**This file translates the P24 IA decision into scoped implementation work for P25/P26/P27 and later UX phases.** The current production Finance UI is deliberately unchanged. P24 is a specification baseline, not a disguised half-implementation.

## Canonical artifacts

- [IA and interaction decisions](P24_INFORMATION_ARCHITECTURE.md)
- [Lo-fi desktop/mobile wireframes](P24_LOFI_WIREFRAMES.md)
- [Machine-readable routes](../design/p24/route-contract.json)
- [Machine-readable journeys](../design/p24/journey-contract.json)
- [P23 audited defects](P23_UX_VISUAL_AUDIT.md)
- [P23 screenshot findings](P23_VISUAL_CAPTURE_RESULTS.md)

Run `npm run validate:ia` (or `node scripts/validate-finance-ia.mjs`) to verify **the specification**. It does **not** mean the live app obeys the specification.

## P25 — Three distinct high-fidelity directions (no implementation yet)

Deliver exactly three separately conceived, finance-specific directions. Each must:
- Preserve the P24 sitemap, route hierarchy and six priority tasks.
- Show desktop **Home, Activity, Receipt Review** and mobile **Home, Scan, Plan** with common **synthetic fixtures**.
- Include both light/dark usage, contrast approach, desktop data density, responsive data-table behavior, empty/loading/error states, and animation grammar.
- Explain how numeric clarity, hierarchy and provenance are maintained (not only generic aesthetic language).
- Reject any candidate primarily defined by oversized headline, card wall, excessive neon/gradients, fake illustration or chat-first layout.
- Score independently on legibility, speed of common tasks, density control, financial credibility, character, mobile touch use and accessibility.

**Decision:** choose one visual language and freeze representative approved references before building P26. P24 does **not** preselect the Ledger Studio palette; earlier palette proposals are only one possible concept.

## P26 — Design system scope

Introduce/upgrade a small set of real financial primitives:
1. `FinancePageHeader`: title + source period + contextual action; no marketing hero.
2. `MoneyValue`: signed minor units, currency, locale, compact/large variants, no ambiguous truncation.
3. `FinanceTable` and `LedgerRow`: desktop semantic table; mobile row/detail pattern; keyboard multi-select.
4. `FinancialState`: auth required, loading, empty, forbidden, offline, error, duplicate, success, warning.
5. `DataProvenance`: posted / planned / estimated / OCR-suggested / unmatched semantics.
6. `FinanceTrend`: axes, accessible table, meaningful comparing, no fabricated extrapolation.
7. `ActionMenu`, `FilterBar`, `PeriodPicker`, `AccountSwitcher`, `FocusHeading`.
8. Device-adaptive panels and form flows, with careful use of borders/radius and reusable density tokens.

Required design checks: tokenized light/dark contrast; 200–400% zoom; 320px width; 44×44px *target* touch affordance where feasible; reduced motion; large numbers and currencies.

## P27 — Architecture migration (sequence matters)

| Wave | Code owners / likely files | Concrete work | Gate |
| --- | --- | --- | --- |
| **P27A — Session boundary** | `src/integrations/supabase-client.ts`, `src/app/FinanceApp.tsx`, `src/app/FinanceSettingsPage.tsx` | Create a single observable auth/session adapter; gate private routes before finance RPC mounting; safe unauthenticated and callback states, no raw RPC errors | Sign-out and cold deep-link tests pass |
| **P27B — Router/history** | `FinanceApp.tsx`, URL utilities, `vercel.json` | Central typed URL routing; bridge 17 hash aliases, handle product detail deep links and `q`; Vercel app-specific fallback; push/replace semantics; popstate focus/scroll | All legacy and new links load, Back works, API/policy routes unaffected |
| **P27C — Shell/menu** | `AppShell.tsx`, `src/ui/styles/shell.css`, layout primitives | Task-first six-item desktop nav, five-item mobile nav + visible More, contextual nav and account, compact headers | Navigability from all routes, no inaccessible secondary page |
| **P27D — Search/evidence continuity** | Activity, Ask Finance, Product Intelligence, Overview, imports | Replace direct hash writes with central links/navigation; global search labeled by actual supported scope; preserve focus/filters/evidence links | Cross-page journeys test URLs/back and keyboard |
| **P27E — Qualification** | Playwright integration tests, axe, screenshots, CI | Test synthetic populated + anonymous states at desktop/tablet/mobile; error matrix, accessibility, performance baseline | CI and visual QA pass; explicit exceptions tracked |

**Do not migrate all financial features simultaneously.** Preserve Finance services, ledger math, receipt processing and API/MCP integrations. A route state transition must not trigger a financial mutation.

### Route migration pseudocode

```text
onLocationChange:
  if pathname is known and not reserved:
      resolve path + safe typed query
  else if pathname is '/' and hash begins with a known legacy '#key':
      resolve alias, transfer allowed parameters, replace to canonical URL
  else if public server path ('/api', '/.well-known', policy):
      yield to server/normal anchor
  else:
      render Not Found route

onUserNavigation:
  validate destination with route contract
  guard unsaved financial draft when applicable
  push canonical URL and update route rendering
  announce new heading, manage focus/scroll

onPopState:
  restore route from URL (not previous React state)
  restore meaningful selection/filter/scroll
  do not mutate ledger

onAuth:
  restoring -> verify identity -> allow private RPCs
  signed-out -> redirect/render sign in with one-use return target
  signed-in -> one-use sanitize return target; remove callback artifacts
```

**Important routing constraints:**
- `window.history.pushState` alone does not emit `popstate`; the app must centralize both state and notifications, or use a mature router.
- Do not put uncontrolled auth actions into `useEffect` dependencies where StrictMode retries can duplicate writes or OAuth operations.
- Legacy hash normalizer must distinguish old app hashes from unrelated fragments; do not mistake an arbitrary `#finance-main` skip link for a route.
- Only route values are public. Account user ID, session token, service-role secret or sensitive saved finance drafts must not be placed in URLs.
- Transaction/receipt detail deep links must verify authorization server-side even when IDs are known.
- Browser history must preserve `q`, `from`, `to`, selected items and valid dynamic IDs, without accidentally navigating to an older app route.
- Direct links to policy/API routes must continue serving Vercel functions; beware broad fallback rewriting.

## Cross-surface contract decisions

**Desktop:** density-optimized. Compact fixed global header, six nav destinations, contextual subnav for currently selected task, well-structured data body with optional detail pane.

**Mobile:** task-optimized. Five bottom tabs, labeled More/account, page-based complex flows, visible transaction actions and receipt camera, no giant dashboard card mosaics.

**Progressive loading:** auth/route shell starts without loading all analytics/AI/image-processing code. Defer route-specific modules in P38; do not block the first financial overview waiting for OCR and AI libraries.

**Navigation consistency:** support direct URL, Ctrl+L copy/paste, refresh, Ctrl/Cmd-click new tab, Back/Forward, opening same product from receipts and Explore, and keyboard/focus semantics.

**No paid AI requirement:** all standard Finance tasks remain available with deterministic calculation and without ChatGPT account/subscription.

## QA plan — the exact gates, not claims

| Test | Source | Expected result |
| --- | --- | --- |
| Specification invariant | `node scripts/validate-finance-ia.mjs` | 6 desktop destinations, 5 mobile, 17 old aliases, valid query/journey references |
| Route direct-entry / reload | P27 Playwright | Every canonical path navigable after direct refresh on preview deployment |
| Browser history | P27 Playwright | Sidebar, in-content, deep detail, filters and Back/Forward agree |
| Login state | Authenticated browser fixture | No private RPC on unknown/anonymous session; no exposed `finance_initialize` permission message |
| OAuth return | Approved test identity | Sign-in from `/activity?q=...` restores filtered route, rejects external `next` |
| Sign-out | Approved test identity | Private data and cached state cleared, drafts isolated |
| Empty vs error | Synthetic fixture | Zero-record state only after successful query; failures are retryable |
| Financial safety | Existing domain tests + e2e | No double posting, preserved currencies and ledger/receipt distinction |
| P23 regression | Run existing visual audit and new auth fixture audit | Fix repeat nav contrast failures, measure mobile overflow and visual changes |
| Keyboard/screen reader | Manual and automated | Native landmarks, accessible nav links, focus restored on new destination |
| API compatibility | Production preview smoke | `/api/mcp`, OAuth discovery, `/privacy`, `/support` and `/terms` continue to work |

**Fixture security:** do not expose personal finance records in Actions artifacts, screenshots or PR descriptions. Create or import synthetic test records in isolated access-controlled test tenant and ensure clean teardown.

## Phase gating and defects

| P23 defect(s) | Must be addressed by |
| --- | --- |
| F23-01, 03, 04; F23-23, 26 | P27A–D |
| F23-24 | P26 shared contrast + P39 verification |
| F23-07, 11, 20 | P25 reference + P26 + P28 |
| F23-05, 19 | P29 |
| F23-06, 18, 27 | P30 + P38 |
| F23-08, 12 | P36 + P38 |
| F23-13, 14 | P33 |
| F23-15, 16, 17, 25 | P26 + P37 |
| F23-09, 10, 21, 22 | P38–P39 |

Do not declare an unimplemented P24 design requirement "fixed" because its document exists.

## P24 signoff checklist

- [x] Task-centered IA and responsive sitemap
- [x] Canonical route map covering all registered previous routes
- [x] Back/Forward, deep-link, auth redirect and server-route contracts
- [x] Unified private/public/loading/error semantics
- [x] 12 testable task journeys including recovery flows
- [x] Dense desktop and purposeful mobile low-fidelity wireframes
- [x] Measurable P25/P26/P27 implementation and QA handoff
- [x] Executable contracts validated by CI

**P24 outcome:** Structural design locked at specification level. **P25** selects visual language and high-fidelity reference; **P27** implements the architecture without losing legacy URLs or protected financial data.
