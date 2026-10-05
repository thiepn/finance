import { useMemo, useState } from "react";
import { Badge, Surface } from "../ui/components/Primitives.js";
import { Icon, type IconName } from "../ui/icons/Icon.js";
import { AppShell } from "../ui/layout/AppShell.js";
import { OverviewPage } from "../overview/OverviewPage.js";
import { SpendingExplorerPage } from "../spending-explorer/SpendingExplorerPage.js";

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

function currentHashRoute(): string {
  if (typeof window === "undefined") return "overview";
  return window.location.hash.replace(/^#/, "") || "overview";
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
        <Badge tone="accent">Foundation ready</Badge>
        <h1>{meta.title}</h1>
        <p>
          This route has the shared P9 shell and live Finance runtime available.
          Its full product surface is implemented in its dedicated phase.
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
        <OverviewPage onNavigate={setActiveKey} />
      ) : activeKey === "insights" ? (
        <SpendingExplorerPage onNavigate={setActiveKey} />
      ) : activeKey === "categories" ? (
        <SpendingExplorerPage
          initialCategoryMode
          onNavigate={setActiveKey}
        />
      ) : (
        <RouteFoundation routeKey={activeKey} />
      )}
    </AppShell>
  );
}
