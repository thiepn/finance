import type { TransactionType, UUID } from "./finance.js";

export type RecurringStatus = "active" | "paused" | "ended";
export type RecurringCadence = "daily" | "weekly" | "monthly" | "yearly";
export type RecurringHealth =
  | "on_track"
  | "upcoming"
  | "due"
  | "late"
  | "missing"
  | "paused"
  | "ended"
  | "unscheduled";
export type RecurringPriceDirection =
  | "up"
  | "down"
  | "stable"
  | "insufficient_history";

export interface RecurringProfile {
  currencyCode: string;
  locale: string;
  timeZone: string;
}

export interface RecurringDashboardSummary {
  activeCount: number;
  subscriptionCount: number;
  monthlyExpenseMinor: number;
  annualizedExpenseMinor: number;
  monthlyIncomeMinor: number;
  monthlyTransferMinor: number;
  monthlySubscriptionMinor: number;
  baselineMonthlyExpenseMinor: number;
  creepDeltaMinor: number;
  creepDeltaRatio: number | null;
  next30dExpenseMinor: number;
  next30dCount: number;
  missingCount: number;
  priceIncreaseCount: number;
  attentionCount: number;
}

export interface RecurringTrendPoint {
  monthStart: string;
  expenseMinor: number;
  incomeMinor: number;
  subscriptionMinor: number;
}

export interface RecurringCategoryBreakdown {
  categoryId: UUID | null;
  categoryName: string;
  monthlyMinor: number;
  annualizedMinor: number;
  patternCount: number;
  share: number | null;
}

export interface RecurringAttentionItem {
  patternId: UUID;
  kind: "missing" | "late" | "price_increase";
  severity: "negative" | "warning";
  title: string;
  detail: string;
  expectedAt: string | null;
  changeMinor: number | null;
  changeRatio: number | null;
}

export interface RecurringUpcomingItem {
  patternId: UUID;
  name: string;
  transactionType: TransactionType;
  merchantName: string | null;
  isSubscription: boolean;
  amountMinor: number;
  currencyCode: string;
  nextExpectedAt: string;
  daysToNext: number;
  health: RecurringHealth;
}

export interface RecurringOccurrence {
  transactionId: UUID;
  occurredAt: string;
  amountMinor: number;
  expectedAt: string | null;
  amountDeltaMinor: number | null;
  timingDeltaDays: number | null;
  matchSource: string;
  confidence: number | null;
}

export interface RecurringSubscription {
  subscriptionId: UUID;
  name: string;
  amountMinor: number;
  billingFrequency: string;
  startedOn: string | null;
  cancelledOn: string | null;
  nextChargeAt: string | null;
}

export interface RecurringPattern {
  patternId: UUID;
  name: string;
  transactionType: TransactionType;
  status: RecurringStatus;
  health: RecurringHealth;
  merchantId: UUID | null;
  merchantName: string | null;
  categoryId: UUID | null;
  categoryName: string | null;
  accountId: UUID | null;
  accountName: string | null;
  currencyCode: string;
  rrule: string;
  cadence: RecurringCadence | null;
  cadenceInterval: number;
  anchorAt: string | null;
  nextExpectedAt: string | null;
  daysToNext: number | null;
  toleranceDays: number;
  amountToleranceMinor: number;
  source: string;
  confidence: number | null;
  expectedAmountMinor: number | null;
  effectiveAmountMinor: number;
  monthlyEquivalentMinor: number;
  annualizedMinor: number;
  occurrenceCount: number;
  firstOccurrenceAt: string | null;
  lastOccurrenceAt: string | null;
  averageAmountMinor: number | null;
  latestAmountMinor: number | null;
  previousAmountMinor: number | null;
  latestTransactionId: UUID | null;
  priceChangeMinor: number | null;
  priceChangeRatio: number | null;
  priceDirection: RecurringPriceDirection;
  subscription: RecurringSubscription | null;
  recentOccurrences: readonly RecurringOccurrence[];
}

export interface RecurringDashboard {
  profile: RecurringProfile;
  anchorDate: string;
  horizonDays: number;
  summary: RecurringDashboardSummary;
  categories: readonly RecurringCategoryBreakdown[];
  trend: readonly RecurringTrendPoint[];
  attention: readonly RecurringAttentionItem[];
  upcoming: readonly RecurringUpcomingItem[];
  patterns: readonly RecurringPattern[];
}

export interface RecurringDetectionCandidate {
  candidateId: string;
  name: string;
  transactionType: TransactionType;
  merchantId: UUID | null;
  merchantName: string | null;
  matchDescription: string | null;
  currencyCode: string;
  occurrenceCount: number;
  firstAt: string;
  lastAt: string;
  averageAmountMinor: number;
  latestAmountMinor: number;
  amountStddevMinor: number;
  amountToleranceMinor: number;
  averageIntervalDays: number;
  intervalStddevDays: number;
  cadence: RecurringCadence;
  cadenceInterval: number;
  rrule: string;
  nextExpectedAt: string;
  monthlyEquivalentMinor: number;
  confidence: number;
  transactionIds: readonly UUID[];
  subscriptionLikely: boolean;
}

export interface RecurringDetectionResult {
  anchorDate: string;
  historyMonths: number;
  candidates: readonly RecurringDetectionCandidate[];
}

export interface RecurringSyncResult {
  patternsProcessed: number;
  transactionsLinked: number;
  asOf: string;
}

export interface ConfirmRecurringCandidateResult {
  patternId: UUID;
  subscriptionId: UUID | null;
  name: string;
  transactionType: TransactionType;
  cadence: RecurringCadence;
  cadenceInterval: number;
  expectedAmountMinor: number;
  nextExpectedAt: string;
  linkedTransactionCount: number;
  isSubscription: boolean;
}
