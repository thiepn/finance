import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ImportCommitResult,
  ImportDashboard,
  ImportDashboardAccount,
  ImportHistoryItem,
  ImportPreview,
  ImportPreviewCategory,
  ImportPreviewRecord,
  ImportProfile,
  ImportStart,
  ParsedImportFile,
  UpdateImportRecordInput,
} from "../domain/imports.js";
import type { UUID } from "../domain/finance.js";
import type {
  FinanceImportService,
  SaveImportProfileInput,
  StartBankImportInput,
} from "./imports.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}

function parseAccount(value: unknown): ImportDashboardAccount {
  const raw = record(value, "import account");
  return {
    accountId: String(raw.account_id),
    name: String(raw.name),
    kind: String(raw.kind),
    currencyCode: String(raw.currency_code),
    institutionName: nullableString(raw.institution_name),
  };
}

function parseProfile(value: unknown): ImportProfile {
  const raw = record(value, "import profile");
  return {
    profileId: String(raw.profile_id),
    name: String(raw.name),
    format: String(raw.format) as ImportProfile["format"],
    institutionKey: nullableString(raw.institution_key),
    accountId: nullableString(raw.account_id),
    headerSignature: nullableString(raw.header_signature),
    mapping:
      raw.mapping && typeof raw.mapping === "object" && !Array.isArray(raw.mapping)
        ? (raw.mapping as Record<string, unknown>)
        : {},
    isDefault: Boolean(raw.is_default),
  };
}

function parseHistory(value: unknown): ImportHistoryItem {
  const raw = record(value, "import history");
  return {
    importId: String(raw.import_id),
    accountId: nullableString(raw.account_id),
    accountName: nullableString(raw.account_name),
    source: String(raw.source),
    format:
      raw.format === null || raw.format === undefined
        ? null
        : (String(raw.format) as ImportHistoryItem["format"]),
    fileName: nullableString(raw.file_name),
    status: String(raw.status) as ImportHistoryItem["status"],
    rowCount: Number(raw.row_count),
    importedCount: Number(raw.imported_count),
    duplicateCount: Number(raw.duplicate_count),
    failedCount: Number(raw.failed_count),
    statementFrom: nullableString(raw.statement_from),
    statementTo: nullableString(raw.statement_to),
    createdAt: String(raw.created_at),
    committedAt: nullableString(raw.committed_at),
    reconciliation:
      raw.reconciliation &&
      typeof raw.reconciliation === "object" &&
      !Array.isArray(raw.reconciliation)
        ? (raw.reconciliation as Record<string, unknown>)
        : null,
  };
}

function parsePreviewRecord(value: unknown): ImportPreviewRecord {
  const raw = record(value, "import preview record");
  return {
    recordId: String(raw.record_id),
    rowNumber: Number(raw.row_number),
    status: String(raw.status) as ImportPreviewRecord["status"],
    decision: String(raw.decision) as ImportPreviewRecord["decision"],
    externalId: nullableString(raw.external_id),
    bookedAt: String(raw.booked_at),
    valueDate: nullableString(raw.value_date),
    amountMinor: Number(raw.amount_minor),
    reportingAmountMinor: nullableNumber(raw.reporting_amount_minor),
    exchangeRate: nullableNumber(raw.exchange_rate),
    currencyCode: String(raw.currency_code),
    description: nullableString(raw.description),
    counterpartyName: nullableString(raw.counterparty_name),
    counterpartyIban: nullableString(raw.counterparty_iban),
    reference: nullableString(raw.reference),
    sourceHash: nullableString(raw.source_hash),
    fingerprint: nullableString(raw.fingerprint),
    duplicateReason:
      raw.duplicate_reason === null || raw.duplicate_reason === undefined
        ? null
        : (String(raw.duplicate_reason) as ImportPreviewRecord["duplicateReason"]),
    duplicateTransactionId: nullableString(raw.duplicate_transaction_id),
    duplicateRecordId: nullableString(raw.duplicate_record_id),
    proposedType: String(raw.proposed_type) as ImportPreviewRecord["proposedType"],
    categoryId: nullableString(raw.category_id),
    necessity:
      raw.necessity === null || raw.necessity === undefined
        ? null
        : (String(raw.necessity) as ImportPreviewRecord["necessity"]),
    transferAccountId: nullableString(raw.transfer_account_id),
    merchantId: nullableString(raw.merchant_id),
    classificationResult:
      raw.classification_result &&
      typeof raw.classification_result === "object" &&
      !Array.isArray(raw.classification_result)
        ? (raw.classification_result as Record<string, unknown>)
        : {},
    transactionId: nullableString(raw.transaction_id),
    errorText: nullableString(raw.error_text),
  };
}

function parseCategory(value: unknown): ImportPreviewCategory {
  const raw = record(value, "import category");
  return {
    categoryId: String(raw.category_id),
    name: String(raw.name),
    kind: String(raw.kind) as ImportPreviewCategory["kind"],
    necessityDefault: String(
      raw.necessity_default,
    ) as ImportPreviewCategory["necessityDefault"],
    depth: Number(raw.depth),
    path: Array.isArray(raw.path) ? raw.path.map(String) : [],
  };
}

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "statement.dat";
}

export class SupabaseFinanceImportService
  implements FinanceImportService
{
  constructor(
    private readonly rpc: SupabaseRpcClient,
    private readonly client: SupabaseClient,
    private readonly ensureInitialized?: () => Promise<void>,
  ) {}

  async getDashboard(): Promise<ImportDashboard> {
    await this.ensureInitialized?.();

    const result = await this.rpc.rpc<Record<string, unknown>>(
      "finance_get_import_dashboard",
    );
    rpcError(result, "getImportDashboard");
    if (!result.data) throw new Error("Import dashboard returned no data");

    return {
      imports: Array.isArray(result.data.imports)
        ? result.data.imports.map(parseHistory)
        : [],
      profiles: Array.isArray(result.data.profiles)
        ? result.data.profiles.map(parseProfile)
        : [],
      accounts: Array.isArray(result.data.accounts)
        ? result.data.accounts.map(parseAccount)
        : [],
    };
  }

  async startImport(input: StartBankImportInput): Promise<ImportStart> {
    await this.ensureInitialized?.();

    const result = await this.rpc.rpc<Record<string, unknown>>(
      "finance_start_import",
      {
        p_account_id: input.accountId,
        p_source: input.source,
        p_format: input.format,
        p_client_import_id: input.clientImportId,
        p_file_name: input.fileName,
        p_file_sha256: input.fileSha256,
        p_mime_type: input.mimeType,
        p_file_size: input.fileSize,
        p_metadata: input.metadata ?? {},
      },
    );
    rpcError(result, "startImport");
    if (!result.data) throw new Error("Import start returned no data");

    return {
      importId: String(result.data.import_id),
      status: String(result.data.status) as ImportStart["status"],
      bucket: String(result.data.bucket),
      storagePrefix: String(result.data.storage_prefix),
    };
  }

  async uploadOriginal(
    start: ImportStart,
    file: Blob,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    const path = `${start.storagePrefix}${safeFileName(fileName)}`;
    const bucket = this.client.storage.from(start.bucket);
    const upload = await bucket.upload(path, file, {
      contentType: mimeType || "application/octet-stream",
      upsert: true,
    });

    if (upload.error) {
      throw new Error(`Finance import upload: ${upload.error.message}`);
    }

    const registration = await this.rpc.rpc<Record<string, unknown>>(
      "finance_register_import_file",
      {
        p_import_id: start.importId,
        p_storage_path: path,
      },
    );

    if (registration.error) {
      await bucket.remove([path]);
      throw new Error(
        `Finance registerImportFile: ${registration.error.message}`,
      );
    }

    return path;
  }

  async stageImport(
    importId: UUID,
    parsed: ParsedImportFile,
  ): Promise<Record<string, unknown>> {
    await this.ensureInitialized?.();

    const result = await this.rpc.rpc<Record<string, unknown>>(
      "finance_stage_import_records",
      {
        p_import_id: importId,
        p_rows: parsed.rows.map((row) => ({
          external_id: row.externalId,
          booked_at: row.bookedAt,
          value_date: row.valueDate,
          amount_minor: row.amountMinor,
          reporting_amount_minor: row.reportingAmountMinor ?? null,
          exchange_rate: row.exchangeRate ?? null,
          currency_code: row.currencyCode,
          description: row.description,
          counterparty_name: row.counterpartyName,
          counterparty_iban: row.counterpartyIban,
          reference: row.reference,
          raw: row.raw,
        })),
        p_statement: {
          account_identifier: parsed.statement.accountIdentifier,
          currency_code: parsed.statement.currencyCode,
          statement_from: parsed.statement.statementFrom,
          statement_to: parsed.statement.statementTo,
          closing_balance_minor: parsed.statement.closingBalanceMinor,
          closing_balance_at: parsed.statement.closingBalanceAt,
          metadata: parsed.statement.metadata,
        },
      },
    );
    rpcError(result, "stageImport");
    if (!result.data) throw new Error("Import staging returned no data");
    return result.data;
  }

  async getPreview(importId: UUID): Promise<ImportPreview> {
    await this.ensureInitialized?.();

    const result = await this.rpc.rpc<Record<string, unknown>>(
      "finance_get_import_preview",
      { p_import_id: importId },
    );
    rpcError(result, "getImportPreview");
    if (!result.data) throw new Error("Import preview returned no data");

    const raw = result.data;
    const imp = record(raw.import, "import preview metadata");
    const summary = record(raw.summary, "import preview summary");

    return {
      import: {
        importId: String(imp.import_id),
        accountId: String(imp.account_id),
        source: String(imp.source),
        format: String(imp.format) as ImportPreview["import"]["format"],
        fileName: nullableString(imp.file_name),
        fileSha256: nullableString(imp.file_sha256),
        storagePath: nullableString(imp.storage_path),
        status: String(imp.status) as ImportPreview["import"]["status"],
        rowCount: Number(imp.row_count),
        importedCount: Number(imp.imported_count),
        duplicateCount: Number(imp.duplicate_count),
        failedCount: Number(imp.failed_count),
        accountIdentifier: nullableString(imp.account_identifier),
        statementCurrency: nullableString(imp.statement_currency),
        statementFrom: nullableString(imp.statement_from),
        statementTo: nullableString(imp.statement_to),
        closingBalanceMinor: nullableNumber(imp.closing_balance_minor),
        closingBalanceAt: nullableString(imp.closing_balance_at),
        mapping:
          imp.mapping && typeof imp.mapping === "object" && !Array.isArray(imp.mapping)
            ? (imp.mapping as Record<string, unknown>)
            : {},
        detectedMetadata:
          imp.detected_metadata &&
          typeof imp.detected_metadata === "object" &&
          !Array.isArray(imp.detected_metadata)
            ? (imp.detected_metadata as Record<string, unknown>)
            : {},
        metadata:
          imp.metadata &&
          typeof imp.metadata === "object" &&
          !Array.isArray(imp.metadata)
            ? (imp.metadata as Record<string, unknown>)
            : {},
        createdAt: String(imp.created_at),
        previewedAt: nullableString(imp.previewed_at),
        committedAt: nullableString(imp.committed_at),
      },
      account: parseAccount(raw.account),
      summary: {
        readyCount: Number(summary.ready_count),
        reviewCount: Number(summary.review_count),
        duplicateCount: Number(summary.duplicate_count),
        ignoredCount: Number(summary.ignored_count),
        debitMinor: Number(summary.debit_minor),
        creditMinor: Number(summary.credit_minor),
      },
      records: Array.isArray(raw.records)
        ? raw.records.map(parsePreviewRecord)
        : [],
      categories: Array.isArray(raw.categories)
        ? raw.categories.map(parseCategory)
        : [],
      accounts: Array.isArray(raw.accounts)
        ? raw.accounts.map(parseAccount)
        : [],
    };
  }

  async updateRecord(input: UpdateImportRecordInput): Promise<void> {
    await this.ensureInitialized?.();

    const result = await this.rpc.rpc<Record<string, unknown>>(
      "finance_update_import_record",
      {
        p_record_id: input.recordId,
        p_decision: input.decision ?? null,
        p_proposed_type: input.proposedType ?? null,
        p_category_id: input.categoryId ?? null,
        p_necessity: input.necessity ?? null,
        p_transfer_account_id: input.transferAccountId ?? null,
        p_reporting_amount_minor: input.reportingAmountMinor ?? null,
        p_exchange_rate: input.exchangeRate ?? null,
      },
    );
    rpcError(result, "updateImportRecord");
  }

  async commitImport(importId: UUID): Promise<ImportCommitResult> {
    await this.ensureInitialized?.();

    const result = await this.rpc.rpc<Record<string, unknown>>(
      "finance_commit_import",
      { p_import_id: importId },
    );
    rpcError(result, "commitImport");
    if (!result.data) throw new Error("Import commit returned no data");

    return {
      importId: String(result.data.import_id),
      status: String(result.data.status) as ImportCommitResult["status"],
      importedCount: Number(result.data.imported_count),
      duplicateCount: Number(result.data.duplicate_count),
      ignoredCount: Number(result.data.ignored_count),
      failedCount: Number(result.data.failed_count),
      reviewCount: Number(result.data.review_count),
      reconciliation:
        result.data.reconciliation &&
        typeof result.data.reconciliation === "object" &&
        !Array.isArray(result.data.reconciliation)
          ? (result.data.reconciliation as Record<string, unknown>)
          : {},
    };
  }

  async cancelImport(importId: UUID): Promise<void> {
    await this.ensureInitialized?.();

    const preview = await this.getPreview(importId);
    if (preview.import.storagePath) {
      const removal = await this.client.storage
        .from("finance-imports")
        .remove([preview.import.storagePath]);
      if (removal.error) {
        throw new Error(
          `Finance import storage cleanup: ${removal.error.message}`,
        );
      }
    }

    const result = await this.rpc.rpc<Record<string, unknown>>(
      "finance_cancel_import",
      { p_import_id: importId },
    );
    rpcError(result, "cancelImport");
  }

  async saveProfile(input: SaveImportProfileInput): Promise<UUID> {
    await this.ensureInitialized?.();

    const result = await this.rpc.rpc<string>(
      "finance_upsert_import_profile",
      {
        p_profile_id: input.profileId ?? null,
        p_name: input.name,
        p_format: input.format,
        p_institution_key: input.institutionKey ?? null,
        p_account_id: input.accountId ?? null,
        p_header_signature: input.headerSignature ?? null,
        p_mapping: input.mapping,
        p_is_default: input.isDefault ?? false,
      },
    );
    rpcError(result, "saveImportProfile");
    if (!result.data) throw new Error("Import profile returned no id");
    return String(result.data);
  }
}
