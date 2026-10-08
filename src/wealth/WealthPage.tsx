import {
  useState,
  type FormEvent,
} from "react";
import type { AccountKind } from "../domain/finance.js";
import type {
  BalanceObservationSource,
  WealthAccount,
  WealthRangeMonths,
} from "../domain/wealth.js";
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
import {
  ChartFrame,
  FinanceChartTable,
} from "../ui/charts/ChartFrame.js";
import {
  FinanceBarChart,
  FinanceDonutChart,
  FinanceLineChart,
} from "../ui/charts/FinanceCharts.js";
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
import { useWealthWorkspace } from "./use-wealth.js";

export type WealthPageMode = "net-worth" | "accounts";

type RangeKey = "12" | "24" | "60";

const rangeOptions = [
  { value: "12", label: "12M" },
  { value: "24", label: "24M" },
  { value: "60", label: "5Y" },
] as const;

const accountKinds: readonly AccountKind[] = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "paypal",
  "prepaid",
  "gift_card",
  "investment",
  "loan",
  "other",
];

function toMinor(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function fromMinor(value: number): string {
  return (Math.abs(value) / 100).toFixed(2);
}

function accountKindLabel(kind: string): string {
  return kind
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isLiabilityKind(kind: AccountKind | string): boolean {
  return kind === "credit_card" || kind === "loan";
}

function formatDate(
  value: string | null,
  locale: string,
  timeZone: string,
): string {
  if (!value) return "No observation";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

function deltaBadge(value: number, ratio: number | null, locale: string) {
  const tone = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  return (
    <Badge tone={tone}>
      {value > 0 ? "↑ " : value < 0 ? "↓ " : ""}
      {ratio === null
        ? "No baseline"
        : formatPercent(Math.abs(ratio), locale, 1)}
    </Badge>
  );
}

function WealthLoading() {
  return (
    <div className="f-wealth">
      <div className="f-wealth-heading">
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

function CreateAccountForm({
  reportingCurrency,
  busy,
  onCreate,
}: {
  reportingCurrency: string;
  busy: boolean;
  onCreate: (input: {
    name: string;
    kind: AccountKind;
    currencyCode: string;
    institutionName: string | null;
    includeInNetWorth: boolean;
    openingBalanceMinor: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("checking");
  const [currency, setCurrency] = useState(reportingCurrency);
  const [institution, setInstitution] = useState("");
  const [opening, setOpening] = useState("");
  const [include, setInclude] = useState(true);

  const foreign = currency.toUpperCase() !== reportingCurrency;
  const liability = isLiabilityKind(kind);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const rawOpening = foreign ? 0 : toMinor(opening) ?? 0;
    const signedOpening =
      liability && rawOpening > 0 ? -rawOpening : rawOpening;

    void onCreate({
      name: name.trim(),
      kind,
      currencyCode: currency.toUpperCase(),
      institutionName: institution.trim() || null,
      includeInNetWorth: include,
      openingBalanceMinor: signedOpening,
    });

    setName("");
    setInstitution("");
    setOpening("");
  };

  return (
    <Surface className="f-wealth-create-account">
      <div className="f-section-heading">
        <div>
          <span className="f-section-heading__kicker">
            Balance sheet
          </span>
          <h2>Add account</h2>
        </div>
      </div>

      <form className="f-wealth-account-form" onSubmit={submit}>
        <label>
          <span>Name</span>
          <input
            maxLength={120}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Main checking"
            required
            value={name}
          />
        </label>

        <label>
          <span>Type</span>
          <select
            onChange={(event) =>
              setKind(event.currentTarget.value as AccountKind)
            }
            value={kind}
          >
            {accountKinds.map((item) => (
              <option key={item} value={item}>
                {accountKindLabel(item)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Currency</span>
          <input
            maxLength={3}
            minLength={3}
            onChange={(event) =>
              setCurrency(event.currentTarget.value.toUpperCase())
            }
            required
            value={currency}
          />
        </label>

        <label>
          <span>Institution</span>
          <input
            maxLength={120}
            onChange={(event) =>
              setInstitution(event.currentTarget.value)
            }
            placeholder="Optional"
            value={institution}
          />
        </label>

        <label>
          <span>{liability ? "Opening amount owed" : "Opening balance"}</span>
          <div className="f-wealth-money-input">
            <span>{currency || reportingCurrency}</span>
            <input
              disabled={foreign}
              inputMode="decimal"
              min={liability ? "0" : undefined}
              onChange={(event) =>
                setOpening(event.currentTarget.value)
              }
              placeholder={foreign ? "Add after creation" : "0.00"}
              step="0.01"
              type="number"
              value={opening}
            />
          </div>
        </label>

        <label className="f-wealth-checkbox">
          <input
            checked={include}
            onChange={(event) =>
              setInclude(event.currentTarget.checked)
            }
            type="checkbox"
          />
          <span>Include in net worth</span>
        </label>

        <Button
          disabled={busy || name.trim().length === 0 || currency.length !== 3}
          type="submit"
          variant="primary"
        >
          {busy ? "Creating…" : "Add account"}
        </Button>
      </form>

      {foreign ? (
        <p className="f-wealth-form-note">
          Foreign-currency accounts start at zero here. Record the
          current balance below with an exchange rate to establish its
          reporting-currency value.
        </p>
      ) : null}
    </Surface>
  );
}

function AccountRow({
  account,
  reportingCurrency,
  locale,
  timeZone,
  busyKey,
  historyLoading,
  onRecord,
  onInclusion,
  onArchive,
  onRestore,
  onHistory,
}: {
  account: WealthAccount;
  reportingCurrency: string;
  locale: string;
  timeZone: string;
  busyKey: string | null;
  historyLoading: boolean;
  onRecord: (input: {
    balanceMinor: number;
    exchangeRate: number | null;
    source: BalanceObservationSource;
  }) => Promise<void>;
  onInclusion: (include: boolean) => Promise<void>;
  onArchive: () => Promise<void>;
  onRestore: () => Promise<void>;
  onHistory: () => Promise<void>;
}) {
  const liability = account.position === "liability";
  const foreign = account.currencyCode !== reportingCurrency;
  const [balance, setBalance] = useState(
    liability
      ? fromMinor(account.balanceMinor)
      : (account.balanceMinor / 100).toFixed(2),
  );
  const [exchangeRate, setExchangeRate] = useState("");
  const [source, setSource] =
    useState<BalanceObservationSource>(
      account.kind === "investment" ? "market" : "manual",
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const amount = toMinor(balance);
    if (amount === null) return;
    const signed = liability ? -Math.abs(amount) : amount;
    const rate = foreign ? Number(exchangeRate) : null;
    if (foreign && (!Number.isFinite(rate) || (rate ?? 0) <= 0)) {
      return;
    }
    void onRecord({
      balanceMinor: signed,
      exchangeRate: rate,
      source,
    });
  };

  const accountBusy =
    busyKey === `observation:${account.accountId}` ||
    busyKey === `inclusion:${account.accountId}` ||
    busyKey === `account:${account.accountId}`;

  return (
    <div className="f-wealth-account-row">
      <div className="f-wealth-account-row__identity">
        <div className="f-wealth-account-row__badges">
          <Badge tone={liability ? "warning" : "neutral"}>
            {accountKindLabel(account.kind)}
          </Badge>
          <Badge
            tone={
              account.balanceBasis === "ledger"
                ? "neutral"
                : "accent"
            }
          >
            {account.balanceBasis.replaceAll("_", " + ")}
          </Badge>
          {account.isArchived ? (
            <Badge tone="neutral">Archived</Badge>
          ) : null}
        </div>
        <strong>{account.name}</strong>
        <small>
          {account.institutionName ?? "No institution"}
          {account.accountLast4 ? ` · •••• ${account.accountLast4}` : ""}
        </small>
      </div>

      <div className="f-wealth-account-row__balance">
        <span>{liability ? "Amount owed" : "Balance"}</span>
        <Money
          amountMinor={account.displayBalanceMinor}
          currencyCode={reportingCurrency}
          locale={locale}
          tone={liability ? "negative" : "default"}
        />
        {account.currencyCode !== reportingCurrency ? (
          <small>
            {formatMoneyMinor(
              Math.abs(account.balanceMinor),
              account.currencyCode,
              { locale },
            )}{" "}
            account balance
          </small>
        ) : null}
      </div>

      <div className="f-wealth-account-row__meta">
        <span>
          {account.observationAt
            ? `${account.observationSource ?? "observed"} · ${formatDate(
                account.observationAt,
                locale,
                timeZone,
              )}`
            : "Ledger-derived"}
        </span>
        {account.reportingLedgerDeltaMinor !== 0 &&
        account.observationId ? (
          <small>
            {formatMoneyMinor(
              account.reportingLedgerDeltaMinor,
              reportingCurrency,
              { locale, showSign: true },
            )}{" "}
            ledger movement since observation
          </small>
        ) : null}
      </div>

      <div className="f-wealth-account-row__controls">
        <label className="f-wealth-checkbox">
          <input
            checked={account.includeInNetWorth}
            disabled={accountBusy}
            onChange={(event) =>
              void onInclusion(event.currentTarget.checked)
            }
            type="checkbox"
          />
          <span>Net worth</span>
        </label>
        <Button
          disabled={accountBusy || historyLoading}
          onClick={() => void onHistory()}
          size="sm"
          variant="ghost"
        >
          {historyLoading ? "Loading…" : "History"}
        </Button>
        {account.isArchived ? (
          <Button
            disabled={accountBusy}
            onClick={() => void onRestore()}
            size="sm"
            variant="ghost"
          >
            Restore
          </Button>
        ) : (
          <Button
            disabled={accountBusy}
            onClick={() => void onArchive()}
            size="sm"
            variant="ghost"
          >
            Archive
          </Button>
        )}
      </div>

      {!account.isArchived ? (
        <form
          className="f-wealth-observation-form"
          onSubmit={submit}
        >
          <label>
            <span>
              {liability ? "Current amount owed" : "Current balance"}
            </span>
            <div className="f-wealth-money-input">
              <span>{account.currencyCode}</span>
              <input
                inputMode="decimal"
                min={liability ? "0" : undefined}
                onChange={(event) =>
                  setBalance(event.currentTarget.value)
                }
                required
                step="0.01"
                type="number"
                value={balance}
              />
            </div>
          </label>

          {foreign ? (
            <label>
              <span>
                1 {account.currencyCode} in {reportingCurrency}
              </span>
              <input
                inputMode="decimal"
                min="0.000001"
                onChange={(event) =>
                  setExchangeRate(event.currentTarget.value)
                }
                placeholder="Exchange rate"
                required
                step="0.000001"
                type="number"
                value={exchangeRate}
              />
            </label>
          ) : null}

          <label>
            <span>Source</span>
            <select
              onChange={(event) =>
                setSource(
                  event.currentTarget
                    .value as BalanceObservationSource,
                )
              }
              value={source}
            >
              <option value="manual">Manual</option>
              <option value="statement">Statement</option>
              <option value="market">Market value</option>
              <option value="import">Import</option>
            </select>
          </label>

          <Button
            disabled={accountBusy}
            size="sm"
            type="submit"
            variant="secondary"
          >
            Update balance
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export interface WealthPageProps {
  mode: WealthPageMode;
  onNavigate: (key: string) => void;
}

export function WealthPage({
  mode,
  onNavigate,
}: WealthPageProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("12");
  const months = Number(rangeKey) as WealthRangeMonths;
  const workspace = useWealthWorkspace(months);
  const [historyView, setHistoryView] =
    useState<ChartViewMode>("chart");
  const [savingsView, setSavingsView] =
    useState<ChartViewMode>("chart");
  const [accountHistoryView, setAccountHistoryView] =
    useState<ChartViewMode>("chart");

  if (workspace.state === "loading") {
    return <WealthLoading />;
  }

  if (workspace.state !== "ready" || !workspace.dashboard) {
    return (
      <div className="f-overview-empty">
        <Surface>
          <div className="f-route-foundation__icon">
            <Icon
              name={
                workspace.state === "error"
                  ? "alert"
                  : "netWorth"
              }
              size={22}
            />
          </div>
          <Badge tone="accent">Wealth</Badge>
          <h1>
            {workspace.state === "unauthenticated"
              ? "A Finance session is required."
              : workspace.state === "unconfigured"
                ? "Finance backend is not configured."
                : "Net worth could not be loaded."}
          </h1>
          <p>
            {workspace.error ??
              "Wealth data is unavailable for this session."}
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

  const dashboard = workspace.dashboard;
  const { summary, savings, bridge, profile } = dashboard;

  const netWorthData: FinanceChartDatum[] = dashboard.history.map(
    (point) => ({
      key: point.monthStart,
      label: new Intl.DateTimeFormat(profile.locale, {
        month: "short",
        year:
          dashboard.range.months > 12 ? "2-digit" : undefined,
        timeZone: profile.timeZone,
      }).format(new Date(`${point.date}T12:00:00Z`)),
      netWorth: point.netWorthMinor,
      assets: point.assetsMinor,
      liabilities: point.liabilitiesMinor,
    }),
  );

  const netWorthSeries: FinanceChartSeries[] = [
    {
      dataKey: "netWorth",
      label: "Net worth",
      tone: "primary",
    },
    {
      dataKey: "assets",
      label: "Assets",
      tone: "positive",
      comparison: true,
    },
    {
      dataKey: "liabilities",
      label: "Liabilities",
      tone: "negative",
      comparison: true,
    },
  ];

  const savingsData: FinanceChartDatum[] =
    dashboard.savingsHistory.map((point) => ({
      key: point.monthStart,
      label: new Intl.DateTimeFormat(profile.locale, {
        month: "short",
        year:
          dashboard.range.months > 12 ? "2-digit" : undefined,
        timeZone: profile.timeZone,
      }).format(new Date(`${point.monthStart}T12:00:00Z`)),
      income: point.incomeMinor,
      spending: point.netSpentMinor,
      savings: point.savingsMinor,
    }));

  const savingsSeries: FinanceChartSeries[] = [
    {
      dataKey: "income",
      label: "Income",
      tone: "primary",
    },
    {
      dataKey: "spending",
      label: "Net spending",
      tone: "secondary",
    },
    {
      dataKey: "savings",
      label: "Savings",
      tone: "positive",
    },
  ];

  const compositionData = dashboard.composition
    .map((row, index) => ({
      key: row.kind,
      label: accountKindLabel(row.kind),
      value: row.assetMinor + row.liabilityMinor,
      tone:
        row.liabilityMinor > row.assetMinor
          ? ("negative" as const)
          : (
              ["primary", "secondary", "tertiary", "quaternary"] as const
            )[index % 4] ?? "primary",
    }))
    .filter((row) => row.value > 0);

  const accountHistoryData: FinanceChartDatum[] =
    workspace.accountHistory?.history.map((point) => ({
      key: point.date,
      label: new Intl.DateTimeFormat(profile.locale, {
        month: "short",
        year:
          dashboard.range.months > 12 ? "2-digit" : undefined,
        timeZone: profile.timeZone,
      }).format(new Date(`${point.date}T12:00:00Z`)),
      balance: point.reportingBalanceMinor,
    })) ?? [];

  const accountHistorySeries: FinanceChartSeries[] = [
    {
      dataKey: "balance",
      label: "Balance",
      tone: "primary",
    },
  ];

  const accountsSection = (
    <Surface>
      <div className="f-section-heading">
        <div>
          <span className="f-section-heading__kicker">
            Balance sources
          </span>
          <h2>Accounts</h2>
        </div>
        <Badge tone="neutral">
          {dashboard.accounts.length} account
          {dashboard.accounts.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {dashboard.accounts.length === 0 ? (
        <div className="f-overview-inline-empty">
          No accounts yet. Add your first account to start the
          balance sheet.
        </div>
      ) : (
        <div className="f-wealth-account-list">
          {dashboard.accounts.map((account) => (
            <AccountRow
              account={account}
              busyKey={workspace.busyKey}
              historyLoading={
                workspace.historyLoadingId === account.accountId
              }
              key={account.accountId}
              locale={profile.locale}
              onArchive={() =>
                workspace.archiveAccount(account.accountId)
              }
              onHistory={() =>
                workspace.loadAccountHistory(account.accountId)
              }
              onInclusion={(include) =>
                workspace.setInclusion(account.accountId, include)
              }
              onRecord={({ balanceMinor, exchangeRate, source }) =>
                workspace.recordObservation({
                  accountId: account.accountId,
                  balanceMinor,
                  exchangeRate,
                  source,
                })
              }
              onRestore={() =>
                workspace.restoreAccount(account.accountId)
              }
              reportingCurrency={profile.currencyCode}
              timeZone={profile.timeZone}
            />
          ))}
        </div>
      )}
    </Surface>
  );

  return (
    <div className="f-wealth">
      <div className="f-wealth-heading">
        <div>
          <div className="f-wealth-heading__meta">
            <Badge tone="accent">
              {mode === "accounts" ? "Accounts" : "Net worth"}
            </Badge>
            <span>
              Ledger balances + explicit observations
            </span>
          </div>
          <h1>
            {mode === "accounts"
              ? "Accounts & balance sources"
              : "Your balance sheet over time"}
          </h1>
          <p>
            {mode === "accounts"
              ? "Manage which accounts belong in net worth and anchor balances from statements, manual checks, imports, or market values without creating fake income."
              : "Track assets, liabilities, savings and balance changes from posted ledger data while keeping valuation changes separate from cash-flow savings."}
          </p>
        </div>

        <div className="f-wealth-heading__actions">
          <SegmentedControl
            label="Wealth history range"
            onChange={setRangeKey}
            options={rangeOptions}
            value={rangeKey}
          />
          <Button
            icon={mode === "accounts" ? "netWorth" : "accounts"}
            onClick={() =>
              onNavigate(
                mode === "accounts" ? "net-worth" : "accounts",
              )
            }
            variant="secondary"
          >
            {mode === "accounts" ? "Net worth" : "Accounts"}
          </Button>
        </div>
      </div>

      {workspace.actionError ? (
        <Surface className="f-wealth-action-error">
          <Badge tone="negative">Action failed</Badge>
          <span>{workspace.actionError}</span>
        </Surface>
      ) : null}

      <div className="f-overview-stats">
        <StatCard
          emphasis
          label="Net worth"
          supporting={
            formatMoneyMinor(
              summary.monthChangeMinor,
              profile.currencyCode,
              { locale: profile.locale, showSign: true },
            ) + " this month"
          }
          trend={deltaBadge(
            summary.monthChangeMinor,
            summary.monthChangeRatio,
            profile.locale,
          )}
          value={
            <Money
              amountMinor={summary.netWorthMinor}
              currencyCode={profile.currencyCode}
              locale={profile.locale}
              tone={
                summary.netWorthMinor < 0
                  ? "negative"
                  : "default"
              }
            />
          }
        />

        <StatCard
          label="Assets"
          supporting="Positive included account balances"
          value={
            <Money
              amountMinor={summary.assetsMinor}
              currencyCode={profile.currencyCode}
              locale={profile.locale}
            />
          }
        />

        <StatCard
          label="Liabilities"
          supporting="Debt and negative included balances"
          value={
            <Money
              amountMinor={summary.liabilitiesMinor}
              currencyCode={profile.currencyCode}
              locale={profile.locale}
              tone={
                summary.liabilitiesMinor > 0
                  ? "negative"
                  : "default"
              }
            />
          }
        />

        <StatCard
          label="Savings rate"
          supporting={
            formatMoneyMinor(
              savings.currentMonthSavingsMinor,
              profile.currencyCode,
              { locale: profile.locale, showSign: true },
            ) + " saved this month"
          }
          value={
            savings.currentMonthSavingsRate === null ? (
              <span className="f-overview-stat-empty">—</span>
            ) : (
              <span className="f-wealth-rate">
                {formatPercent(
                  savings.currentMonthSavingsRate,
                  profile.locale,
                  1,
                )}
              </span>
            )
          }
        />
      </div>

      {mode === "accounts" ? (
        <>
          <CreateAccountForm
            busy={workspace.busyKey === "account:new"}
            onCreate={workspace.createAccount}
            reportingCurrency={profile.currencyCode}
          />
          {accountsSection}
        </>
      ) : (
        <>
          <Surface>
            <ChartFrame
              description="Month-end account positions use the latest balance observation available at that date plus later posted ledger movements."
              eyebrow="Long-term trajectory"
              onViewModeChange={setHistoryView}
              summary={
                <div className="f-wealth-chart-summary">
                  <div>
                    <span>YTD change</span>
                    <strong>
                      {formatMoneyMinor(
                        summary.ytdChangeMinor,
                        profile.currencyCode,
                        {
                          locale: profile.locale,
                          showSign: true,
                        },
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Year start</span>
                    <strong>
                      {formatMoneyMinor(
                        summary.yearStartNetWorthMinor,
                        profile.currencyCode,
                        { locale: profile.locale },
                      )}
                    </strong>
                  </div>
                </div>
              }
              title="Net worth history"
              viewMode={historyView}
            >
              {historyView === "chart" ? (
                <FinanceLineChart
                  ariaLabel="Net worth, assets and liabilities history"
                  data={netWorthData}
                  series={netWorthSeries}
                  tickFormatter={(value) =>
                    new Intl.NumberFormat(profile.locale, {
                      style: "currency",
                      currency: profile.currencyCode,
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value / 100)
                  }
                  valueFormatter={(value) =>
                    formatMoneyMinor(
                      value,
                      profile.currencyCode,
                      { locale: profile.locale },
                    )
                  }
                />
              ) : (
                <FinanceChartTable
                  data={netWorthData}
                  series={netWorthSeries}
                  valueFormatter={(value) =>
                    formatMoneyMinor(
                      value,
                      profile.currencyCode,
                      { locale: profile.locale },
                    )
                  }
                />
              )}
            </ChartFrame>
          </Surface>

          <div className="f-wealth-grid">
            <Surface>
              <div className="f-section-heading">
                <div>
                  <span className="f-section-heading__kicker">
                    Composition
                  </span>
                  <h2>Balance-sheet mix</h2>
                </div>
              </div>
              {compositionData.length === 0 ? (
                <div className="f-overview-inline-empty">
                  No included balances yet.
                </div>
              ) : (
                <FinanceDonutChart
                  ariaLabel="Balance sheet composition by account type"
                  data={compositionData}
                  height={250}
                  valueFormatter={(value) =>
                    formatMoneyMinor(
                      value,
                      profile.currencyCode,
                      { locale: profile.locale },
                    )
                  }
                />
              )}
            </Surface>

            <Surface>
              <div className="f-section-heading">
                <div>
                  <span className="f-section-heading__kicker">
                    Wealth bridge
                  </span>
                  <h2>What changed your net worth</h2>
                </div>
                <Badge tone="neutral">
                  {dashboard.range.months} months
                </Badge>
              </div>

              <div className="f-wealth-bridge">
                <div>
                  <span>Opening net worth</span>
                  <Money
                    amountMinor={bridge.openingNetWorthMinor}
                    currencyCode={profile.currencyCode}
                    locale={profile.locale}
                  />
                </div>
                <div>
                  <span>Ledger savings</span>
                  <Money
                    amountMinor={bridge.ledgerSavingsMinor}
                    currencyCode={profile.currencyCode}
                    locale={profile.locale}
                    showSign
                    tone={
                      bridge.ledgerSavingsMinor >= 0
                        ? "positive"
                        : "negative"
                    }
                  />
                </div>
                <div>
                  <span>Valuation & other balance change</span>
                  <Money
                    amountMinor={
                      bridge.valuationAndOtherChangeMinor
                    }
                    currencyCode={profile.currencyCode}
                    locale={profile.locale}
                    showSign
                    tone={
                      bridge.valuationAndOtherChangeMinor >= 0
                        ? "positive"
                        : "negative"
                    }
                  />
                </div>
                <div className="f-wealth-bridge__total">
                  <strong>Closing net worth</strong>
                  <Money
                    amountMinor={bridge.closingNetWorthMinor}
                    currencyCode={profile.currencyCode}
                    locale={profile.locale}
                  />
                </div>
              </div>

              <p className="f-wealth-form-note">
                “Valuation & other” is a reconciliation residual, not an
                investment-return claim. It can include market revaluations,
                imported balance anchors, opening balances and other
                non-category changes.
              </p>
            </Surface>
          </div>

          <Surface>
            <ChartFrame
              description="Savings is posted income minus net spending. Own-account transfers do not count as income or spending."
              eyebrow="Cash-flow discipline"
              onViewModeChange={setSavingsView}
              summary={
                <div className="f-wealth-chart-summary">
                  <div>
                    <span>YTD savings</span>
                    <strong>
                      {formatMoneyMinor(
                        savings.ytdSavingsMinor,
                        profile.currencyCode,
                        {
                          locale: profile.locale,
                          showSign: true,
                        },
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>YTD savings rate</span>
                    <strong>
                      {savings.ytdSavingsRate === null
                        ? "—"
                        : formatPercent(
                            savings.ytdSavingsRate,
                            profile.locale,
                            1,
                          )}
                    </strong>
                  </div>
                </div>
              }
              title="Income, spending & savings"
              viewMode={savingsView}
            >
              {savingsView === "chart" ? (
                <FinanceBarChart
                  ariaLabel="Monthly income spending and savings"
                  data={savingsData}
                  series={savingsSeries}
                  tickFormatter={(value) =>
                    new Intl.NumberFormat(profile.locale, {
                      style: "currency",
                      currency: profile.currencyCode,
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(value / 100)
                  }
                  valueFormatter={(value) =>
                    formatMoneyMinor(
                      value,
                      profile.currencyCode,
                      { locale: profile.locale },
                    )
                  }
                />
              ) : (
                <FinanceChartTable
                  data={savingsData}
                  series={savingsSeries}
                  valueFormatter={(value) =>
                    formatMoneyMinor(
                      value,
                      profile.currencyCode,
                      { locale: profile.locale },
                    )
                  }
                />
              )}
            </ChartFrame>
          </Surface>

          {dashboard.investmentBridges.length > 0 ? (
            <Surface>
              <div className="f-section-heading">
                <div>
                  <span className="f-section-heading__kicker">
                    Investments
                  </span>
                  <h2>Balance bridge</h2>
                </div>
                <Badge tone="neutral">
                  Not performance return
                </Badge>
              </div>

              <div className="f-wealth-investment-list">
                {dashboard.investmentBridges.map((item) => (
                  <div
                    className="f-wealth-investment-row"
                    key={item.accountId}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.currencyCode}</small>
                    </div>
                    <div>
                      <span>Opening</span>
                      <Money
                        amountMinor={item.openingBalanceMinor}
                        currencyCode={profile.currencyCode}
                        locale={profile.locale}
                      />
                    </div>
                    <div>
                      <span>Net ledger flow</span>
                      <Money
                        amountMinor={item.netTransactionFlowMinor}
                        currencyCode={profile.currencyCode}
                        locale={profile.locale}
                        showSign
                      />
                    </div>
                    <div>
                      <span>Residual value change</span>
                      <Money
                        amountMinor={item.residualValueChangeMinor}
                        currencyCode={profile.currencyCode}
                        locale={profile.locale}
                        showSign
                        tone={
                          item.residualValueChangeMinor >= 0
                            ? "positive"
                            : "negative"
                        }
                      />
                    </div>
                    <div>
                      <span>Closing</span>
                      <Money
                        amountMinor={item.closingBalanceMinor}
                        currencyCode={profile.currencyCode}
                        locale={profile.locale}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          ) : null}

          {accountsSection}
        </>
      )}

      {workspace.accountHistory ? (
        <Surface className="f-wealth-history-panel">
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Account history
              </span>
              <h2>{workspace.accountHistory.account.name}</h2>
            </div>
            <Button
              onClick={workspace.clearAccountHistory}
              size="sm"
              variant="ghost"
            >
              Close
            </Button>
          </div>

          <ChartFrame
            description="Historical effective balance in the Finance reporting currency."
            eyebrow={accountKindLabel(
              workspace.accountHistory.account.kind,
            )}
            onViewModeChange={setAccountHistoryView}
            title="Balance history"
            viewMode={accountHistoryView}
          >
            {accountHistoryView === "chart" ? (
              <FinanceLineChart
                ariaLabel="Account balance history"
                data={accountHistoryData}
                series={accountHistorySeries}
                tickFormatter={(value) =>
                  new Intl.NumberFormat(profile.locale, {
                    style: "currency",
                    currency: profile.currencyCode,
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(value / 100)
                }
                valueFormatter={(value) =>
                  formatMoneyMinor(
                    value,
                    profile.currencyCode,
                    { locale: profile.locale },
                  )
                }
              />
            ) : (
              <FinanceChartTable
                data={accountHistoryData}
                series={accountHistorySeries}
                valueFormatter={(value) =>
                  formatMoneyMinor(
                    value,
                    profile.currencyCode,
                    { locale: profile.locale },
                  )
                }
              />
            )}
          </ChartFrame>
        </Surface>
      ) : null}

      {mode === "accounts" && dashboard.accounts.length > 0 ? (
        <Surface>
          <div className="f-section-heading">
            <div>
              <span className="f-section-heading__kicker">
                Balance quality
              </span>
              <h2>Observation coverage</h2>
            </div>
          </div>
          <div className="f-wealth-coverage">
            {dashboard.accounts.map((account) => {
              const observed = account.observationId !== null;
              return (
                <ProgressBar
                  detail={
                    observed
                      ? formatDate(
                          account.observationAt,
                          profile.locale,
                          profile.timeZone,
                        )
                      : "Ledger only"
                  }
                  key={account.accountId}
                  label={account.name}
                  tone={observed ? "positive" : "accent"}
                  value={observed ? 1 : 0}
                />
              );
            })}
          </div>
        </Surface>
      ) : null}
    </div>
  );
}
