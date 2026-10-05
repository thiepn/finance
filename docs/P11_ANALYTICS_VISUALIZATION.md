# P11 — Advanced Analytics Visualization Engine

P11 adds the shared quantitative-analysis layer used by Overview and future Finance analytics surfaces.

## Goals

- deterministic time-series aggregation from posted ledger entries;
- current-period vs previous-period comparisons;
- arbitrary bucket boundaries that remain correct across DST and non-aligned weeks;
- reusable category / merchant / necessity breakdowns;
- one shared responsive chart system;
- chart/table parity;
- keyboard- and screen-reader-compatible visualizations;
- drill-down callbacks rather than dead-end charts.

## Backend read models

P11 adds:

```text
finance.get_analytics_time_series(...)
public.finance_get_analytics_time_series(...)

finance.get_analytics_breakdown(...)
public.finance_get_analytics_breakdown(...)
```

Both public RPCs are SECURITY INVOKER. Public/anon execution is revoked and authenticated/service-role execution is explicitly granted.

### Time-series metrics

Every bucket returns:

- gross spending;
- refunds/reimbursements;
- net spending;
- income;
- net cash flow;
- transaction count.

Refund-heavy buckets may therefore have negative net spending. That information is preserved instead of clamped away.

### Bucket kinds

Supported:

- day;
- week;
- month;
- quarter;
- year.

Buckets are generated from the selected range boundary and transactions are assigned by bucket start/end timestamps.

This avoids an important bug in which a Thursday-start range could lose data if values were grouped only with ISO `date_trunc('week')`.

Timezone conversion comes from the Finance profile and therefore preserves DST-aware calendar boundaries.

### Comparison

The RPC returns both:

- current range;
- comparison range.

Each point has a deterministic `bucket_index` so equivalent positions can be aligned in the client even when periods contain a different number of buckets.

### Breakdown

The reusable breakdown RPC supports:

- category;
- merchant;
- necessity.

Each row returns:

- current amount;
- previous amount;
- absolute delta;
- percentage delta when a previous baseline exists;
- current-period share;
- current and previous transaction counts.

A zero previous baseline returns a null percentage rather than an invented infinite change.

## Application model

P11 adds:

```text
src/domain/analytics.ts
src/services/analytics.ts
src/services/supabase-analytics.ts

src/analytics/analytics-model.ts
src/analytics/use-analytics.ts
src/analytics/OverviewTrendPanel.tsx
src/analytics/analytics-model.test.ts
src/analytics/supabase-analytics.test.ts
```

The browser runtime now exposes `runtime.analytics` alongside the P10 Overview service.

## Metric semantics

Shared metric keys:

```text
net_spend
gross_spend
recoveries
income
cash_flow
```

Presentation helpers own favorable-direction semantics:

- lower spending is favorable;
- higher income is favorable;
- higher net cash flow is favorable;
- recovery amount alone is neutral.

This prevents chart components from deciding what “good” or “bad” means.

## Visualization system

P11 adds the reusable Finance chart layer:

```text
src/ui/charts/chart-types.ts
src/ui/charts/ChartFrame.tsx
src/ui/charts/FinanceCharts.tsx
src/ui/charts/charts.css
```

Primitives:

- line chart;
- bar chart;
- stacked bar chart;
- donut chart;
- sparkline;
- heatmap;
- shared legend;
- shared financial tooltip formatting;
- chart/table switch;
- responsive data table fallback.

Every chart accepts a structured activation callback for later drill-down behavior.

## Accessibility

The chart wrapper always provides a textual label and supports a table representation of the same data.

The selected chart runtime is Recharts 3.10.1, whose 3.x accessibility layer provides keyboard chart navigation and screen-reader tooltip behavior by default.

Finance also preserves its own:

- visible focus treatment;
- non-color-only labels;
- textual legends;
- chart/table parity;
- reduced-motion design baseline.

## Chart palette

P11 adds dedicated light/dark categorical chart tokens:

```text
--f-chart-1
--f-chart-2
--f-chart-3
--f-chart-4
--f-chart-5
--f-chart-6
--f-chart-grid
```

Dataset colors are intentionally separate from positive/negative financial semantics.

## Live Overview integration

Overview now contains a real **Money over time** panel.

It supports:

- Spending / Income / Cash flow metric switch;
- current vs previous period overlay;
- Chart / Table mode;
- Week / Month / Quarter / Year range changes through the existing Overview range control;
- automatic bucket recommendation:
  - week → day;
  - month → day;
  - quarter → week;
  - year → month;
- deterministic favorable/unfavorable comparison badge;
- click/table activation handoff to Activity.

No chart uses sample financial data.

## Verification

The live rollback-only database fixture verifies:

- 31 October daily buckets;
- 30 September comparison buckets;
- €700 gross spending;
- €100 recoveries;
- €600 net spending;
- €2,000 income;
- €1,400 net cash flow;
- negative refund-day net spending;
- exact previous-period totals;
- arbitrary Thursday-start weekly buckets;
- category breakdown/current-vs-previous deltas;
- null percentage for a zero baseline;
- cross-user RLS isolation.

Client tests verify:

- metric extraction;
- cumulative calculations;
- comparison alignment;
- favorable-direction semantics;
- recommended bucket grouping;
- Supabase RPC arguments;
- snake_case response parsing.

CI verifies strict TypeScript, all Finance fixture groups, and the Vite production build.

## P12 handoff

P12 can now build the Spending Explorer on top of these contracts:

```text
Finance
→ category
→ subcategory
→ merchant / product
→ individual purchase
```

The explorer should reuse P11 visualizations and analytics RPCs rather than implementing its own chart behavior or financial calculations.
