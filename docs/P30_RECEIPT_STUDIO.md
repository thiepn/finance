# P30 — Signal Current Receipt Studio

**Status:** Implemented in a Pull Request; production release gated by CI, browser review, and authenticated real-account QA.

## Scope and delivered workflows

| User workflow | Real implementation | Data-integrity constraint |
| --- | --- | --- |
| Receipt inbox | `ReceiptStudioInbox.tsx` consumes `receiptMatching.getDashboard(80)` and shows an evidence-oriented list, four counts, six task filters, and stable direct links. | A receipt **does not** imply another posted transaction. Queue loading errors are never translated into an empty set. |
| Receipt review | `/receipts/:receiptId` mounts `ReceiptStudioDetail.tsx`, loading existing `receiptMatching.getWorkspace(receiptId)` and `finance_get_receipt_capture` independently. | Existing records are displayed without invented OCR values. Unsupported edits are labelled read-only, not exposed as nonfunctional controls. |
| Original evidence | User invokes `createPreviewUrl(storagePath, 120)` against the authenticated `finance-receipts` bucket for each registered private page. Image previews and new-tab PDFs are accessible while links are valid. | URLs are short-lived; they are not stored in localStorage or listed in public receipt indexes. The receipt page may be used even where original evidence is absent. |
| Candidate matching | Shows existing server suggestions, confidence, scores, amount, date, merchant and account. User explicitly confirms an exact positive minor-unit amount, rejects, or unlinks. | **Never** calls `refreshReceipt(..., true)`, and does not call ledger posting in a receipt match. Confirm amounts must not exceed remaining receipt and matchable transaction values. |
| Candidate discovery | `refreshReceipt(receiptId, false)` refreshes suggestions only; no implicit automatic confirmation. | Server remains authoritative for matching and allocation/reconciliation. |
| Document capture | Existing `ReceiptCaptureController` and account-isolated IndexedDB draft store retained; file/camera flows, multi-page additions, order/removal and finalize preserved. | Private bytes stay in the device's local draft until upload; local blob URLs are revoked upon teardown; discard requires confirmation. Upload finalization cannot create a ledger expense. |
| Processing state | Source capture and matching state are shown independently, with a private-original unavailable path rather than fabricated verified evidence. | OCR/extracted values are read-only until an audited extraction-correction endpoint is implemented. |

## Architecture and source constraints

P30 uses existing `finance_get_receipt_match_dashboard` / `finance_get_receipt_match_workspace`, candidate refresh and match decision RPCs, and `SupabaseFinanceReceiptCaptureService` with authenticated private Storage.

No database schema or RLS change was introduced. The P27 verified session boundary continues to prevent anonymous Finance route mounting, but authorization is **ultimately enforced by backend ownership/RLS**, not frontend route state.

**Existing extraction correction gap:** Current verified frontend services offer capture, original-page retrieval and matching, but do not expose an audited correction endpoint for merchant/date/items. P30 accurately labels extraction read-only. P30 must not invent a UI-only save operation that pretends to persist corrections.

**Currency limitation:** The manual match input uses exact two-decimal minor units as supported by the current EUR-oriented UI. Any currency with a different exponent requires an explicit per-currency conversion contract before permitting manual matching amounts. Do not interpret a native multi-currency number display as validated currency conversion.

## Verification

Run in the repository:
```sh
npm run validate:p30
npm run typecheck
npm test
npm run build
```

Synthetic React preview: `npm run dev`, then open `/p30-receipt-preview.html`. This is a **separate development entrypoint** and does not impersonate a real Finance user.

P30 browser QA covers 1440/1024/390/320-pixel layouts, dark/light themes, real filter button interaction, empty inbox, horizontal overflow, and axe WCAG-tagged issues. Automated audits do not replace screen-reader or real-device testing.

## Remaining acceptance gates

- [x] Live inbox and protected detail routes implemented, with real account-scoped sources
- [x] Real private original-document retrieval through temporary signed links
- [x] Manual matching; auto-confirm is absent from P30 actions
- [x] Clear receipt-versus-posted-spending semantics
- [x] Device-local receipt page preview; discard confirmation and preserved draft sync controller
- [x] Exact amount and status filter unit tests; CI isolation checks
- [ ] Real signed-in Google/email account testing, owner isolation, encrypted/private Storage policy audit (P38–P39)
- [ ] Dedicated OCR editing/correction backend with authenticated write and audit log
- [ ] Cross-currency amount matching validation beyond EUR/2-decimal currencies
- [ ] On-device camera and HEIC/PDF preview qualification (P39)

**Next after P30:** P31 — Plan & Budget Workspace.
