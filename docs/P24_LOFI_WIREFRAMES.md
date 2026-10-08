# P24 — Low-fidelity, Finance-native wireframes

**Status: structure and behavior only.** These are intentionally monochrome information-layout specifications, NOT visual themes or production designs. Data below is **synthetic**. The P25 task is to test three distinctive visual languages against **these same tasks**, not to copy these ASCII boxes or replace every row with a card.

Abbreviations: **A** = action, **F** = filter, **D** = drill-down, **S** = semantic status, **R** = retry/recovery. Dimensions are conceptual; validate actual interaction at 1440px, 1024px, 768px, 390px and 320px.

## W1 — Home, desktop (populated)

```text
┌──────────────────┬────────────────────────────────────────────────────────────────────────────────────┐
│ Finance          │ Home                                      [Search activity] [Account ▾]           │
│                  ├────────────────────────────────────────────────────────────────────────────────────┤
│ ● Home           │ OCTOBER 2026                                   [Add transaction] [Scan receipt]    │
│   Activity       │                                                                            (A)     │
│   Plan           │ AVAILABLE TO SPEND                  CASH POSITION          UPCOMING COMMITMENTS    │
│   Explore        │ € 1,240.50                          € 2,870.30             € 745.00               │
│   Receipts       │ Month forecast · updated 12:45      View accounts (D)      Next 30 days (D)       │
│   Wealth         │                                                                                    │
│                  │ Spending pace ──────────────────────────────┬── Needs attention (3) ──────────────│
│                  │ [Actual vs planned chart; labeled axes]   │ 2 transactions uncategorized       │
│                  │                                           │ 1 receipt ready for review         │
│                  │ Categories driving changes (D)            │ [Review now]                         │
│                  │───────────────────────────────────────────┴──────────────────────────────────────│
│                  │ Recent activity                                                           [All →] │
│                  │ Date     Merchant                Category                Amount          Status    │
│                  │ Today    Grocery store           Groceries               -42.35          Posted    │
│                  │ Tue      Regional rail            Transport               -12.80          Posted    │
│                  │ Mon      Salary                    Income                +1,650.00        Posted    │
│                  │                                                                                    │
│ Account [▾]      │ Source: posted ledger | Forecasts clearly marked | No decorative welcome banner   │
└──────────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

- **A:** one obvious manual-entry action plus receipt scan.
- **D:** clicking a number goes to transactions, budget, recurring, or accounts with period preserved.
- Financial labels must distinguish *posted cash*, *planned available amount* and *forecast*; do not create a false identity between them.
- Categories and attention use unboxed rows or restrained division, not a grid of identical dashboard tiles.

## W2 — Home, mobile (populated)

```text
┌──────────────────────────────┐
│ Finance          Oct ▾  More│
│                              │
│ Available to spend           │
│ €1,240.50                    │
│ October · planned remaining │
│                              │
│ Cash €2,870     Due €745  >  │
│                              │
│ Spending pace          [↗]  │
│ [Compact readable chart]     │
│ Actual        Plan           │
│                              │
│ Needs attention         (3) │
│ • Unclassified (2)       >   │
│ • Receipt to review (1)  >   │
│                              │
│ Recent activity       All >  │
│ Grocery store       -42.35   │
│ Regional rail       -12.80   │
│                              │
│ [ + Add transaction ]        │
│                              │
├──────────────────────────────┤
│ Home Activity [Scan] Plan Exp│
└──────────────────────────────┘
```

- Home's amount and action appear above optional chart/trends; no heading taking 100px.
- Persistent bottom nav respects safe area and does not cover the last row/form button.
- **More** is labelled and keyboard/screen-reader accessible; Accounts and Receipts reachable without search.

## W3 — Activity, desktop / detailed ledger

```text
┌──────────────────┬────────────────────────────────────────────────────────────────────────────────────┐
│ ● Activity       │ Activity                       [Import] [+ New transaction]                        │
│                  │ [Search transactions & receipts______________________] [Date ▾] [Category ▾] [More] │
│                  │                                                                                    │
│                  │ 438 results  |  Posted: 433  |  Needs review: 5  |  [Filters active: Oct ×]           │
│                  │                                                                                    │
│                  │ ○ Date       Merchant             Account       Category              Amount   Flag│
│                  │ ○ 08 Oct     Grocery store        Main          Groceries             -42.35       │
│                  │ ● 07 Oct     Regional rail        Main          Transport             -12.80       │
│                  │ ○ 06 Oct     Internet provider    Main          Utilities             -34.99   Due│
│                  │                                                                                    │
│                  │ ┌──────────────────────────────────────────────────────────────────────────────┐   │
│                  │ │ SELECTED TRANSACTION (detail pane, URL-addressable)                          │   │
│                  │ │ Regional rail / 07 Oct / -€12.80 / Main                                      │   │
│                  │ │ Category: Transport      [Edit] [Split] [Receipt evidence]                  │   │
│                  │ │ Entry ID | Imported source | Matching status | Change history               │   │
│                  │ └──────────────────────────────────────────────────────────────────────────────┘   │
│                  │                                                                                    │
│                  │ [Prev page]                                                        [Next page]     │
└──────────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

- Use sortable headers and actual table semantics at large widths; checkboxes only for bulk-edit capable rows.
- Action bar appears when multi-selected; avoid secondary actions replicated permanently in every cell.
- Back from a detail pane restores list, query, filters, focus and selection.

## W4 — Activity + expense editor, mobile

```text
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ Activity               [ + ]│       │ < New expense            [×] │
│ [ Search purchases       ]  │       │                              │
│ October ▾  Filter ▾         │       │ Amount *                     │
│                              │       │ € [ 42,35            ]      │
│ 08 Oct   Grocery store       │       │ Account *   [Main ▾]        │
│   Groceries        -€42.35 > │       │ Date        [08 Oct 2026]   │
│ 07 Oct   Rail ticket         │       │ Merchant    [Store  ]      │
│   Transport        -€12.80 > │       │ Category / Split (A)        │
│ 06 Oct   Internet             │       │                              │
│   Utilities        -€34.99 > │       │ Validation: sum = amount    │
│                              │       │                              │
│ [Load older…]                │       │ [Review transaction]        │
├──────────────────────────────┤       │ [Save draft]                 │
│ Home Activity [Scan] Plan Exp│       └──────────────────────────────┘
└──────────────────────────────┘
```

Editor is a **real addressable mobile page**, not a tab that opens a decorative popup. Requires error, disabled, save/continue and confirmed states. Money field should accommodate de-DE separators and always store validated minor units.

## W5 — Receipt capture, mobile

```text
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ < Receipts    Scan receipt   │     │ < Scan receipt          Next│
│                              │     │                              │
│ [ Camera preview / picker ]  │     │ [ Large receipt image       ]│
│ [ shutter ]  [From files]    │     │ [ Crop ] [Rotate] [Retake]   │
│                              │     │                              │
│ No pages yet                 │     │ Pages  [1] [2] [+]          │
│ Photos stay on device until  │     │ Drag to reorder, check text │
│ you choose Upload.           │     │                              │
│                              │     │ [Upload for processing]     │
│ [Saved drafts (2)]          │     │ Status: Ready to upload     │
│ Draft · 1 page · 08 Oct  >  │     │ [Save draft / Discard]      │
│ Draft · 3 pages · 07 Oct  >  │     │                              │
├──────────────────────────────┤     ├──────────────────────────────┤
│ Home Activity [Scan] Plan Exp│     │ Home Activity [Scan] Plan Exp│
└──────────────────────────────┘     └──────────────────────────────┘
```

- Permission denied → choose files, not a dead end.
- Upload stages: queued / uploading / processing / needs review / matched / failed, with explicit Retry.
- Draft user ownership and local storage treatment must be described without exposing another account's draft.

## W6 — Receipt review, desktop

```text
┌──────────────────┬───────────────────────────────────────────┬──────────────────────────────────────┐
│ Receipts         │ Receipt image                             │ Extracted evidence                   │
│                  │                                           │ Merchant [ Grocery store       ]    │
│ Inbox · 2       │ [ high-resolution zoomable image ]         │ Date     [ 08 Oct 2026          ]    │
│ Needs review    │                                           │ Total    [ €42.35              ]    │
│ Matched         │ Page 1  Page 2                            │                                      │
│                  │                                           │ Items                                │
│                  │                                           │ Item        Qty  Unit   Total       │
│                  │                                           │ Bread       1    2.20   2.20       │
│                  │                                           │ Fruit       2    3.50   7.00       │
│                  │                                           │ [Add item] [Edit OCR suggestion]     │
│                  │                                           │                                      │
│                  │                                           │ MATCH SUGGESTIONS                    │
│                  │                                           │ Main / 08 Oct / -42.35 (confidence) │
│                  │                                           │ [Review match] [Keep unmatched]      │
└──────────────────┴───────────────────────────────────────────┴──────────────────────────────────────┘
```

- Review **source image beside extracted fields** for visual verification.
- If a receipt is matched to posted entry, it must never increment spending again.
- Long OCR documents, uncertain totals and parsing errors have correctable states.

## W7 — Plan, desktop

```text
┌──────────────────┬────────────────────────────────────────────────────────────────────────────────────┐
│ Plan             │ Budget               [‹ September] October 2026 [November ›] [Edit allocation]    │
│  ● Budget        │ Available to allocate: €240.00  |  Planned bills this month: €745.00              │
│    Goals         │                                                                                    │
│    Recurring     │ Category              Planned       Actual        Remaining       Status           │
│                  │ Groceries               250.00       182.40         67.60         On pace          │
│                  │ Housing                 600.00       600.00          0.00         Fully used       │
│                  │ Transport               100.00        32.40         67.60         On pace          │
│                  │ Entertainment            70.00        85.00        -15.00         Overspent        │
│                  │                                                                                    │
│                  │ Upcoming: Rent · 01 Nov · €600   [View Recurring]                                │
└──────────────────┴────────────────────────────────────────────────────────────────────────────────────┘
```

- Table is the budget workspace, not a meaningless chart wall.
- Clear difference between allocation, actual posted spending, remaining balance and forecast.
- On mobile each category becomes a navigable section with sticky available-to-allocate amount, not an unusable eight-column table.

## W8 — Explore, desktop and mobile

```text
DESKTOP                                               MOBILE
┌────────────────────────────────────────────────┐    ┌──────────────────────────────┐
│ Explore   Spending | Categories | Merchants |  │    │ Explore  2026 Oct ▾  More   │
│           Products                              │    │ Spending Categories Products │
│ Oct 2026 ▾  Compare Sep 2026 ▾                  │    │ Spend €862.40                │
│                                                │    │ [Readable chart]             │
│ Spending €862.40  Change +€108.90              │    │ Breakdown [Chart | Table]    │
│ [Interactive trends / category breakdown]      │    │ Groceries   €182.40     >    │
│                                                │    │ Housing     €600.00     >    │
│ What changed?                                  │    │ Other        €80.00     >    │
│ + Grocery quantity          €44.20        >    │    │ [View transactions]          │
│ + Price per product         €11.30        >    ├──────────────────────────────┤
│ [View underlying transactions]                  │    │ Home Activity [Scan] Plan Exp│
└────────────────────────────────────────────────┘    └──────────────────────────────┘
```

- Attribution only when underlying data supports it. Without matched product units, avoid confidently attributing change to unit prices versus quantity.
- Drill-down preserves period and filters with an evidence link to Activity.

## W9 — Wealth / Accounts, mobile

```text
┌──────────────────────────────┐
│ Wealth              Accounts │
│ Cash accounts                 │
│ Main checking     €1,520.30 > │
│ Savings           €1,350.00 > │
│                              │
│ Last updated: 08 Oct         │
│ [Reconcile]                  │
│                              │
│ Net worth           View >   │
│ Assets      €9,800.00        │
│ Liabilities -€2,250.00       │
│ Total       €7,550.00        │
│                              │
│ [Source and valuation status]│
├──────────────────────────────┤
│ Home Activity [Scan] Plan Exp│
└──────────────────────────────┘
```

- This screen is reached from `More → Accounts & wealth`, Home's cash balance, and linked relevant insights. Do not hide it solely in a non-visible footer.
- Avoid implying asset valuations are cash ready to spend.

## W10 — Auth gate and recovery, mobile

```text
┌──────────────────────────────┐
│ Finance                 Help │
│                              │
│ Sign in to view Activity     │
│ Only your own transactions   │
│ and receipt evidence appear. │
│                              │
│ [ Continue with Google ]     │
│ [ Email sign-in link     ]   │
│                              │
│ You'll return to your search │
│ for "REWE" after signing in. │
│                              │
│ [Back to Home]  [Privacy]    │
└──────────────────────────────┘
```

- Show **the intended destination**, not a second copy of the same authentication warning.
- If callback fails, offer resend or switch method. A stale token never yields a fake `0 transactions` state.
- No bottom nav is required on a dedicated public callback screen, but a back/help action must exist.

## W11 — More/Account disclosure on mobile

```text
┌──────────────────────────────┐
│ Explore                 More │
│                     ┌──────┐│
│                     │Receipts
│                     │Accounts & wealth
│                     │Imports
│                     │Rules
│                     │Ask Finance
│                     │Settings & account
│                     └──────┘│
│ (Current Explore state remains underneath)  │
└──────────────────────────────┘
```

- Disclosure is accessible via button, Escape, click-away and outside keyboard focus. A list of **links**, not an OS-like dialog; do not require complex roving tab semantics.
- Menu should avoid clipping and fit a 320px viewport. Active/selected destinations indicated semantically.

## Required review fixtures for P25 (not production finance data)

| Fixture | Required content | Tests |
| --- | --- | --- |
| `first-run` | Zero accounts/transactions, signed in | Setup and empty actions |
| `daily-realistic` | 3 accounts, 4 income/expense types, 50 transactions, 5 categories, 6 merchants | Typical viewport and density |
| `large-ledger` | 1,000+ transactions, long merchant names, varying ISO dates and currencies | Search, overflow, performance and truncation |
| `receipt-troublesome` | 3-page, rotated, OCR-uncertain receipt, one possible match | Correction, matched/double-count rules |
| `stress-plan` | Overspent categories, budget rollover, upcoming subscription, unmatched refunds | Negative numbers, overflow and warnings |
| `error-states` | Signed out, expired, forbidden, network offline, malformed import | Recovery and accessibility |

**Signoff prerequisite:** P25 presents at least desktop Home + Activity + Receipt Review and mobile Home + Scan + Plan for **each** of three genuinely different design directions. Must be comprehensible with actual synthetic fixture data, not vague empty-state illustrations.
