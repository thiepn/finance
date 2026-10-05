import type {
  ProductPurchaseEvidence,
  ProductPurchaseEvidenceRequest,
  SpendingExplorer,
  SpendingExplorerRequest,
} from "../domain/spending-explorer.js";

export interface FinanceSpendingExplorerService {
  getExplorer(
    request?: SpendingExplorerRequest,
  ): Promise<SpendingExplorer>;

  getProductEvidence(
    request: ProductPurchaseEvidenceRequest,
  ): Promise<ProductPurchaseEvidence>;
}
