import type { UUID } from "./finance.js";

export type ReceiptMatchStatus =
  | "unmatched"
  | "suggested_match"
  | "matched"
  | "partially_matched"
  | "multi_payment_matched";

export type MatchCandidateStatus =
  | "suggested"
  | "confirmed"
  | "rejected";

export interface ReceiptMatchDashboardSummary {
  unmatchedCount: number;
  suggestedCount: number;
  partialCount: number;
  matchedCount: number;
}

export interface ReceiptMatchQueueItem {
  receiptId: UUID;
  merchantId: UUID | null;
  merchantName: string;
  purchasedAt: string | null;
  currencyCode: string;
  totalMinor: number | null;
  matchStatus: ReceiptMatchStatus;
  coveredMinor: number;
  remainingMinor: number | null;
  suggestedCount: number;
  confirmedCount: number;
  topConfidence: number | null;
  topTransactionId: UUID | null;
  topTransactionAt: string | null;
  topTransactionDescription: string | null;
  topTransactionAmountMinor: number | null;
  updatedAt: string;
}

export interface ReceiptMatchDashboard {
  summary: ReceiptMatchDashboardSummary;
  receipts: readonly ReceiptMatchQueueItem[];
}

export interface ReceiptMatchItem {
  itemId: UUID;
  lineIndex: number;
  rawName: string;
  normalizedName: string | null;
  productId: UUID | null;
  productName: string | null;
  categoryId: UUID | null;
  categoryName: string | null;
  necessity: string;
  quantity: number;
  effectiveTotalMinor: number;
}

export interface ReceiptMatchTransaction {
  transactionId: UUID;
  type: string;
  status: string;
  source: string;
  occurredAt: string;
  description: string | null;
  merchantId: UUID | null;
  merchantName: string | null;
  merchantSource: string | null;
  reportingCurrency: string;
  displayAmountMinor: number;
  matchableAmountMinor: number | null;
  accounts: readonly {
    accountId: UUID;
    name: string;
    kind: string;
    currencyCode: string;
    signedAmountMinor: number;
  }[];
}

export interface ReceiptTransactionMatch {
  matchId: UUID;
  status: MatchCandidateStatus;
  matchedAmountMinor: number;
  confidence: number | null;
  candidateRank: number | null;
  amountDeltaMinor: number | null;
  dateDeltaDays: number | null;
  amountScore: number | null;
  dateScore: number | null;
  merchantScore: number | null;
  currencyScore: number | null;
  scoreVersion: string | null;
  decisionSource: string | null;
  decisionNote: string | null;
  confirmedAt: string | null;
  rejectedAt: string | null;
  transaction: ReceiptMatchTransaction;
  reason: Record<string, unknown>;
}

export interface ReceiptMatchAllocation {
  transactionId: UUID;
  matchId: UUID;
  categoryId: UUID | null;
  categoryName: string | null;
  necessity: string;
  sourceCurrencyCode: string;
  sourceAmountMinor: number;
  reportingCurrency: string;
  reportingAmountMinor: number;
}

export interface ReceiptMatchWorkspace {
  receipt: {
    receiptId: UUID;
    merchantId: UUID | null;
    merchantName: string;
    merchantRawName: string | null;
    purchasedAt: string | null;
    currencyCode: string;
    totalMinor: number | null;
    paymentMethodRaw: string | null;
    receiptNumber: string | null;
    processingStatus: string;
    matchStatus: ReceiptMatchStatus;
    coveredMinor: number;
    remainingMinor: number | null;
    matchUpdatedAt: string | null;
  };
  items: readonly ReceiptMatchItem[];
  matches: readonly ReceiptTransactionMatch[];
  effectiveAllocations: readonly ReceiptMatchAllocation[];
}

export interface ConfirmReceiptMatchInput {
  matchId: UUID;
  matchedAmountMinor?: number | null;
  note?: string | null;
}
