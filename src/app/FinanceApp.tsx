import { useEffect, useMemo, useState } from "react";
import { Badge, Surface } from "../ui/components/Primitives.js";
import { Icon, type IconName } from "../ui/icons/Icon.js";
import { AppShell } from "../ui/layout/AppShell.js";
import { OverviewPage } from "../overview/OverviewPage.js";
import { SpendingExplorerPage } from "../spending-explorer/SpendingExplorerPage.js";
import { ProductIntelligencePage } from "../product-intelligence/ProductIntelligencePage.js";
import { RecurringPage } from "../recurring/RecurringPage.js";
import { PlanningPage } from "../planning/PlanningPage.js";

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

interface FinanceRouteSnapshot {
  key: string;
  productId: string | null;
}

function currentHashRoute(): FinanceRouteSnapshot {
  if (typeof window === "undefined") {
    return { key: "overview", productId: null };
  }

  const raw = window.location.hash.replace(/^#/, "") || "overview";
  const [key = "overview", query = ""] = raw.split("?", 2);
  const params = new URLSearchParams(query);

  return {
    key,
    productId:
      key === "products" ? params.get("product") : null,
  };
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
  const initialRoute = useMemo(currentHashRoute, []);
  const [activeKey, setActiveKey] = useState(initialRoute.key);
  const [focusedProductId, setFocusedProductId] = useState<string | null>(
    initialRoute.productId,
  );

  useEffect(() => {
    const syncFromHash = () => {
      const route = currentHashRoute();
      setActiveKey(route.key);
      setFocusedProductId(route.productId);
    };

    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const navigate = (key: string) => {
    setActiveKey(key);
    if (key !== "products") {
      setFocusedProductId(null);
    }
  };

  const openProduct = (productId: string | null) => {
    setActiveKey("products");
    setFocusedProductId(productId);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        productId
          ? `#products?product=${encodeURIComponent(productId)}`
          : "#products",
      );
    }
  };

  const title = useMemo(
    () => routeMeta[activeKey]?.title ?? "Finance",
    [activeKey],
  );

  return (
    <AppShell
      activeKey={activeKey}
      onNavigate={navigate}
      title={title}
    >
      {activeKey === "overview" ? (
        <OverviewPage onNavigate={navigate} />
      ) : activeKey === "insights" ? (
        <SpendingExplorerPage
          onNavigate={navigate}
          onOpenProduct={openProduct}
        />
      ) : activeKey === "categories" ? (
        <SpendingExplorerPage
          initialCategoryMode
          onNavigate={navigate}
          onOpenProduct={openProduct}
        />
      ) : activeKey === "products" ? (
        <ProductIntelligencePage
          onNavigate={navigate}
          onProductChange={openProduct}
          selectedProductId={focusedProductId}
        />
      ) : activeKey === "recurring" ? (
        <RecurringPage onNavigate={navigate} />
      ) : activeKey === "budget" ? (
        <PlanningPage mode="budget" onNavigate={navigate} />
      ) : activeKey === "goals" ? (
        <PlanningPage mode="goals" onNavigate={navigate} />
      ) : (
        <RouteFoundation routeKey={activeKey} />
      )}
    </AppShell>
  );
}
