# P27 — Signal Current App Shell, Canonical Routing & Session Boundary

**Status:** Implemented; release subject to GitHub CI, browser tests, and production deployment verification.  
**Product:** THIEPN Finance, `finance.thiepn.dev`.  
**Authoritative contracts:** [P24 IA](P24_INFORMATION_ARCHITECTURE.md), [P25L Lock](P25L_SIGNAL_CURRENT_LOCK.md), [P26 Components](P26_SIGNAL_CURRENT_DESIGN_SYSTEM.md).

## 1. What changed in the real application

- `src/app/FinanceAppV2.tsx` is the live app, re-exported from the old `FinanceApp.tsx` entry. This is **not** the synthetic P26 preview.
- Six compact desktop destinations **Home, Activity, Plan, Explore, Receipts, Wealth**, plus a contextual list for the current section.
- Five mobile tabs **Home, Activity, Scan, Plan, Explore**, with an explicitly labelled topbar **More** menu exposing Receipts, Accounts & wealth, Imports, Rules, Ask and Settings & account. A dark/light appearance toggle remains visible on mobile.
- User-initiated app navigation now uses canonical pathname routes (`history.pushState`) and a single route state; Back/Forward uses `popstate`. Legacy hash URLs are normalized using `replaceState` without creating extra history entries.
- The P26 Signal Current component/CSS layer is mounted on the real app shell. Existing detailed Finance pages continue using the legacy `f-*` components but inherit a *scoped* dark/light Signal Current palette; they are progressively redesigned in P28–P37.

## 2. URL contract

`src/app/finance-router.ts` implements the 24 P24 route definitions, all **17 legacy aliases**, and dynamic product/transaction/account/receipt route parsing. Highlights:

| Old deep link | New canonical destination |
| --- | --- |
| `/#overview` | `/` |
| `/#activity?q=REWE` | `/activity?q=REWE` |
| `/#budget` | `/plan` |
| `/#insights` | `/explore` |
| `/#scan` | `/receipts/capture` |
| `/#products?product=SKU_ID` | `/explore/products/SKU_ID` |
| `/#accounts` | `/wealth/accounts` |
| `/#settings` | `/settings` |

The Activity search accepts and updates `/activity?q=...`, including browser Back/Forward restoration of the query.

**Public/server paths** `/api/*`, `/.well-known/*`, `/privacy`, `/terms`, `/support`, and assets are not intercepted by Vercel's restricted SPA rewrite. Nested app routes refresh to `/index.html`; old policy/MCP/API functions continue serving their original routes.

**Dynamic detail routes recognized but not yet fully implemented:** `/activity/transaction/:id`, `/receipts/:id`, and `/wealth/accounts/:id` are authenticated and show a clearly identified *integration pending* state. They never fabricate balances or silently access different records. The full detail workspaces land in P29/P30/P35. Product detail routes reuse the existing Product Intelligence detail screen.

## 3. Authentication boundary

`src/app/useFinanceSession.ts` is the single entry gate:

1. Create/reuse the existing singleton browser client with the **public Supabase publishable key**; no service key added.
2. Restore the session via Supabase Auth; **verify the user with `getUser()`**. Private pages and their Finance RPC effects do not mount until verification succeeds.
3. Distinguish **restoring**, **verified**, **signed out**, **backend unconfigured**, and **auth temporarily unavailable**. Never label backend failures as empty account data.
4. React synchronously to `SIGNED_OUT` by hiding all private pages; clear cached `finance_initialize` so a later sign-in cannot inherit the previous user's initialization promise.
5. Store the requested original private path in **same-origin sessionStorage**, validate it against the canonical router, use it **once** after verified sign-in, and expire the intent after 10 minutes.
6. Maintain the **existing production OAuth/email redirect** `/#overview` for backwards compatibility with the currently approved redirect allowlist. Do not claim `/auth/callback` is approved in Core until the Auth URL Configuration has been verified.
7. Preserve `?code=` and Supabase auth fragments until the authentication client has processed them; strip them after verified login, never before.
8. On sign-out, clear the one-use return intent and remove private Finance pages; device-local receipt drafts are not silently deleted.

Supabase Auth's `onAuthStateChange` callback intentionally **does not await auth calls** while holding its internal lock. Verification is deferred to a microtask and stale results are ignored.

**Security boundary:** frontend gating improves UX and prevents anonymous private RPC attempts, but backend Finance authorization still depends on existing THIEPN Core row ownership/RLS/RPC checks. The browser gate is not a substitute for server-side access control.

## 4. Account UX

`FinanceAuthPage.tsx` provides clear sign-in/connection/recovery states, Google and email links, privacy/support references, and no decorative/fake financial totals. Errors shown to users are generic rather than raw `finance_initialize` or RPC details.

The current Finance app authenticates through its already configured Supabase client. **P27 does not independently certify THIEPN-wide SSO** or Supabase Auth redirect allowlist additions; this must be tested with an authorized real account before marking a cross-product sign-in requirement complete.

## 5. Actual screen behavior

- Legacy feature pages (**Overview, Activity, Plan, Explore, Receipts, Wealth, Rules, Imports, Ask**) are still wired to their existing real backend/services.
- No financial schema, ledger posting logic, receipt evidence, core gateways, or private storage permissions changed.
- Canonical `/activity/new` exposes the existing transaction composer as a protected full page; the inline legacy entry remains until P29 consolidates transaction editing.
- Search is explicitly scoped to **Activity transactions and receipts**; future federated search is a separate feature.
- `FinanceV2Shell` uses semantic navigation links supporting copy URL, open in new tab, keyboard focus, reduced motion, real browser history, and route title updates. Secondary mobile destinations are accessible in **More**.

## 6. Tests and QA gates

Run:
```sh
npm run validate:ia
npm run validate:p25l
npm run validate:p26
npm run validate:p27
npm run typecheck
npm test
npm run build
```

P27 static and unit tests validate:
- All P24 routes, all 17 hash aliases and supported query mappings.
- Sanitized same-origin private redirect targets, and rejection of external, public, reserved and malformed URLs.
- Preservation of OAuth credentials until Supabase session restoration.
- Restricted Vercel rewrite patterns cannot shadow OAuth discovery, API/MCP, privacy, terms, support and assets.
- Auth gate exists before financial pages mount.
- P26 synthetic showcase remains excluded from production.

The **Finance P27 Navigation and Auth QA** action runs Chromium with a dummy invalid Supabase host and **no user credentials**, verifies direct paths and legacy deep links redirect to the sign-in gate, rejects external return URLs, checks mobile/narrow overflow and axe A/AA rules, and screenshots the dedicated auth screen. It also exercises the **real P27 shell** separately through the development-only synthetic entry `/p27-shell-preview.html`: six-task desktop navigation, mobile tab access, More, Escape, and theme toggle.

**Unverified until real-account QA:** Provider redirect acceptance, real device OAuth/OTP completion, user-switch isolation on shared browsers, exact detail authorization errors, browser history scroll restoration in complex legacy pages, ledger posting and receipt upload paths, and cross-product SSO. Do not mistake dummy-host test results for production verification.

## 7. Rollout and next phases

This phase activates the Signal Current **app shell and session gate**. Most existing page bodies are visually bridged but not yet rewritten. The future order remains:

- **P28:** Home dashboard, numerical hierarchy and true source distinction.
- **P29:** Activity ledger search, transaction detail/editor and direct-linked financial evidence.
- **P30:** Receipt camera, private drafts, image/OCR correction and matching.
- **P31–P37:** Plan/Explore/Wealth/imports/AI improvement.
- **P38–P39:** Performance, accessible mobile workflow and real-device authenticated QA.
- **P40:** Stable V2.0 release after verified production evidence.

**P27 is a structural migration**, not a claim that all Finance pages are visually finished.
