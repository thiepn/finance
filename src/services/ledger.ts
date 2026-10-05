import type {
  AccountBalance,
  CreateAccountInput,
  CreateExpenseInput,
  CreateIncomeInput,
  CreateRefundInput,
  CreateReimbursementInput,
  CreateTransferInput,
  UUID,
  VoidTransactionInput,
} from "../domain/finance.js";

/**
 * Product-facing P2 ledger boundary.
 *
 * The live implementation currently resides in the THIEPN Core Postgres
 * `finance` schema. Frontend/network transport is intentionally kept outside
 * this interface so P2 does not couple financial semantics to a specific API.
 */
export interface FinanceLedgerService {
  createAccount(input: CreateAccountInput): Promise<UUID>;
  archiveAccount(accountId: UUID): Promise<void>;
  restoreAccount(accountId: UUID): Promise<void>;

  createExpense(input: CreateExpenseInput): Promise<UUID>;
  createIncome(input: CreateIncomeInput): Promise<UUID>;
  createTransfer(input: CreateTransferInput): Promise<UUID>;
  createRefund(input: CreateRefundInput): Promise<UUID>;
  createReimbursement(input: CreateReimbursementInput): Promise<UUID>;
  voidTransaction(input: VoidTransactionInput): Promise<void>;

  getAccountBalances(): Promise<readonly AccountBalance[]>;
}

/**
 * Stable database operation names implemented by P2.
 * A future server adapter can map these to SQL/RPC without duplicating
 * business rules in the browser.
 */
export const FinanceLedgerOperations = Object.freeze({
  createAccount: "finance.create_account",
  archiveAccount: "finance.archive_account",
  restoreAccount: "finance.restore_account",
  createExpense: "finance.create_expense",
  createIncome: "finance.create_income",
  createTransfer: "finance.create_transfer",
  createRefund: "finance.create_refund",
  createReimbursement: "finance.create_reimbursement",
  voidTransaction: "finance.void_transaction",
  accountBalances: "finance.account_balances",
  transactionSummary: "finance.transaction_summary",
} as const);
