import type {
  ConfirmRecurringCandidateResult,
  RecurringAttentionItem,
  RecurringDashboard,
  RecurringDashboardSummary,
  RecurringDetectionCandidate,
  RecurringDetectionResult,
  RecurringOccurrence,
  RecurringPattern,
  RecurringStatus,
  RecurringSubscription,
  RecurringSyncResult,
  RecurringTrendPoint,
  RecurringUpcomingItem,
} from "../domain/recurring.js";
import type { TransactionType, UUID } from "../domain/finance.js";
import type { FinanceRecurringService } from "./recurring.js";
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

function parseSummary(value: unknown): RecurringDashboardSummary {
  const raw = record(value, "recurring summary");
  return {
    activeCount: Number(raw.active_count),
    subscriptionCount: Number(raw.subscription_count),
    monthlyExpenseMinor: Number(raw.monthly_expense_minor),
    annualizedExpenseMinor: Number(raw.annualized_expense_minor),
    monthlyIncomeMinor: Number(raw.monthly_income_minor),
    monthlyTransferMinor: Number(raw.monthly_transfer_minor),
    monthlySubscriptionMinor: Number(raw.monthly_subscription_minor),
    baselineMonthlyExpenseMinor: Number(raw.baseline_monthly_expense_minor),
    creepDeltaMinor: Number(raw.creep_delta_minor),
    creepDeltaRatio: nullableNumber(raw.creep_delta_ratio),
    next30dExpenseMinor: Number(raw.next_30d_expense_minor),
    next30dCount: Number(raw.next_30d_count),
    missingCount: Number(raw.missing_count),
    priceIncreaseCount: Number(raw.price_increase_count),
    attentionCount: Number(raw.attention_count),
  };
}

function parseTrend(value: unknown): RecurringTrendPoint {
  const raw = record(value, "recurring trend point");
  return {
    monthStart: String(raw.month_start),
    expenseMinor: Number(raw.expense_minor),
    incomeMinor: Number(raw.income_minor),
    subscriptionMinor: Number(raw.subscription_minor),
  };
}

function parseAttention(value: unknown): RecurringAttentionItem {
  const raw = record(value, "recurring attention item");
  return {
    patternId: String(raw.pattern_id),
    kind: String(raw.kind) as RecurringAttentionItem["kind"],
    severity: String(raw.severity) as RecurringAttentionItem["severity"],
    title: String(raw.title),
    detail: String(raw.detail),
    expectedAt: nullableString(raw.expected_at),
    changeMinor: nullableNumber(raw.change_minor),
    changeRatio: nullableNumber(raw.change_ratio),
  };
}

function parseUpcoming(value: unknown): RecurringUpcomingItem {
  const raw = record(value, "recurring upcoming item");
  return {
    patternId: String(raw.pattern_id),
    name: String(raw.name),
    transactionType: String(raw.transaction_type) as TransactionType,
    merchantName: nullableString(raw.merchant_name),
    isSubscription: Boolean(raw.is_subscription),
    amountMinor: Number(raw.amount_minor),
    currencyCode: String(raw.currency_code),
    nextExpectedAt: String(raw.next_expected_at),
    daysToNext: Number(raw.days_to_next),
    health: String(raw.health) as RecurringUpcomingItem["health"],
  };
}

function parseOccurrence(value: unknown): RecurringOccurrence {
  const raw = record(value, "recurring occurrence");
  return {
    transactionId: String(raw.transaction_id),
    occurredAt: String(raw.occurred_at),
    amountMinor: Number(raw.amount_minor),
    expectedAt: nullableString(raw.expected_at),
    amountDeltaMinor: nullableNumber(raw.amount_delta_minor),
    timingDeltaDays: nullableNumber(raw.timing_delta_days),
    matchSource: String(raw.match_source),
    confidence: nullableNumber(raw.confidence),
  };
}

function parseSubscription(value: unknown): RecurringSubscription | null {
  if (value === null || value === undefined) return null;
  const raw = record(value, "recurring subscription");
  return {
    subscriptionId: String(raw.subscription_id),
    name: String(raw.name),
    amountMinor: Number(raw.amount_minor),
    billingFrequency: String(raw.billing_frequency),
    startedOn: nullableString(raw.started_on),
    cancelledOn: nullableString(raw.cancelled_on),
    nextChargeAt: nullableString(raw.next_charge_at),
  };
}

function parsePattern(value: unknown): RecurringPattern {
  const raw = record(value, "recurring pattern");
  return {
    patternId: String(raw.pattern_id),
    name: String(raw.name),
    transactionType: String(raw.transaction_type) as TransactionType,
    status: String(raw.status) as RecurringStatus,
    health: String(raw.health) as RecurringPattern["health"],
    merchantId: nullableString(raw.merchant_id),
    merchantName: nullableString(raw.merchant_name),
    categoryId: nullableString(raw.category_id),
    categoryName: nullableString(raw.category_name),
    accountId: nullableString(raw.account_id),
    accountName: nullableString(raw.account_name),
    currencyCode: String(raw.currency_code),
    rrule: String(raw.rrule),
    cadence:
      raw.cadence === null || raw.cadence === undefined
        ? null
        : (String(raw.cadence) as RecurringPattern["cadence"]),
    cadenceInterval: Number(raw.cadence_interval),
    anchorAt: nullableString(raw.anchor_at),
    nextExpectedAt: nullableString(raw.next_expected_at),
    daysToNext: nullableNumber(raw.days_to_next),
    toleranceDays: Number(raw.tolerance_days),
    amountToleranceMinor: Number(raw.amount_tolerance_minor),
    source: String(raw.source),
    confidence: nullableNumber(raw.confidence),
    expectedAmountMinor: nullableNumber(raw.expected_amount_minor),
    effectiveAmountMinor: Number(raw.effective_amount_minor),
    monthlyEquivalentMinor: Number(raw.monthly_equivalent_minor),
    annualizedMinor: Number(raw.annualized_minor),
    occurrenceCount: Number(raw.occurrence_count),
    firstOccurrenceAt: nullableString(raw.first_occurrence_at),
    lastOccurrenceAt: nullableString(raw.last_occurrence_at),
    averageAmountMinor: nullableNumber(raw.average_amount_minor),
    latestAmountMinor: nullableNumber(raw.latest_amount_minor),
    previousAmountMinor: nullableNumber(raw.previous_amount_minor),
    latestTransactionId: nullableString(raw.latest_transaction_id),
    priceChangeMinor: nullableNumber(raw.price_change_minor),
    priceChangeRatio: nullableNumber(raw.price_change_ratio),
    priceDirection: String(raw.price_direction) as RecurringPattern["priceDirection"],
    subscription: parseSubscription(raw.subscription),
    recentOccurrences: Array.isArray(raw.recent_occurrences)
      ? raw.recent_occurrences.map(parseOccurrence)
      : [],
  };
}

function parseCandidate(value: unknown): RecurringDetectionCandidate {
  const raw = record(value, "recurring candidate");
  return {
    candidateId: String(raw.candidate_id),
    name: String(raw.name),
    transactionType: String(raw.transaction_type) as TransactionType,
    merchantId: nullableString(raw.merchant_id),
    merchantName: nullableString(raw.merchant_name),
    matchDescription: nullableString(raw.match_description),
    currencyCode: String(raw.currency_code),
    occurrenceCount: Number(raw.occurrence_count),
    firstAt: String(raw.first_at),
    lastAt: String(raw.last_at),
    averageAmountMinor: Number(raw.average_amount_minor),
    latestAmountMinor: Number(raw.latest_amount_minor),
    amountStddevMinor: Number(raw.amount_stddev_minor),
    amountToleranceMinor: Number(raw.amount_tolerance_minor),
    averageIntervalDays: Number(raw.average_interval_days),
    intervalStddevDays: Number(raw.interval_stddev_days),
    cadence: String(raw.cadence) as RecurringDetectionCandidate["cadence"],
    cadenceInterval: Number(raw.cadence_interval),
    rrule: String(raw.rrule),
    nextExpectedAt: String(raw.next_expected_at),
    monthlyEquivalentMinor: Number(raw.monthly_equivalent_minor),
    confidence: Number(raw.confidence),
    transactionIds: Array.isArray(raw.transaction_ids)
      ? raw.transaction_ids.map(String)
      : [],
    subscriptionLikely: Boolean(raw.subscription_likely),
  };
}

export class SupabaseFinanceRecurringService
  implements FinanceRecurringService
{
  constructor(
    private readonly client: SupabaseRpcClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async syncPatterns(
    patternId: UUID | null = null,
    asOf: string | null = null,
  ): Promise<RecurringSyncResult> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_sync_recurring_patterns",
      {
        p_pattern_id: patternId,
        p_as_of: asOf,
      },
    );
    rpcError(result, "syncRecurringPatterns");
    if (!result.data) throw new Error("Recurring sync returned no data");

    return {
      patternsProcessed: Number(result.data.patterns_processed),
      transactionsLinked: Number(result.data.transactions_linked),
      asOf: String(result.data.as_of),
    };
  }

  async getDashboard(
    anchorDate: string | null = null,
    horizonDays = 45,
  ): Promise<RecurringDashboard> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_recurring_dashboard",
      {
        p_anchor_date: anchorDate,
        p_horizon_days: horizonDays,
      },
    );
    rpcError(result, "getRecurringDashboard");
    if (!result.data) throw new Error("Recurring dashboard returned no data");

    const raw = result.data;
    const profile = record(raw.profile, "recurring profile");

    return {
      profile: {
        currencyCode: String(profile.currency_code),
        locale: String(profile.locale),
        timeZone: String(profile.time_zone),
      },
      anchorDate: String(raw.anchor_date),
      horizonDays: Number(raw.horizon_days),
      summary: parseSummary(raw.summary),
      trend: Array.isArray(raw.trend) ? raw.trend.map(parseTrend) : [],
      attention: Array.isArray(raw.attention)
        ? raw.attention.map(parseAttention)
        : [],
      upcoming: Array.isArray(raw.upcoming)
        ? raw.upcoming.map(parseUpcoming)
        : [],
      patterns: Array.isArray(raw.patterns)
        ? raw.patterns.map(parsePattern)
        : [],
    };
  }

  async getDetectionCandidates(
    anchorDate: string | null = null,
    historyMonths = 18,
    limit = 40,
  ): Promise<RecurringDetectionResult> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_recurring_detection_candidates",
      {
        p_anchor_date: anchorDate,
        p_history_months: historyMonths,
        p_limit: limit,
      },
    );
    rpcError(result, "getRecurringDetectionCandidates");
    if (!result.data) {
      throw new Error("Recurring detection returned no data");
    }

    return {
      anchorDate: String(result.data.anchor_date),
      historyMonths: Number(result.data.history_months),
      candidates: Array.isArray(result.data.candidates)
        ? result.data.candidates.map(parseCandidate)
        : [],
    };
  }

  async confirmCandidate(
    candidate: RecurringDetectionCandidate,
    isSubscription: boolean,
  ): Promise<ConfirmRecurringCandidateResult> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_confirm_recurring_candidate",
      {
        p_transaction_ids: [...candidate.transactionIds],
        p_name: candidate.name,
        p_cadence: candidate.cadence,
        p_cadence_interval: candidate.cadenceInterval,
        p_is_subscription: isSubscription,
        p_tolerance_days: 3,
      },
    );
    rpcError(result, "confirmRecurringCandidate");
    if (!result.data) {
      throw new Error("Recurring confirmation returned no data");
    }

    return {
      patternId: String(result.data.pattern_id),
      subscriptionId: nullableString(result.data.subscription_id),
      name: String(result.data.name),
      transactionType: String(result.data.transaction_type) as TransactionType,
      cadence: String(result.data.cadence) as ConfirmRecurringCandidateResult["cadence"],
      cadenceInterval: Number(result.data.cadence_interval),
      expectedAmountMinor: Number(result.data.expected_amount_minor),
      nextExpectedAt: String(result.data.next_expected_at),
      linkedTransactionCount: Number(result.data.linked_transaction_count),
      isSubscription: Boolean(result.data.is_subscription),
    };
  }

  async setStatus(
    patternId: UUID,
    status: RecurringStatus,
  ): Promise<{ patternId: UUID; status: RecurringStatus }> {
    await this.ensureInitialized?.();

    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_set_recurring_status",
      {
        p_pattern_id: patternId,
        p_status: status,
      },
    );
    rpcError(result, "setRecurringStatus");
    if (!result.data) throw new Error("Recurring status update returned no data");

    return {
      patternId: String(result.data.pattern_id),
      status: String(result.data.status) as RecurringStatus,
    };
  }
}
