import type { UUID } from "./finance.js";
import type { OverviewPeriodKind } from "./overview.js";

export type AskFinanceIntent =
  | "spending"
  | "top_spending"
  | "cash_flow"
  | "product_prices"
  | "recurring"
  | "budget"
  | "net_worth"
  | "receipt_reconciliation";

export type AskFinanceDimension =
  | "category"
  | "merchant"
  | "necessity"
  | "product";

export interface AskFinancePeriod {
  kind: OverviewPeriodKind;
  anchorDate: string;
  label: string;
}

export interface AskFinanceQuery {
  intent: AskFinanceIntent;
  question: string;
  period: AskFinancePeriod;
  dimension?: AskFinanceDimension;
  categoryId?: UUID | null;
  categoryLabel?: string | null;
  merchantId?: UUID | null;
  merchantLabel?: string | null;
  productId?: UUID | null;
  productLabel?: string | null;
  necessity?: "essential" | "flexible" | "discretionary" | "unclassified" | null;
  limit?: number;
}

export interface AskFinanceMetric {
  key: string;
  label: string;
  displayValue: string;
  valueMinor?: number;
  valueNumber?: number;
  tone?: "default" | "positive" | "negative" | "warning" | "muted";
}

export type AskFinanceEvidenceKind =
  | "transaction"
  | "receipt"
  | "category"
  | "merchant"
  | "product"
  | "recurring"
  | "budget"
  | "account"
  | "summary";

export interface AskFinanceEvidence {
  kind: AskFinanceEvidenceKind;
  id?: UUID | null;
  label: string;
  detail?: string | null;
  route?: string | null;
}

export interface AskFinanceProvenance {
  source:
    | "overview"
    | "spending_explorer"
    | "product_intelligence"
    | "product_evidence"
    | "recurring"
    | "planning"
    | "wealth"
    | "receipt_matching";
  label: string;
  detail: string;
}

export interface AskFinanceAnswer {
  query: AskFinanceQuery;
  title: string;
  summary: string;
  metrics: readonly AskFinanceMetric[];
  evidence: readonly AskFinanceEvidence[];
  provenance: readonly AskFinanceProvenance[];
  followUps: readonly string[];
  caveat?: string | null;
}

export interface AskFinanceParseResult {
  query: AskFinanceQuery | null;
  reason: string | null;
}
