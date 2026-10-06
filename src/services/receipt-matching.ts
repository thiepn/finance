import type {
  ConfirmReceiptMatchInput,
  ReceiptMatchDashboard,
  ReceiptMatchWorkspace,
} from "../domain/receipt-matching.js";
import type { UUID } from "../domain/finance.js";

export interface FinanceReceiptMatchingService {
  getDashboard(limit?: number): Promise<ReceiptMatchDashboard>;
  getWorkspace(receiptId: UUID): Promise<ReceiptMatchWorkspace>;
  refreshReceipt(
    receiptId: UUID,
    autoConfirm?: boolean,
  ): Promise<Record<string, unknown>>;
  refreshQueue(
    limit?: number,
    autoConfirm?: boolean,
  ): Promise<Record<string, unknown>>;
  confirm(input: ConfirmReceiptMatchInput): Promise<Record<string, unknown>>;
  reject(matchId: UUID, note?: string | null): Promise<void>;
}
