# P9 — Finance Design System & UI Foundation

P9 establishes the visual and interaction foundation for every THIEPN Finance product surface.

The purpose is not to complete Overview, Activity, planning, or analytics screens. It is to make those future screens compose from one stable system rather than inventing new UI patterns per phase.

## Product direction

Finance should feel:

- precise rather than playful;
- data-dense without becoming visually noisy;
- premium without relying on gradients or decorative illustration;
- fast to scan on desktop;
- easy to operate one-handed on mobile;
- consistent across financial, receipt, product, planning, and analytics workflows.

Numbers are visually dominant. Semantic colors are reserved for meaning.

The product accent is intentionally separate from:

- positive values;
- negative values;
- warnings;
- destructive actions.

This prevents "green means brand" from conflicting with "green means positive financial movement."

## Frontend foundation

P9 introduces a thin React/Vite application layer while keeping all P0–P8 domain and service code framework-independent.

Runtime:

- React 19.3
- React DOM 19.3
- Vite 8.3
- strict TypeScript
- no UI framework dependency
- no charting dependency yet

The browser shell lives under `src/app` and reusable UI under `src/ui`.

## Information architecture

### Desktop

Sidebar groups:

- Overview
- Money
  - Activity
  - Accounts
  - Receipts
- Analyze
  - Insights
  - Categories
  - Merchants
  - Products
  - Recurring
- Plan
  - Budget
  - Goals
  - Net Worth
- AI
  - Ask Finance
- System
  - Imports
  - Rules
  - Settings

### Mobile

Persistent bottom navigation:

- Overview
- Activity
- Scan
- Plan
- Insights

Scan is visually elevated as the central capture action.

## Design tokens

The system defines CSS custom properties for:

- typography;
- spacing;
- radii;
- surfaces;
- borders;
- primary text;
- secondary text;
- tertiary text;
- accent;
- positive state;
- negative state;
- warning state;
- focus state;
- shadows;
- timing;
- responsive shell dimensions.

All component styles consume semantic tokens rather than hard-coded page-specific colors.

## Themes

Light and dark themes use the same semantic token names.

Theme behavior supports:

- system preference;
- persisted explicit preference;
- manual light/dark toggle;
- live response to OS theme changes while in system mode.

The HTML color scheme is updated alongside the resolved theme.

## Financial typography

Money is formatted from integer minor units.

Examples:

- `1250` → €12.50 equivalent for the active locale
- `-3872` → negative €38.72 equivalent
- optional explicit positive sign for net-flow contexts

Financial values use tabular lining numerals so columns and changing dashboard values do not visually jump.

## Core primitives

P9 adds reusable primitives for:

- buttons;
- icon buttons;
- surfaces/cards;
- badges;
- money display;
- stat cards;
- search fields;
- filter chips;
- segmented controls;
- progress bars;
- skeleton loading states.

These are intentionally generic and contain no finance business logic.

## Icon system

P9 includes a small first-party SVG icon system for Finance navigation and common actions.

This avoids introducing an icon dependency solely for the shell and keeps the design language deterministic.

Icons cover:

- overview;
- activity;
- scan;
- planning;
- insights;
- accounts;
- receipts;
- categories;
- merchants;
- products;
- recurring;
- goals;
- net worth;
- Ask Finance;
- imports;
- rules;
- settings;
- search/filter;
- theme;
- status/actions.

## Responsive shell

### Desktop

- fixed sidebar;
- sticky top toolbar;
- bounded content width;
- global search area;
- Ask action;
- theme control;
- grouped navigation.

### Tablet

- narrower sidebar;
- same information hierarchy;
- adaptive content grids.

### Mobile

At 760 px and below:

- desktop sidebar disappears;
- sticky compact top bar remains;
- bottom navigation becomes primary;
- Scan becomes the elevated center action;
- content receives safe-area-aware bottom spacing;
- desktop tables collapse into mobile row cards.

At 430 px and below:

- summary grids collapse to one column;
- segmented controls become full-width;
- primary page actions stack vertically.

## Accessibility

P9 includes:

- skip-to-content link;
- visible `:focus-visible` treatment;
- semantic nav/main/section structure;
- ARIA current-page states;
- labels for icon-only controls;
- minimum mobile touch targets;
- progressbar semantics;
- hidden accessible labels for search;
- reduced-motion support;
- no state that relies on color alone.

## Sample-data preview

The root app currently renders an explicitly labeled P9 foundation preview.

It exists only to exercise:

- hierarchy;
- spacing;
- typography;
- stat cards;
- money formatting;
- badges;
- budget/progress treatment;
- attention rows;
- filters;
- responsive Activity rows;
- light/dark themes.

The preview does not claim to be the completed Overview implementation.

All non-Overview routes render a clear P9 shell placeholder so navigation can be exercised without pretending later product phases are complete.

## Files

P9 adds:

```text
index.html
vite.config.ts

src/app/main.tsx
src/app/FinanceApp.tsx
src/app/app.css

src/ui/components/Primitives.tsx
src/ui/icons/Icon.tsx
src/ui/layout/AppShell.tsx
src/ui/theme/theme.ts
src/ui/format/money.ts

src/ui/styles/tokens.css
src/ui/styles/base.css
src/ui/styles/components.css
src/ui/styles/shell.css

src/ui/ui-foundation.test.ts
```

## CI

CI now verifies:

1. strict TypeScript;
2. all existing processing/review/activity tests;
3. UI foundation utility tests;
4. a production Vite build.

The build gate is important because TypeScript alone cannot detect missing browser entry files or bundler-resolution errors.

## P10 handoff

P10 can now implement the real Overview dashboard against this shared shell and component system.

It should replace sample preview values with deterministic Finance queries rather than changing the visual foundation ad hoc.
