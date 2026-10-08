import { useMemo, useState } from "react";
import type {
  RecurringDetectionCandidate,
  RecurringHealth,
  RecurringPattern,
  RecurringPriceDirection,
} from "../domain/recurring.js";
import {
  Badge,
  Button,
  FilterChip,
  Money,
  Skeleton,
  StatCard,
  Surface,
} from "../ui/components/Primitives.js";
import {
  ChartFrame,
  FinanceChartTable,
} from "../ui/charts/ChartFrame.js";
import { FinanceDonutChart, FinanceLineChart } from "../ui/charts/FinanceCharts.js";
import type {
  ChartViewMode,
  FinanceChartDatum,
  FinanceChartSeries,
} from "../ui/charts/chart-types.js";
import {
  formatMoneyMinor,
  formatPercent,
} from "../ui/format/money.js";
import { Icon } from "../ui/icons/Icon.js";
import { useRecurringWorkspace } from "./use-recurring.js";

type RecurringFilter =
  | "all"
  | "subscriptions"
  | "bills"
  | "income"
  | "transfers";

const filterOptions: Array<{
  value: RecurringFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "bills", label: "Bills" },
  { value: "income", label: "Income" },
  { value: "transfers", label: "Transfers" },
];

function healthTone(
  health: RecurringHealth,
): "positive" | "negative" | "warning" | "accent" | "neutral" {
  switch (health) {
    case "missing":
      return "negative";
    case "late":
    case "due":
    case "unscheduled":
      return "warning";
    case "upcoming":
      return "accent";
    case "on_track":
      return "positive";
    default:
      return "neutral";
  }
}

function healthLabel(health: RecurringHealth): string {
  return {
    on_track: "On track",
    upcoming: "Upcoming",
    due: "Due",
    late: "Late",
    missing: "Missing",
    paused: "Paused",
    ended: "Ended",
    unscheduled: "Unscheduled",
  }[health];
}

function priceTone(
  direction: RecurringPriceDirection,
): "positive" | "negative" | "neutral" {
  if (direction === "down") return "positive";
  if (direction === "up") return "negative";
  return "neutral";
}

function cadenceLabel(pattern: RecurringPattern): string {
  if (!pattern.cadence) return pattern.rrule;

  if (pattern.cadenceInterval === 1) {
    return {
      daily: "Daily",
      weekly: "Weekly",
      monthly: "Monthly",
      yearly: "Yearly",
    }[pattern.cadence];
  }

  if (
    pattern.cadence === "monthly" &&
    pattern.cadenceInterval === 3
  ) {
    return "Quarterly";
  }

  if (
    pattern.cadence === "monthly" &&
    pattern.cadenceInterval === 6
  ) {
    return "Every 6 months";
  }

  if (
    pattern.cadence === "weekly" &&
    pattern.cadenceInterval === 2
  ) {
    return "Every 2 weeks";
  }

  return `Every ${pattern.cadenceInterval} ${pattern.cadence}`;
}

function candidateCadenceLabel(
  candidate: RecurringDetectionCandidate,
): string {
  if (
    candidate.cadence === "monthly" &&
    candidate.cadenceInterval === 3
  ) {
    return "Quarterly";
  }
  if (candidate.cadenceInterval === 1) {
    return {
      daily: "Daily",
      weekly: "Weekly",
      monthly: "Monthly",
      yearly: "Yearly",
    }[candidate.cadence];
  }
  return `Every ${candidate.cadenceInterval} ${candidate.cadence}`;
}

function priceChangeLabel(
  pattern: RecurringPattern,
  locale: string,
): string {
  if (
    pattern.priceDirection === "insufficient_history" ||
    pattern.priceChangeRatio === null
  ) {
    return "No baseline";
  }

  if (pattern.priceDirection === "stable") return "Stable";

  return (
    (pattern.priceDirection === "up" ? "↑ " : "↓ ") +
    formatPercent(
      Math.abs(pattern.priceChangeRatio),
      locale,
      1,
    )
  );
}

function dateLabel(
  value: string | null,
  locale: string,
  timeZone: string,
): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

function relativeNextLabel(days: number | null): string {
  if (days === null) return "No date";
  if (days < 0) {
    const abs = Math.abs(days);
    return `${abs} day${abs === 1 ? "" : "s"} late`;
  }
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function filterPattern(
  pattern: RecurringPattern,
  filter: RecurringFilter,
): boolean {
  switch (filter) {
    case "subscriptions":
      return pattern.subscription !== null;
    case "bills":
      return (
        pattern.transactionType === "expense" &&
        pattern.subscription === null
      );
    case "income":
      return pattern.transactionType === "income";
    case "transfers":
      return pattern.transactionType === "transfer";
    default:
      return true;
  }
}

function RecurringLoading() {
  return (
    <div className="f-recurring">
      <div className="f-recurring-heading">
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
          </Surface>
        ))}
      </div>
      <Surface>
        <Skeleton className="f-overview-skeleton--panel" />
      </Surface>
    </div>
  );
}

export interface RecurringPageProps {
  onNavigate: (key: string) => void;
}

export function RecurringPage({
  onNavigate,
}: RecurringPageProps) {
  const workspace = useRecurringWorkspace();
  const [filter, setFilter] =
    useState<RecurringFilter>("all");
  const [selectedPatternId, setSelectedPatternId] =
    useState<string | null>(null);
  const [trendView, setTrendView] =
    useState<ChartViewMode>("chart");

  if (workspace.state === "loading") {
    return <RecurringLoading />;
  }

  if (
    workspace.state !== "ready" ||
    !workspace.dashboard ||
    !workspace.detection
  ) {
    return (
      <div className="f-overview-empty">
        <Surface>
          <div className="f-route-foundation__icon">
            <Icon
              name={
                workspace.state === "error"
                  ? "alert"
                  : workspace.state === "unconfigured"
                    ? "settings"
                    : "accounts"
              }
              size={22}
            />
          </div>
          <Badge
            tone={
              workspace.state === "error"
                ? "negative"
                : "accent"
            }
          >
            Recurring analytics
          </Badge>
          <h1>
            {workspace.state === "unconfigured"
              ? "Finance backend is not configured."
              : workspace.state === "unauthenticated"
                ? "A Finance session is required."
                : "Recurring analytics could not be loaded."}
          </h1>
          <p>
            {workspace.error ??
              "Recurring data is available only from the authenticated Finance ledger."}
          </p>
          {workspace.state === "error" ? (
            <Button
              onClick={() => void workspace.refresh()}
              variant="primary"
            >
              Retry
            </Button>
          ) : null}
        </Surface>
      </div>
    );
  }

  const { dashboard, detection } = workspace;
  const { summary } = dashboard;

  const trendData: FinanceChartDatum[] =
    dashboard.trend.map((point) => ({
      key: point.monthStart,
      label: new Intl.DateTimeFormat(
        dashboard.profile.locale,
        {
          month: "short",
          timeZone: dashboard.profile.timeZone,
        },
      ).format(new Date(`${point.monthStart}T12:00:00Z`)),
      expense: point.expenseMinor,
      subscriptions: point.subscriptionMinor,
    }));

  const trendSeries: FinanceChartSeries[] = [
    {
      dataKey: "expense",
      label: "Recurring expenses",
      tone: "primary",
    },
    {
      dataKey: "subscriptions",
      label: "Subscription portion",
      tone: "secondary",
    },
  ];

  const categoryDonut = dashboard.categories.map(
    (category, index) => ({
      key: category.categoryId ?? "uncategorized",
      label: category.categoryName,
      value: category.monthlyMinor,
      tone: (
        ["primary", "secondary", "tertiary", "quaternary"] as const
      )[index % 4] ?? "primary",
    }),
  );

  const patterns = dashboard.patterns.filter((pattern) =>
    filterPattern(pattern, filter),
  );

  const selectedPattern = dashboard.patterns.find(
    (pattern) => pattern.patternId === selectedPatternId,
  );

  return (
    <div className="f-recurring">
      <div className="f-recurring-heading">
        <div>
          <div className="f-recurring-heading__meta">
            <Badge tone="accent">Recurring Intelligence</Badge>
            <span>
              Linked posted transactions · deterministic expectations
            </span>
          </div>
          <h1>Bills & subscriptions</h1>
          <p>
            Understand recurring commitments, upcoming charges,
            price changes, missed expectations and newly detected
            patterns without double-counting ledger activity.
          </p>
        </div>

        <div className="f-recurring-heading__actions">
          <Badge tone="neutral">
            {summary.activeCount} active
          </Badge>
          {summary.attentionCount > 0 ? (
            <Badge tone="warning">
              {summary.attentionCount} need attention
            </Badge>
          ) : (
            <Badge tone="positive">No recurring alerts</Badge>
          )}
        </div>
      </div>

      {workspace.actionError ? (
        <Surface className="f-recurring-action-error">
          <Badge tone="negative">Action failed</Badge>
          <span>{workspace.actionError}</span>
        </Surface>
      ) : null}

      <div className="f-overview-stats">
        <StatCard
          label="Monthly recurring"
          supporting="Active recurring expenses normalized to one month"
          trend={
            <Badge
              tone={
                summary.creepDeltaRatio === null ||
                summary.creepDeltaRatio === 0
                  ? "neutral"
                  : summary.creepDeltaRatio < 0
                    ? "positive"
                    : "negative"
              }
            >
              {summary.creepDeltaRatio === null
                ? "No 3M baseline"
                : formatPercent(
                    summary.creepDeltaRatio,
                    dashboard.profile.locale,
                    1,
                  ) + " vs 3M ago"}
            </Badge>
          }
          value={
            <Money
              amountMinor={summary.monthlyExpenseMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
            />
          }
        />
        <StatCard
          label="Annualized"
          supporting="Current recurring expense run rate"
          value={
            <Money
              amountMinor={summary.annualizedExpenseMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
            />
          }
        />
        <StatCard
          label="Subscriptions"
          supporting={
            formatMoneyMinor(
              summary.monthlySubscriptionMinor,
              dashboard.profile.currencyCode,
              { locale: dashboard.profile.locale },
            ) + " / month"
          }
          value={
            <span className="f-tabular">
              {summary.subscriptionCount}
            </span>
          }
        />
        <StatCard
          label="Next 30 days"
          supporting={
            summary.next30dCount +
            " expected recurring charge" +
            (summary.next30dCount === 1 ? "" : "s")
          }
          value={
            <Money
              amountMinor={summary.next30dExpenseMinor}
              currencyCode={dashboard.profile.currencyCode}
              locale={dashboard.profile.locale}
            />
          }
        />
      </div>

      <Surface>
        <ChartFrame
          description="Actual posted transactions linked to confirmed recurring patterns. Subscription spend is shown as a subset of total recurring expense."
          eyebrow="Cost trend"
          onViewModeChange={setTrendView}
          summary={
            <div className="f-recurring-trend-summary">
              <div>
                <span>Current run rate</span>
                <strong>
                  {formatMoneyMinor(
                    summary.monthlyExpenseMinor,
                    dashboard.profile.currencyCode,
                    { locale: dashboard.profile.locale },
                  )}
                </strong>
              </div>
              <div>
                <span>3 months ago</span>
                <strong>
                  {formatMoneyMinor(
                    summary.baselineMonthlyExpenseMinor,
                    dashboard.profile.currencyCode,
                    { locale: dashboard.profile.locale },
                  )}
                </strong>
              </div>
            </div>
          }
          title="Recurring spending over 12 months"
          viewMode={trendView}
        >
          {trendView === "chart" ? (
            <FinanceLineChart
              ariaLabel="Recurring spending over twelve months"
              data={trendData}
              onDatumActivate={() => onNavigate("activity")}
              series={trendSeries}
              tickFormatter={(value) =>
                new Intl.NumberFormat(
                  dashboard.profile.locale,
                  {
                    style: "currency",
                    currency: dashboard.profile.currencyCode,
                    notation: "compact",
                    maximumFractionDigits: 1,
                  },
                ).format(value / 100)
              }
              valueFormatter={(value) =>
                formatMoneyMinor(
                  value,
                  dashboard.profile.currencyCode,
                  { locale: dashboard.profile.locale },
                )
              }
            />
          ) : (
            <FinanceChartTable
              data={trendData}
              onDatumActivate={() => onNavigate("activity")}
              series={trendSeries}
              valueFormatter={(value) =>
                formatMoneyMinor(
                  value,
                  dashboard.profile.currencyCode,
                  { locale: dashboard.profile.locale },
                )
              }
            />
          )}
        </ChartFrame>
      </Surface>

      <Surface>
        <div className="f-section-heading">
          <div>
            <span className="f-section-heading__kicker">
              Cost structure
            </span>
            <h2>Recurring expense by category</h2>
          </div>
          <Badge tone="neutral">
            Monthly equivalent
          </Badge>
        </div>

        {dashboard.categories.length === 0 ? (
          <div className="f-overview-inline-empty">
            No active recurring expense categories yet.
          </div>
        ) : (
          <div className="f-recurring-category-composition">
            <FinanceDonutChart
              ariaLabel="Recurring expense category composition"
              data={categoryDonut}
              height={230}
              valueFormatter={(value) =>
                formatMoneyMinor(
                  value,
                  dashboard.profile.currencyCode,
                  { locale: dashboard.profile.locale },
                )
              }
            />
            <div className="f-recurring-category-list">
              {dashboard.categories.map((category) => (
                <div
                  className="f-recurring-category-row"
                  key={category.categoryId ?? "uncategorized"}
                >
                  <span>
                    <strong>{category.categoryName}</strong>
                    <small>
                      {category.patternCount} pattern
                      {category.patternCount === 1 ? "" : "s"}
                      {category.share === null
                        ? ""
                        : " · " +
                          formatPercent(
                            category.share,
                            dashboard.profile.locale,
                            0,
                          )}
                    </small>
                  </span>
                  <span>
                    <Money
                      amountMinor={category.monthlyMinor}
                      currencyCode={dashboard.profile.currencyCode}
                      locale={dashboard.profile.locale}
                    />
                    <small>
                      {formatMoneyMinor(
                        category.annualizedMinor,
                        dashboard.profile.currencyCode,
                        { locale: dashboard.profile.locale },
                      )}{" "}
                      / year
                    </small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Surface>

      <div className="f-recurring-grid">
        <Surface>
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Attention
              </span>
              <h2>Needs review</h2>
            </div>
            {summary.missingCount > 0 ? (
              <Badge tone="negative">
                {summary.missingCount} missing
              </Badge>
            ) : null}
          </div>

          {dashboard.attention.length === 0 ? (
            <div className="f-overview-inline-empty">
              No missing charges or recurring price increases.
            </div>
          ) : (
            <div className="f-recurring-attention-list">
              {dashboard.attention.map((item) => (
                <button
                  className="f-recurring-attention"
                  key={item.patternId + item.kind}
                  onClick={() =>
                    setSelectedPatternId(item.patternId)
                  }
                  type="button"
                >
                  <Badge
                    tone={
                      item.severity === "negative"
                        ? "negative"
                        : "warning"
                    }
                  >
                    {item.kind === "price_increase"
                      ? "Price increase"
                      : item.kind === "missing"
                        ? "Missing"
                        : "Late"}
                  </Badge>
                  <span className="f-recurring-attention__copy">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  {item.changeRatio !== null ? (
                    <strong className="f-recurring-attention__value">
                      {formatPercent(
                        item.changeRatio,
                        dashboard.profile.locale,
                        1,
                      )}
                    </strong>
                  ) : item.expectedAt ? (
                    <span className="f-recurring-attention__value">
                      {dateLabel(
                        item.expectedAt,
                        dashboard.profile.locale,
                        dashboard.profile.timeZone,
                      )}
                    </span>
                  ) : null}
                  <Icon name="chevronRight" size={16} />
                </button>
              ))}
            </div>
          )}
        </Surface>

        <Surface>
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Forecast
              </span>
              <h2>Upcoming</h2>
            </div>
            <Badge tone="neutral">
              {dashboard.horizonDays} days
            </Badge>
          </div>

          {dashboard.upcoming.length === 0 ? (
            <div className="f-overview-inline-empty">
              No recurring events are expected in this window.
            </div>
          ) : (
            <div className="f-recurring-upcoming-list">
              {dashboard.upcoming.map((item) => (
                <button
                  className="f-recurring-upcoming"
                  key={item.patternId}
                  onClick={() =>
                    setSelectedPatternId(item.patternId)
                  }
                  type="button"
                >
                  <span className="f-recurring-upcoming__date">
                    <strong>
                      {new Intl.DateTimeFormat(
                        dashboard.profile.locale,
                        {
                          day: "2-digit",
                          month: "short",
                          timeZone:
                            dashboard.profile.timeZone,
                        },
                      ).format(
                        new Date(item.nextExpectedAt),
                      )}
                    </strong>
                    <small>
                      {relativeNextLabel(item.daysToNext)}
                    </small>
                  </span>
                  <span className="f-recurring-upcoming__copy">
                    <strong>{item.name}</strong>
                    <span>
                      {item.merchantName ??
                        (item.isSubscription
                          ? "Subscription"
                          : item.transactionType)}
                    </span>
                  </span>
                  <Money
                    amountMinor={item.amountMinor}
                    currencyCode={item.currencyCode}
                    locale={dashboard.profile.locale}
                  />
                  <Badge tone={healthTone(item.health)}>
                    {healthLabel(item.health)}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </Surface>
      </div>

      <Surface className="f-recurring-patterns">
        <div className="f-section-heading">
          <div>
            <span className="f-section-heading__kicker">
              Commitments
            </span>
            <h2>Recurring ledger</h2>
          </div>
          <div className="f-recurring-filters">
            {filterOptions.map((option) => (
              <FilterChip
                active={filter === option.value}
                key={option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </FilterChip>
            ))}
          </div>
        </div>

        {patterns.length === 0 ? (
          <div className="f-overview-inline-empty">
            No recurring patterns match this filter.
          </div>
        ) : (
          <div className="f-recurring-pattern-list">
            {patterns.map((pattern) => {
              const open =
                selectedPatternId === pattern.patternId;
              const busy =
                workspace.busyKey ===
                `pattern:${pattern.patternId}`;

              return (
                <div
                  className={
                    open
                      ? "f-recurring-pattern f-recurring-pattern--open"
                      : "f-recurring-pattern"
                  }
                  key={pattern.patternId}
                >
                  <button
                    aria-expanded={open}
                    className="f-recurring-pattern__summary"
                    onClick={() =>
                      setSelectedPatternId(
                        open ? null : pattern.patternId,
                      )
                    }
                    type="button"
                  >
                    <span className="f-recurring-pattern__identity">
                      <span className="f-recurring-pattern__badges">
                        <Badge tone={healthTone(pattern.health)}>
                          {healthLabel(pattern.health)}
                        </Badge>
                        {pattern.subscription ? (
                          <Badge tone="neutral">
                            Subscription
                          </Badge>
                        ) : null}
                      </span>
                      <strong>{pattern.name}</strong>
                      <small>
                        {[
                          pattern.merchantName,
                          cadenceLabel(pattern),
                          pattern.categoryName,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>

                    <span className="f-recurring-pattern__metric">
                      <small>Monthly</small>
                      <Money
                        amountMinor={
                          pattern.monthlyEquivalentMinor
                        }
                        currencyCode={pattern.currencyCode}
                        locale={dashboard.profile.locale}
                      />
                    </span>

                    <span className="f-recurring-pattern__metric">
                      <small>Yearly</small>
                      <Money
                        amountMinor={pattern.annualizedMinor}
                        currencyCode={pattern.currencyCode}
                        locale={dashboard.profile.locale}
                      />
                    </span>

                    <span className="f-recurring-pattern__metric">
                      <small>Next</small>
                      <strong>
                        {relativeNextLabel(
                          pattern.daysToNext,
                        )}
                      </strong>
                    </span>

                    <Badge
                      tone={priceTone(
                        pattern.priceDirection,
                      )}
                    >
                      {priceChangeLabel(
                        pattern,
                        dashboard.profile.locale,
                      )}
                    </Badge>

                    <Icon
                      name="chevronRight"
                      size={16}
                    />
                  </button>

                  {open ? (
                    <div className="f-recurring-pattern__detail">
                      <div className="f-recurring-pattern__detail-grid">
                        <div>
                          <span>Latest charge</span>
                          <strong>
                            {pattern.latestAmountMinor === null
                              ? "—"
                              : formatMoneyMinor(
                                  pattern.latestAmountMinor,
                                  pattern.currencyCode,
                                  {
                                    locale:
                                      dashboard.profile.locale,
                                  },
                                )}
                          </strong>
                        </div>
                        <div>
                          <span>Average</span>
                          <strong>
                            {pattern.averageAmountMinor === null
                              ? "—"
                              : formatMoneyMinor(
                                  pattern.averageAmountMinor,
                                  pattern.currencyCode,
                                  {
                                    locale:
                                      dashboard.profile.locale,
                                  },
                                )}
                          </strong>
                        </div>
                        <div>
                          <span>Last seen</span>
                          <strong>
                            {dateLabel(
                              pattern.lastOccurrenceAt,
                              dashboard.profile.locale,
                              dashboard.profile.timeZone,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Next expected</span>
                          <strong>
                            {dateLabel(
                              pattern.nextExpectedAt,
                              dashboard.profile.locale,
                              dashboard.profile.timeZone,
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Evidence</span>
                          <strong>
                            {pattern.occurrenceCount} linked
                          </strong>
                        </div>
                        <div>
                          <span>Source</span>
                          <strong>{pattern.source}</strong>
                        </div>
                      </div>

                      <div className="f-recurring-occurrence-list">
                        {pattern.recentOccurrences.length ===
                        0 ? (
                          <div className="f-overview-inline-empty">
                            No linked occurrences yet.
                          </div>
                        ) : (
                          pattern.recentOccurrences.map(
                            (occurrence) => (
                              <button
                                className="f-recurring-occurrence"
                                key={
                                  occurrence.transactionId
                                }
                                onClick={() =>
                                  onNavigate("activity")
                                }
                                type="button"
                              >
                                <span>
                                  <strong>
                                    {dateLabel(
                                      occurrence.occurredAt,
                                      dashboard.profile
                                        .locale,
                                      dashboard.profile
                                        .timeZone,
                                    )}
                                  </strong>
                                  <small>
                                    {occurrence.expectedAt
                                      ? "Expected " +
                                        dateLabel(
                                          occurrence.expectedAt,
                                          dashboard.profile
                                            .locale,
                                          dashboard.profile
                                            .timeZone,
                                        )
                                      : "Linked occurrence"}
                                  </small>
                                </span>
                                <Money
                                  amountMinor={
                                    occurrence.amountMinor
                                  }
                                  currencyCode={
                                    pattern.currencyCode
                                  }
                                  locale={
                                    dashboard.profile.locale
                                  }
                                />
                                <Badge tone="neutral">
                                  {occurrence.matchSource}
                                </Badge>
                                <Icon
                                  name="chevronRight"
                                  size={15}
                                />
                              </button>
                            ),
                          )
                        )}
                      </div>

                      <div className="f-recurring-pattern__actions">
                        <Button
                          icon="activity"
                          onClick={() =>
                            onNavigate("activity")
                          }
                          size="sm"
                          variant="ghost"
                        >
                          Open Activity
                        </Button>

                        {pattern.status === "active" ? (
                          <>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                void workspace.setPatternStatus(
                                  pattern.patternId,
                                  "paused",
                                )
                              }
                              size="sm"
                              variant="secondary"
                            >
                              Pause
                            </Button>
                            <Button
                              disabled={busy}
                              onClick={() =>
                                void workspace.setPatternStatus(
                                  pattern.patternId,
                                  "ended",
                                )
                              }
                              size="sm"
                              variant="ghost"
                            >
                              End
                            </Button>
                          </>
                        ) : (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void workspace.setPatternStatus(
                                pattern.patternId,
                                "active",
                              )
                            }
                            size="sm"
                            variant="secondary"
                          >
                            Resume
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      <Surface className="f-recurring-detection">
        <div className="f-section-heading">
          <div>
            <span className="f-section-heading__kicker">
              Detection
            </span>
            <h2>Suspected recurring activity</h2>
          </div>
          <Badge
            tone={
              detection.candidates.length > 0
                ? "accent"
                : "neutral"
            }
          >
            {detection.candidates.length} candidate
            {detection.candidates.length === 1 ? "" : "s"}
          </Badge>
        </div>

        <p className="f-recurring-section-note">
          Finance requires at least three unlinked posted
          occurrences with a regular cadence before suggesting a
          pattern. Nothing here becomes recurring until you
          confirm it.
        </p>

        {detection.candidates.length === 0 ? (
          <div className="f-overview-inline-empty">
            No strong untracked recurring patterns were detected.
          </div>
        ) : (
          <div className="f-recurring-candidate-list">
            {detection.candidates.map((candidate) => {
              const busy =
                workspace.busyKey ===
                `candidate:${candidate.candidateId}`;

              return (
                <div
                  className="f-recurring-candidate"
                  key={candidate.candidateId}
                >
                  <div className="f-recurring-candidate__identity">
                    <div className="f-recurring-pattern__badges">
                      <Badge tone="accent">
                        {candidateCadenceLabel(candidate)}
                      </Badge>
                      {candidate.subscriptionLikely ? (
                        <Badge tone="neutral">
                          Likely subscription
                        </Badge>
                      ) : null}
                    </div>
                    <strong>{candidate.name}</strong>
                    <span>
                      {candidate.occurrenceCount} occurrences ·{" "}
                      {formatPercent(
                        candidate.confidence,
                        dashboard.profile.locale,
                        0,
                      )} confidence
                    </span>
                  </div>

                  <div className="f-recurring-candidate__metric">
                    <small>Latest</small>
                    <Money
                      amountMinor={
                        candidate.latestAmountMinor
                      }
                      currencyCode={candidate.currencyCode}
                      locale={dashboard.profile.locale}
                    />
                  </div>

                  <div className="f-recurring-candidate__metric">
                    <small>Monthly equivalent</small>
                    <Money
                      amountMinor={
                        candidate.monthlyEquivalentMinor
                      }
                      currencyCode={candidate.currencyCode}
                      locale={dashboard.profile.locale}
                    />
                  </div>

                  <div className="f-recurring-candidate__actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void workspace.confirmCandidate(
                          candidate,
                          false,
                        )
                      }
                      size="sm"
                      variant="secondary"
                    >
                      Track recurring
                    </Button>
                    {candidate.transactionType ===
                    "expense" ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void workspace.confirmCandidate(
                            candidate,
                            true,
                          )
                        }
                        size="sm"
                        variant={
                          candidate.subscriptionLikely
                            ? "primary"
                            : "ghost"
                        }
                      >
                        Track subscription
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Surface>
    </div>
  );
}
