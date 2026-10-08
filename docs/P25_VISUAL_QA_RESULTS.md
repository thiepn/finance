# P25 — Visual QA Results and Selection Readiness

**Status:** Prototype QA passed; direction selection is pending.  
**Verified visual QA run:** [Finance P25 Concept Visual QA (2026-10-08)](https://github.com/thiepn/finance/actions/runs/37764764057)  
**Scope:** Fully synthetic static design mockups; **no authenticated financial data or ledger operations**.

## Results

| Dimension | Measured evidence |
| --- | --- |
| Visual directions | A Ledger Atelier / B Signal Current / C Editor's Ledger |
| Primary desktop screens each | Home / Activity / Receipt review / States |
| Primary mobile screens each | Home / Scan / Plan / States |
| Theme modes | Primary and alternate (light + dark) for each concept |
| Standard screenshots | 3 candidates × 2 themes × 2 devices × 4 screens = **48** |
| Narrow viewport tests | 3 candidates × (320px mobile Home + 1024px desktop Activity) = **6** |
| **Total captures** | **54 / 54** |
| Browser smoke failures | **0** |
| Horizontal page-overflow violations | **0** (in tested viewports) |
| Axe tagged WCAG A/AA violation instances | **0** on tested static mockups |

### Fixes incorporated during P25

- Corrected mobile bottom navigation erroneously appearing on desktop.
- Corrected low-contrast navigation labels, warning values and merchant monograms.
- Corrected alternate light/dark receipt-detail surfaces and user-avatar text contrast.
- Added explicit layout divergence: B has an attention-first desktop cockpit and reversed receipt review panel order; C has unboxed ruled typography-led sections rather than a recolored card dashboard.
- Captured mobile viewport screenshots at actual phone-sized frames rather than misleading full-page screenshots with mid-document sticky navigation.
- Added visually specified sign-in, empty, offline and receipt processing states.

Automated checks do **not** establish: human task completion, focus restoration, fully implemented keyboard behavior, screen-reader usability, color suitability under all visual conditions, receipt OCR correctness, accessibility of a real camera, authenticated workflows, or superiority to competitors. These belong to P27–P39. No numerical subjective visual rating is asserted as a test result.

## Inspection order

1. Compare the three generated **concept boards** for overall product character; they are illustrations, not fidelity targets.
2. Review the 54 browser screenshots: open the screenshot artifact's `index.html`, or locally open `design/p25/visual-lab/index.html` and switch between the candidates.
3. Compare desktop Activity and Receipt Review **before** choosing a homepage. These tasks determine whether the design holds up after data becomes dense.
4. Review mobile Scan, Plan and the account/error states in both modes.
5. Select A, B, C, or explicitly request a hybrid and identify which features to borrow.

## Candidate conclusions (qualitative)

| Criterion | A — Ledger Atelier | B — Signal Current | C — Editor's Ledger |
| --- | --- | --- | --- |
| Financial tone | Quiet premium | High-contrast active | Editorial precise |
| Data density | Medium | Medium | High desktop / comfortable mobile |
| Primary differentiator | Warm trust and calm | Dark cockpit & context | Unboxed ruled ledger |
| Potential issue | Conventional dashboard structure | Accent/card overload | Can feel austere |
| Best reason to choose | Broad daily approachability | Bold dark-first character | Strong non-SaaS identity |

**Provisional preference: C**, because it most directly avoids the user's known dislike of oversized headline-and-card SaaS templates; however, final approval must come from the user. If asked to change a color or component, do not quietly select a direction or rename an existing design lock.

## P25 completion semantics

**Exploration (code, render, QA, comparison): complete.**  
**Reference lock: pending explicit choice.**

After selection, perform `P25L — Final Reference Lock`: record the chosen `id`, approve both modes and all eight screen families, export exact final PNG fixtures, perform remaining manual UX review, and only then authorize P26 implementation.

No production Finance UI change is associated with this audit/design phase. The synthetic mockups must not be deployed as a replacement for the real application without separate implementation and authentication qualification.
