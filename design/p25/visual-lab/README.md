# P25 Visual Lab — Instructions

**B — Signal Current is the locked Finance V2.0 identity; A/C remain available as historical comparison. No live finance data, credentials, account integration or functional transactions.** This is a browser-rendered presentation and responsive reference source for P25.

Run from repo root:

```bash
python3 -m http.server 8000
```

Open [http://localhost:8000/design/p25/visual-lab/](http://localhost:8000/design/p25/visual-lab/). The toolbar lets you select direction A/B/C, principal/alternate theme, desktop/mobile and screen. `Clean preview` hides the tool controls.

All concept screens use synthetic EUR values. The **reference dataset** is `../directions.json`; any image-generated moodboard amounts are non-authoritative.

Direct-link examples:

- `?direction=a&device=desktop&screen=home&mode=default` — A desktop Home.
- `?direction=b&device=desktop&screen=activity&mode=default` — B dark Activity.
- `?direction=c&device=mobile&screen=plan&mode=default` — C mobile Budget.
- `?direction=a&device=mobile&screen=states&mode=alternate` — A dark mobile auth/error states.

`npm run validate:ia` validates P24 routing; it does not check P25 visuals. For screenshots, accessibility and overflow checks:

```bash
npm install --no-save --no-package-lock playwright @axe-core/playwright
npx playwright install chromium
node scripts/capture-finance-p25.mjs
```

The CI workflow `.github/workflows/finance-p25-visual-qa.yml` captures 3 concepts × 2 visual themes × 8 views (4 desktop and 4 mobile), plus 6 narrow-width stress views. It uploads `finance-p25-concept-visual-qa` containing PNGs, a gallery and machine-readable issues.

**Screen fidelity limitations:** Mockup controls are illustrative and do not simulate backend actions; they intentionally do not make remote requests. The color checker is automated and cannot certify screen-reader navigation, keyboard actions or authenticated financial workflows. The user has explicitly approved B — Signal Current. Its selection, screenshot manifest and locked tokens are in `../selection.json`, `../signal-current-reference-manifest.json` and `../signal-current.tokens.json`. Production implementation still requires P26 onward.
