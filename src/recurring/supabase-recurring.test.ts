import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinanceRecurringService } from "../services/supabase-recurring.js";

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

    if (functionName === "finance_sync_recurring_patterns") {
      return {
        data: {
          patterns_processed: 1,
          transactions_linked: 1,
          as_of: "2026-11-05T12:00:00+01:00",
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_get_recurring_dashboard") {
      return {
        data: {
          profile: {
            currency_code: "EUR",
            locale: "de-DE",
            time_zone: "Europe/Berlin",
          },
          anchor_date: "2026-11-05",
          horizon_days: 45,
          summary: {
            active_count: 1,
            subscription_count: 1,
            monthly_expense_minor: 1499,
            annualized_expense_minor: 17988,
            monthly_income_minor: 0,
            monthly_transfer_minor: 0,
            monthly_subscription_minor: 1499,
            baseline_monthly_expense_minor: 1299,
            creep_delta_minor: 200,
            creep_delta_ratio: 0.1539646,
            next_30d_expense_minor: 1499,
            next_30d_count: 1,
            missing_count: 0,
            price_increase_count: 1,
            attention_count: 1,
          },
          trend: [{
            month_start: "2026-11-01",
            expense_minor: 1499,
            income_minor: 0,
            subscription_minor: 1499,
          }],
          attention: [{
            pattern_id: "pattern-1",
            kind: "price_increase",
            severity: "warning",
            title: "StreamBox",
            detail: "Latest recurring charge is higher.",
            expected_at: "2026-12-01T08:00:00Z",
            change_minor: 100,
            change_ratio: 0.07148,
          }],
          upcoming: [{
            pattern_id: "pattern-1",
            name: "StreamBox",
            transaction_type: "expense",
            merchant_name: "StreamBox",
            is_subscription: true,
            amount_minor: 1499,
            currency_code: "EUR",
            next_expected_at: "2026-12-01T08:00:00Z",
            days_to_next: 26,
            health: "upcoming",
          }],
          patterns: [{
            pattern_id: "pattern-1",
            name: "StreamBox",
            transaction_type: "expense",
            status: "active",
            health: "upcoming",
            merchant_id: "merchant-1",
            merchant_name: "StreamBox",
            category_id: "category-1",
            category_name: "Subscriptions",
            account_id: "account-1",
            account_name: "Checking",
            currency_code: "EUR",
            rrule: "FREQ=MONTHLY;INTERVAL=1",
            cadence: "monthly",
            cadence_interval: 1,
            anchor_at: "2026-07-01T06:00:00Z",
            next_expected_at: "2026-12-01T07:00:00Z",
            days_to_next: 26,
            tolerance_days: 3,
            amount_tolerance_minor: 140,
            source: "learned",
            confidence: 1,
            expected_amount_minor: 1399,
            effective_amount_minor: 1499,
            monthly_equivalent_minor: 1499,
            annualized_minor: 17988,
            occurrence_count: 5,
            first_occurrence_at: "2026-07-01T06:00:00Z",
            last_occurrence_at: "2026-11-01T07:00:00Z",
            average_amount_minor: 1379,
            latest_amount_minor: 1499,
            previous_amount_minor: 1399,
            latest_transaction_id: "tx-5",
            price_change_minor: 100,
            price_change_ratio: 0.07148,
            price_direction: "up",
            subscription: {
              subscription_id: "sub-1",
              name: "StreamBox",
              amount_minor: 1499,
              billing_frequency: "monthly",
              started_on: "2026-07-01",
              cancelled_on: null,
              next_charge_at: "2026-12-01T07:00:00Z",
            },
            recent_occurrences: [{
              transaction_id: "tx-5",
              occurred_at: "2026-11-01T07:00:00Z",
              amount_minor: 1499,
              expected_at: "2026-11-01T06:00:00Z",
              amount_delta_minor: 100,
              timing_delta_days: 0.0417,
              match_source: "learned",
              confidence: 0.97,
            }],
          }],
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_get_recurring_detection_candidates") {
      return {
        data: {
          anchor_date: "2026-11-05",
          history_months: 18,
          candidates: [{
            candidate_id: "candidate-1",
            name: "MusicBox",
            transaction_type: "expense",
            merchant_id: "merchant-2",
            merchant_name: "MusicBox",
            match_description: "musicbox monthly",
            currency_code: "EUR",
            occurrence_count: 4,
            first_at: "2026-08-02T07:00:00Z",
            last_at: "2026-11-02T07:00:00Z",
            average_amount_minor: 999,
            latest_amount_minor: 999,
            amount_stddev_minor: 0,
            amount_tolerance_minor: 100,
            average_interval_days: 30.67,
            interval_stddev_days: 0.47,
            cadence: "monthly",
            cadence_interval: 1,
            rrule: "FREQ=MONTHLY;INTERVAL=1",
            next_expected_at: "2026-12-02T07:00:00Z",
            monthly_equivalent_minor: 999,
            confidence: 0.96,
            transaction_ids: ["tx-a", "tx-b", "tx-c", "tx-d"],
            subscription_likely: true,
          }],
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_confirm_recurring_candidate") {
      return {
        data: {
          pattern_id: "pattern-2",
          subscription_id: "sub-2",
          name: "MusicBox",
          transaction_type: "expense",
          cadence: "monthly",
          cadence_interval: 1,
          expected_amount_minor: 999,
          next_expected_at: "2026-12-02T07:00:00Z",
          linked_transaction_count: 4,
          is_subscription: true,
        } as T,
        error: null,
      };
    }

    return {
      data: {
        pattern_id: "pattern-1",
        status: "paused",
      } as T,
      error: null,
    };
  },
};

let initialized = 0;
const service = new SupabaseFinanceRecurringService(client, async () => {
  initialized += 1;
});

const sync = await service.syncPatterns();
assert(sync.transactionsLinked === 1, "sync parsing failed");

const dashboard = await service.getDashboard("2026-11-05", 45);
assert(dashboard.summary.monthlyExpenseMinor === 1499, "summary parsing failed");
assert(dashboard.summary.creepDeltaMinor === 200, "creep parsing failed");
assert(dashboard.patterns[0]?.priceDirection === "up", "price direction parsing failed");
assert(dashboard.patterns[0]?.subscription?.billingFrequency === "monthly", "subscription parsing failed");
assert(dashboard.attention[0]?.kind === "price_increase", "attention parsing failed");

const detection = await service.getDetectionCandidates("2026-11-05", 18, 40);
const candidate = detection.candidates[0];
assert(candidate?.subscriptionLikely === true, "candidate parsing failed");
assert(candidate?.transactionIds.length === 4, "candidate transaction parsing failed");

if (!candidate) throw new Error("candidate fixture missing");
const confirmed = await service.confirmCandidate(candidate, true);
assert(confirmed.subscriptionId === "sub-2", "confirmation parsing failed");
assert(confirmed.linkedTransactionCount === 4, "confirmation count parsing failed");

const status = await service.setStatus("pattern-1", "paused");
assert(status.status === "paused", "status parsing failed");

assert(initialized === 5, "initialization hook count failed");
assert(calls[0]?.name === "finance_sync_recurring_patterns", "sync RPC mismatch");
assert(calls[1]?.name === "finance_get_recurring_dashboard", "dashboard RPC mismatch");
assert(calls[2]?.name === "finance_get_recurring_detection_candidates", "candidate RPC mismatch");
assert(calls[3]?.name === "finance_confirm_recurring_candidate", "confirm RPC mismatch");
assert(calls[3]?.args?.p_is_subscription === true, "subscription confirmation arg mismatch");
assert(calls[4]?.name === "finance_set_recurring_status", "status RPC mismatch");

console.log("P14 recurring Supabase adapter fixtures passed");
