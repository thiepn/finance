# P29 — Activity & Transaction Workspace

**Status:** Implemented in `thiepn/finance` on the actual authenticated P27 Finance app shell, subject to CI and real-user verification.

## Implemented

| Journey | Implementation | Financial integrity |
| --- | --- | --- |
| Activity list | `src/activity/ActivityWorkspace.tsx`; searchable Signal Current table with dates, merchant/category, source, account, kind, amount, and 40-entry cursor pagination | `finance_search_activity` is the existing user-scoped server API |
| Search | URL-backed search, date range, entity type, merchant, account; browser history and direct link preserved | Filter catalog loads independently; its failure does not imply zero transactions |
| Record details | `/activity/transaction/:transactionId` loads existing server transaction detail, account ledger entries, categories, tags, receipts and notes | No in-place database edits and no fabricated splits; `finance_get_activity_detail` checks ownership server-side |
| Receipt evidence detail | `/receipts/:receiptId` describes source status and matching activity while P30 builds full Receipt Studio | Receipt evidence has no extra posted amount |
| Void | Existing `ledger.voidTransaction` RPC with non-empty written explanation (10 chars minimum), explicit checkbox, posted-status gate and repeated current-state read | Preserves auditable void status; no silent delete or optimistic balance edit |
| New entry | `/activity/new` uses the existing authorized expense/income/transfer RPCs; category splitting validates **exact integer minor-unit sum** | A successful post navigates to its persisted detail; on ambiguous network failure, user must verify Activity before retrying |
| Responsive | Wide native table, focused scroll region, full-page details, compact mobile rows and functional action controls | Typed actual currency for read-only records; **new postings intentionally EUR-only** until verified FX/ledger support exists |

## Data and accounting invariants

- No dummy balances or synthetic records imported by `FinanceAppV2.tsx`.
- Receipts without a transaction are marked *Evidence only*, never listed as a second expense.
- Expense amounts are displayed negative; income/refunds/reimbursements positive; transfers visually neutral and not labeled spending.
- A transaction's category splits must add up exactly, without floating-point rounding. The UI applies `validateAllocationsForPosting` before calling the existing ledger RPC, which validates again.
- Void is an audited reversal/status operation, not an unsafe general-purpose editor. Only posted entries are eligible in this release.
- User-visible fetch/write errors are generic; raw Supabase RPC or permission function names are never shown on the new Activity/detail pages.
- Receipt and transaction detail endpoints remain protected by P27 authenticated routing and backend ownership constraints. Frontend route checking alone is not an access-control mechanism.
- Currency conversion is **not** guessed. The current create RPC provides EUR-only posting; reading non-EUR records uses their native currency.
- Existing ledger transactions are not casually modified in place. More extensive editing (split reclassification, refunds, exchange-rate-aware transfers) requires dedicated audited server methods and qualification; not falsely described as complete.

## Verification and entry points

```sh
npm run validate:p29
npm run typecheck
npm test
npm run build
npm run dev
# Open http://localhost:5173/p29-activity-preview.html for isolated synthetic-only React QA
```

`src/activity/activity-workspace-model.test.ts` covers query round trips, date/type/account/merchant filters, signs and transaction-vs-receipt semantics, route target encoding, exact splits/overflow prevention and error redaction.

The P29 Playwright/axe workflow captures the **actual React ActivityWorkspaceView** in dark and light at desktop (1440), tablet (1024), mobile (390), and narrow (320) widths. It also tests empty and error states, keyboard focus, search submission, source distinctions and page overflow. The QA page is a separate development-only Vite entrypoint with clearly labelled synthetic values.

## Known release gates

- Real-account verification of authenticated data, account changes, owner isolation, CRUD permissions and posting side effects.
- Cross-currency write support, edits and reclassification must not be inferred from read-only multi-currency formatting.
- P30 will finish full receipt view/edit/capture/matching and original-document evidence controls.
- P38/P39 remain responsible for end-to-end actual-device QA.

**Next:** P30 Receipt Studio. Do not call P29 an entirely finished ledger editor until server-side mutation contracts beyond audited void are available.
