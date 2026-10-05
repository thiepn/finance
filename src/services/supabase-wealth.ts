import type {
  AccountWealthHistory,
  InvestmentBalanceBridge,
  NetWorthDashboard,
  NetWorthHistoryPoint,
  RecordBalanceObservationInput,
  SavingsHistoryPoint,
  WealthAccount,
  WealthCompositionRow,
  WealthProfile,
  WealthRangeMonths,
} from "../domain/wealth.js";
import type { UUID } from "../domain/finance.js";
import type { FinanceWealthService } from "./wealth.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}

function parseProfile(value: unknown): WealthProfile {
  const raw = record(value, "wealth profile");
  return {
    currencyCode: String(raw.currency_code),
    locale: String(raw.locale),
    timeZone: String(raw.time_zone),
  };
}

function parseAccount(value: unknown): WealthAccount {
  const raw = record(value, "wealth account");
  return {
    accountId: String(raw.account_id),
    name: String(raw.name),
    kind: String(raw.kind),
    currencyCode: String(raw.currency_code),
    institutionName: nullableString(raw.institution_name),
    accountLast4: nullableString(raw.account_last4),
    includeInNetWorth: Boolean(raw.include_in_net_worth),
    isArchived: Boolean(raw.is_archived),
    balanceMinor: Number(raw.balance_minor),
    reportingBalanceMinor: Number(raw.reporting_balance_minor),
    position: String(raw.position) as WealthAccount["position"],
    displayBalanceMinor: Number(raw.display_balance_minor),
    observationId: nullableString(raw.observation_id),
    observationAt: nullableString(raw.observation_at),
    observationSource:
      raw.observation_source === null ||
      raw.observation_source === undefined
        ? null
        : (String(raw.observation_source) as WealthAccount["observationSource"]),
    ledgerDeltaMinor: Number(raw.ledger_delta_minor),
    reportingLedgerDeltaMinor: Number(raw.reporting_ledger_delta_minor),
    lastActivityAt: nullableString(raw.last_activity_at),
    balanceBasis: String(raw.balance_basis) as WealthAccount["balanceBasis"],
  };
}

function parseHistory(value: unknown): NetWorthHistoryPoint {
  const raw = record(value, "net worth history");
  return {
    monthStart: String(raw.month_start),
    date: String(raw.date),
    netWorthMinor: Number(raw.net_worth_minor),
    assetsMinor: Number(raw.assets_minor),
    liabilitiesMinor: Number(raw.liabilities_minor),
  };
}

function parseSavingsHistory(value: unknown): SavingsHistoryPoint {
  const raw = record(value, "savings history");
  return {
    monthStart: String(raw.month_start),
    incomeMinor: Number(raw.income_minor),
    netSpentMinor: Number(raw.net_spent_minor),
    savingsMinor: Number(raw.savings_minor),
    savingsRate: nullableNumber(raw.savings_rate),
  };
}

function parseComposition(value: unknown): WealthCompositionRow {
  const raw = record(value, "wealth composition");
  return {
    kind: String(raw.kind),
    netMinor: Number(raw.net_minor),
    assetMinor: Number(raw.asset_minor),
    liabilityMinor: Number(raw.liability_minor),
    accountCount: Number(raw.account_count),
  };
}

function parseInvestmentBridge(
  value: unknown,
): InvestmentBalanceBridge {
  const raw = record(value, "investment bridge");
  return {
    accountId: String(raw.account_id),
    name: String(raw.name),
    currencyCode: String(raw.currency_code),
    openingBalanceMinor: Number(raw.opening_balance_minor),
    closingBalanceMinor: Number(raw.closing_balance_minor),
    netTransactionFlowMinor: Number(raw.net_transaction_flow_minor),
    residualValueChangeMinor: Number(raw.residual_value_change_minor),
  };
}

export class SupabaseFinanceWealthService
  implements FinanceWealthService
{
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async getDashboard(
    months: WealthRangeMonths = 12,
    anchorDate: string | null = null,
  ): Promise<NetWorthDashboard> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_net_worth_dashboard",
      {
        p_anchor_date: anchorDate,
        p_months: months,
      },
    );
    rpcError(result, "getNetWorthDashboard");
    if (!result.data) throw new Error("Net worth dashboard returned no data");

    const raw = result.data;
    const range = record(raw.range, "wealth range");
    const summary = record(raw.summary, "wealth summary");
    const savings = record(raw.savings, "savings summary");
    const bridge = record(raw.bridge, "wealth bridge");

    return {
      profile: parseProfile(raw.profile),
      anchorDate: String(raw.anchor_date),
      range: {
        months: Number(range.months),
        startDate: String(range.start_date),
        asOf: String(range.as_of),
      },
      summary: {
        netWorthMinor: Number(summary.net_worth_minor),
        assetsMinor: Number(summary.assets_minor),
        liabilitiesMinor: Number(summary.liabilities_minor),
        previousMonthNetWorthMinor: Number(
          summary.previous_month_net_worth_minor,
        ),
        monthChangeMinor: Number(summary.month_change_minor),
        monthChangeRatio: nullableNumber(summary.month_change_ratio),
        yearStartNetWorthMinor: Number(
          summary.year_start_net_worth_minor,
        ),
        ytdChangeMinor: Number(summary.ytd_change_minor),
      },
      savings: {
        currentMonthIncomeMinor: Number(
          savings.current_month_income_minor,
        ),
        currentMonthSpendMinor: Number(
          savings.current_month_spend_minor,
        ),
        currentMonthSavingsMinor: Number(
          savings.current_month_savings_minor,
        ),
        currentMonthSavingsRate: nullableNumber(
          savings.current_month_savings_rate,
        ),
        ytdIncomeMinor: Number(savings.ytd_income_minor),
        ytdSpendMinor: Number(savings.ytd_spend_minor),
        ytdSavingsMinor: Number(savings.ytd_savings_minor),
        ytdSavingsRate: nullableNumber(savings.ytd_savings_rate),
      },
      bridge: {
        openingNetWorthMinor: Number(
          bridge.opening_net_worth_minor,
        ),
        closingNetWorthMinor: Number(
          bridge.closing_net_worth_minor,
        ),
        netWorthChangeMinor: Number(
          bridge.net_worth_change_minor,
        ),
        ledgerSavingsMinor: Number(bridge.ledger_savings_minor),
        valuationAndOtherChangeMinor: Number(
          bridge.valuation_and_other_change_minor,
        ),
      },
      accounts: Array.isArray(raw.accounts)
        ? raw.accounts.map(parseAccount)
        : [],
      history: Array.isArray(raw.history)
        ? raw.history.map(parseHistory)
        : [],
      savingsHistory: Array.isArray(raw.savings_history)
        ? raw.savings_history.map(parseSavingsHistory)
        : [],
      composition: Array.isArray(raw.composition)
        ? raw.composition.map(parseComposition)
        : [],
      investmentBridges: Array.isArray(raw.investment_bridges)
        ? raw.investment_bridges.map(parseInvestmentBridge)
        : [],
    };
  }

  async getAccountHistory(
    accountId: UUID,
    months: WealthRangeMonths = 12,
    anchorDate: string | null = null,
  ): Promise<AccountWealthHistory> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_account_wealth_history",
      {
        p_account_id: accountId,
        p_anchor_date: anchorDate,
        p_months: months,
      },
    );
    rpcError(result, "getAccountWealthHistory");
    if (!result.data) throw new Error("Account wealth history returned no data");

    const raw = result.data;
    const account = record(raw.account, "account wealth summary");

    return {
      profile: parseProfile(raw.profile),
      account: {
        accountId: String(account.account_id),
        name: String(account.name),
        kind: String(account.kind),
        currencyCode: String(account.currency_code),
        institutionName: nullableString(account.institution_name),
        includeInNetWorth: Boolean(account.include_in_net_worth),
        isArchived: Boolean(account.is_archived),
      },
      history: Array.isArray(raw.history)
        ? raw.history.map((value) => {
            const point = record(value, "account wealth point");
            return {
              date: String(point.date),
              balanceMinor: Number(point.balance_minor),
              reportingBalanceMinor: Number(
                point.reporting_balance_minor,
              ),
            };
          })
        : [],
    };
  }

  async recordBalanceObservation(
    input: RecordBalanceObservationInput,
  ): Promise<UUID> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<string>(
      "finance_record_account_balance_observation",
      {
        p_account_id: input.accountId,
        p_balance_minor: input.balanceMinor,
        p_observed_at: input.observedAt ?? null,
        p_reporting_balance_minor:
          input.reportingBalanceMinor ?? null,
        p_exchange_rate: input.exchangeRate ?? null,
        p_source: input.source ?? "manual",
        p_note: input.note ?? null,
      },
    );
    rpcError(result, "recordAccountBalanceObservation");
    if (!result.data) throw new Error("Balance observation returned no id");
    return String(result.data);
  }

  async deleteBalanceObservation(
    observationId: UUID,
  ): Promise<void> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<null>(
      "finance_delete_account_balance_observation",
      { p_observation_id: observationId },
    );
    rpcError(result, "deleteAccountBalanceObservation");
  }

  async setNetWorthInclusion(
    accountId: UUID,
    include: boolean,
  ): Promise<void> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_set_account_net_worth_inclusion",
      {
        p_account_id: accountId,
        p_include: include,
      },
    );
    rpcError(result, "setAccountNetWorthInclusion");
  }
}
