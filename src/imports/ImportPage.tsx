import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type {
  CsvImportMapping,
  ImportPreview,
  ImportPreviewRecord,
  ParsedImportFile,
} from "../domain/imports.js";
import type { Necessity } from "../domain/finance.js";
import {
  Badge,
  Button,
  Money,
  Skeleton,
  StatCard,
  Surface,
} from "../ui/components/Primitives.js";
import { formatMoneyMinor } from "../ui/format/money.js";
import { Icon } from "../ui/icons/Icon.js";
import {
  detectImportFormat,
  importHeaderSignature,
  inspectCsv,
  parseBankFile,
  parseCsv,
} from "./parsers.js";
import { useImportWorkspace } from "./use-imports.js";

function ImportLoading() {
  return (
    <div className="f-imports">
      <div className="f-imports-heading">
        <Skeleton className="f-overview-skeleton--title" />
      </div>
      <Surface>
        <Skeleton className="f-overview-skeleton--panel" />
      </Surface>
    </div>
  );
}

function MappingField({
  label,
  value,
  headers,
  required,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  headers: readonly string[];
  required?: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        onChange={(event) =>
          onChange(event.currentTarget.value || null)
        }
        required={required}
        value={value ?? ""}
      >
        <option value="">
          {required ? "Choose column…" : "Not mapped"}
        </option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}

function CsvMappingEditor({
  headers,
  mapping,
  onChange,
}: {
  headers: readonly string[];
  mapping: CsvImportMapping;
  onChange: (mapping: CsvImportMapping) => void;
}) {
  const patch = <K extends keyof CsvImportMapping>(
    key: K,
    value: CsvImportMapping[K],
  ) => onChange({ ...mapping, [key]: value });

  return (
    <div className="f-imports-mapping-grid">
      <MappingField
        headers={headers}
        label="Booking date"
        onChange={(value) => patch("bookedAt", value ?? "")}
        required
        value={mapping.bookedAt}
      />
      <MappingField
        headers={headers}
        label="Amount"
        onChange={(value) => patch("amount", value ?? "")}
        value={mapping.amount}
      />
      <MappingField
        headers={headers}
        label="Debit"
        onChange={(value) => patch("debit", value)}
        value={mapping.debit}
      />
      <MappingField
        headers={headers}
        label="Credit"
        onChange={(value) => patch("credit", value)}
        value={mapping.credit}
      />
      <MappingField
        headers={headers}
        label="Description"
        onChange={(value) => patch("description", value)}
        value={mapping.description}
      />
      <MappingField
        headers={headers}
        label="Counterparty"
        onChange={(value) => patch("counterpartyName", value)}
        value={mapping.counterpartyName}
      />
      <MappingField
        headers={headers}
        label="Currency"
        onChange={(value) => patch("currency", value)}
        value={mapping.currency}
      />
      <MappingField
        headers={headers}
        label="External ID"
        onChange={(value) => patch("externalId", value)}
        value={mapping.externalId}
      />
      <MappingField
        headers={headers}
        label="Reference"
        onChange={(value) => patch("reference", value)}
        value={mapping.reference}
      />
      <MappingField
        headers={headers}
        label="IBAN"
        onChange={(value) => patch("counterpartyIban", value)}
        value={mapping.counterpartyIban}
      />
      <MappingField
        headers={headers}
        label="Value date"
        onChange={(value) => patch("valueDate", value)}
        value={mapping.valueDate}
      />

      <label>
        <span>Date order</span>
        <select
          onChange={(event) =>
            patch(
              "dateFormat",
              event.currentTarget
                .value as CsvImportMapping["dateFormat"],
            )
          }
          value={mapping.dateFormat ?? "auto"}
        >
          <option value="auto">Auto</option>
          <option value="dmy">Day / Month / Year</option>
          <option value="mdy">Month / Day / Year</option>
          <option value="ymd">Year / Month / Day</option>
        </select>
      </label>
    </div>
  );
}

function RecordEditor({
  record,
  preview,
  busy,
  onSave,
}: {
  record: ImportPreviewRecord;
  preview: ImportPreview;
  busy: boolean;
  onSave: (input: {
    decision: ImportPreviewRecord["decision"];
    proposedType: ImportPreviewRecord["proposedType"];
    categoryId: string | null;
    necessity: Necessity | null;
    transferAccountId: string | null;
    exchangeRate: number | null;
  }) => Promise<void>;
}) {
  const [decision, setDecision] = useState(record.decision);
  const [type, setType] = useState(record.proposedType);
  const [categoryId, setCategoryId] = useState(record.categoryId ?? "");
  const [necessity, setNecessity] =
    useState<Necessity | "">(record.necessity ?? "");
  const [transferAccountId, setTransferAccountId] = useState(
    record.transferAccountId ?? "",
  );
  const [exchangeRate, setExchangeRate] = useState(
    record.exchangeRate && record.exchangeRate !== 1
      ? String(record.exchangeRate)
      : "",
  );

  const categories = preview.categories.filter((category) =>
    type === "expense"
      ? category.kind === "expense" || category.kind === "both"
      : type === "income"
        ? category.kind === "income" || category.kind === "both"
        : false,
  );

  const needsFx = record.reportingAmountMinor === null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSave({
      decision,
      proposedType: type,
      categoryId: type === "transfer" ? null : categoryId || null,
      necessity:
        type === "expense" && necessity
          ? necessity
          : type === "expense"
            ? record.necessity
            : null,
      transferAccountId:
        type === "transfer" ? transferAccountId || null : null,
      exchangeRate:
        needsFx && exchangeRate
          ? Number(exchangeRate)
          : null,
    });
  };

  return (
    <form className="f-imports-record" onSubmit={submit}>
      <div className="f-imports-record__main">
        <div className="f-imports-record__badges">
          <Badge
            tone={
              record.decision === "duplicate"
                ? "neutral"
                : record.decision === "review"
                  ? "warning"
                  : "accent"
            }
          >
            {record.decision}
          </Badge>
          {record.duplicateReason ? (
            <Badge tone="warning">
              {record.duplicateReason.replaceAll("_", " ")}
            </Badge>
          ) : null}
          {record.externalId ? (
            <Badge tone="neutral">Bank ID</Badge>
          ) : null}
        </div>
        <strong>
          {record.counterpartyName ??
            record.description ??
            "Imported transaction"}
        </strong>
        <span>
          {new Intl.DateTimeFormat("de-DE", {
            dateStyle: "medium",
          }).format(new Date(record.bookedAt))}
          {record.description &&
          record.description !== record.counterpartyName
            ? ` · ${record.description}`
            : ""}
        </span>
        {record.reference ? (
          <small>{record.reference}</small>
        ) : null}
      </div>

      <div className="f-imports-record__amount">
        <Money
          amountMinor={record.amountMinor}
          currencyCode={record.currencyCode}
          locale="de-DE"
          tone={record.amountMinor < 0 ? "negative" : "positive"}
          showSign
        />
        <small>
          {record.externalId
            ? `ID ${record.externalId}`
            : `Row ${record.rowNumber}`}
        </small>
      </div>

      <div className="f-imports-record__edit">
        <label>
          <span>Decision</span>
          <select
            disabled={record.status === "imported"}
            onChange={(event) =>
              setDecision(
                event.currentTarget
                  .value as ImportPreviewRecord["decision"],
              )
            }
            value={decision}
          >
            <option value="import">Import</option>
            <option value="review">Review</option>
            <option value="duplicate">Duplicate</option>
            <option value="ignore">Ignore</option>
          </select>
        </label>

        <label>
          <span>Type</span>
          <select
            disabled={record.status === "imported"}
            onChange={(event) =>
              setType(
                event.currentTarget
                  .value as ImportPreviewRecord["proposedType"],
              )
            }
            value={type}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
        </label>

        {type !== "transfer" ? (
          <label>
            <span>Category</span>
            <select
              disabled={record.status === "imported"}
              onChange={(event) =>
                setCategoryId(event.currentTarget.value)
              }
              required={decision === "import"}
              value={categoryId}
            >
              <option value="">Choose category…</option>
              {categories.map((category) => (
                <option
                  key={category.categoryId}
                  value={category.categoryId}
                >
                  {"— ".repeat(category.depth)}
                  {category.path.join(" › ")}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            <span>Other account</span>
            <select
              disabled={record.status === "imported"}
              onChange={(event) =>
                setTransferAccountId(event.currentTarget.value)
              }
              required={decision === "import"}
              value={transferAccountId}
            >
              <option value="">Choose account…</option>
              {preview.accounts
                .filter(
                  (account) =>
                    account.accountId !== preview.account.accountId,
                )
                .map((account) => (
                  <option
                    key={account.accountId}
                    value={account.accountId}
                  >
                    {account.name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {type === "expense" ? (
          <label>
            <span>Necessity</span>
            <select
              disabled={record.status === "imported"}
              onChange={(event) =>
                setNecessity(
                  event.currentTarget.value as Necessity,
                )
              }
              value={necessity || "unclassified"}
            >
              <option value="essential">Essential</option>
              <option value="flexible">Flexible</option>
              <option value="discretionary">Discretionary</option>
              <option value="unclassified">Unclassified</option>
            </select>
          </label>
        ) : null}

        {needsFx ? (
          <label>
            <span>FX to reporting currency</span>
            <input
              disabled={record.status === "imported"}
              min="0.000001"
              onChange={(event) =>
                setExchangeRate(event.currentTarget.value)
              }
              required={decision === "import"}
              step="0.000001"
              type="number"
              value={exchangeRate}
            />
          </label>
        ) : null}

        <Button
          disabled={busy || record.status === "imported"}
          size="sm"
          type="submit"
          variant="secondary"
        >
          {record.status === "imported" ? "Posted" : "Save row"}
        </Button>
      </div>
    </form>
  );
}

export interface ImportPageProps {
  onNavigate: (key: string) => void;
}

export function ImportPage({ onNavigate }: ImportPageProps) {
  const workspace = useImportWorkspace();
  const [accountId, setAccountId] = useState("");
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [csvMapping, setCsvMapping] = useState<CsvImportMapping | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");

  const selectedAccount = useMemo(
    () =>
      workspace.dashboard?.accounts.find(
        (account) => account.accountId === accountId,
      ) ?? null,
    [accountId, workspace.dashboard],
  );

  if (workspace.state === "loading") return <ImportLoading />;

  if (
    workspace.state !== "ready" ||
    !workspace.dashboard
  ) {
    return (
      <div className="f-overview-empty">
        <Surface>
          <Badge tone="accent">Imports</Badge>
          <h1>Imports are unavailable.</h1>
          <p>{workspace.error ?? "A Finance session is required."}</p>
          {workspace.state === "error" ? (
            <Button onClick={() => void workspace.refresh()}>
              Retry
            </Button>
          ) : null}
        </Surface>
      </div>
    );
  }

  const dashboard = workspace.dashboard;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.files?.[0] ?? null;
    setFile(next);
    setParsed(null);
    setCsvMapping(null);
    setParseError(null);

    if (!next || !selectedAccount) return;

    try {
      const content = await next.text();
      setText(content);
      const format = detectImportFormat(
        next.name,
        next.type,
        content,
      );

      if (format === "csv") {
        const inspected = inspectCsv(content);
        const signature = importHeaderSignature(inspected.headers);
        const saved = dashboard.profiles.find(
          (profile) =>
            profile.format === "csv" &&
            profile.headerSignature === signature &&
            (!profile.accountId ||
              profile.accountId === selectedAccount.accountId),
        );

        const mapping =
          (saved?.mapping as unknown as CsvImportMapping | undefined) ??
          inspected.mapping ??
          {
            bookedAt: "",
            amount: "",
            dateFormat: "auto",
            decimalSeparator: "auto",
          };

        setCsvMapping(mapping);
        if (
          mapping.bookedAt &&
          (mapping.amount || (mapping.debit && mapping.credit))
        ) {
          setParsed(
            parseCsv(
              content,
              mapping,
              selectedAccount.currencyCode,
            ),
          );
        } else {
          setParsed({
            format: "csv",
            rows: [],
            statement: {
              accountIdentifier: null,
              currencyCode: null,
              statementFrom: null,
              statementTo: null,
              closingBalanceMinor: null,
              closingBalanceAt: null,
              metadata: {},
            },
            csv: {
              ...inspected,
              mapping,
            },
          });
        }
      } else {
        setParsed(
          parseBankFile(
            content,
            format,
            selectedAccount.currencyCode,
          ),
        );
      }

      if (!source.trim()) {
        setSource(
          selectedAccount.institutionName ??
            next.name.replace(/\.[^.]+$/, ""),
        );
      }
    } catch (cause) {
      setParseError(
        cause instanceof Error
          ? cause.message
          : "The selected file could not be parsed.",
      );
    }
  };

  const applyMapping = () => {
    if (!csvMapping || !selectedAccount || !text) return;
    try {
      setParsed(
        parseCsv(
          text,
          csvMapping,
          selectedAccount.currencyCode,
        ),
      );
      setParseError(null);
    } catch (cause) {
      setParseError(
        cause instanceof Error
          ? cause.message
          : "CSV mapping failed.",
      );
    }
  };

  const beginImport = () => {
    if (!file || !parsed || !accountId || !source.trim()) return;
    void workspace.importFile({
      file,
      accountId,
      source: source.trim(),
      parsed,
    });
  };

  const preview = workspace.preview;

  return (
    <div className="f-imports">
      <div className="f-imports-heading">
        <div>
          <div className="f-imports-heading__meta">
            <Badge tone="accent">Ingestion</Badge>
            <span>Preview before ledger mutation</span>
          </div>
          <h1>Import bank activity without losing provenance.</h1>
          <p>
            CSV, CAMT.053, OFX and QFX files are normalized locally,
            stored privately, deduplicated against Finance history,
            and committed only after the preview is accepted.
          </p>
        </div>
        {preview ? (
          <Button
            onClick={workspace.clearPreview}
            variant="secondary"
          >
            New import
          </Button>
        ) : null}
      </div>

      {workspace.actionError || parseError ? (
        <Surface className="f-imports-error">
          <Badge tone="negative">Needs attention</Badge>
          <span>{workspace.actionError ?? parseError}</span>
        </Surface>
      ) : null}

      {!preview ? (
        <>
          <Surface>
            <div className="f-section-heading">
              <div>
                <span className="f-section-heading__kicker">
                  New statement
                </span>
                <h2>Choose account and file</h2>
              </div>
            </div>

            <div className="f-imports-start-grid">
              <label>
                <span>Finance account</span>
                <select
                  onChange={(event) => {
                    setAccountId(event.currentTarget.value);
                    setFile(null);
                    setParsed(null);
                  }}
                  required
                  value={accountId}
                >
                  <option value="">Choose account…</option>
                  {dashboard.accounts.map((account) => (
                    <option
                      key={account.accountId}
                      value={account.accountId}
                    >
                      {account.name} · {account.currencyCode}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Bank / source</span>
                <input
                  maxLength={80}
                  onChange={(event) =>
                    setSource(event.currentTarget.value)
                  }
                  placeholder={
                    selectedAccount?.institutionName ??
                    "e.g. Deutsche Bank"
                  }
                  value={source}
                />
              </label>

              <label className="f-imports-file">
                <span>Statement file</span>
                <input
                  accept=".csv,.xml,.ofx,.qfx,text/csv,application/xml,text/xml,application/x-ofx,application/vnd.intu.qfx"
                  disabled={!selectedAccount}
                  onChange={(event) => void onFile(event)}
                  type="file"
                />
              </label>
            </div>

            {!selectedAccount ? (
              <p className="f-imports-note">
                Select the destination Finance account first so
                statement currency can be validated before staging.
              </p>
            ) : null}
          </Surface>

          {parsed?.format === "csv" &&
          parsed.csv &&
          parsed.rows.length === 0 &&
          csvMapping ? (
            <Surface>
              <div className="f-section-heading">
                <div>
                  <span className="f-section-heading__kicker">
                    CSV mapping
                  </span>
                  <h2>Map this bank export</h2>
                </div>
              </div>
              <CsvMappingEditor
                headers={parsed.csv.headers}
                mapping={csvMapping}
                onChange={setCsvMapping}
              />
              <div className="f-imports-inline-actions">
                <Button onClick={applyMapping} variant="primary">
                  Apply mapping
                </Button>
              </div>
            </Surface>
          ) : null}

          {parsed && parsed.rows.length > 0 && file ? (
            <Surface>
              <div className="f-imports-ready">
                <div>
                  <Badge tone="positive">
                    {parsed.format.toUpperCase()} parsed
                  </Badge>
                  <h2>
                    {parsed.rows.length} transaction
                    {parsed.rows.length === 1 ? "" : "s"} ready for
                    preview
                  </h2>
                  <p>
                    {parsed.statement.statementFrom ?? "Unknown start"}
                    {" – "}
                    {parsed.statement.statementTo ?? "Unknown end"}
                    {parsed.statement.closingBalanceMinor !== null
                      ? " · closing balance available"
                      : ""}
                  </p>
                </div>
                <Button
                  disabled={
                    workspace.busyKey === "import:new" ||
                    !source.trim()
                  }
                  onClick={beginImport}
                  variant="primary"
                >
                  {workspace.busyKey === "import:new"
                    ? "Preparing…"
                    : "Create secure preview"}
                </Button>
              </div>

              {parsed.format === "csv" &&
              parsed.csv?.mapping &&
              selectedAccount ? (
                <div className="f-imports-profile-save">
                  <input
                    onChange={(event) =>
                      setProfileName(event.currentTarget.value)
                    }
                    placeholder="Save mapping as…"
                    value={profileName}
                  />
                  <Button
                    disabled={
                      !profileName.trim() ||
                      workspace.busyKey === "profile:save"
                    }
                    onClick={() =>
                      void workspace.saveCsvProfile({
                        name: profileName.trim(),
                        accountId: selectedAccount.accountId,
                        institutionKey:
                          selectedAccount.institutionName,
                        headerSignature: importHeaderSignature(
                          parsed.csv!.headers,
                        ),
                        mapping:
                          parsed.csv!.mapping as unknown as Record<
                            string,
                            unknown
                          >,
                      })
                    }
                    size="sm"
                    variant="secondary"
                  >
                    Save mapping
                  </Button>
                </div>
              ) : null}
            </Surface>
          ) : null}
        </>
      ) : (
        <>
          <div className="f-overview-stats">
            <StatCard
              label="Ready"
              supporting="Selected for ledger import"
              value={<span>{preview.summary.readyCount}</span>}
            />
            <StatCard
              label="Review"
              supporting="Potential duplicates or ambiguity"
              value={<span>{preview.summary.reviewCount}</span>}
            />
            <StatCard
              label="Duplicates"
              supporting="Strong duplicate evidence"
              value={<span>{preview.summary.duplicateCount}</span>}
            />
            <StatCard
              label="Net file movement"
              supporting="Credits minus debits"
              value={
                <Money
                  amountMinor={
                    preview.summary.creditMinor -
                    preview.summary.debitMinor
                  }
                  currencyCode={preview.account.currencyCode}
                  locale="de-DE"
                  showSign
                />
              }
            />
          </div>

          <Surface>
            <div className="f-section-heading">
              <div>
                <span className="f-section-heading__kicker">
                  {preview.import.format.toUpperCase()}
                </span>
                <h2>
                  {preview.import.fileName ?? "Bank statement"}
                </h2>
                <p className="f-imports-note">
                  {preview.account.name}
                  {preview.import.statementFrom
                    ? ` · ${preview.import.statementFrom}`
                    : ""}
                  {preview.import.statementTo
                    ? ` – ${preview.import.statementTo}`
                    : ""}
                </p>
              </div>
              <Badge
                tone={
                  preview.import.status === "completed"
                    ? "positive"
                    : preview.import.status === "review_required"
                      ? "warning"
                      : "neutral"
                }
              >
                {preview.import.status.replaceAll("_", " ")}
              </Badge>
            </div>

            {preview.import.closingBalanceMinor !== null ? (
              <div className="f-imports-statement-facts">
                <span>
                  Closing balance{" "}
                  <strong>
                    {formatMoneyMinor(
                      preview.import.closingBalanceMinor,
                      preview.account.currencyCode,
                      { locale: "de-DE" },
                    )}
                  </strong>
                </span>
                {preview.import.accountIdentifier ? (
                  <span>
                    Statement account{" "}
                    <strong>
                      {preview.import.accountIdentifier}
                    </strong>
                  </span>
                ) : null}
              </div>
            ) : null}
          </Surface>

          <Surface>
            <div className="f-section-heading">
              <div>
                <span className="f-section-heading__kicker">
                  Transaction review
                </span>
                <h2>Normalized rows</h2>
              </div>
            </div>

            <div className="f-imports-record-list">
              {preview.records.map((record) => (
                <RecordEditor
                  busy={
                    workspace.busyKey ===
                    `record:${record.recordId}`
                  }
                  key={record.recordId}
                  onSave={(input) =>
                    workspace.updateRecord({
                      recordId: record.recordId,
                      ...input,
                    })
                  }
                  preview={preview}
                  record={record}
                />
              ))}
            </div>
          </Surface>

          {workspace.commitResult ? (
            <Surface className="f-imports-result">
              <div>
                <Badge
                  tone={
                    workspace.commitResult.status === "completed"
                      ? "positive"
                      : "warning"
                  }
                >
                  {workspace.commitResult.status.replaceAll("_", " ")}
                </Badge>
                <h2>
                  {workspace.commitResult.importedCount} imported ·{" "}
                  {workspace.commitResult.duplicateCount} duplicate ·{" "}
                  {workspace.commitResult.reviewCount} still to review
                </h2>
                {Object.keys(
                  workspace.commitResult.reconciliation,
                ).length > 0 ? (
                  <p>
                    Reconciliation:{" "}
                    {String(
                      workspace.commitResult.reconciliation.status ??
                        "recorded",
                    ).replaceAll("_", " ")}
                    {" · variance "}
                    {formatMoneyMinor(
                      Number(
                        workspace.commitResult.reconciliation
                          .variance_minor ?? 0,
                      ),
                      preview.account.currencyCode,
                      { locale: "de-DE", showSign: true },
                    )}
                  </p>
                ) : null}
              </div>
              <Button
                onClick={() => onNavigate("activity")}
                variant="secondary"
              >
                Open Activity
              </Button>
            </Surface>
          ) : null}

          {preview.import.status !== "completed" &&
          preview.import.status !== "cancelled" ? (
            <div className="f-imports-commit-bar">
              <div>
                <strong>
                  Commit {preview.summary.readyCount} selected row
                  {preview.summary.readyCount === 1 ? "" : "s"}
                </strong>
                <span>
                  Review rows remain staged until you explicitly decide
                  how to handle them.
                </span>
              </div>
              <Button
                disabled={workspace.busyKey === "import:cancel"}
                onClick={() => void workspace.cancel()}
                variant="ghost"
              >
                Cancel import
              </Button>
              <Button
                disabled={
                  workspace.busyKey === "import:commit" ||
                  preview.summary.readyCount === 0
                }
                onClick={() => void workspace.commit()}
                variant="primary"
              >
                {workspace.busyKey === "import:commit"
                  ? "Committing…"
                  : "Commit selected"}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Surface>
        <div className="f-section-heading">
          <div>
            <span className="f-section-heading__kicker">
              Import history
            </span>
            <h2>Recent files</h2>
          </div>
          <Badge tone="neutral">
            {dashboard.imports.length} recent
          </Badge>
        </div>

        {dashboard.imports.length === 0 ? (
          <div className="f-overview-inline-empty">
            No bank files have been imported yet.
          </div>
        ) : (
          <div className="f-imports-history">
            {dashboard.imports.map((item) => (
              <button
                className="f-imports-history__row"
                key={item.importId}
                onClick={() =>
                  void workspace.openImport(item.importId)
                }
                type="button"
              >
                <span>
                  <strong>
                    {item.fileName ?? item.source}
                  </strong>
                  <small>
                    {item.accountName ?? "Account"} ·{" "}
                    {item.format?.toUpperCase() ?? "FILE"}
                  </small>
                </span>
                <span>
                  {item.importedCount}/{item.rowCount} imported
                </span>
                <Badge
                  tone={
                    item.status === "completed"
                      ? "positive"
                      : item.status === "review_required"
                        ? "warning"
                        : item.status === "failed"
                          ? "negative"
                          : "neutral"
                  }
                >
                  {item.status.replaceAll("_", " ")}
                </Badge>
                <Icon name="chevronRight" size={16} />
              </button>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}
