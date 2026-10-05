import { useMemo, useState } from "react";
import type {
  OverviewAttentionItem,
  OverviewDashboard,
  OverviewPeriodKind,
  OverviewStatusTone,
} from "../domain/overview.js";
import {
  Badge,
  Button,
  Money,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  StatCard,
  Surface,
} from "../ui/components/Primitives.js";
import { formatMoneyMinor, formatPercent } from "../ui/format/money.js";
import { Icon } from "../ui/icons/Icon.js";
import {
  attentionCopy,
  overviewMetricTrend,
  overviewStatusCopy,
} from "./overview-model.js";
import { useOverview, type OverviewLoadState } from "./use-overview.js";

const periodOptions = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
] as const;

function trendBadge(
  ratio: number | null,
  tone: "positive" | "negative" | "neutral",
) {
  if (ratio === null) return <Badge tone="neutral">No baseline</Badge>;
  const badgeTone =
    tone === "positive"
      ? "positive"
      : tone === "negative"
        ? "negative"
        : "neutral";
  return (
    <Badge tone={badgeTone}>
      {ratio > 0 ? "↑ " : ratio < 0 ? "↓ " : ""}
      {formatPercent(Math.abs(ratio), "de-DE", 1)}
    </Badge>
  );
}

function periodLabel(dashboard: OverviewDashboard): string {
  const { periodKind, period, profile } = dashboard;
  const start = new Date(period.start);
  const end = new Date(new Date(period.end).getTime() - 1);

  if (periodKind === "year") {
    return new Intl.DateTimeFormat(profile.locale, {
      year: "numeric",
      timeZone: profile.timeZone,
    }).format(start);
  }

  if (periodKind === "quarter") {
    const month = Number(
      new Intl.DateTimeFormat("en", {
        month: "numeric",
        timeZone: profile.timeZone,
      }).format(start),
    );
    const year = new Intl.DateTimeFormat(profile.locale, {
      year: "numeric",
      timeZone: profile.timeZone,
    }).format(start);
    return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
  }

  if (periodKind === "month") {
    return new Intl.DateTimeFormat(profile.locale, {
      month: "long",
      year: "numeric",
      timeZone: profile.timeZone,
    }).format(start);
  }

  const formatter = new Intl.DateTimeFormat(profile.locale, {
    day: "numeric",
    month: "short",
    timeZone: profile.timeZone,
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function statusTone(tone: OverviewStatusTone) {
  return tone === "negative"
    ? "negative"
    : tone === "warning"
      ? "warning"
      : tone === "positive"
        ? "positive"
        : "neutral";
}

function AttentionRow({
  item,
  onNavigate,
}: {
  item: OverviewAttentionItem;
  onNavigate: (key: string) => void;
}) {
  const copy = attentionCopy(item);
  const icon =
    item.entityKind === "receipt"
      ? "receipt"
      : item.entityKind === "budget"
        ? "plan"
        : "alert";

  return (
    <button
      className="f-overview-attention-row"
      onClick={() => onNavigate(copy.routeKey)}
      type="button"
    >
      <span className="f-overview-attention-row__icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="f-overview-attention-row__copy">
        <strong>{copy.title}</strong>
        <span>
          {item.subject ? `${item.subject} · ` : ""}
          {copy.detail}
        </span>
      </span>
      <Badge tone={item.severity}>{item.severity}</Badge>
      <Icon name="chevronRight" size={16} />
    </button>
  );
}

function OverviewLoading() {
  return (
    <div className="f-overview">
      <div className="f-overview-heading">
        <div>
          <Skeleton className="f-overview-skeleton--short" />
          <Skeleton className="f-overview-skeleton--title" />
        </div>
      </div>
      <div className="f-overview-stats">
        {Array.from({ length: 4 }).map((_, index) => (
          <Surface key={index}>
            <Skeleton className="f-overview-skeleton--short" />
            <Skeleton className="f-overview-skeleton--value" />
            <Skeleton className="f-overview-skeleton--medium" />
          </Surface>
        ))}
      </div>
      <div className="f-overview-grid">
        <Surface><Skeleton className="f-overview-skeleton--panel" /></Surface>
        <Surface><Skeleton className="f-overview-skeleton--panel" /></Surface>
      </div>
    </div>
  );
}

function OverviewUnavailable({
  state,
  error,
  refresh,
}: {
  state: Exclude<OverviewLoadState, "loading" | "ready">;
  error: string | null;
  refresh: () => Promise<void>;
}) {
  const isConfig = state === "unconfigured";
  const isAuth = state === "unauthenticated";

  return (
    <div className="f-overview-empty">
      <Surface>
        <div className="f-route-foundation__icon">
          <Icon
            name={isConfig ? "settings" : isAuth ? "accounts" : "alert"}
            size={22}
          />
        </div>
        <Badge tone={state === "error" ? "negative" : "accent"}>
          {isConfig
            ? "Backend configuration"
            : isAuth
              ? "Authentication"
              : "Load error"}
        </Badge>
        <h1>
          {isConfig
            ? "Finance backend is not configured in this build."
            : isAuth
              ? "A THIEPN Finance session is required."
              : "Overview could not be loaded."}
        </h1>
        <p>
          {isConfig
            ? "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this deployment. No demo financial values are shown."
            : isAuth
              ? "The live dashboard only renders data returned for the authenticated THIEPN Core user. Unified account flow is handled separately from this dashboard."
              : error ?? "The live Overview request failed."}
        </p>
        {state === "error" ? (
          <Button onClick={() => void refresh()} variant="primary">
            Retry
          </Button>
        ) : null}
      </Surface>
    </div>
  );
}

export interface OverviewPageProps {
  onNavigate: (key: string) => void;
}

export function OverviewPage({ onNavigate }: OverviewPageProps) {
  const [periodKind, setPeriodKind] =
    useState<OverviewPeriodKind>("month");
  const loader = useOverview(periodKind);

  if (loader.state === "loading") return <OverviewLoading />;
  if (loader.state !== "ready" || !loader.dashboard) {
    return (
      <OverviewUnavailable
        error={loader.error}
        refresh={loader.refresh}
        state={loader.state}
      />
    );
  }

  const dashboard = loader.dashboard;
  const status = overviewStatusCopy(
    dashboard.financialStatus,
    dashboard,
  );
  const spendingTrend = overviewMetricTrend(dashboard, "spending");
  const incomeTrend = overviewMetricTrend(dashboard, "income");
  const cashFlowTrend = overviewMetricTrend(dashboard, "cash_flow");

  return (
    <div className="f-overview">
      <div className="f-overview-heading">
        <div>
          <div className="f-overview-heading__meta">
            <Badge tone={statusTone(dashboard.financialStatus.tone)}>
              {status.title}
            </Badge>
            <span>{periodLabel(dashboard)}</span>
          </div>
          <h1>Your financial position, from posted data.</h1>
          <p>{status.detail}</p>
        </div>
        <div className="f-overview-heading__actions">
          <SegmentedControl
            label="Overview period"
            onChange={setPeriodKind}
            options={periodOptions}
            value={periodKind}
          />
          <Button
            icon="scan"
            onClick={() => onNavigate("scan")}
            variant="primary"
          >
            Scan receipt
          </Button>
        </div>
      </div>

      <div className="f-overview-stats">
        <StatCard
          emphasis={dashboard.planning.configured}
          label="Available to spend"
          supporting={
            dashboard.planning.configured
              ? "Remaining across configured budget allocations"
              : "No active budget plan for this period"
          }
          value={
            dashboard.summary.availableToSpendMinor === null ? (
              <span className="f-overview-stat-empty">—</span>
            ) : (
              <Money
                amountMinor={dashboard.summary.availableToSpendMinor}
                currencyCode={dashboard.profile.currencyCode}
                locale={dashboard.profile.locale}
                tone={
                  dashboard.summary.availableToSpendMinor < 0
                    ? "negative"
                    : "default"
                }
              />
            )
          }
        />

        <StatCard
          label="Net spending"
          supporting={
            dashboard.summary.recoveriesMinor > 0
              ? `${formatMoneyMinor(
                  dashboard.summary.recoveriesMinor,
                  dashboard.profile.currencyCode,
                  { locale: dashboard.profile.locale },
                )} refunds/reimbursements applied`
              : `${dashboard.summary.expenseCount} posted expense${dashboard.summary.expenseCount === 1 ? "" : "s"}`
          }
          trend={trendBadge(spendingTrend.ratio, spendingTrend.tone)}
          value={
            <Money
              amountMinor={dashboard.summary.netSpentMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
            />
          }
        />

        <StatCard
          label="Income"
          supporting="Posted income transactions only"
          trend={trendBadge(incomeTrend.ratio, incomeTrend.tone)}
          value={
            <Money
              amountMinor={dashboard.summary.incomeMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
            />
          }
        />

        <StatCard
          label="Net cash flow"
          supporting={
            dashboard.summary.savingsRate === null
              ? "Savings rate needs recorded income"
              : `Savings rate ${formatPercent(
                  dashboard.summary.savingsRate,
                  dashboard.profile.locale,
                  1,
                )}`
          }
          trend={trendBadge(cashFlowTrend.ratio, cashFlowTrend.tone)}
          value={
            <Money
              amountMinor={dashboard.summary.netCashFlowMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
              showSign
              tone={
                dashboard.summary.netCashFlowMinor > 0
                  ? "positive"
                  : dashboard.summary.netCashFlowMinor < 0
                    ? "negative"
                    : "default"
              }
            />
          }
        />
      </div>

      <div className="f-overview-primary-grid">
        <Surface className="f-overview-plan">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">Plan</span>
              <h2>Spending pace</h2>
            </div>
            <Badge tone={statusTone(dashboard.financialStatus.tone)}>
              {dashboard.planning.configured
                ? status.title
                : "No plan"}
            </Badge>
          </div>

          {dashboard.planning.configured &&
          dashboard.planning.plannedSpendMinor !== null &&
          dashboard.planning.budgetedSpentMinor !== null ? (
            <>
              <div className="f-overview-plan__hero">
                <div>
                  <span>Budgeted spending</span>
                  <strong>
                    <Money
                      amountMinor={dashboard.planning.budgetedSpentMinor}
                      currencyCode={dashboard.profile.currencyCode}
                      locale={dashboard.profile.locale}
                    />
                    <span className="f-overview-plan__divider"> / </span>
                    <Money
                      amountMinor={dashboard.planning.plannedSpendMinor}
                      currencyCode={dashboard.profile.currencyCode}
                      locale={dashboard.profile.locale}
                      tone="muted"
                    />
                  </strong>
                </div>
                <div className="f-overview-plan__elapsed">
                  <span>Period elapsed</span>
                  <strong>
                    {formatPercent(
                      dashboard.planning.elapsedRatio,
                      dashboard.profile.locale,
                      0,
                    )}
                  </strong>
                </div>
              </div>

              <ProgressBar
                detail={
                  dashboard.planning.paceRatio === null
                    ? undefined
                    : formatPercent(
                        dashboard.planning.paceRatio,
                        dashboard.profile.locale,
                        0,
                      )
                }
                label="Plan used"
                tone={
                  dashboard.financialStatus.tone === "negative"
                    ? "negative"
                    : dashboard.financialStatus.tone === "warning"
                      ? "warning"
                      : "accent"
                }
                value={dashboard.planning.paceRatio ?? 0}
              />

              <div className="f-overview-plan__facts">
                <div>
                  <span>Remaining</span>
                  <strong>
                    <Money
                      amountMinor={dashboard.planning.remainingMinor ?? 0}
                      currencyCode={dashboard.profile.currencyCode}
                      locale={dashboard.profile.locale}
                      tone={
                        (dashboard.planning.remainingMinor ?? 0) < 0
                          ? "negative"
                          : "default"
                      }
                    />
                  </strong>
                </div>
                <div>
                  <span>Projected</span>
                  <strong>
                    {dashboard.planning.projectedSpendMinor === null ? (
                      "—"
                    ) : (
                      <Money
                        amountMinor={dashboard.planning.projectedSpendMinor}
                        currencyCode={dashboard.profile.currencyCode}
                        locale={dashboard.profile.locale}
                      />
                    )}
                  </strong>
                </div>
                <div>
                  <span>Planned income</span>
                  <strong>
                    {dashboard.planning.plannedIncomeMinor === null ? (
                      "—"
                    ) : (
                      <Money
                        amountMinor={dashboard.planning.plannedIncomeMinor}
                        currencyCode={dashboard.profile.currencyCode}
                        locale={dashboard.profile.locale}
                      />
                    )}
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <div className="f-overview-plan__empty">
              <Icon name="plan" size={22} />
              <div>
                <strong>No budget configured</strong>
                <span>
                  Finance will not invent an “available to spend” number
                  without a real plan.
                </span>
              </div>
              <Button
                onClick={() => onNavigate("budget")}
                size="sm"
                variant="secondary"
              >
                Open Plan
              </Button>
            </div>
          )}
        </Surface>

        <Surface className="f-overview-attention">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">Attention</span>
              <h2>Needs attention</h2>
            </div>
            <span className="f-attention-card__count">
              {dashboard.attention.totalCount}
            </span>
          </div>

          {dashboard.attention.items.length === 0 ? (
            <div className="f-overview-attention__empty">
              <Icon name="check" size={20} />
              <div>
                <strong>Nothing needs attention</strong>
                <span>
                  No review blockers or reconciliation issues are currently
                  surfaced.
                </span>
              </div>
            </div>
          ) : (
            <div className="f-overview-attention__list">
              {dashboard.attention.items.map((item, index) => (
                <AttentionRow
                  item={item}
                  key={`${item.code}-${item.entityId ?? index}`}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </Surface>
      </div>

      <div className="f-overview-secondary-grid">
        <Surface className="f-overview-categories">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">Spending</span>
              <h2>Top categories</h2>
            </div>
            <Button
              onClick={() => onNavigate("categories")}
              size="sm"
              variant="ghost"
            >
              Explore
              <Icon name="chevronRight" size={15} />
            </Button>
          </div>

          {dashboard.topCategories.length === 0 ? (
            <div className="f-overview-inline-empty">
              No category spending in this period.
            </div>
          ) : (
            <div className="f-overview-category-list">
              {dashboard.topCategories.map((category) => {
                const max =
                  dashboard.topCategories[0]?.currentMinor ?? 1;
                const ratio = category.deltaRatio;
                return (
                  <button
                    className="f-overview-category"
                    key={category.categoryId}
                    onClick={() => onNavigate("categories")}
                    type="button"
                  >
                    <div className="f-overview-category__top">
                      <strong>{category.name}</strong>
                      <Money
                        amountMinor={category.currentMinor}
                        currencyCode={dashboard.profile.currencyCode}
                        locale={dashboard.profile.locale}
                      />
                    </div>
                    <div className="f-overview-category__bar">
                      <span
                        style={{
                          width: `${Math.max(
                            4,
                            (category.currentMinor / max) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="f-overview-category__meta">
                      <span>
                        {category.share === null
                          ? "—"
                          : `${formatPercent(
                              category.share,
                              dashboard.profile.locale,
                              0,
                            )} of spending`}
                      </span>
                      <span
                        className={
                          ratio === null || ratio === 0
                            ? ""
                            : ratio < 0
                              ? "is-positive"
                              : "is-negative"
                        }
                      >
                        {ratio === null
                          ? "No baseline"
                          : `${ratio > 0 ? "↑" : ratio < 0 ? "↓" : ""} ${formatPercent(
                              Math.abs(ratio),
                              dashboard.profile.locale,
                              1,
                            )}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Surface>

        <Surface className="f-overview-position">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">Position</span>
              <h2>Tracked accounts</h2>
            </div>
            <Button
              onClick={() => onNavigate("accounts")}
              size="sm"
              variant="ghost"
            >
              Accounts
              <Icon name="chevronRight" size={15} />
            </Button>
          </div>
          <div className="f-overview-position__value">
            <span>Tracked net position</span>
            <Money
              amountMinor={dashboard.accounts.trackedNetWorthMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
            />
          </div>
          <p>
            Based on {dashboard.accounts.activeCount} active account
            {dashboard.accounts.activeCount === 1 ? "" : "s"} marked for net
            worth tracking. Full net-worth modeling is expanded in its
            dedicated phase.
          </p>
        </Surface>
      </div>

      <Surface className="f-overview-activity">
        <div className="f-section-heading f-overview-activity__heading">
          <div>
            <span className="f-section-heading__kicker">Money</span>
            <h2>Recent activity</h2>
          </div>
          <Button
            onClick={() => onNavigate("activity")}
            size="sm"
            variant="ghost"
          >
            View all
            <Icon name="chevronRight" size={15} />
          </Button>
        </div>

        {dashboard.recentActivity.length === 0 ? (
          <div className="f-overview-inline-empty">
            No posted activity yet.
          </div>
        ) : (
          <div className="f-overview-activity__rows">
            {dashboard.recentActivity.map((item) => {
              const amount =
                item.entityKind === "transaction" &&
                item.transactionType === "income"
                  ? item.amountMinor ?? 0
                  : item.entityKind === "transaction" &&
                      (item.transactionType === "refund" ||
                        item.transactionType === "reimbursement")
                    ? item.amountMinor ?? 0
                    : -(item.amountMinor ?? 0);

              return (
                <button
                  className="f-overview-activity-row"
                  key={`${item.entityKind}-${item.id}`}
                  onClick={() => onNavigate("activity")}
                  type="button"
                >
                  <span className="f-merchant-avatar" aria-hidden="true">
                    {(item.merchantName ?? item.title).slice(0, 1)}
                  </span>
                  <span className="f-overview-activity-row__main">
                    <strong>{item.merchantName ?? item.title}</strong>
                    <span>
                      {item.categories[0]?.name ??
                        item.transactionType ??
                        "Receipt"}
                      {item.itemCount > 0
                        ? ` · ${item.itemCount} item${item.itemCount === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </span>
                  {item.hasReceipt ? (
                    <Badge tone="neutral">Receipt</Badge>
                  ) : null}
                  <Money
                    amountMinor={amount}
                    currencyCode={item.currencyCode}
                    locale={dashboard.profile.locale}
                    showSign={amount > 0}
                    tone={
                      amount > 0
                        ? "positive"
                        : amount < 0
                          ? "default"
                          : "muted"
                    }
                  />
                </button>
              );
            })}
          </div>
        )}
      </Surface>
    </div>
  );
}
