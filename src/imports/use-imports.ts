import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ImportCommitResult,
  ImportDashboard,
  ImportPreview,
  ParsedImportFile,
  UpdateImportRecordInput,
} from "../domain/imports.js";
import type { UUID } from "../domain/finance.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { sha256Hex } from "./parsers.js";

export type ImportLoadState =
  | "loading"
  | "ready"
  | "unconfigured"
  | "unauthenticated"
  | "error";

export interface ImportWorkspace {
  state: ImportLoadState;
  dashboard: ImportDashboard | null;
  preview: ImportPreview | null;
  commitResult: ImportCommitResult | null;
  error: string | null;
  actionError: string | null;
  busyKey: string | null;
  refresh(): Promise<void>;
  openImport(importId: UUID): Promise<void>;
  importFile(input: {
    file: File;
    accountId: UUID;
    source: string;
    parsed: ParsedImportFile;
  }): Promise<void>;
  updateRecord(input: UpdateImportRecordInput): Promise<void>;
  commit(): Promise<void>;
  cancel(): Promise<void>;
  saveCsvProfile(input: {
    name: string;
    accountId: UUID | null;
    institutionKey: string | null;
    headerSignature: string;
    mapping: Record<string, unknown>;
  }): Promise<void>;
  clearPreview(): void;
}

export function useImportWorkspace(): ImportWorkspace {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] = useState<ImportLoadState>(
    runtime ? "loading" : "unconfigured",
  );
  const [dashboard, setDashboard] = useState<ImportDashboard | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [commitResult, setCommitResult] =
    useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!runtime) {
      setState("unconfigured");
      setDashboard(null);
      return;
    }

    const id = ++requestId.current;
    setState("loading");
    setError(null);

    const session = await runtime.client.auth.getSession();
    if (id !== requestId.current) return;

    if (session.error) {
      setState("error");
      setError(session.error.message);
      return;
    }

    if (!session.data.session) {
      setState("unauthenticated");
      setDashboard(null);
      return;
    }

    try {
      const next = await runtime.imports.getDashboard();
      if (id !== requestId.current) return;
      setDashboard(next);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Import dashboard could not be loaded.",
      );
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key);
      setActionError(null);
      try {
        await action();
      } catch (cause) {
        setActionError(
          cause instanceof Error ? cause.message : "Import action failed.",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [],
  );

  const openImport = useCallback(
    async (importId: UUID) => {
      if (!runtime) return;
      await runAction(`open:${importId}`, async () => {
        setCommitResult(null);
        setPreview(await runtime.imports.getPreview(importId));
      });
    },
    [runAction, runtime],
  );

  const importFile = useCallback(
    async (input: {
      file: File;
      accountId: UUID;
      source: string;
      parsed: ParsedImportFile;
    }) => {
      if (!runtime) return;

      await runAction("import:new", async () => {
        const hash = await sha256Hex(input.file);
        const start = await runtime.imports.startImport({
          accountId: input.accountId,
          source: input.source,
          format: input.parsed.format,
          clientImportId: crypto.randomUUID(),
          fileName: input.file.name,
          fileSha256: hash,
          mimeType: input.file.type || "application/octet-stream",
          fileSize: input.file.size,
          metadata: {
            parser: "browser",
            parsed_row_count: input.parsed.rows.length,
          },
        });

        try {
          await runtime.imports.uploadOriginal(
            start,
            input.file,
            input.file.name,
            input.file.type || "application/octet-stream",
          );
          await runtime.imports.stageImport(start.importId, input.parsed);
          setPreview(await runtime.imports.getPreview(start.importId));
          setCommitResult(null);
          setDashboard(await runtime.imports.getDashboard());
        } catch (cause) {
          try {
            await runtime.imports.cancelImport(start.importId);
          } catch {
            // Preserve the original ingestion error.
          }
          throw cause;
        }
      });
    },
    [runAction, runtime],
  );

  const updateRecord = useCallback(
    async (input: UpdateImportRecordInput) => {
      if (!runtime || !preview) return;
      await runAction(`record:${input.recordId}`, async () => {
        await runtime.imports.updateRecord(input);
        setPreview(
          await runtime.imports.getPreview(preview.import.importId),
        );
      });
    },
    [preview, runAction, runtime],
  );

  const commit = useCallback(async () => {
    if (!runtime || !preview) return;
    await runAction("import:commit", async () => {
      const result = await runtime.imports.commitImport(
        preview.import.importId,
      );
      setCommitResult(result);
      setPreview(
        await runtime.imports.getPreview(preview.import.importId),
      );
      setDashboard(await runtime.imports.getDashboard());
    });
  }, [preview, runAction, runtime]);

  const cancel = useCallback(async () => {
    if (!runtime || !preview) return;
    await runAction("import:cancel", async () => {
      await runtime.imports.cancelImport(preview.import.importId);
      setPreview(null);
      setCommitResult(null);
      setDashboard(await runtime.imports.getDashboard());
    });
  }, [preview, runAction, runtime]);

  const saveCsvProfile = useCallback(
    async (input: {
      name: string;
      accountId: UUID | null;
      institutionKey: string | null;
      headerSignature: string;
      mapping: Record<string, unknown>;
    }) => {
      if (!runtime) return;
      await runAction("profile:save", async () => {
        await runtime.imports.saveProfile({
          name: input.name,
          format: "csv",
          accountId: input.accountId,
          institutionKey: input.institutionKey,
          headerSignature: input.headerSignature,
          mapping: input.mapping,
          isDefault: true,
        });
        setDashboard(await runtime.imports.getDashboard());
      });
    },
    [runAction, runtime],
  );

  const clearPreview = useCallback(() => {
    setPreview(null);
    setCommitResult(null);
  }, []);

  return {
    state,
    dashboard,
    preview,
    commitResult,
    error,
    actionError,
    busyKey,
    refresh,
    openImport,
    importFile,
    updateRecord,
    commit,
    cancel,
    saveCsvProfile,
    clearPreview,
  };
}
