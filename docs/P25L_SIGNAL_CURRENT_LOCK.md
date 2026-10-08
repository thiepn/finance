# P25L — Official Finance V2.0 Visual Reference Lock

**Decision:** **B — Signal Current**, selected explicitly by the project owner on **8 October 2026**.  
**Status:** Visual identity **locked**; production visual implementation still belongs to P26–P37.  
**Baseline:** P25 [comparison](P25_VISUAL_DIRECTIONS.md), [QA results](P25_VISUAL_QA_RESULTS.md), and P24 [information architecture](P24_INFORMATION_ARCHITECTURE.md).  
**Contract:** [selection.json](../design/p25/selection.json), [locked tokens](../design/p25/signal-current.tokens.json), [reference screenshot hashes](../design/p25/signal-current-reference-manifest.json), [visual lab](../design/p25/visual-lab/index.html).

## 1. Final selection

Signal Current is the **one approved direction**. Prior concepts A and C remain historical comparisons, not alternative implementation targets.

The user approved the existing B design, without a requested hybrid or additional changes. Preserve B's authentic dark-first character rather than silently borrowing a different candidate's structural identity.

### Design DNA

- **Dark-first financial control interface** — deep midnight navy `#0a1426`, panel `#12233b`, sidebar `#0e1b31`.
- **Cyan action and actual financial data** — `#43d6da` on dark. **Coral** `#fa9279` communicates upcoming/important secondary signals, not decorative noise.
- **Light alternative** — ice paper `#f2f7fc`, white surface, cobalt-blue `#135ab3`, restrained rust `#b94f3d`.
- **Numbers lead.** Tabular numerals, explicit currency, dates, posted vs planned provenance, clear credit/debit direction.
- **Compact headings**, never oversized generic welcome statements, unrelated hero banners or a chat prompt dominating the home screen.
- **Dense desktop ledger** and an approachable mobile task experience. It must look like finance software, not an AI dashboard.
- **Discipline with panels.** The P25 illustration uses surfaces to separate financial functions. P26 must avoid converting every small section into a rounded card; chart, ledger and receipt areas earn their own surfaces when boundaries aid comprehension.
- **One strong primary action** per page. Cyan remains a meaningful interaction color; do not create neon gradients, universal glow effects, repeated pulsing accents or default elevation hover.
- **Forecast and supporting evidence are not ledger postings.** Financial correctness outranks aesthetic simplification.

## 2. Page reference lock

| Target viewport | Screen | Locked content and behavior |
| --- | --- | --- |
| 1440×900 | Home | Four financial numbers; attention-first panel left, spending-pace analytical chart right, budget ahead of recent activity |
| 1440×900 | Activity | Filtered financial ledger first; dense rows; stable details at right; search and actions never obscure table |
| 1440×900 | Receipt Review | Editable extracted values and explicit match action first, full source receipt alongside; receipt never double-posts |
| 1440×900 | System states | Signed-out, genuinely empty, offline and receipt processing are legible and recoverable |
| 390×844 | Home | Available to spend first; then accounts/upcoming, spending pace, unresolved issues and activity |
| 390×844 | Scan | Full camera/picker region, obvious shutter, page thumbnails, privacy and upload/review control |
| 390×844 | Plan | Spend/remaining amounts and allocation rows; Budget / Goals / Recurring hierarchy |
| 390×844 | System states | Clear sign-in, recovery and no-data affordances, accessible with one hand |
| 1024×768 / 320×640 | Activity / Home stress | No unintended overflow; content remains visible and usable |

These **eight screen families in two themes plus two stress views** are frozen as source-and-pixel reference specimens. They are not completed application pages. Detailed interaction contracts and routing remain with P24.

## 3. Locked palettes

| Semantic role | Dark primary | Light alternative |
| --- | --- | --- |
| Page | `#0a1426` | `#f2f7fc` |
| Panel | `#12233b` | `#ffffff` |
| Sidebar | `#0e1b31` | `#e7f0fa` |
| Main text | `#f0f7ff` | `#182c49` |
| Secondary text | `#b0c3d7` | `#546982` |
| Divider | `#30465f` | `#c8d6e5` |
| Interactive accent | `#43d6da` | `#135ab3` |
| Accent text | `#081a25` | `#ffffff` |
| Secondary signal | `#fa9279` | `#b94f3d` |
| Positive | `#65e4ba` | `#0a7663` |
| Negative | `#ff8c88` | `#b33d43` |
| Warning | `#ffbb82` | `#a64b35` |

**WCAG contrast:** validation in CI checks normal-text/foreground combinations against 4.5:1 and appropriate button contrasts. This is a token-only gate, not a guarantee that all realized UI combinations pass WCAG. Real implementation requires axe **and** manual accessibility validation.

### Typography and geometry

- UI: system/Inter-style precise sans, no external font files in repository.
- Money: `font-variant-numeric: tabular-nums lining-nums`.
- Desktop title about 24px, mobile about 23px; compact and finance-native.
- Core panel radius 11px, controls 6px; no giant pill shapes or 30px corner style.
- Sidebar about 205px in reference; actual breakpoints refined at P26–P27.
- Motion 120–200ms only for feedback and controlled route interactions; reduced-motion respected.

## 4. Locked references and reproducibility

**Verified screenshot run:** [P25 browser QA](https://github.com/thiepn/finance/actions/runs/37765096582) on source commit `cd86af19b39f549fba54eb84dbeab21834cc2c32`, captured **54** concept screenshots with **0** reported overflow/smoke failures and **0** automated axe violations. Selected B subset: **18 exact PNGs** (16 regular screens + 2 stress).

The reference filenames and SHA-256 hashes are in [signal-current-reference-manifest.json](../design/p25/signal-current-reference-manifest.json).

**Asset pinning complete:** [P25L Reference Freeze run](https://github.com/thiepn/finance/actions/runs/37767894681) successfully verified all 18 selected PNG SHA-256 hashes and committed the files to [`design/p25/locked-references/`](../design/p25/locked-references). The exact screenshots are now version-controlled in the repository, not dependent on the temporary original Actions artifact. Pinning was performed in a separate hash-checked workflow so unreviewed binary assets were never silently substituted.

**The generated concept boards** are visual inspiration only and may contain illegible text or invented totals. They are **not** the frozen implementation target; only the browser-rendered synthetic data/screens and the design contracts are authoritative.

## 5. Guardrails for P26 — Design System

1. Put P25 tokens into production **behind a migration/feature flag**; avoid half-dark/half-violet UI across pages.
2. Build composable semantic financial primitives: money amount and source, attention row, compact period picker, dense ledger, receipt comparison pane, financial data states.
3. Retain clear tables, numeric alignment and restrained panels: a card-heavy neon clone is a regression.
4. Match dark **and** light variants. A dark-only implementation does not satisfy this lock.
5. Never swap the existing ledger, user isolation or receipt matching logic simply to achieve a screenshot.
6. Keep the mobile bottom bar / More menu from P24; overlays must not swallow Back or focus.
7. Compare actual rendered app screens to pinned references at desktop/mobile, plus 320px and 1024px stress viewports.
8. Test first-use, signed-out, network error and source-freshness states—not only populated happy paths.
9. No pretense that static mockup buttons, a simulated camera or dummy balances are live functionality.

## 6. What happens next

**P26** constructs the actual Signal Current design tokens, primitives and visual test infrastructure. **P27** migrates navigation/auth routes to P24. **P28–P37** migrate each finance experience. **P38–P40** qualify and release the fully redesigned V2.

P25L is a **design reference approval and freeze**, not a statement that Finance has already been redesigned or deployed. The real account, device accessibility, performance, latency, and end-to-end financial journeys must still be tested.
