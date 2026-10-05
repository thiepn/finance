import type {
  BankImportFormat,
  CsvImportMapping,
  ImportCommitResult,
  ImportDashboard,
  ImportPreview,
  ImportProfile,
  ImportStart,
  ParsedImportFile,
  UpdateImportRecordInput,
} from "../domain/imports.js";
import type { UUID } from "../domain/finance.js";

export interface StartBankImportInput {
  accountId: UUID;
  source: string;
  format: BankImportFormat;
  clientImportId: UUID;
  fileName: string;
  fileSha256: string;
  mimeType: string;
  fileSize: number;
  metadata?: Record<string, unknown>;
}

export interface SaveImportProfileInput {
  profileId?: UUID | null;
  name: string;
  format: BankImportFormat;
  institutionKey?: string | null;
  accountId?: UUID | null;
  headerSignature?: string | null;
  mapping: CsvImportMapping | Record<string, unknown>;
  isDefault?: boolean;
}

export interface FinanceImportService {
  getDashboard(): Promise<ImportDashboard>;
  startImport(input: StartBankImportInput): Promise<ImportStart>;
  uploadOriginal(
    start: ImportStart,
    file: Blob,
    fileName: string,
    mimeType: string,
  ): Promise<string>;
  stageImport(
    importId: UUID,
    parsed: ParsedImportFile,
  ): Promise<Record<string, unknown>>;
  getPreview(importId: UUID): Promise<ImportPreview>;
  updateRecord(input: UpdateImportRecordInput): Promise<void>;
  commitImport(importId: UUID): Promise<ImportCommitResult>;
  cancelImport(importId: UUID): Promise<void>;
  saveProfile(input: SaveImportProfileInput): Promise<UUID>;
}
