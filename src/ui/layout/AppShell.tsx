import { useEffect, useState, type ReactNode } from "react";
import { Button, SearchField } from "../components/Primitives.js";
import { Icon, type IconName } from "../icons/Icon.js";
import {
  applyFinanceTheme,
  nextFinanceTheme,
  readStoredFinanceTheme,
  resolveFinanceTheme,
  type FinanceTheme,
  type ResolvedFinanceTheme,
} from "../theme/theme.js";

interface NavItem {
  key: string;
  label: string;
  icon: IconName;
}

interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

const desktopNav: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [{ key: "overview", label: "Overview", icon: "overview" }],
  },
  {
    label: "Money",
    items: [
      { key: "activity", label: "Activity", icon: "activity" },
      { key: "accounts", label: "Accounts", icon: "accounts" },
      { key: "receipts", label: "Receipts", icon: "receipts" },
    ],
  },
  {
    label: "Analyze",
    items: [
      { key: "insights", label: "Insights", icon: "insights" },
      { key: "categories", label: "Categories", icon: "categories" },
      { key: "merchants", label: "Merchants", icon: "merchants" },
      { key: "products", label: "Products", icon: "products" },
      { key: "recurring", label: "Recurring", icon: "recurring" },
    ],
  },
  {
    label: "Plan",
    items: [
      { key: "budget", label: "Budget", icon: "plan" },
      { key: "goals", label: "Goals", icon: "goals" },
      { key: "net-worth", label: "Net Worth", icon: "netWorth" },
    ],
  },
  {
    label: "AI",
    items: [{ key: "ask", label: "Ask Finance", icon: "ask" }],
  },
  {
    label: "System",
    items: [
      { key: "imports", label: "Imports", icon: "imports" },
      { key: "rules", label: "Rules", icon: "rules" },
      { key: "settings", label: "Settings", icon: "settings" },
    ],
  },
];

const mobileNav: readonly NavItem[] = [
  { key: "overview", label: "Overview", icon: "overview" },
  { key: "activity", label: "Activity", icon: "activity" },
  { key: "scan", label: "Scan", icon: "scan" },
  { key: "budget", label: "Plan", icon: "plan" },
  { key: "insights", label: "Insights", icon: "insights" },
];

export interface AppShellProps {
  children: ReactNode;
  activeKey?: string;
  title?: string;
  eyebrow?: string;
  onNavigate?: (key: string) => void;
}

function currentResolvedTheme(theme: FinanceTheme): ResolvedFinanceTheme {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return resolveFinanceTheme(theme, prefersDark);
}

export function AppShell({
  children,
  activeKey = "overview",
  title = "Overview",
  eyebrow = "Finance",
  onNavigate,
}: AppShellProps) {
  const [theme, setTheme] = useState<FinanceTheme>(() =>
    readStoredFinanceTheme(),
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedFinanceTheme>(() =>
    currentResolvedTheme(theme),
  );

  useEffect(() => {
    setResolvedTheme(applyFinanceTheme(theme));

    if (theme !== "system") return undefined;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setResolvedTheme(applyFinanceTheme("system"));
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);

  const navigate = (key: string) => {
    onNavigate?.(key);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${key}`);
    }
  };

  const toggleTheme = () => {
    setTheme(nextFinanceTheme(resolvedTheme));
  };

  return (
    <div className="f-shell">
      <a className="f-skip-link" href="#finance-main">
        Skip to content
      </a>

      <aside className="f-sidebar" aria-label="Finance navigation">
        <div className="f-brand">
          <div className="f-brand__mark" aria-hidden="true">
            F
          </div>
          <div>
            <div className="f-brand__name">THIEPN</div>
            <div className="f-brand__product">Finance</div>
          </div>
        </div>

        <nav className="f-sidebar__nav">
          {desktopNav.map((group) => (
            <div className="f-nav-group" key={group.label}>
              <div className="f-nav-group__label">{group.label}</div>
              <div className="f-nav-group__items">
                {group.items.map((item) => (
                  <button
                    aria-current={activeKey === item.key ? "page" : undefined}
                    className={
                      activeKey === item.key
                        ? "f-nav-item f-nav-item--active"
                        : "f-nav-item"
                    }
                    key={item.key}
                    onClick={() => navigate(item.key)}
                    type="button"
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="f-sidebar__footer">
          <button
            aria-label={
              resolvedTheme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"
            }
            className="f-theme-toggle"
            onClick={toggleTheme}
            type="button"
          >
            <Icon
              name={resolvedTheme === "dark" ? "sun" : "moon"}
              size={17}
            />
            <span>
              {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          </button>
          <div className="f-account-chip">
            <div className="f-account-chip__avatar">J</div>
            <div className="f-account-chip__copy">
              <strong>Personal</strong>
              <span>EUR · Germany</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="f-shell__body">
        <header className="f-topbar">
          <div className="f-topbar__title">
            <span>{eyebrow}</span>
            <strong>{title}</strong>
          </div>
          <div className="f-topbar__actions">
            <SearchField
              className="f-topbar__search"
              placeholder="Search activity, products, merchants…"
              shortcut="⌘ K"
            />
            <Button icon="ask" variant="secondary">
              Ask
            </Button>
            <Button
              aria-label={
                resolvedTheme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              icon={resolvedTheme === "dark" ? "sun" : "moon"}
              iconOnly
              onClick={toggleTheme}
              variant="ghost"
            >
              Toggle theme
            </Button>
          </div>
        </header>

        <main className="f-main" id="finance-main">
          {children}
        </main>
      </div>

      <nav className="f-mobile-nav" aria-label="Primary mobile navigation">
        {mobileNav.map((item) => {
          const isScan = item.key === "scan";
          const active = activeKey === item.key;
          return (
            <button
              aria-current={active ? "page" : undefined}
              className={[
                "f-mobile-nav__item",
                active ? "f-mobile-nav__item--active" : "",
                isScan ? "f-mobile-nav__item--scan" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={item.key}
              onClick={() => navigate(item.key)}
              type="button"
            >
              <span className="f-mobile-nav__icon">
                <Icon name={item.icon} size={isScan ? 22 : 20} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
