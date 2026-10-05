import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseRpcClient } from "../services/supabase-ledger.js";
import { SupabaseFinanceImportService } from "../services/supabase-imports.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];

const rpc: SupabaseRpcClient = {
  async rpc<T>(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: null }> {
    calls.push(args ? { name: functionName, args } : { name: functionName });

    if (functionName === "finance_get_import_dashboard") {
      return {
        data: {
          imports: [{
            import_id: "import-1",
            account_id: "account-1",
            account_name: "Checking",
            source: "Bank",
            format: "csv",
            file_name: "statement.csv",
            status: "review_required",
            row_count: 2,
            imported_count: 0,
            duplicate_count: 1,
            failed_count: 0,
            statement_from: "2026-10-01",
            statement_to: "2026-10-02",
            created_at: "2026-10-05T12:00:00Z",
            committed_at: null,
            reconciliation: null,
          }],
          profiles: [{
            profile_id: "profile-1",
            name: "Bank CSV",
            format: "csv",
            institution_key: "bank",
            account_id: "account-1",
            header_signature: "amount|date",
            mapping: { bookedAt: "Date", amount: "Amount" },
            is_default: true,
          }],
          accounts: [{
            account_id: "account-1",
            name: "Checking",
            kind: "checking",
            currency_code: "EUR",
            institution_name: "Bank",
          }],
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_start_import") {
      return {
        data: {
          import_id: "import-1",
          status: "pending",
          bucket: "finance-imports",
          storage_prefix: "user/import-1/",
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_stage_import_records") {
      return {
        data: {
          import_id: "import-1",
          row_count: 1,
          ready_count: 1,
          review_count: 0,
          duplicate_count: 0,
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_get_import_preview") {
      return {
        data: {
          import: {
            import_id: "import-1",
            account_id: "account-1",
            source: "Bank",
            format: "csv",
            file_name: "statement.csv",
            file_sha256: "a".repeat(64),
            storage_path: null,
            status: "review_required",
            row_count: 1,
            imported_count: 0,
            duplicate_count: 0,
            failed_count: 0,
            account_identifier: null,
            statement_currency: "EUR",
            statement_from: "2026-10-01",
            statement_to: "2026-10-01",
            closing_balance_minor: null,
            closing_balance_at: null,
            mapping: {},
            detected_metadata: {},
            metadata: {},
            created_at: "2026-10-05T12:00:00Z",
            previewed_at: "2026-10-05T12:01:00Z",
            committed_at: null,
          },
          account: {
            account_id: "account-1",
            name: "Checking",
            kind: "checking",
            currency_code: "EUR",
            institution_name: "Bank",
          },
          summary: {
            ready_count: 1,
            review_count: 0,
            duplicate_count: 0,
            ignored_count: 0,
            debit_minor: 1000,
            credit_minor: 0,
          },
          records: [{
            record_id: "record-1",
            row_number: 1,
            status: "pending",
            decision: "import",
            external_id: "fit-1",
            booked_at: "2026-10-01T12:00:00Z",
            value_date: null,
            amount_minor: -1000,
            reporting_amount_minor: -1000,
            exchange_rate: 1,
            currency_code: "EUR",
            description: "Coffee",
            counterparty_name: "Cafe",
            counterparty_iban: null,
            reference: null,
            source_hash: "hash",
            fingerprint: "fingerprint",
            duplicate_reason: null,
            duplicate_transaction_id: null,
            duplicate_record_id: null,
            proposed_type: "expense",
            category_id: "category-1",
            necessity: "flexible",
            transfer_account_id: null,
            merchant_id: null,
            classification_result: {},
            transaction_id: null,
            error_text: null,
          }],
          categories: [{
            category_id: "category-1",
            name: "Other",
            kind: "both",
            necessity_default: "unclassified",
            depth: 0,
            path: ["Other"],
          }],
          accounts: [{
            account_id: "account-1",
            name: "Checking",
            kind: "checking",
            currency_code: "EUR",
            institution_name: "Bank",
          }],
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_update_import_record") {
      return { data: { record_id: "record-1" } as T, error: null };
    }

    if (functionName === "finance_commit_import") {
      return {
        data: {
          import_id: "import-1",
          status: "completed",
          imported_count: 1,
          duplicate_count: 0,
          ignored_count: 0,
          failed_count: 0,
          review_count: 0,
          reconciliation: {},
        } as T,
        error: null,
      };
    }

    if (functionName === "finance_upsert_import_profile") {
      return { data: "profile-created" as T, error: null };
    }

    if (functionName === "finance_cancel_import") {
      return { data: { import_id: "import-1", status: "cancelled" } as T, error: null };
    }

    return { data: null, error: null };
  },
};

let initialized = 0;
const service = new SupabaseFinanceImportService(
  rpc,
  {} as SupabaseClient,
  async () => { initialized += 1; },
);

const dashboard = await service.getDashboard();
assert(dashboard.accounts[0]?.name === "Checking", "dashboard account parse failed");
assert(dashboard.profiles[0]?.isDefault === true, "profile parse failed");

const start = await service.startImport({
  accountId: "account-1",
  source: "Bank",
  format: "csv",
  clientImportId: "client-1",
  fileName: "statement.csv",
  fileSha256: "a".repeat(64),
  mimeType: "text/csv",
  fileSize: 100,
});
assert(start.importId === "import-1", "start parse failed");

await service.stageImport("import-1", {
  format: "csv",
  rows: [{
    externalId: "fit-1",
    bookedAt: "2026-10-01T12:00:00Z",
    valueDate: null,
    amountMinor: -1000,
    currencyCode: "EUR",
    description: "Coffee",
    counterpartyName: "Cafe",
    counterpartyIban: null,
    reference: null,
    raw: {},
  }],
  statement: {
    accountIdentifier: null,
    currencyCode: "EUR",
    statementFrom: "2026-10-01",
    statementTo: "2026-10-01",
    closingBalanceMinor: null,
    closingBalanceAt: null,
    metadata: {},
  },
});

const preview = await service.getPreview("import-1");
assert(preview.records[0]?.amountMinor === -1000, "preview parse failed");
assert(preview.summary.readyCount === 1, "preview summary failed");

await service.updateRecord({
  recordId: "record-1",
  decision: "ignore",
});
const committed = await service.commitImport("import-1");
assert(committed.status === "completed", "commit parse failed");

const profile = await service.saveProfile({
  name: "Bank CSV",
  format: "csv",
  mapping: { bookedAt: "Date", amount: "Amount" },
});
assert(profile === "profile-created", "profile mutation failed");

assert(initialized === 7, "import initialization hook count failed");
assert(calls[0]?.name === "finance_get_import_dashboard", "dashboard RPC mismatch");
assert(calls[1]?.name === "finance_start_import", "start RPC mismatch");
assert(calls[2]?.name === "finance_stage_import_records", "stage RPC mismatch");
assert(calls[3]?.name === "finance_get_import_preview", "preview RPC mismatch");
assert(calls[4]?.name === "finance_update_import_record", "update RPC mismatch");
assert(calls[5]?.name === "finance_commit_import", "commit RPC mismatch");
assert(calls[6]?.name === "finance_upsert_import_profile", "profile RPC mismatch");

console.log("P17 import Supabase adapter fixtures passed");
