# P37 — Finance Release Acceptance & Evidence-Based Consolidation

Stacked from qualified P36 draft PR #31. No merge, deployment, migrations, credentials, real financial writes or human approvals.

## Authentic account-scoped review
The protected `/settings/release` route provides visible on-demand read-only Finance source checks and independent release governance. Settings and the shell link to the page. Checks use the existing overview, wealth, recurring, planning and import read RPCs **without bootstrap initialize RPC**, ledger posting, sync or account edits. A user identity is validated before and after each concurrent read; sign-out, sign-in or account replacement invalidates sampled results. No financial results are stored, exported or sent to a separate endpoint.

The model checks safe currency and integer minor units, Wealth assets−liabilities/net worth, posted savings versus valuation bridge, recurring subscription subset, transfer classification and import exception counts. Across different as-of/anchor dates the app **abstains from treating unequal totals as proof of a discrepancy**. A successful read is not evidence of production RLS/cross-user denial; independently authorized disposable negative testing is open.

## Governance and custody
- Staging, release and postrelease each return **NO_GO**, with distinct human authorization requirements. Neither browser CI nor preview provider success permits releasing money software.
- Independently controlled witness roots, signer replacement/revocation, source file hashes, real owner acceptance, physical Android/iOS/NVDA/VoiceOver, prior-state recovery and later postrelease acceptance remain open.
- Local witness leads are bounded HTTPS or SHA256 strings with human designation and date, shown **unverified**. No submission/storage, signature verification, uploader identity authority or attestation completion is claimed.
- Cross-workspace navigation provides review access to posted activity, receipts, plan, insights, merchant/products, recurring, wealth, import and classification rules. Existing operations remain subject to their original reviewed mutation controls.

## Test boundaries
Synthetic actual-component Chromium screenshots, axe, keyboard and responsive checks cannot substitute for live-account isolation, authentic bank custody, human physical-device signoff or independently signed release.

Next P38 — Independent Operator Attestation & Real-World Acceptance Evidence (NOT STARTED).
