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
import type { FinanceLedgerService } from "./ledger.js";

type RpcError = { message: string; code?: string; details?: string | null };

export interface SupabaseRpcClient {
  rpc<T = unknown>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: RpcError | null }>;
}

function isoOrNow(value?: string): string {
  return value ?? new Date().toISOString();
}

function allocationPayload(
  allocations: readonly { categoryId: UUID; amountMinor: number; memo?: string }[],
): Array<Record<string, unknown>> {
  return allocations.map((allocation) => ({
    category_id: allocation.categoryId,
    amount_minor: allocation.amountMinor,
    ...(allocation.memo ? { memo: allocation.memo } : {}),
  }));
}

function assertRpc<T>(
  result: { data: T | null; error: RpcError | null },
  operation: string,
): T {
  if (result.error) {
    const error = new Error(
      `Finance RPC ${operation} failed: ${result.error.message}`,
    );
    Object.assign(error, { cause: result.error });
    throw error;
  }

  if (result.data === null) {
    throw new Error(`Finance RPC ${operation} returned no data`);
  }

  return result.data;
}

async function assertVoidRpc(
  result: { data: unknown | null; error: RpcError | null },
  operation: string,
): Promise<void> {
  if (result.error) {
    const error = new Error(
      `Finance RPC ${operation} failed: ${result.error.message}`,
    );
    Object.assign(error, { cause: result.error });
    throw error;
  }
}

/**
 * Browser-safe adapter over the narrow public Finance RPC facade.
 *
 * Raw finance tables remain outside the Data API; this adapter calls only
 * public.finance_* SECURITY INVOKER functions.
 */
export class SupabaseFinanceLedgerService implements FinanceLedgerService {
  constructor(private readonly client: SupabaseRpcClient) {}

  async createAccount(input: CreateAccountInput): Promise<UUID> {
    return assertRpc(
      await this.client.rpc<UUID>("finance_create_account", {
        p_name: input.name,
        p_kind: input.kind,
        p_currency_code: input.currencyCode ?? "EUR",
        p_include_in_net_worth: input.includeInNetWorth ?? true,
        p_institution_name: input.institutionName ?? null,
        p_opening_balance_minor: input.openingBalanceMinor ?? 0,
      }),
      "createAccount",
    );
  }

  async archiveAccount(accountId: UUID): Promise<void> {
    await assertVoidRpc(
      await this.client.rpc("finance_archive_account", {
        p_account_id: accountId,
      }),
      "archiveAccount",
    );
  }

  async restoreAccount(accountId: UUID): Promise<void> {
    await assertVoidRpc(
      await this.client.rpc("finance_restore_account", {
        p_account_id: accountId,
      }),
      "restoreAccount",
    );
  }

  async createExpense(input: CreateExpenseInput): Promise<UUID> {
    return assertRpc(
      await this.client.rpc<UUID>("finance_create_expense", {
        p_account_id: input.accountId,
        p_amount_minor: input.amountMinor,
        p_allocations: allocationPayload(input.allocations),
        p_occurred_at: isoOrNow(input.occurredAt),
        p_merchant_id: input.merchantId ?? null,
        p_description: input.description ?? null,
        p_note: input.note ?? null,
      }),
      "createExpense",
    );
  }

  async createIncome(input: CreateIncomeInput): Promise<UUID> {
    return assertRpc(
      await this.client.rpc<UUID>("finance_create_income", {
        p_account_id: input.accountId,
        p_amount_minor: input.amountMinor,
        p_allocations: allocationPayload(input.allocations),
        p_occurred_at: isoOrNow(input.occurredAt),
        p_merchant_id: input.merchantId ?? null,
        p_description: input.description ?? null,
        p_note: input.note ?? null,
      }),
      "createIncome",
    );
  }

  async createTransfer(input: CreateTransferInput): Promise<UUID> {
    return assertRpc(
      await this.client.rpc<UUID>("finance_create_transfer", {
        p_from_account_id: input.fromAccountId,
        p_to_account_id: input.toAccountId,
        p_amount_minor: input.amountMinor,
        p_occurred_at: isoOrNow(input.occurredAt),
        p_note: input.note ?? null,
      }),
      "createTransfer",
    );
  }

  async createRefund(input: CreateRefundInput): Promise<UUID> {
    return assertRpc(
      await this.client.rpc<UUID>("finance_create_refund", {
        p_original_transaction_id: input.originalTransactionId,
        p_account_id: input.accountId,
        p_amount_minor: input.amountMinor,
        p_allocations: input.allocations
          ? allocationPayload(input.allocations)
          : null,
        p_occurred_at: isoOrNow(input.occurredAt),
        p_note: input.note ?? null,
      }),
      "createRefund",
    );
  }

  async createReimbursement(
    input: CreateReimbursementInput,
  ): Promise<UUID> {
    return assertRpc(
      await this.client.rpc<UUID>("finance_create_reimbursement", {
        p_original_transaction_id: input.originalTransactionId,
        p_account_id: input.accountId,
        p_amount_minor: input.amountMinor,
        p_allocations: allocationPayload(input.allocations),
        p_occurred_at: isoOrNow(input.occurredAt),
        p_note: input.note ?? null,
      }),
      "createReimbursement",
    );
  }

  async voidTransaction(input: VoidTransactionInput): Promise<void> {
    await assertVoidRpc(
      await this.client.rpc("finance_void_transaction", {
        p_transaction_id: input.transactionId,
        p_reason: input.reason,
      }),
      "voidTransaction",
    );
  }

  async getAccountBalances(): Promise<readonly AccountBalance[]> {
    const data = assertRpc<unknown>(
      await this.client.rpc("finance_get_account_balances"),
      "getAccountBalances",
    );

    if (!Array.isArray(data)) {
      throw new TypeError("Finance account balances RPC returned invalid data");
    }

    return data.map((value) => {
      if (!value || typeof value !== "object") {
        throw new TypeError("Finance account balance row is invalid");
      }
      const row = value as Record<string, unknown>;
      return {
        accountId: String(row.account_id),
        name: String(row.name),
        kind: String(row.kind) as AccountBalance["kind"],
        currencyCode: String(row.currency_code),
        balanceMinor: Number(row.balance_minor),
        lastActivityAt:
          row.last_activity_at === null ? null : String(row.last_activity_at),
      };
    });
  }
}
