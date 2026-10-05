export type UUID = string;
export type CurrencyCode = string;

/**
 * Monetary values are integer minor units.
 * EUR 40.00 === 4000.
 */
export type MinorUnits = number;

export type AccountKind =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "paypal"
  | "prepaid"
  | "gift_card"
  | "investment"
  | "loan"
  | "other";

export type TransactionType =
  | "expense"
  | "income"
  | "transfer"
  | "refund"
  | "reimbursement"
  | "adjustment"
  | "opening_balance";

export type TransactionStatus = "draft" | "posted" | "void";

export type TransactionRelationKind =
  | "refund_of"
  | "reimbursement_of"
  | "replacement_of"
  | "adjustment_for";

export type CategoryKind = "expense" | "income" | "both";

export interface CategoryAllocation {
  categoryId: UUID;
  amountMinor: MinorUnits;
  memo?: string;
}

export interface CreateAccountInput {
  name: string;
  kind: AccountKind;
  currencyCode?: CurrencyCode;
  includeInNetWorth?: boolean;
  institutionName?: string;
  openingBalanceMinor?: MinorUnits;
}

export interface CreateExpenseInput {
  accountId: UUID;
  amountMinor: MinorUnits;
  allocations: readonly CategoryAllocation[];
  occurredAt?: string;
  merchantId?: UUID;
  description?: string;
  note?: string;
}

export interface CreateIncomeInput {
  accountId: UUID;
  amountMinor: MinorUnits;
  allocations: readonly CategoryAllocation[];
  occurredAt?: string;
  merchantId?: UUID;
  description?: string;
  note?: string;
}

export interface CreateTransferInput {
  fromAccountId: UUID;
  toAccountId: UUID;
  amountMinor: MinorUnits;
  occurredAt?: string;
  note?: string;
}

export interface CreateRefundInput {
  originalTransactionId: UUID;
  accountId: UUID;
  amountMinor: MinorUnits;
  /**
   * Full refunds can omit allocations and mirror the original category split.
   * Partial refunds must specify allocations.
   */
  allocations?: readonly CategoryAllocation[];
  occurredAt?: string;
  note?: string;
}

export interface CreateReimbursementInput {
  originalTransactionId: UUID;
  accountId: UUID;
  amountMinor: MinorUnits;
  allocations: readonly CategoryAllocation[];
  occurredAt?: string;
  note?: string;
}

export interface VoidTransactionInput {
  transactionId: UUID;
  reason: string;
}

export interface AccountBalance {
  accountId: UUID;
  name: string;
  kind: AccountKind;
  currencyCode: CurrencyCode;
  balanceMinor: MinorUnits;
  lastActivityAt: string | null;
}

export function sumAllocations(
  allocations: readonly CategoryAllocation[],
): MinorUnits {
  return allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
}

export function validatePositiveMinorUnits(
  amountMinor: MinorUnits,
  label = "amount",
): void {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new RangeError(`${label} must be a positive safe integer in minor units`);
  }
}

export function validateAllocations(
  expectedMinor: MinorUnits,
  allocations: readonly CategoryAllocation[],
): void {
  validatePositiveMinorUnits(expectedMinor);

  if (allocations.length === 0) {
    throw new RangeError("at least one category allocation is required");
  }

  for (const allocation of allocations) {
    validatePositiveMinorUnits(allocation.amountMinor, "allocation amount");
    if (!allocation.categoryId) {
      throw new TypeError("allocation categoryId is required");
    }
  }

  const actual = sumAllocations(allocations);
  if (actual !== expectedMinor) {
    throw new RangeError(
      `allocations sum to ${actual} minor units, expected ${expectedMinor}`,
    );
  }
}

/**
 * Ledger sign convention:
 * - account positive: account value/liability moves upward
 * - account negative: account value moves downward / liability increases
 * - expense category positive: spending
 * - income category negative: earned income
 * - refund/reimbursement category negative: spending reduction
 */
export const LedgerSigns = Object.freeze({
  expenseAccount: -1,
  expenseCategory: 1,
  incomeAccount: 1,
  incomeCategory: -1,
  refundAccount: 1,
  refundCategory: -1,
  transferSource: -1,
  transferDestination: 1,
} as const);
