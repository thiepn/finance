import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinanceWealthService } from "../services/supabase-wealth.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];

const client: SupabaseRpcClient = {
  async rpc<T>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: null }> {
    calls.push(args ? { name: functionName, args } : { name: functionName });

    if (functionName === "finance_get_net_worth_dashboard") {
      return {
        data: {
          profile: {
            currency_code: "EUR",
            locale: "de-DE",
            time_zone: "Europe/Berlin",
          },
          anchor_date: "2026-10-05",
          range: {
            months: 12,
            start_date: "2025-11-01",
            as_of: "2026-10-05T21:59:59+00:00",
          },
          summary: {
            net_worth_minor: 225000,
            assets_minor: 235000,
            liabilities_minor: 10000,
            previous_month_net_worth_minor: 145000,
            month_change_minor: 80000,
            month_change_ratio: 0.551724,
            year_start_net_worth_minor: 0,
            ytd_change_minor: 225000,
          },
          savings: {
            current_month_income_minor: 100000,
            current_month_spend_minor: 20000,
            current_month_savings_minor: 80000,
            current_month_savings_rate: 0.8,
            ytd_income_minor: 300000,
            ytd_spend_minor: 80000,
            ytd_savings_minor: 220000,
            ytd_savings_rate: 0.733333,
          },
          bridge: {
            opening_net_worth_minor: 0,
            closing_net_worth_minor: 225000,
            net_worth_change_minor: 225000,
            ledger_savings_minor: 220000,
            valuation_and_other_change_minor: 5000,
          },
          accounts: [{
            account_id: "account-1",
            name: "Investment",
            kind: "investment",
            currency_code: "EUR",
            institution_name: "Broker",
            account_last4: null,
            include_in_net_worth: true,
            is_archived: false,
            balance_minor: 65000,
            reporting_balance_minor: 65000,
            position: "asset",
            display_balance_minor: 65000,
            observation_id: "obs-1",
            observation_at: "2026-09-30T21:00:00Z",
            observation_source: "market",
            ledger_delta_minor: 0,
            reporting_ledger_delta_minor: 0,
            last_activity_at: "2026-09-30T21:00:00Z",
            balance_basis: "observation",
          }],
          history: [{
            month_start: "2026-10-01",
            date: "2026-10-05",
            net_worth_minor: 225000,
            assets_minor: 235000,
            liabilities_minor: 10000,
          }],
          savings_history: [{
            month_start: "2026-10-01",
            income_minor: 100000,
            net_spent_minor: 20000,
            savings_minor: 80000,
            savings_rate: 0.8,
          }],
          composition: [{
            kind: "investment",
            net_minor: 65000,
            asset_minor: 65000,
            liability_minor: 0,
            account_count: 1,
          }],
          investment_bridges: [{
            account_id: "account-1",
            name: "Investment",
            currency_code: "EUR",
            opening_balance_minor: 0,
            closing_balance_minor: 65000,
            net_transaction_flow_minor: 60000,
            residual_value_change_minor: 5000,
          }],
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_get_account_wealth_history") {
      return {
        data: {
          profile: {
            currency_code: "EUR",
            locale: "de-DE",
            time_zone: "Europe/Berlin",
          },
          account: {
            account_id: "account-1",
            name: "Investment",
            kind: "investment",
            currency_code: "EUR",
            institution_name: "Broker",
            include_in_net_worth: true,
            is_archived: false,
          },
          history: [{
            date: "2026-10-05",
            balance_minor: 65000,
            reporting_balance_minor: 65000,
          }],
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_record_account_balance_observation") {
      return { data: "obs-created" as T, error: null };
    }

    if (functionName === "finance_set_account_net_worth_inclusion") {
      return {
        data: {
          account_id: "account-1",
          include_in_net_worth: false,
        } as T,
        error: null,
      };
    }

    return { data: null, error: null };
  },
};

let initialized = 0;
const service = new SupabaseFinanceWealthService(client, async () => {
  initialized += 1;
});

const dashboard = await service.getDashboard(12, "2026-10-05");
assert(dashboard.summary.netWorthMinor === 225000, "net worth parse failed");
assert(dashboard.summary.liabilitiesMinor === 10000, "liabilities parse failed");
assert(dashboard.savings.currentMonthSavingsRate === 0.8, "savings rate parse failed");
assert(dashboard.bridge.valuationAndOtherChangeMinor === 5000, "bridge parse failed");
assert(dashboard.accounts[0]?.balanceBasis === "observation", "account basis parse failed");
assert(dashboard.investmentBridges[0]?.residualValueChangeMinor === 5000, "investment bridge parse failed");

const history = await service.getAccountHistory(
  "account-1",
  12,
  "2026-10-05",
);
assert(history.history[0]?.reportingBalanceMinor === 65000, "account history parse failed");

const observationId = await service.recordBalanceObservation({
  accountId: "account-1",
  balanceMinor: 70000,
  source: "market",
});
assert(observationId === "obs-created", "observation mutation failed");

await service.setNetWorthInclusion("account-1", false);
await service.deleteBalanceObservation("obs-created");

assert(initialized === 5, "wealth initialization hook count failed");
assert(calls[0]?.name === "finance_get_net_worth_dashboard", "dashboard RPC mismatch");
assert(calls[1]?.name === "finance_get_account_wealth_history", "history RPC mismatch");
assert(calls[2]?.name === "finance_record_account_balance_observation", "observation RPC mismatch");
assert(calls[3]?.name === "finance_set_account_net_worth_inclusion", "inclusion RPC mismatch");
assert(calls[4]?.name === "finance_delete_account_balance_observation", "delete RPC mismatch");

console.log("P16 wealth Supabase adapter fixtures passed");
