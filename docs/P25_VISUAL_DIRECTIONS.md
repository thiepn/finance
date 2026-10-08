# P25 — Three Visual Directions and Design Selection

**Status:** THREE CANDIDATES DELIVERED. **No visual direction is locked until the user selects it.**  
**Product:** THIEPN Finance V2.0; **Phase:** P25; **Date:** 2026-10-08.  
**Boundary:** Design-only. The live React application, ledger and THIEPN Core authentication are intentionally unchanged.

## What this phase delivers

P25 uses **three completely explicit visual directions**, not simply three accent color options. The screenshot implementation shares the same testable financial fixture and P24 navigation obligations, but direction B changes primary information placement and direction C removes card-wall styling. Each includes:

1. Desktop **Home**, dense **Activity**, two-column **Receipt review**, and a **system-state reference** (sign-in, first-run, offline, processing).
2. Mobile **Home**, native-minded **Scan**, allocation-focused **Plan**, and **recovery state** reference.
3. Both a principal and inverse **light/dark mode**.
4. Consistent factual synthetic figures (not real-account data).
5. Static browser-rendered HTML/CSS to check text, layout and contrast at real viewports, beyond generated imagery.
6. Automation capturing **48 concept screens** plus six narrow-width stress captures, with axe accessibility results and page-overflow checks.

Files:
- [Design direction contracts](../design/p25/directions.json)
- [Actual browser-rendered concept gallery](../design/p25/visual-lab/index.html)
- [Concept CSS](../design/p25/visual-lab/visual-lab.css)
- [Screenshot runner](../scripts/capture-finance-p25.mjs)
- [Screenshot workflow](../.github/workflows/finance-p25-visual-qa.yml)

**Important distinction:** AI-rendered moodboards are inspirational illustrations only. The **HTML/CSS gallery and `directions.json`** are the evidence-grade design comparators. The gallery is not a working finance application and none of its controls writes to a backend.

## A — Ledger Atelier

**Concept:** Calm premium money management, warm off-white paper, soft evergreen actions, copper secondary color. Visual expression of trust, routine and financial attention without sterile spreadsheet aesthetics.

| Axis | Requirement |
| --- | --- |
| Primary theme | Warm cream light |
| Alternate | Deep spruce dark |
| Core colors | `#f8f7f2` paper, `#fffdfa` surface, `#176653` evergreen, `#b98843` copper |
| Typeface | Modern system sans; sparing Georgia for primary monetary highlights |
| Surfaces | Selective light cards with thin borders and minimal shadow |
| Navigation | Compact cream sidebar, evergreen active item |
| Desktop | Four KPI cells, wide spending chart, right-side attention, transaction table and budget side |
| Mobile | Very readable money summary, semantic task rows, restrained receipt capture |
| Chart grammar | Evergreen posted line, dashed copper budget pace, accessible data table later |
| Motion | 120–180ms opacity/translate only; no perpetual animation |
| Risks | Too conventional if every financial object becomes a card; must protect data density |

**A should win if:** a quiet, accessible, familiar consumer-finance experience is the top priority, and card chrome is heavily reduced during actual P26/P28 implementation.

## B — Signal Current

**Concept:** Distinctive, dark-first visual instrument for actively tracking money, bills, subscriptions and anomalies. Deep indigo/navy, confident cyan actions and restrained coral warning emphasis.

| Axis | Requirement |
| --- | --- |
| Primary theme | Deep midnight |
| Alternate | Clean ice-blue light |
| Core colors | `#0a1426` backdrop, `#12233b` panels, `#43d6da` cyan, `#fa9279` coral |
| Typeface | Precise compact sans, tabular numerals |
| Surfaces | Structured panels with strong contrasting headings, thin accent strokes |
| Navigation | Dark utility rail, deliberate bright selected state |
| Desktop Home | Distinct attention-first control cockpit, large chart to its right, budget before activity below |
| Receipt review | Editable evidence interpretation **first**, source image adjacent |
| Mobile | Emphatic money states, camera action and category-level progress |
| Chart grammar | Cyan actuals, coral forecast, grid anchored to numeric labels |
| Motion | 160–200ms context changes with reduced-motion override |
| Risks | May become a generic neon fintech/gaming UI; needs discipline around accent use and card quantity |

**B should win if:** a strong dark-first product personality and proactive money-management UI matters most. It must be judged on information clarity, not saturation alone.

## C — Editor's Ledger

**Concept:** A sophisticated financial register. Swiss/editorial typographic discipline, rule-divided spaces, exceptionally legible ledger entries and deliberately non-SaaS structure. Calm paper, cobalt navigation, rust warnings.

| Axis | Requirement |
| --- | --- |
| Primary theme | Editorial paper |
| Alternate | Graphite/ink dark |
| Core colors | `#fcfcf8` page, `#f7f7f0` nav, `#244bc7` cobalt, `#bb5a49` rust |
| Typeface | Neutral interface sans + restrained small editorial serif headings |
| Surfaces | Zero-shadow, mostly unboxed ruled sections; 2px radius where needed |
| Navigation | Slim six-task index, contextual subnavigation |
| Desktop | Editorial KPI strip, clean chart+attention division, high-density ledger rows |
| Receipt review | Source-evidence workbench with simultaneous original and correction fields |
| Mobile | Money and daily tasks first; full-page scanner and category allocation rows |
| Chart grammar | Direct labels, fine grid, minimal fill, table counterpart |
| Motion | 90–150ms subtle confirmation/motion, no decorative lift effects |
| Risks | Can feel austere to casual users; mobile should retain comfortable spacing/touch targets |

**C should win if:** differentiation from generic SaaS and excellent dense financial interaction is the main priority. This best matches the requirement to avoid oversized hero text, repetitive card grids and chat-style finance software.

## Fair evaluation

P25 makes a **non-validated expert design judgment**, not a measured superiority claim over Copilot, Monarch or Actual Budget. Do not fabricate a score from subjective intuition; rank the candidates *after* reviewing their rendered screenshots under the same fixture.

### Weighted rubric (100 points)

| Dimension | Weight | Evaluation prompt |
| --- | ---: | --- |
| Financial meaning and trust | 25 | Are posted/cash/budget/forecast/receipt values distinguishable? |
| Daily workflow efficiency | 20 | How quickly can one review, post, filter, scan and reconcile? |
| Information density and hierarchy | 15 | Is desktop useful without crowded mobile? |
| Distinctive non-SaaS identity | 15 | Does it avoid a big welcome hero and uniform card walls? |
| Mobile usability | 15 | Are priority actions and secondary destinations practical? |
| Accessibility and robustness | 10 | Do tested contrasts and viewports pass; are states comprehensible? |

No mockup can prove task times, real-account behavior or screen reader access. Those remain for P27–P39.

**Provisional design preference (not a lock): C** because it establishes the clearest differentiation from standard dashboard layouts, while keeping the P24 information architecture and receipt evidence intact. A is the calmer mainstream alternative; B is most expressive/dark-first. The user chooses after seeing all three.

### Non-negotiable failures

Reject a candidate or revise its specification if it:
- Uses huge one-sentence hero copy before financial utility.
- Replaces finance actions with an AI prompt entry point.
- Hides ledger, account, receipt or money-source provenance.
- Distorts category breakdowns or makes projected values look posted.
- Cannot scale to large transaction tables or a narrow phone viewport.
- Uses color without text/icons to convey negative/positive/unknown.
- Uses gradient/radius/shadow as a substitute for information architecture.
- Makes secondary mobile navigation undiscoverable.

## Data consistency

`design/p25/directions.json.shared.fixture` is authoritative for the mockups:
- Available-to-spend: **€1,240.50**, separate from unspent monthly budget.
- Posted spend: **€862.40** of **€1,500.00** planned; **€637.60** unspent.
- Cash position: **€2,870.30**, upcoming obligations **€745.00**.
- Six budget categories sum **€1,500.00** planned and **€862.40** spent.
- Receipt mock: €42.35; **receipt evidence never creates a second ledger expense**.

The original image-generated concept boards may include illustrative unverified totals or imaginative branding. Do not treat them as financial truth or as a pixel-locked implementation target.

## How to inspect the HTML design lab

From repository root, run:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/design/p25/visual-lab/`.

Change **Direction**, **Theme**, **Device** and **Screen** from the design-lab toolbar. Choose **Clean preview** for an uncluttered comparison. The screen-selector deliberately limits desktop to Home/Activity/Receipt/States and mobile to Home/Scan/Plan/States, consistent with P24's selection brief.

Screenshots in GitHub Actions: open the `Finance P25 Concept Visual QA` run and download `finance-p25-concept-visual-qa`; open `index.html`. **Do not upload personal financial data into the fixture or screenshot artifact.**

## Selection and final reference lock

One direction selection must be explicit. Once selected, perform a **P25L Reference Lock** (separate follow-up, not assumed):
1. Record selected `id`, user decision and lock commit in `design/p25/selection.json`.
2. Produce final corrected desktop and mobile **pixel-reference PNGs**, shared fixtures and exact visual tokens for the selected direction.
3. Compare all approved reference screens and ensure both light/dark axe checks pass, with any remaining human QA limitations written down.
4. Commit/PR the frozen specification. Record deliberate exceptions only with rationale.
5. Authorize P26 design system development and P27 navigation implementation against the locked target.

**P25 is not "fully reference-locked" until selection occurs.** The design exploration and QA artifacts can be finalized and merged without making an unwanted design choice.
