import { useMemo, useState } from "react";
import type {
  ExplorerNecessity,
  ExplorerProductRow,
  SpendingExplorer,
} from "../domain/spending-explorer.js";
import type { OverviewPeriodKind } from "../domain/overview.js";
import {
  Badge,
  Button,
  FilterChip,
  Money,
  SegmentedControl,
  Skeleton,
  StatCard,
  Surface,
} from "../ui/components/Primitives.js";
import { formatMoneyMinor, formatPercent } from "../ui/format/money.js";
import { Icon } from "../ui/icons/Icon.js";
import {
  ChartFrame,
  FinanceChartTable,
} from "../ui/charts/ChartFrame.js";
import {
  FinanceDonutChart,
  FinanceLineChart,
} from "../ui/charts/FinanceCharts.js";
import type {
  ChartViewMode,
  FinanceChartDatum,
  FinanceChartSeries,
} from "../ui/charts/chart-types.js";
import {
  useProductPurchaseEvidence,
  useSpendingExplorer,
  type ExplorerLoadState,
} from "./use-spending-explorer.js";

const periodOptions = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
] as const;

const necessityOptions: Array<{
  value: ExplorerNecessity | null;
  label: string;
}> = [
  { value: null, label: "All needs" },
  { value: "essential", label: "Essential" },
  { value: "flexible", label: "Flexible" },
  { value: "discretionary", label: "Discretionary" },
  { value: "unclassified", label: "Unclassified" },
];

function bucketLabel(
  iso: string,
  bucketKind: SpendingExplorer["bucketKind"],
  explorer: SpendingExplorer,
): string {
  const date = new Date(iso);
  if (bucketKind === "month" || bucketKind === "quarter") {
    return new Intl.DateTimeFormat(explorer.profile.locale, {
      month: "short",
      timeZone: explorer.profile.timeZone,
    }).format(date);
  }
  if (bucketKind === "year") {
    return new Intl.DateTimeFormat(explorer.profile.locale, {
      year: "2-digit",
      timeZone: explorer.profile.timeZone,
    }).format(date);
  }
  return new Intl.DateTimeFormat(explorer.profile.locale, {
    day: "numeric",
    month: "short",
    timeZone: explorer.profile.timeZone,
  }).format(date);
}

function compactMoney(
  valueMinor: number,
  explorer: SpendingExplorer,
): string {
  return new Intl.NumberFormat(explorer.profile.locale, {
    style: "currency",
    currency: explorer.profile.currencyCode,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valueMinor / 100);
}

function ratioLabel(
  ratio: number | null,
  locale: string,
): string {
  if (ratio === null) return "No baseline";
  return (
    (ratio > 0 ? "↑ " : ratio < 0 ? "↓ " : "") +
    formatPercent(Math.abs(ratio), locale, 1)
  );
}

function changeTone(
  ratio: number | null,
): "positive" | "negative" | "neutral" {
  if (ratio === null || ratio === 0) return "neutral";
  return ratio < 0 ? "positive" : "negative";
}

function trendData(explorer: SpendingExplorer): FinanceChartDatum[] {
  const comparison = new Map(
    explorer.series.comparison.map((point) => [
      point.bucketIndex,
      point,
    ]),
  );

  return explorer.series.current.map((point) => ({
    key: String(point.bucketIndex),
    label: bucketLabel(
      point.bucketStart,
      explorer.bucketKind,
      explorer,
    ),
    current: point.netSpendMinor,
    comparison:
      comparison.get(point.bucketIndex)?.netSpendMinor ?? null,
  }));
}

function ExplorerLoading() {
  return (
    <div className="f-explorer">
      <div className="f-explorer-heading">
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

function ExplorerUnavailable({
  state,
  error,
  refresh,
}: {
  state: Exclude<ExplorerLoadState, "loading" | "ready">;
  error: string | null;
  refresh: () => Promise<void>;
}) {
  return (
    <div className="f-overview-empty">
      <Surface>
        <div className="f-route-foundation__icon">
          <Icon
            name={
              state === "unconfigured"
                ? "settings"
                : state === "unauthenticated"
                  ? "accounts"
                  : "alert"
            }
            size={22}
          />
        </div>
        <Badge tone={state === "error" ? "negative" : "accent"}>
          {state === "unconfigured"
            ? "Backend configuration"
            : state === "unauthenticated"
              ? "Authentication"
              : "Load error"}
        </Badge>
        <h1>
          {state === "unconfigured"
            ? "Finance backend is not configured in this build."
            : state === "unauthenticated"
              ? "A THIEPN Finance session is required."
              : "Spending Explorer could not be loaded."}
        </h1>
        <p>
          {error ??
            "The explorer only renders authenticated deterministic Finance data."}
        </p>
        {state === "error" ? (
          <Button
            onClick={() => void refresh()}
            variant="primary"
          >
            Retry
          </Button>
        ) : null}
      </Surface>
    </div>
  );
}

function ProductRow({
  product,
  explorer,
  active,
  onClick,
}: {
  product: ExplorerProductRow;
  explorer: SpendingExplorer;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={
        active
          ? "f-explorer-product f-explorer-product--active"
          : "f-explorer-product"
      }
      onClick={onClick}
      type="button"
    >
      <span className="f-explorer-product__main">
        <strong>{product.name}</strong>
        <span>
          {[product.brand, product.familyName, product.productType]
            .filter(Boolean)
            .join(" · ") || "Normalized product"}
        </span>
      </span>
      <span className="f-explorer-product__meta">
        <span>
          {product.purchaseCount} purchase
          {product.purchaseCount === 1 ? "" : "s"}
        </span>
        <Money
          amountMinor={product.currentItemizedMinor}
          currencyCode={explorer.profile.currencyCode}
          locale={explorer.profile.locale}
        />
      </span>
      <Badge tone={changeTone(product.deltaRatio)}>
        {ratioLabel(
          product.deltaRatio,
          explorer.profile.locale,
        )}
      </Badge>
      <Icon name="chevronRight" size={16} />
    </button>
  );
}

export interface SpendingExplorerPageProps {
  onNavigate: (key: string) => void;
  onOpenProduct?: (productId: string) => void;
  initialCategoryMode?: boolean;
}

export function SpendingExplorerPage({
  onNavigate,
  onOpenProduct,
  initialCategoryMode = false,
}: SpendingExplorerPageProps) {
  const [periodKind, setPeriodKind] =
    useState<OverviewPeriodKind>("month");
  const [categoryId, setCategoryId] = useState<string | null>(
    null,
  );
  const [merchantId, setMerchantId] = useState<string | null>(
    null,
  );
  const [necessity, setNecessity] =
    useState<ExplorerNecessity | null>(null);
  const [selectedProductId, setSelectedProductId] =
    useState<string | null>(null);
  const [trendView, setTrendView] =
    useState<ChartViewMode>("chart");

  const request = useMemo(
    () => ({
      periodKind,
      categoryId,
      merchantId,
      necessity,
      limit: 10,
    }),
    [categoryId, merchantId, necessity, periodKind],
  );

  const loader = useSpendingExplorer(request);
  const explorer = loader.explorer;

  const evidenceRequest = useMemo(
    () =>
      explorer && selectedProductId
        ? {
            productId: selectedProductId,
            periodStart: explorer.period.start,
            periodEnd: explorer.period.end,
            merchantId: explorer.scope.merchantId,
            limit: 30,
          }
        : null,
    [explorer, selectedProductId],
  );

  const evidence = useProductPurchaseEvidence(evidenceRequest);

  if (loader.state === "loading") return <ExplorerLoading />;
  if (loader.state !== "ready" || !explorer) {
    return (
      <ExplorerUnavailable
        error={loader.error}
        refresh={loader.refresh}
        state={loader.state === "ready" ? "error" : loader.state}
      />
    );
  }

  const chartData = trendData(explorer);
  const chartSeries: FinanceChartSeries[] = [
    {
      dataKey: "current",
      label: "Current period",
      tone: "primary",
    },
    {
      dataKey: "comparison",
      label: "Previous period",
      tone: "secondary",
      comparison: true,
    },
  ];

  const categoryDonut = explorer.children.map(
    (row, index) => ({
      key: row.categoryId,
      label: row.name,
      value: row.currentMinor,
      tone: (
        ["primary", "secondary", "tertiary", "quaternary"] as const
      )[index % 4] ?? "primary",
    }),
  );

  const necessityDonut = explorer.necessities.map(
    (row, index) => ({
      key: row.necessity,
      label: row.label,
      value: row.currentMinor,
      tone: (
        ["primary", "secondary", "tertiary", "quaternary"] as const
      )[index % 4] ?? "primary",
    }),
  );

  const maxMerchant =
    explorer.merchants[0]?.currentMinor ?? 1;

  const setCategory = (next: string | null) => {
    setCategoryId(next);
    setSelectedProductId(null);
  };

  const setMerchant = (next: string | null) => {
    setMerchantId(next);
    setSelectedProductId(null);
  };

  const setNeed = (next: ExplorerNecessity | null) => {
    setNecessity(next);
    setSelectedProductId(null);
  };

  const scopeTitle =
    explorer.scope.categoryName ??
    (initialCategoryMode ? "Categories" : "All spending");

  return (
    <div className="f-explorer">
      <div className="f-explorer-heading">
        <div>
          <div className="f-explorer-heading__meta">
            <Badge tone="accent">Spending Explorer</Badge>
            <span>
              Ledger totals · itemized receipt evidence
            </span>
          </div>
          <h1>{scopeTitle}</h1>
          <p>
            Drill from categories into merchants and products without
            changing the underlying financial source of truth.
          </p>
        </div>

        <SegmentedControl
          label="Explorer period"
          onChange={(value) => {
            setPeriodKind(value);
            setSelectedProductId(null);
          }}
          options={periodOptions}
          value={periodKind}
        />
      </div>

      <nav
        aria-label="Category breadcrumb"
        className="f-explorer-breadcrumb"
      >
        <button
          className={
            categoryId === null
              ? "f-explorer-breadcrumb__item is-current"
              : "f-explorer-breadcrumb__item"
          }
          onClick={() => setCategory(null)}
          type="button"
        >
          All spending
        </button>
        {explorer.scope.breadcrumb.map((item) => (
          <span
            className="f-explorer-breadcrumb__segment"
            key={item.categoryId}
          >
            <Icon name="chevronRight" size={14} />
            <button
              className={
                item.categoryId === explorer.scope.categoryId
                  ? "f-explorer-breadcrumb__item is-current"
                  : "f-explorer-breadcrumb__item"
              }
              onClick={() => setCategory(item.categoryId)}
              type="button"
            >
              {item.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="f-explorer-filterbar">
        <div className="f-explorer-filterbar__group">
          {necessityOptions.map((option) => (
            <FilterChip
              active={necessity === option.value}
              key={option.label}
              onClick={() => setNeed(option.value)}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>

        {explorer.scope.merchantId ? (
          <FilterChip
            active
            onClick={() => setMerchant(null)}
          >
            {explorer.scope.merchantName ?? "Merchant"} ×
          </FilterChip>
        ) : null}
      </div>

      <div className="f-overview-stats">
        <StatCard
          label="Net spending"
          supporting={
            explorer.summary.current.recoveriesMinor > 0
              ? formatMoneyMinor(
                  explorer.summary.current.recoveriesMinor,
                  explorer.profile.currencyCode,
                  { locale: explorer.profile.locale },
                ) + " recovered"
              : "Posted spending in scope"
          }
          value={
            <Money
              amountMinor={
                explorer.summary.current.netSpendMinor
              }
              currencyCode={explorer.profile.currencyCode}
              locale={explorer.profile.locale}
            />
          }
        />
        <StatCard
          label="Vs previous period"
          supporting="Equivalent previous calendar period"
          trend={
            <Badge
              tone={changeTone(
                explorer.summary.deltaRatio,
              )}
            >
              {ratioLabel(
                explorer.summary.deltaRatio,
                explorer.profile.locale,
              )}
            </Badge>
          }
          value={
            <Money
              amountMinor={explorer.summary.deltaMinor}
              currencyCode={explorer.profile.currencyCode}
              locale={explorer.profile.locale}
              showSign
              tone={
                explorer.summary.deltaMinor < 0
                  ? "positive"
                  : explorer.summary.deltaMinor > 0
                    ? "negative"
                    : "muted"
              }
            />
          }
        />
        <StatCard
          label="Transactions"
          supporting="Distinct posted transactions"
          value={
            <span className="f-tabular">
              {explorer.summary.current.transactionCount}
            </span>
          }
        />
        <StatCard
          label="Itemized evidence"
          supporting={
            explorer.summary.itemizedCoverageRatio === null
              ? "No receipt-item coverage yet"
              : formatPercent(
                  explorer.summary.itemizedCoverageRatio,
                  explorer.profile.locale,
                  0,
                ) + " of scoped spend represented"
          }
          value={
            <Money
              amountMinor={
                explorer.summary.itemizedEvidenceMinor
              }
              currencyCode={explorer.profile.currencyCode}
              locale={explorer.profile.locale}
            />
          }
        />
      </div>

      <Surface className="f-explorer-trend">
        <ChartFrame
          description={
            "Net ledger spending grouped by " +
            explorer.bucketKind +
            ". Refunds and reimbursements reduce the affected bucket."
          }
          eyebrow="Trend"
          onViewModeChange={setTrendView}
          summary={
            <div className="f-chart-summary">
              <div>
                <span>Current period</span>
                <strong>
                  {formatMoneyMinor(
                    explorer.summary.current.netSpendMinor,
                    explorer.profile.currencyCode,
                    { locale: explorer.profile.locale },
                  )}
                </strong>
              </div>
              <Badge
                tone={changeTone(
                  explorer.summary.deltaRatio,
                )}
              >
                {ratioLabel(
                  explorer.summary.deltaRatio,
                  explorer.profile.locale,
                )}
              </Badge>
            </div>
          }
          title="Spending over time"
          viewMode={trendView}
        >
          {trendView === "chart" ? (
            <FinanceLineChart
              ariaLabel="Scoped spending over time"
              data={chartData}
              onDatumActivate={() => onNavigate("activity")}
              series={chartSeries}
              tickFormatter={(value) =>
                compactMoney(value, explorer)
              }
              valueFormatter={(value) =>
                formatMoneyMinor(
                  value,
                  explorer.profile.currencyCode,
                  { locale: explorer.profile.locale },
                )
              }
            />
          ) : (
            <FinanceChartTable
              data={chartData}
              onDatumActivate={() => onNavigate("activity")}
              series={chartSeries}
              valueFormatter={(value) =>
                formatMoneyMinor(
                  value,
                  explorer.profile.currencyCode,
                  { locale: explorer.profile.locale },
                )
              }
            />
          )}
        </ChartFrame>
      </Surface>

      <div className="f-explorer-grid">
        <Surface className="f-explorer-categories">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Drill down
              </span>
              <h2>
                {categoryId ? "Subcategories" : "Categories"}
              </h2>
            </div>
            {explorer.directCategoryMinor !== null &&
            explorer.directCategoryMinor > 0 ? (
              <Badge tone="neutral">
                Direct{" "}
                {formatMoneyMinor(
                  explorer.directCategoryMinor,
                  explorer.profile.currencyCode,
                  { locale: explorer.profile.locale },
                )}
              </Badge>
            ) : null}
          </div>

          {explorer.children.length === 0 ? (
            <div className="f-overview-inline-empty">
              No deeper category split exists in this scope.
            </div>
          ) : (
            <div className="f-explorer-composition">
              <FinanceDonutChart
                ariaLabel="Category composition"
                data={categoryDonut}
                height={230}
                onDatumActivate={(datum) =>
                  setCategory(datum.key)
                }
                valueFormatter={(value) =>
                  formatMoneyMinor(
                    value,
                    explorer.profile.currencyCode,
                    { locale: explorer.profile.locale },
                  )
                }
              />
              <div className="f-explorer-ranked-list">
                {explorer.children.map((row) => (
                  <button
                    className="f-explorer-rank-row"
                    key={row.categoryId}
                    onClick={() =>
                      setCategory(row.categoryId)
                    }
                    type="button"
                  >
                    <span className="f-explorer-rank-row__main">
                      <strong>{row.name}</strong>
                      <span>
                        {row.transactionCount} tx
                        {row.share === null
                          ? ""
                          : " · " +
                            formatPercent(
                              row.share,
                              explorer.profile.locale,
                              0,
                            )}
                      </span>
                    </span>
                    <span className="f-explorer-rank-row__amount">
                      <Money
                        amountMinor={row.currentMinor}
                        currencyCode={
                          explorer.profile.currencyCode
                        }
                        locale={explorer.profile.locale}
                      />
                      <small
                        className={
                          changeTone(row.deltaRatio) ===
                          "positive"
                            ? "is-positive"
                            : changeTone(
                                  row.deltaRatio,
                                ) === "negative"
                              ? "is-negative"
                              : ""
                        }
                      >
                        {ratioLabel(
                          row.deltaRatio,
                          explorer.profile.locale,
                        )}
                      </small>
                    </span>
                    <Icon
                      name="chevronRight"
                      size={16}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </Surface>

        <Surface className="f-explorer-necessity">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Classification
              </span>
              <h2>Need profile</h2>
            </div>
          </div>
          {explorer.necessities.length === 0 ? (
            <div className="f-overview-inline-empty">
              No necessity data in this scope.
            </div>
          ) : (
            <FinanceDonutChart
              ariaLabel="Necessity composition"
              data={necessityDonut}
              height={230}
              onDatumActivate={(datum) =>
                setNeed(
                  datum.key as ExplorerNecessity,
                )
              }
              valueFormatter={(value) =>
                formatMoneyMinor(
                  value,
                  explorer.profile.currencyCode,
                  { locale: explorer.profile.locale },
                )
              }
            />
          )}
        </Surface>
      </div>

      <div className="f-explorer-grid">
        <Surface>
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Places
              </span>
              <h2>Top merchants</h2>
            </div>
            {merchantId ? (
              <Button
                onClick={() => setMerchant(null)}
                size="sm"
                variant="ghost"
              >
                Clear merchant
              </Button>
            ) : null}
          </div>

          {explorer.merchants.length === 0 ? (
            <div className="f-overview-inline-empty">
              No merchant spending in this scope.
            </div>
          ) : (
            <div className="f-explorer-merchant-list">
              {explorer.merchants.map((row) => (
                <button
                  aria-pressed={
                    merchantId === row.merchantId
                  }
                  className="f-explorer-merchant"
                  disabled={row.merchantId === null}
                  key={row.merchantId ?? "__unassigned__"}
                  onClick={() =>
                    row.merchantId
                      ? setMerchant(row.merchantId)
                      : undefined
                  }
                  type="button"
                >
                  <div className="f-explorer-merchant__top">
                    <span>
                      <strong>{row.name}</strong>
                      <small>
                        {row.transactionCount} tx
                      </small>
                    </span>
                    <span>
                      <Money
                        amountMinor={row.currentMinor}
                        currencyCode={
                          explorer.profile.currencyCode
                        }
                        locale={explorer.profile.locale}
                      />
                      <small>
                        {ratioLabel(
                          row.deltaRatio,
                          explorer.profile.locale,
                        )}
                      </small>
                    </span>
                  </div>
                  <div className="f-explorer-merchant__bar">
                    <span
                      style={{
                        width:
                          Math.max(
                            3,
                            (row.currentMinor /
                              maxMerchant) *
                              100,
                          ) + "%",
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="f-explorer-products">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Receipt intelligence
              </span>
              <h2>Top products</h2>
            </div>
            <Badge tone="neutral">
              Itemized evidence
            </Badge>
          </div>

          <p className="f-explorer-products__note">
            Product amounts come only from confirmed receipt
            items attached to posted transactions. Ledger totals
            above remain the financial source of truth.
          </p>

          {explorer.products.length === 0 ? (
            <div className="f-overview-inline-empty">
              No confirmed product-level receipt evidence in
              this scope.
            </div>
          ) : (
            <div className="f-explorer-product-list">
              {explorer.products.map((product) => (
                <ProductRow
                  active={
                    selectedProductId ===
                    product.productId
                  }
                  explorer={explorer}
                  key={product.productId}
                  onClick={() =>
                    setSelectedProductId(
                      selectedProductId ===
                        product.productId
                        ? null
                        : product.productId,
                    )
                  }
                  product={product}
                />
              ))}
            </div>
          )}
        </Surface>
      </div>

      {selectedProductId ? (
        <Surface className="f-explorer-evidence">
          {evidence.state === "loading" ? (
            <Skeleton className="f-overview-skeleton--panel" />
          ) : evidence.state === "error" ? (
            <div className="f-overview-inline-empty">
              {evidence.error}
            </div>
          ) : evidence.state === "ready" &&
            evidence.evidence ? (
            <>
              <div className="f-section-heading">
                <div>
                  <span className="f-section-heading__kicker">
                    Individual purchases
                  </span>
                  <h2>
                    {evidence.evidence.product.name}
                  </h2>
                </div>
                <div className="f-explorer-evidence__actions">
                  {onOpenProduct ? (
                    <Button
                      icon="products"
                      onClick={() =>
                        onOpenProduct(
                          evidence.evidence!.product.productId,
                        )
                      }
                      size="sm"
                      variant="secondary"
                    >
                      Product analytics
                    </Button>
                  ) : null}
                  <Button
                    onClick={() =>
                      setSelectedProductId(null)
                    }
                    size="sm"
                    variant="ghost"
                  >
                    Close
                  </Button>
                </div>
              </div>

              <div className="f-explorer-evidence__meta">
                {evidence.evidence.product.brand ? (
                  <Badge tone="neutral">
                    {evidence.evidence.product.brand}
                  </Badge>
                ) : null}
                {evidence.evidence.product.familyName ? (
                  <Badge tone="neutral">
                    {
                      evidence.evidence.product
                        .familyName
                    }
                  </Badge>
                ) : null}
                {evidence.evidence.product.productType ? (
                  <Badge tone="neutral">
                    {
                      evidence.evidence.product
                        .productType
                    }
                  </Badge>
                ) : null}
              </div>

              {evidence.evidence.purchases.length ===
              0 ? (
                <div className="f-overview-inline-empty">
                  No purchases in the current scope.
                </div>
              ) : (
                <div className="f-explorer-purchase-list">
                  {evidence.evidence.purchases.map(
                    (purchase) => (
                      <button
                        className="f-explorer-purchase"
                        key={
                          purchase.receiptItemId
                        }
                        onClick={() =>
                          onNavigate("activity")
                        }
                        type="button"
                      >
                        <span className="f-explorer-purchase__main">
                          <strong>
                            {purchase.merchantName}
                          </strong>
                          <span>
                            {new Intl.DateTimeFormat(
                              explorer.profile.locale,
                              {
                                dateStyle: "medium",
                                timeZone:
                                  explorer.profile
                                    .timeZone,
                              },
                            ).format(
                              new Date(
                                purchase.occurredAt,
                              ),
                            )}
                            {purchase.categoryName
                              ? " · " +
                                purchase.categoryName
                              : ""}
                          </span>
                        </span>
                        <span className="f-explorer-purchase__qty">
                          ×
                          {new Intl.NumberFormat(
                            explorer.profile.locale,
                          ).format(
                            purchase.quantity,
                          )}
                        </span>
                        <Money
                          amountMinor={
                            purchase.effectiveTotalMinor
                          }
                          currencyCode={
                            explorer.profile
                              .currencyCode
                          }
                          locale={
                            explorer.profile.locale
                          }
                        />
                        <Icon
                          name="chevronRight"
                          size={16}
                        />
                      </button>
                    ),
                  )}
                </div>
              )}
            </>
          ) : null}
        </Surface>
      ) : null}

      <div className="f-explorer-footer-action">
        <Button
          icon="activity"
          onClick={() => onNavigate("activity")}
          variant="secondary"
        >
          Open matching Activity
        </Button>
      </div>
    </div>
  );
}
