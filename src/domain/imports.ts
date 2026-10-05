import type { Necessity, UUID } from "./finance.js";

export type BankImportFormat = "csv" | "camt053" | "ofx" | "qfx";
export type ImportDecision = "review" | "import" | "ignore" | "duplicate";
export type ImportStatus =
  | "pending"
  | "processing"
  | "review_required"
  | "completed"
  | "failed"
  | "cancelled";
export type ImportRecordStatus =
  | "pending"
  | "imported"
  | "duplicate"
  | "ignored"
  | "failed";
export type ImportDuplicateReason =
  | "source_id"
  | "fingerprint"
  | "within_file"
  | "existing_transaction";

export interface CsvImportMapping {
  bookedAt: string;
  amount: string;
  valueDate?: string | null;
  currency?: string | null;
  description?: string | null;
  counterpartyName?: string | null;
  counterpartyIban?: string | null;
  reference?: string | null;
  externalId?: string | null;
  debit?: string | null;
  credit?: string | null;
  dateFormat?: "auto" | "dmy" | "mdy" | "ymd";
  decimalSeparator?: "auto" | "." | ",";
}

export interface ParsedImportRow {
  externalId: string | null;
  bookedAt: string;
  valueDate: string | null;
  amountMinor: number;
  reportingAmountMinor?: number | null;
  exchangeRate?: number | null;
  currencyCode: string;
  description: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  reference: string | null;
  raw: Record<string, unknown>;
}

export interface ParsedImportStatement {
  accountIdentifier: string | null;
  currencyCode: string | null;
  statementFrom: string | null;
  statementTo: string | null;
  closingBalanceMinor: number | null;
  closingBalanceAt: string | null;
  metadata: Record<string, unknown>;
}

export interface ParsedImportFile {
  format: BankImportFormat;
  rows: readonly ParsedImportRow[];
  statement: ParsedImportStatement;
  csv?: {
    headers: readonly string[];
    delimiter: string;
    mapping: CsvImportMapping | null;
    rawRows: readonly Record<string, string>[];
  };
}

export interface ImportDashboardAccount {
  accountId: UUID;
  name: string;
  kind: string;
  currencyCode: string;
  institutionName: string | null;
}

export interface ImportProfile {
  profileId: UUID;
  name: string;
  format: BankImportFormat;
  institutionKey: string | null;
  accountId: UUID | null;
  headerSignature: string | null;
  mapping: Record<string, unknown>;
  isDefault: boolean;
}

export interface ImportHistoryItem {
  importId: UUID;
  accountId: UUID | null;
  accountName: string | null;
  source: string;
  format: BankImportFormat | null;
  fileName: string | null;
  status: ImportStatus;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  statementFrom: string | null;
  statementTo: string | null;
  createdAt: string;
  committedAt: string | null;
  reconciliation: Record<string, unknown> | null;
}

export interface ImportDashboard {
  imports: readonly ImportHistoryItem[];
  profiles: readonly ImportProfile[];
  accounts: readonly ImportDashboardAccount[];
}

export interface ImportStart {
  importId: UUID;
  status: ImportStatus;
  bucket: string;
  storagePrefix: string;
}

export interface ImportPreviewRecord {
  recordId: UUID;
  rowNumber: number;
  status: ImportRecordStatus;
  decision: ImportDecision;
  externalId: string | null;
  bookedAt: string;
  valueDate: string | null;
  amountMinor: number;
  reportingAmountMinor: number | null;
  exchangeRate: number | null;
  currencyCode: string;
  description: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  reference: string | null;
  sourceHash: string | null;
  fingerprint: string | null;
  duplicateReason: ImportDuplicateReason | null;
  duplicateTransactionId: UUID | null;
  duplicateRecordId: UUID | null;
  proposedType: "expense" | "income" | "transfer";
  categoryId: UUID | null;
  necessity: Necessity | null;
  transferAccountId: UUID | null;
  merchantId: UUID | null;
  classificationResult: Record<string, unknown>;
  transactionId: UUID | null;
  errorText: string | null;
}

export interface ImportPreviewCategory {
  categoryId: UUID;
  name: string;
  kind: "expense" | "income" | "both";
  necessityDefault: Necessity;
  depth: number;
  path: readonly string[];
}

export interface ImportPreview {
  import: {
    importId: UUID;
    accountId: UUID;
    source: string;
    format: BankImportFormat;
    fileName: string | null;
    fileSha256: string | null;
    storagePath: string | null;
    status: ImportStatus;
    rowCount: number;
    importedCount: number;
    duplicateCount: number;
    failedCount: number;
    accountIdentifier: string | null;
    statementCurrency: string | null;
    statementFrom: string | null;
    statementTo: string | null;
    closingBalanceMinor: number | null;
    closingBalanceAt: string | null;
    mapping: Record<string, unknown>;
    detectedMetadata: Record<string, unknown>;
    metadata: Record<string, unknown>;
    createdAt: string;
    previewedAt: string | null;
    committedAt: string | null;
  };
  account: ImportDashboardAccount;
  summary: {
    readyCount: number;
    reviewCount: number;
    duplicateCount: number;
    ignoredCount: number;
    debitMinor: number;
    creditMinor: number;
  };
  records: readonly ImportPreviewRecord[];
  categories: readonly ImportPreviewCategory[];
  accounts: readonly ImportDashboardAccount[];
}

export interface ImportCommitResult {
  importId: UUID;
  status: ImportStatus;
  importedCount: number;
  duplicateCount: number;
  ignoredCount: number;
  failedCount: number;
  reviewCount: number;
  reconciliation: Record<string, unknown>;
}

export interface UpdateImportRecordInput {
  recordId: UUID;
  decision?: ImportDecision | null;
  proposedType?: "expense" | "income" | "transfer" | null;
  categoryId?: UUID | null;
  necessity?: Necessity | null;
  transferAccountId?: UUID | null;
  reportingAmountMinor?: number | null;
  exchangeRate?: number | null;
}
