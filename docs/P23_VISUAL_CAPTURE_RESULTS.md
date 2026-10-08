# P23 — Browser Capture Findings (Anonymous Baseline)

**Verified run:** [Finance P23 Visual Audit, 2026-10-08](https://github.com/thiepn/finance/actions/runs/37755951438)  
**Artifact:** `finance-p23-anonymous-baseline` (Actions artifact, retention 7 days).  
**Environment:** Production `https://finance.thiepn.dev`, newly created unauthenticated browser profiles; viewport sizes 1440×900 and 390×844.  
**Visual review:** Actual PNGs extracted and inspected (not mockups).

## Automated checks: observed results

| Check | Observed result | Interpretation |
| --- | --- | --- |
| Light screenshots | 34 of 34 captured | 17 routes × desktop/mobile |
| Dark screenshots | 12 captured | Six critical routes × desktop/mobile |
| Horizontal overflow | 0 / 34 tested light screens | Good baseline; not a guarantee at 320px, with long data, or every open state |
| Uncaught JavaScript page errors | 0 | No uncaught exceptions in anonymous routes |
| Unknown route or invisible main | 0 | All registered destinations render |
| Axe accessibility | **12 color-contrast violation instances** across six audited routes × two viewports | Repeated failure class, NOT 12 distinct WCAG issues |
| Affected contrast nodes | **74 total repeated-node observations** | Usually desktop nav section headings and mobile inactive tab labels |

Axe reported `serious` `color-contrast` failures. Sample selectors: `.f-nav-group > .f-nav-group__label` (desktop), `.f-mobile-nav__item > span:nth-child(2)` (mobile). These labels are styled in small fonts with low-contrast tertiary text. This is a **confirmed WCAG AA problem in the audited light-theme public surfaces**, not an acceptable decorative styling choice. Dark-mode automated contrast was not in this run.

## Screenshot-backed defects

### F23-23 — Authentication failures masquerade as application data (P1)

**Activity, mobile and desktop:** after an anonymous visit, the Activity list shows:

> Finance initialization failed: permission denied for function finance_initialize

**Merchants desktop:** error text includes:

> Finance getMerchants: permission denied for function finance_get_merchants

Immediately afterward, the directory also says `No merchants found.` although the request failed. This is a false empty state: an authentication error is not a legitimately empty merchant database.

**Fix:** a central auth gate and a coherent `Sign in` action; never surface raw Supabase function names; distinguish unauthenticated, forbidden, network failure and genuine empty data. **Owner P24/P27** (do not wait for cosmetic redesign).

Evidence: `screenshots/activity-desktop-light.png`, `screenshots/activity-mobile-light.png`, `screenshots/merchants-desktop-light.png`.

### F23-24 — Contrast failure concentrated in navigation (P1)

Light theme: small grey sidebar group headings and inactive mobile nav labels fail axe contrast. It recurs consistently on Home, Activity, Scan, Receipts, Insights and Budget. Updating the shared navigation tokens and font treatment should eliminate the repeated root cause rather than applying per-page fixes. **Owner P26**, retest at P39.

Evidence: `report.json` -> `observations[*].axe`; reviewed Home/Activity screenshots.

### F23-25 — Ask Finance is unhelpfully verbose in the signed-out state (P2)

Mobile shows internal `P21 · Native Finance AI` metadata, large explanatory introduction, a disabled question composer, multi-line trust notes, and four capability cards. There is no nearby sign-in action. The static cards consume substantial scroll length before helping a user do anything.

**Fix:** no implementation-phase labels; remove promotional prose; inline evidence-based finance Q&A only after access is available, with a sign-in/return route. **Owner P37**.

Evidence: `screenshots/ask-mobile-light.png`.

### F23-26 — Signed-out Home wastes the first screen (P1)

Desktop and mobile Home display a centrally placed authentication card surrounded by mostly empty space. It explains the session requirement but provides no way to sign in; however, sign-in controls exist inside the Settings route, which is not on the mobile bottom navigation. A new user cannot discover an appropriate next step from the start page.

**Fix:** explicit session landing with sign-in button, account entrypoint and restore-to-last-intended-route behavior. **Owner P24/P27/P36**.

Evidence: `screenshots/overview-desktop-light.png`, `screenshots/overview-mobile-light.png`.

### F23-27 — Scan repeats an error without providing a resolution (P2)

Mobile Scan shows a red `Sign in to THIEPN Finance before capturing receipts.` card followed by a second card saying a signed-in account is required. Neither provides an authentication action. The only obvious action is `Receipt review`, which is not useful without access.

**Fix:** one clear signed-out state with a primary authentication action; only show capture controls after successful auth. **Owner P30**.

Evidence: `screenshots/scan-mobile-light.png`.

## Qualitative visual observations from the actual renders

- The shared shell looks coherent across desktop and mobile; active nav states and spacing are consistent.
- The visual hierarchy is dominated by conventional white/grey rounded card containers, violet accents and explanatory copy. It looks more like a generic web dashboard than a financial instrument. This is a design assessment, not a measured benchmark score.
- On desktop, the left sidebar consumes a fixed 248px even when the app has no accessible data; the top bar has an always-visible AI entrypoint.
- Mobile tabs are persistent and recognizable. The distinctive raised center Scan action is clear, but navigation under sign-out is unproductive.
- The dark theme is visually consistent, but screenshots alone cannot certify text contrast, accessibility, or readability with actual charts and dense transactions.
- Full-page mobile screenshot composites can show the *fixed* bottom nav midway through a tall document capture. This does not alone prove a real scroll overlay defect.

**The quality of populated finance dashboards, graphs, transaction tables and personal data workflows remains UNRATED** until signed-in fixture screenshots are captured and reviewed. This report must not be represented as authenticated production qualification.

## Visible screenshot annotations

The downloaded annotated review package includes numbered notes for:
- `overview-desktop-light`: overloaded navigation, dead-end session card, misleading search scope.
- `overview-mobile-light`: dead-end sign-in card and hidden secondary navigation.
- `activity-mobile-light`: raw SQL permission error and title-space usage.
- `scan-mobile-light`: duplicated signed-out warnings and disjoint receipt review.
- `ask-mobile-light`: phase label, explanatory wall, disabled composer.
- `merchants-desktop-light`: raw RPC error and false "zero merchants" state.

Annotation boxes mark **visible interface regions** only; they are not user-testing observations.

## Immediate P24 decisions

1. Signed-out state is a first-class information-architecture node with a visible sign-in action on every private page. Not an unhandled backend exception.
2. One router controls all destination updates, URLs, history, focus and sign-in return navigation.
3. Mobile bottom navigation remains visible but access to profile, accounts and recovery must not be hidden behind unusable anonymous pages.
4. Financial page headers must be compact and functional; eliminate internal phase badges and redundant explanatory content.
5. Shared accessibility tokens must pass light/dark contrast checks, including nav labels, disabled-looking badges and low-emphasis text.
6. P25 high-fidelity design direction must be judged with **populated financial fixtures**, not only blank unauthenticated screens.
7. After P24, quality review must cover authenticated transactions and bank imports separately, without uploading private financial data to public Actions artifacts.

## Final status

**P23 source audit: complete. Anonymous public visual baseline: captured, analyzed and attached. Authenticated UX and physical-device tests: pending and correctly excluded from completion claims.**

Next phase: **P24 — Information Architecture & Interaction Blueprint**, with F23-01 through F23-09 and F23-23 through F23-27 as high-priority inputs.
