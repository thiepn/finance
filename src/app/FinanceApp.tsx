import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  FilterChip,
  Money,
  ProgressBar,
  SegmentedControl,
  StatCard,
  Surface,
} from "../ui/components/Primitives.js";
import { Icon, type IconName } from "../ui/icons/Icon.js";
import { AppShell } from "../ui/layout/AppShell.js";

type Period = "month" | "quarter" | "year";

const routeMeta: Record<string, { title: string; icon: IconName }> = {
  overview: { title: "Overview", icon: "overview" },
  activity: { title: "Activity", icon: "activity" },
  scan: { title: "Scan", icon: "scan" },
  accounts: { title: "Accounts", icon: "accounts" },
  receipts: { title: "Receipts", icon: "receipts" },
  insights: { title: "Insights", icon: "insights" },
  categories: { title: "Categories", icon: "categories" },
  merchants: { title: "Merchants", icon: "merchants" },
  products: { title: "Products", icon: "products" },
  recurring: { title: "Recurring", icon: "recurring" },
  budget: { title: "Budget", icon: "plan" },
  goals: { title: "Goals", icon: "goals" },
  "net-worth": { title: "Net Worth", icon: "netWorth" },
  ask: { title: "Ask Finance", icon: "ask" },
  imports: { title: "Imports", icon: "imports" },
  rules: { title: "Rules", icon: "rules" },
  settings: { title: "Settings", icon: "settings" },
};

const periodOptions = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
] as const;

const sampleActivity = [
  {
    merchant: "REWE",
    detail: "Food · Snacks · 14 items",
    account: "Girokonto",
    amountMinor: -3872,
    time: "Today · 16:42",
    receipt: true,
  },
  {
    merchant: "KVB",
    detail: "Transport · Deutschlandticket",
    account: "Girokonto",
    amountMinor: -5800,
    time: "Today · 08:10",
    receipt: false,
  },
  {
    merchant: "University",
    detail: "Income · Reimbursement",
    account: "Girokonto",
    amountMinor: 2400,
    time: "Yesterday · 13:21",
    receipt: false,
  },
  {
    merchant: "Lidl",
    detail: "Food · Groceries · 9 items",
    account: "Cash",
    amountMinor: -2148,
    time: "Oct 3 · 18:07",
    receipt: true,
  },
] as const;

function currentHashRoute(): string {
  if (typeof window === "undefined") return "overview";
  return window.location.hash.replace(/^#/, "") || "overview";
}

function FoundationOverview() {
  const [period, setPeriod] = useState<Period>("month");
  const [filter, setFilter] = useState("all");

  return (
    <div className="f-preview">
      <div className="f-page-heading">
        <div>
          <div className="f-page-heading__eyebrow">
            <Badge tone="accent">P9 foundation · sample data</Badge>
          </div>
          <h1>Financial clarity without dashboard clutter.</h1>
          <p>
            This preview exercises the shared Finance shell and components.
            Real Overview queries and analytics arrive in later phases.
          </p>
        </div>
        <div className="f-page-heading__actions">
          <SegmentedControl
            label="Preview period"
            onChange={setPeriod}
            options={periodOptions}
            value={period}
          />
          <Button icon="scan" variant="primary">
            Scan receipt
          </Button>
        </div>
      </div>

      <div className="f-stat-grid">
        <StatCard
          emphasis
          label="Available to spend"
          supporting="After planned commitments"
          value={<Money amountMinor={64280} />}
        />
        <StatCard
          label="Spent this month"
          supporting="62% of flexible plan"
          trend={<Badge tone="positive">↓ 8.2%</Badge>}
          value={<Money amountMinor={114520} />}
        />
        <StatCard
          label="Saved"
          supporting="Goal: €600"
          trend={<Badge tone="positive">On track</Badge>}
          value={<Money amountMinor={46800} />}
        />
        <StatCard
          label="Net cash flow"
          supporting="Income minus outflows"
          value={<Money amountMinor={32140} showSign tone="positive" />}
        />
      </div>

      <div className="f-preview-grid">
        <Surface className="f-pacing-card">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">Plan</span>
              <h2>Spending pace</h2>
            </div>
            <Badge tone="positive" icon="check">
              Healthy
            </Badge>
          </div>
          <div className="f-pacing-card__hero">
            <div>
              <span>Flexible spending</span>
              <strong className="f-tabular">€712.40 / €1,150</strong>
            </div>
            <span className="f-pacing-card__day">Day 5 of 31</span>
          </div>
          <ProgressBar
            detail="62%"
            label="Used"
            tone="accent"
            value={0.62}
          />
          <div className="f-budget-mini-grid">
            <ProgressBar
              detail="€238 / €420"
              label="Food"
              value={0.57}
            />
            <ProgressBar
              detail="€164 / €180"
              label="Transport"
              tone="warning"
              value={0.91}
            />
            <ProgressBar
              detail="€74 / €220"
              label="Leisure"
              tone="positive"
              value={0.34}
            />
          </div>
        </Surface>

        <Surface className="f-attention-card">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">Attention</span>
              <h2>Needs review</h2>
            </div>
            <span className="f-attention-card__count">2</span>
          </div>

          <button className="f-attention-row" type="button">
            <span className="f-attention-row__icon">
              <Icon name="receipt" size={18} />
            </span>
            <span className="f-attention-row__copy">
              <strong>REWE receipt</strong>
              <span>1 uncertain line item</span>
            </span>
            <Icon name="chevronRight" size={17} />
          </button>

          <button className="f-attention-row" type="button">
            <span className="f-attention-row__icon">
              <Icon name="recurring" size={18} />
            </span>
            <span className="f-attention-row__copy">
              <strong>Spotify</strong>
              <span>Price increased by €1</span>
            </span>
            <Icon name="chevronRight" size={17} />
          </button>
        </Surface>
      </div>

      <Surface className="f-activity-preview">
        <div className="f-section-heading f-section-heading--activity">
          <div>
            <span className="f-section-heading__kicker">Money</span>
            <h2>Recent activity</h2>
          </div>
          <Button size="sm" variant="ghost">
            View all
            <Icon name="chevronRight" size={15} />
          </Button>
        </div>

        <div className="f-filter-strip" aria-label="Activity filters">
          {[
            ["all", "All"],
            ["expense", "Expenses"],
            ["income", "Income"],
            ["receipt", "Receipts"],
          ].map(([key, label]) => (
            <FilterChip
              active={filter === key}
              key={key}
              onClick={() => setFilter(key ?? "all")}
            >
              {label}
            </FilterChip>
          ))}
          <FilterChip leadingIcon="filter">More filters</FilterChip>
        </div>

        <div className="f-activity-table" role="table" aria-label="Sample recent activity">
          <div className="f-activity-table__head" role="row">
            <span role="columnheader">Merchant</span>
            <span role="columnheader">Details</span>
            <span role="columnheader">Account</span>
            <span role="columnheader">Amount</span>
          </div>
          {sampleActivity.map((row) => (
            <div className="f-activity-table__row" key={row.merchant + row.time} role="row">
              <span className="f-activity-table__merchant" role="cell">
                <span className="f-merchant-avatar" aria-hidden="true">
                  {row.merchant.slice(0, 1)}
                </span>
                <span>
                  <strong>{row.merchant}</strong>
                  <small>{row.time}</small>
                </span>
              </span>
              <span className="f-activity-table__detail" role="cell">
                {row.detail}
                {row.receipt ? <Badge tone="neutral">Receipt</Badge> : null}
              </span>
              <span className="f-activity-table__account" role="cell">
                {row.account}
              </span>
              <span className="f-activity-table__amount" role="cell">
                <Money
                  amountMinor={row.amountMinor}
                  showSign={row.amountMinor > 0}
                  tone={row.amountMinor > 0 ? "positive" : "default"}
                />
              </span>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}

function RouteFoundation({ routeKey }: { routeKey: string }) {
  const meta = routeMeta[routeKey] ?? {
    title: "Finance",
    icon: "overview" as IconName,
  };

  return (
    <div className="f-route-foundation">
      <Surface>
        <div className="f-route-foundation__icon">
          <Icon name={meta.icon} size={22} />
        </div>
        <Badge tone="accent">P9 shell ready</Badge>
        <h1>{meta.title}</h1>
        <p>
          Navigation, responsive layout, themes, typography, focus states, and
          shared controls are ready. This product surface is intentionally left
          for its dedicated implementation phase.
        </p>
      </Surface>
    </div>
  );
}

export function FinanceApp() {
  const [activeKey, setActiveKey] = useState(currentHashRoute);
  const title = useMemo(
    () => routeMeta[activeKey]?.title ?? "Finance",
    [activeKey],
  );

  return (
    <AppShell
      activeKey={activeKey}
      onNavigate={setActiveKey}
      title={title}
    >
      {activeKey === "overview" ? (
        <FoundationOverview />
      ) : (
        <RouteFoundation routeKey={activeKey} />
      )}
    </AppShell>
  );
}
