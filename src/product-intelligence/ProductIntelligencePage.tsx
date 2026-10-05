import {
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import type {
  ProductAnalytics,
  ProductAnalyticsRange,
  ProductCatalogItem,
  ProductMerchantPrice,
} from "../domain/product-intelligence.js";
import {
  Badge,
  Button,
  Money,
  SearchField,
  SegmentedControl,
  Skeleton,
  StatCard,
  Surface,
} from "../ui/components/Primitives.js";
import {
  ChartFrame,
  FinanceChartTable,
} from "../ui/charts/ChartFrame.js";
import {
  FinanceBarChart,
  FinanceLineChart,
} from "../ui/charts/FinanceCharts.js";
import type {
  ChartViewMode,
  FinanceChartDatum,
  FinanceChartSeries,
} from "../ui/charts/chart-types.js";
import { formatMoneyMinor, formatPercent } from "../ui/format/money.js";
import { Icon } from "../ui/icons/Icon.js";
import { useProductPurchaseEvidence } from "../spending-explorer/use-spending-explorer.js";
import {
  useProductAnalytics,
  useProductCatalog,
} from "./use-product-intelligence.js";

const rangeOptions = [
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
] as const;

function compactMoney(
  valueMinor: number,
  analytics: ProductAnalytics,
): string {
  return new Intl.NumberFormat(analytics.profile.locale, {
    style: "currency",
    currency: analytics.profile.currencyCode,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valueMinor / 100);
}

function formatQuantity(
  value: number,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}

function bucketLabel(
  iso: string,
  analytics: ProductAnalytics,
): string {
  const date = new Date(iso);
  if (
    analytics.bucketKind === "month" ||
    analytics.bucketKind === "quarter"
  ) {
    return new Intl.DateTimeFormat(analytics.profile.locale, {
      month: "short",
      year:
        analytics.range === "all" ? "2-digit" : undefined,
      timeZone: analytics.profile.timeZone,
    }).format(date);
  }

  return new Intl.DateTimeFormat(analytics.profile.locale, {
    day: "numeric",
    month: "short",
    timeZone: analytics.profile.timeZone,
  }).format(date);
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

function spendingTone(
  ratio: number | null,
): "positive" | "negative" | "neutral" {
  if (ratio === null || ratio === 0) return "neutral";
  return ratio < 0 ? "positive" : "negative";
}

function priceTone(
  direction: ProductAnalytics["latestPrice"]["direction"],
): "positive" | "negative" | "neutral" {
  if (direction === "down") return "positive";
  if (direction === "up") return "negative";
  return "neutral";
}

function priceDirectionLabel(
  analytics: ProductAnalytics,
): string {
  const price = analytics.latestPrice;
  if (
    price.direction === "insufficient_history" ||
    price.changeRatio === null
  ) {
    return "No previous price";
  }
  if (price.direction === "stable") {
    return "Stable";
  }
  return (
    (price.direction === "up" ? "↑ " : "↓ ") +
    formatPercent(
      Math.abs(price.changeRatio),
      analytics.profile.locale,
      1,
    )
  );
}

function catalogMeta(
  item: ProductCatalogItem,
): string {
  return [
    item.brand,
    item.familyName,
    item.variantName,
    item.productType,
  ]
    .filter(Boolean)
    .join(" · ");
}

function merchantPriceRange(
  merchant: ProductMerchantPrice,
  analytics: ProductAnalytics,
): string {
  if (
    merchant.minUnitPriceMinor === null ||
    merchant.maxUnitPriceMinor === null
  ) {
    return "No price range";
  }
  if (
    merchant.minUnitPriceMinor ===
    merchant.maxUnitPriceMinor
  ) {
    return formatMoneyMinor(
      merchant.minUnitPriceMinor,
      analytics.profile.currencyCode,
      { locale: analytics.profile.locale },
    );
  }
  return (
    formatMoneyMinor(
      merchant.minUnitPriceMinor,
      analytics.profile.currencyCode,
      { locale: analytics.profile.locale },
    ) +
    " – " +
    formatMoneyMinor(
      merchant.maxUnitPriceMinor,
      analytics.profile.currencyCode,
      { locale: analytics.profile.locale },
    )
  );
}

function CatalogLoading() {
  return (
    <div className="f-product-catalog__loading">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton
          className="f-product-catalog__skeleton"
          key={index}
        />
      ))}
    </div>
  );
}

function ProductDetailLoading() {
  return (
    <div className="f-product-detail">
      <Surface>
        <Skeleton className="f-overview-skeleton--short" />
        <Skeleton className="f-overview-skeleton--title" />
      </Surface>
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

function ProductCatalogRow({
  item,
  active,
  currencyCode,
  locale,
  onClick,
}: {
  item: ProductCatalogItem;
  active: boolean;
  currencyCode: string;
  locale: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={
        active
          ? "f-product-catalog-row f-product-catalog-row--active"
          : "f-product-catalog-row"
      }
      onClick={onClick}
      type="button"
    >
      <span className="f-product-catalog-row__copy">
        <strong>{item.name}</strong>
        <span>{catalogMeta(item) || "Normalized product"}</span>
      </span>
      <span className="f-product-catalog-row__stats">
        <span>
          {item.purchaseCount} purchase
          {item.purchaseCount === 1 ? "" : "s"}
        </span>
        {item.latestUnitPriceMinor === null ? (
          <span>—</span>
        ) : (
          <Money
            amountMinor={item.latestUnitPriceMinor}
            currencyCode={item.priceCurrencyCode || currencyCode}
            locale={locale}
          />
        )}
      </span>
      <Icon name="chevronRight" size={15} />
    </button>
  );
}

export interface ProductIntelligencePageProps {
  selectedProductId: string | null;
  onProductChange: (productId: string | null) => void;
  onNavigate: (key: string) => void;
}

export function ProductIntelligencePage({
  selectedProductId,
  onProductChange,
  onNavigate,
}: ProductIntelligencePageProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [range, setRange] =
    useState<ProductAnalyticsRange>("1y");
  const [priceView, setPriceView] =
    useState<ChartViewMode>("chart");
  const [frequencyView, setFrequencyView] =
    useState<ChartViewMode>("chart");

  const catalog = useProductCatalog(deferredQuery);
  const detail = useProductAnalytics(
    selectedProductId,
    range,
  );
  const analytics = detail.analytics;

  const evidenceRequest = useMemo(
    () =>
      analytics
        ? {
            productId: analytics.product.id,
            periodStart: analytics.period.start,
            periodEnd: analytics.period.end,
            limit: 40,
          }
        : null,
    [analytics],
  );
  const evidence = useProductPurchaseEvidence(
    evidenceRequest,
  );

  const profile =
    catalog.catalog?.profile ?? analytics?.profile ?? {
      currencyCode: "EUR",
      locale: "de-DE",
      timeZone: "Europe/Berlin",
    };

  return (
    <div className="f-products">
      <div className="f-products-heading">
        <div>
          <div className="f-products-heading__meta">
            <Badge tone="accent">Product Intelligence</Badge>
            <span>Confirmed purchase evidence only</span>
          </div>
          <h1>Products</h1>
          <p>
            Track what you buy, how often you buy it, what
            each product costs, and where the same exact
            product has been cheapest.
          </p>
        </div>
        {selectedProductId ? (
          <Button
            icon="products"
            onClick={() => onProductChange(null)}
            variant="secondary"
          >
            All products
          </Button>
        ) : null}
      </div>

      <div
        className={
          selectedProductId
            ? "f-products-layout f-products-layout--selected"
            : "f-products-layout"
        }
      >
        <Surface
          className="f-product-catalog"
          density="compact"
        >
          <div className="f-product-catalog__header">
            <SearchField
              label="Search products"
              onChange={(event) =>
                setQuery(event.currentTarget.value)
              }
              placeholder="Search product, brand, family…"
              value={query}
            />
            {catalog.catalog ? (
              <span>
                {catalog.catalog.products.length} shown
              </span>
            ) : null}
          </div>

          {catalog.state === "loading" ? (
            <CatalogLoading />
          ) : catalog.state === "error" ? (
            <div className="f-overview-inline-empty">
              {catalog.error}
            </div>
          ) : catalog.state === "unconfigured" ? (
            <div className="f-overview-inline-empty">
              Finance backend is not configured.
            </div>
          ) : catalog.state === "unauthenticated" ? (
            <div className="f-overview-inline-empty">
              Sign in to view product intelligence.
            </div>
          ) : catalog.catalog?.products.length ? (
            <div className="f-product-catalog__list">
              {catalog.catalog.products.map((item) => (
                <ProductCatalogRow
                  active={
                    item.productId === selectedProductId
                  }
                  currencyCode={profile.currencyCode}
                  item={item}
                  key={item.productId}
                  locale={profile.locale}
                  onClick={() =>
                    onProductChange(item.productId)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="f-overview-inline-empty">
              No products match this search.
            </div>
          )}
        </Surface>

        <div className="f-product-detail-shell">
          {!selectedProductId ? (
            <Surface className="f-product-select-empty">
              <div className="f-route-foundation__icon">
                <Icon name="products" size={22} />
              </div>
              <Badge tone="neutral">Product history</Badge>
              <h2>Select a product</h2>
              <p>
                Choose a normalized product to inspect price
                history, purchase frequency, merchants and
                package variants.
              </p>
            </Surface>
          ) : detail.state === "loading" ? (
            <ProductDetailLoading />
          ) : detail.state === "error" ? (
            <Surface className="f-product-select-empty">
              <Badge tone="negative">Load error</Badge>
              <h2>Product analytics unavailable</h2>
              <p>{detail.error}</p>
              <Button
                onClick={() => void detail.refresh()}
                variant="primary"
              >
                Retry
              </Button>
            </Surface>
          ) : detail.state === "ready" && analytics ? (
            <ProductDetail
              analytics={analytics}
              evidence={evidence}
              frequencyView={frequencyView}
              onFrequencyViewChange={setFrequencyView}
              onNavigate={onNavigate}
              onProductChange={onProductChange}
              onRangeChange={setRange}
              onPriceViewChange={setPriceView}
              priceView={priceView}
              range={range}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ProductDetail({
  analytics,
  evidence,
  range,
  onRangeChange,
  priceView,
  onPriceViewChange,
  frequencyView,
  onFrequencyViewChange,
  onProductChange,
  onNavigate,
}: {
  analytics: ProductAnalytics;
  evidence: ReturnType<typeof useProductPurchaseEvidence>;
  range: ProductAnalyticsRange;
  onRangeChange: (range: ProductAnalyticsRange) => void;
  priceView: ChartViewMode;
  onPriceViewChange: (mode: ChartViewMode) => void;
  frequencyView: ChartViewMode;
  onFrequencyViewChange: (mode: ChartViewMode) => void;
  onProductChange: (productId: string | null) => void;
  onNavigate: (key: string) => void;
}) {
  const priceData: FinanceChartDatum[] =
    analytics.priceHistory.map((point, index) => ({
      key: point.receiptItemId,
      label: new Intl.DateTimeFormat(
        analytics.profile.locale,
        {
          day: "numeric",
          month: "short",
          timeZone: analytics.profile.timeZone,
        },
      ).format(new Date(point.observedAt)),
      price: point.effectiveUnitPriceMinor,
      index,
    }));

  const priceSeries: FinanceChartSeries[] = [{
    dataKey: "price",
    label: "Observed unit price",
    tone: "primary",
  }];

  const comparisonByIndex = new Map(
    analytics.frequency.comparison.map((point) => [
      point.bucketIndex,
      point,
    ]),
  );

  const frequencyData: FinanceChartDatum[] =
    analytics.frequency.current.map((point) => ({
      key: String(point.bucketIndex),
      label: bucketLabel(point.bucketStart, analytics),
      current: point.purchaseCount,
      comparison:
        comparisonByIndex.get(point.bucketIndex)
          ?.purchaseCount ?? null,
    }));

  const frequencySeries: FinanceChartSeries[] = [
    {
      dataKey: "current",
      label: "Current period",
      tone: "primary",
    },
    ...(analytics.period.compareStart
      ? [{
          dataKey: "comparison",
          label: "Previous period",
          tone: "secondary" as const,
          comparison: true,
        }]
      : []),
  ];

  const latest = analytics.latestPrice;
  const current = analytics.summary.current;

  return (
    <div className="f-product-detail">
      <Surface className="f-product-hero">
        <div className="f-product-hero__top">
          <div>
            <div className="f-product-hero__badges">
              {analytics.product.brand ? (
                <Badge tone="neutral">
                  {analytics.product.brand}
                </Badge>
              ) : null}
              {analytics.product.categoryName ? (
                <Badge tone="neutral">
                  {analytics.product.categoryName}
                </Badge>
              ) : null}
              {analytics.product.productType ? (
                <Badge tone="neutral">
                  {analytics.product.productType}
                </Badge>
              ) : null}
            </div>
            <h2>{analytics.product.name}</h2>
            <p>
              {[
                analytics.product.familyName,
                analytics.product.variantName,
                analytics.product.sizeValue &&
                analytics.product.sizeUnit
                  ? formatQuantity(
                      analytics.product.sizeValue,
                      analytics.profile.locale,
                    ) +
                    " " +
                    analytics.product.sizeUnit
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <SegmentedControl
            label="Product analytics range"
            onChange={onRangeChange}
            options={rangeOptions}
            value={range}
          />
        </div>
      </Surface>

      <div className="f-overview-stats">
        <StatCard
          label="Spent"
          supporting={
            analytics.period.compareStart
              ? "Compared with previous range"
              : "All confirmed purchases"
          }
          trend={
            analytics.period.compareStart ? (
              <Badge
                tone={spendingTone(
                  analytics.summary.spendDeltaRatio,
                )}
              >
                {ratioLabel(
                  analytics.summary.spendDeltaRatio,
                  analytics.profile.locale,
                )}
              </Badge>
            ) : undefined
          }
          value={
            <Money
              amountMinor={current.totalSpendMinor}
              currencyCode={
                analytics.profile.currencyCode
              }
              locale={analytics.profile.locale}
            />
          }
        />
        <StatCard
          label="Purchases"
          supporting={
            analytics.period.compareStart
              ? ratioLabel(
                  analytics.summary.purchaseDeltaRatio,
                  analytics.profile.locale,
                ) + " vs previous"
              : "Confirmed purchase events"
          }
          value={
            <span className="f-tabular">
              {current.purchaseCount}
            </span>
          }
        />
        <StatCard
          label="Latest price"
          supporting={
            latest.merchantName ??
            "No confirmed price observation"
          }
          trend={
            <Badge tone={priceTone(latest.direction)}>
              {priceDirectionLabel(analytics)}
            </Badge>
          }
          value={
            latest.latestUnitPriceMinor === null ? (
              <span>—</span>
            ) : (
              <Money
                amountMinor={latest.latestUnitPriceMinor}
                currencyCode={
                  analytics.profile.currencyCode
                }
                locale={analytics.profile.locale}
              />
            )
          }
        />
        <StatCard
          label="Cheapest current merchant"
          supporting={
            analytics.cheapestMerchant
              ? analytics.cheapestMerchant.merchantName
              : "Not enough price evidence"
          }
          value={
            analytics.cheapestMerchant ? (
              <Money
                amountMinor={
                  analytics.cheapestMerchant
                    .latestUnitPriceMinor
                }
                currencyCode={
                  analytics.profile.currencyCode
                }
                locale={analytics.profile.locale}
              />
            ) : (
              <span>—</span>
            )
          }
        />
      </div>

      <div className="f-product-analytics-grid">
        <Surface>
          <ChartFrame
            description={
              "Confirmed effective unit price" +
              (latest.basisLabel
                ? " · normalized view available at " +
                  latest.basisLabel
                : "")
            }
            eyebrow="Price"
            onViewModeChange={onPriceViewChange}
            summary={
              <div className="f-product-price-summary">
                <div>
                  <span>Average</span>
                  <strong>
                    {current.avgUnitPriceMinor === null
                      ? "—"
                      : formatMoneyMinor(
                          current.avgUnitPriceMinor,
                          analytics.profile.currencyCode,
                          {
                            locale:
                              analytics.profile.locale,
                          },
                        )}
                  </strong>
                </div>
                <div>
                  <span>Observed range</span>
                  <strong>
                    {current.minUnitPriceMinor === null ||
                    current.maxUnitPriceMinor === null
                      ? "—"
                      : formatMoneyMinor(
                          current.minUnitPriceMinor,
                          analytics.profile.currencyCode,
                          {
                            locale:
                              analytics.profile.locale,
                          },
                        ) +
                        " – " +
                        formatMoneyMinor(
                          current.maxUnitPriceMinor,
                          analytics.profile.currencyCode,
                          {
                            locale:
                              analytics.profile.locale,
                          },
                        )}
                  </strong>
                </div>
              </div>
            }
            title="Price history"
            viewMode={priceView}
          >
            {analytics.priceHistory.length === 0 ? (
              <div className="f-overview-inline-empty">
                No confirmed price observations in this
                range.
              </div>
            ) : priceView === "chart" ? (
              <FinanceLineChart
                ariaLabel="Product price history"
                data={priceData}
                onDatumActivate={() =>
                  onNavigate("activity")
                }
                series={priceSeries}
                tickFormatter={(value) =>
                  compactMoney(value, analytics)
                }
                valueFormatter={(value) =>
                  formatMoneyMinor(
                    value,
                    analytics.profile.currencyCode,
                    {
                      locale:
                        analytics.profile.locale,
                    },
                  )
                }
              />
            ) : (
              <div className="f-product-price-table-wrap">
                <table className="f-product-price-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Merchant</th>
                      <th>Price</th>
                      <th>Normalized</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.priceHistory
                      .slice()
                      .reverse()
                      .map((point) => (
                        <tr key={point.receiptItemId}>
                          <td>
                            {new Intl.DateTimeFormat(
                              analytics.profile.locale,
                              {
                                dateStyle: "medium",
                                timeZone:
                                  analytics.profile
                                    .timeZone,
                              },
                            ).format(
                              new Date(point.observedAt),
                            )}
                          </td>
                          <td>{point.merchantName}</td>
                          <td>
                            {formatMoneyMinor(
                              point.effectiveUnitPriceMinor,
                              point.currencyCode,
                              {
                                locale:
                                  analytics.profile
                                    .locale,
                              },
                            )}
                          </td>
                          <td>
                            {point.basisPriceMinor ===
                              null ||
                            !point.basisLabel
                              ? "—"
                              : formatMoneyMinor(
                                  point.basisPriceMinor,
                                  point.currencyCode,
                                  {
                                    locale:
                                      analytics.profile
                                        .locale,
                                  },
                                ) +
                                " / " +
                                point.basisLabel}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {analytics.priceHistoryTruncated ? (
              <p className="f-product-chart-note">
                Showing the latest 500 of{" "}
                {analytics.priceHistoryCount} price
                observations.
              </p>
            ) : null}
          </ChartFrame>
        </Surface>

        <Surface>
          <ChartFrame
            description="Purchase events per analysis bucket. Frequency is separate from product price."
            eyebrow="Behavior"
            onViewModeChange={onFrequencyViewChange}
            summary={
              <div className="f-product-price-summary">
                <div>
                  <span>Quantity</span>
                  <strong>
                    {formatQuantity(
                      current.totalQuantity,
                      analytics.profile.locale,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Purchases</span>
                  <strong>{current.purchaseCount}</strong>
                </div>
              </div>
            }
            title="Purchase frequency"
            viewMode={frequencyView}
          >
            {frequencyView === "chart" ? (
              <FinanceBarChart
                ariaLabel="Product purchase frequency"
                data={frequencyData}
                series={frequencySeries}
                tickFormatter={(value) =>
                  new Intl.NumberFormat(
                    analytics.profile.locale,
                    { maximumFractionDigits: 0 },
                  ).format(value)
                }
                valueFormatter={(value) =>
                  new Intl.NumberFormat(
                    analytics.profile.locale,
                    { maximumFractionDigits: 0 },
                  ).format(value)
                }
              />
            ) : (
              <FinanceChartTable
                data={frequencyData}
                series={frequencySeries}
                valueFormatter={(value) =>
                  new Intl.NumberFormat(
                    analytics.profile.locale,
                    { maximumFractionDigits: 0 },
                  ).format(value)
                }
              />
            )}
          </ChartFrame>
        </Surface>
      </div>

      <div className="f-product-analytics-grid">
        <Surface>
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Stores
              </span>
              <h2>Merchant price comparison</h2>
            </div>
            {analytics.cheapestMerchant ? (
              <Badge tone="positive">
                Cheapest:{" "}
                {analytics.cheapestMerchant.merchantName}
              </Badge>
            ) : null}
          </div>

          {analytics.merchants.length === 0 ? (
            <div className="f-overview-inline-empty">
              No merchant price evidence in this range.
            </div>
          ) : (
            <div className="f-product-merchant-table-wrap">
              <table className="f-product-merchant-table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Latest</th>
                    <th>Average</th>
                    <th>Observed range</th>
                    <th>Price change</th>
                    <th>Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.merchants.map((merchant) => (
                    <tr
                      key={
                        merchant.merchantId ??
                        merchant.merchantName
                      }
                    >
                      <th scope="row">
                        {merchant.merchantName}
                      </th>
                      <td>
                        {merchant.latestUnitPriceMinor ===
                        null
                          ? "—"
                          : formatMoneyMinor(
                              merchant.latestUnitPriceMinor,
                              analytics.profile
                                .currencyCode,
                              {
                                locale:
                                  analytics.profile
                                    .locale,
                              },
                            )}
                      </td>
                      <td>
                        {merchant.avgUnitPriceMinor === null
                          ? "—"
                          : formatMoneyMinor(
                              merchant.avgUnitPriceMinor,
                              analytics.profile
                                .currencyCode,
                              {
                                locale:
                                  analytics.profile
                                    .locale,
                              },
                            )}
                      </td>
                      <td>
                        {merchantPriceRange(
                          merchant,
                          analytics,
                        )}
                      </td>
                      <td>
                        <Badge
                          tone={
                            merchant.priceChangeRatio ===
                              null ||
                            merchant.priceChangeRatio === 0
                              ? "neutral"
                              : merchant.priceChangeRatio < 0
                                ? "positive"
                                : "negative"
                          }
                        >
                          {ratioLabel(
                            merchant.priceChangeRatio,
                            analytics.profile.locale,
                          )}
                        </Badge>
                      </td>
                      <td>{merchant.purchaseCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>

        <Surface>
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Package value
              </span>
              <h2>Family variants</h2>
            </div>
            {analytics.product.familyName ? (
              <Badge tone="neutral">
                {analytics.product.familyName}
              </Badge>
            ) : null}
          </div>

          <p className="f-product-section-note">
            Different package sizes are compared using
            normalized price per 100 g / 100 ml or per count
            where size data is available.
          </p>

          {analytics.familyVariants.length <= 1 ? (
            <div className="f-overview-inline-empty">
              No other normalized package variants are known.
            </div>
          ) : (
            <div className="f-product-family-list">
              {analytics.familyVariants.map((variant) => (
                <button
                  className={
                    variant.isCurrent
                      ? "f-product-family-row f-product-family-row--current"
                      : "f-product-family-row"
                  }
                  key={variant.productId}
                  onClick={() =>
                    onProductChange(variant.productId)
                  }
                  type="button"
                >
                  <span>
                    <strong>{variant.name}</strong>
                    <small>
                      {variant.latestMerchantName ??
                        "No latest merchant"}
                    </small>
                  </span>
                  <span>
                    <strong>
                      {variant.basisPriceMinor === null ||
                      !variant.basisLabel
                        ? "—"
                        : formatMoneyMinor(
                            variant.basisPriceMinor,
                            analytics.profile
                              .currencyCode,
                            {
                              locale:
                                analytics.profile
                                  .locale,
                            },
                          ) +
                          " / " +
                          variant.basisLabel}
                    </strong>
                    <small>
                      {variant.latestUnitPriceMinor ===
                      null
                        ? "No package price"
                        : formatMoneyMinor(
                            variant.latestUnitPriceMinor,
                            analytics.profile
                              .currencyCode,
                            {
                              locale:
                                analytics.profile
                                  .locale,
                            },
                          ) + " package"}
                    </small>
                  </span>
                  {variant.isCurrent ? (
                    <Badge tone="accent">Current</Badge>
                  ) : (
                    <Icon
                      name="chevronRight"
                      size={15}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </Surface>
      </div>

      <Surface>
        <div className="f-section-heading">
          <div>
            <span className="f-section-heading__kicker">
              Evidence
            </span>
            <h2>Individual purchases</h2>
          </div>
          <Button
            icon="activity"
            onClick={() => onNavigate("activity")}
            size="sm"
            variant="ghost"
          >
            Open Activity
          </Button>
        </div>

        {evidence.state === "loading" ? (
          <Skeleton className="f-overview-skeleton--panel" />
        ) : evidence.state === "error" ? (
          <div className="f-overview-inline-empty">
            {evidence.error}
          </div>
        ) : evidence.state === "ready" &&
          evidence.evidence?.purchases.length ? (
          <div className="f-product-purchase-list">
            {evidence.evidence.purchases.map(
              (purchase) => (
                <button
                  className="f-product-purchase-row"
                  key={purchase.receiptItemId}
                  onClick={() => onNavigate("activity")}
                  type="button"
                >
                  <span>
                    <strong>{purchase.merchantName}</strong>
                    <small>
                      {new Intl.DateTimeFormat(
                        analytics.profile.locale,
                        {
                          dateStyle: "medium",
                          timeZone:
                            analytics.profile.timeZone,
                        },
                      ).format(
                        new Date(purchase.occurredAt),
                      )}
                    </small>
                  </span>
                  <span>
                    ×
                    {formatQuantity(
                      purchase.quantity,
                      analytics.profile.locale,
                    )}
                  </span>
                  <Money
                    amountMinor={
                      purchase.effectiveTotalMinor
                    }
                    currencyCode={
                      analytics.profile.currencyCode
                    }
                    locale={analytics.profile.locale}
                  />
                  <Icon name="chevronRight" size={15} />
                </button>
              ),
            )}
          </div>
        ) : (
          <div className="f-overview-inline-empty">
            No confirmed purchases in this range.
          </div>
        )}
      </Surface>
    </div>
  );
}
