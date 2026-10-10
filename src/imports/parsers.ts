import type {
  BankImportFormat,
  CsvImportMapping,
  ParsedImportFile,
  ParsedImportRow,
  ParsedImportStatement,
} from "../domain/imports.js";

const emptyStatement = (): ParsedImportStatement => ({
  accountIdentifier: null,
  currencyCode: null,
  statementFrom: null,
  statementTo: null,
  closingBalanceMinor: null,
  closingBalanceAt: null,
  metadata: {},
});

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function firstMatchingHeader(
  headers: readonly string[],
  aliases: readonly string[],
): string | null {
  const normalized = new Map(
    headers.map((header) => [normalizeHeader(header), header]),
  );
  for (const alias of aliases) {
    const match = normalized.get(normalizeHeader(alias));
    if (match) return match;
  }
  return null;
}

function detectDelimiter(text: string): string {
  const line = text
    .split(/\r?\n/)
    .find((item) => item.trim().length > 0) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const candidate of candidates) {
    let count = 0;
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      if (!quoted && char === candidate) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(value);
      value = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  return rows;
}

function parseMoney(value: string, decimal: CsvImportMapping["decimalSeparator"]): number {
  let clean = value
    .trim()
    .replace(/\s/g, "")
    .replace(/[€$£]/g, "");

  if (!clean) throw new Error("Amount is empty");

  const negativeByParens = /^\(.*\)$/.test(clean);
  clean = clean.replace(/[()]/g, "");

  let separator = decimal;
  if (!separator || separator === "auto") {
    const comma = clean.lastIndexOf(",");
    const dot = clean.lastIndexOf(".");
    separator = comma > dot ? "," : ".";
  }

  if (separator === ",") {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else {
    clean = clean.replace(/,/g, "");
  }

  // Bank statements are evidence, not approximations: never silently round
  // sub-cent values or unsafe integers when interpreting a two-decimal export.
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(clean)) {
    throw new Error(`Ambiguous or sub-cent amount: ${value}`);
  }
  const amount = Number(clean);
  const minor = Math.round((negativeByParens ? -amount : amount) * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(minor)) {
    throw new Error(`Invalid or unsafe bank amount: ${value}`);
  }
  return minor;
}

function parseDate(
  value: string,
  format: CsvImportMapping["dateFormat"] = "auto",
): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Date is empty");

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return `${trimmed.slice(0, 10)}T12:00:00Z`;
  }

  const match = trimmed.match(/^(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{1,4})/);
  if (!match) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date: ${value}`);
    }
    return parsed.toISOString();
  }

  let year: number;
  let month: number;
  let day: number;
  const a = Number(match[1]);
  const b = Number(match[2]);
  const c = Number(match[3]);

  const resolved =
    format === "auto"
      ? match[1]!.length === 4
        ? "ymd"
        : "dmy"
      : format;

  if (resolved === "ymd") {
    year = a;
    month = b;
    day = c;
  } else if (resolved === "mdy") {
    month = a;
    day = b;
    year = c;
  } else {
    day = a;
    month = b;
    year = c;
  }

  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const iso = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    iso.getUTCFullYear() !== year ||
    iso.getUTCMonth() !== month - 1 ||
    iso.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`);
  }
  return iso.toISOString();
}

function optionalDate(value: string | undefined, format: CsvImportMapping["dateFormat"]): string | null {
  if (!value?.trim()) return null;
  return parseDate(value, format).slice(0, 10);
}

export function detectImportFormat(
  fileName: string,
  mimeType: string,
  content: string,
): BankImportFormat {
  const name = fileName.toLowerCase();
  const head = content.slice(0, 1200).toLowerCase();

  if (name.endsWith(".qfx")) return "qfx";
  if (name.endsWith(".ofx") || head.includes("<ofx>")) return "ofx";
  if (
    name.endsWith(".xml") &&
    (head.includes("bk-to-cstmr-stmt") ||
      head.includes("camt.053") ||
      head.includes("banktocustomerstatement"))
  ) {
    return "camt053";
  }
  if (
    mimeType.includes("xml") &&
    (head.includes("camt.053") || head.includes("bktocstmrstmt"))
  ) {
    return "camt053";
  }
  return "csv";
}

export function autoMapCsv(headers: readonly string[]): CsvImportMapping | null {
  const bookedAt = firstMatchingHeader(headers, [
    "Buchungstag",
    "Buchungsdatum",
    "Datum",
    "Booking Date",
    "Booked",
    "Transaction Date",
    "Date",
  ]);
  const amount = firstMatchingHeader(headers, [
    "Betrag",
    "Umsatz",
    "Amount",
    "Transaction Amount",
  ]);
  const debit = firstMatchingHeader(headers, [
    "Soll",
    "Debit",
    "Withdrawal",
    "Ausgabe",
  ]);
  const credit = firstMatchingHeader(headers, [
    "Haben",
    "Credit",
    "Deposit",
    "Einnahme",
  ]);

  if (!bookedAt || (!amount && !(debit && credit))) return null;

  return {
    bookedAt,
    amount: amount ?? "",
    debit,
    credit,
    valueDate: firstMatchingHeader(headers, [
      "Valutadatum",
      "Wertstellung",
      "Value Date",
    ]),
    currency: firstMatchingHeader(headers, [
      "Währung",
      "Waehrung",
      "Currency",
      "CUR",
    ]),
    description: firstMatchingHeader(headers, [
      "Verwendungszweck",
      "Buchungstext",
      "Beschreibung",
      "Purpose",
      "Description",
      "Memo",
    ]),
    counterpartyName: firstMatchingHeader(headers, [
      "Begünstigter/Zahlungspflichtiger",
      "Beguenstigter/Zahlungspflichtiger",
      "Empfänger/Auftraggeber",
      "Name Zahlungsbeteiligter",
      "Payee",
      "Payer",
      "Name",
    ]),
    counterpartyIban: firstMatchingHeader(headers, [
      "IBAN Zahlungsbeteiligter",
      "IBAN",
      "Counterparty IBAN",
    ]),
    reference: firstMatchingHeader(headers, [
      "Kundenreferenz",
      "Mandatsreferenz",
      "Referenz",
      "Reference",
      "End-to-End-Ref.",
    ]),
    externalId: firstMatchingHeader(headers, [
      "Transaktions-ID",
      "Transaction ID",
      "TransactionId",
      "FITID",
      "ID",
    ]),
    dateFormat: "auto",
    decimalSeparator: "auto",
  };
}

export function inspectCsv(text: string): {
  headers: string[];
  delimiter: string;
  rawRows: Record<string, string>[];
  mapping: CsvImportMapping | null;
} {
  const delimiter = detectDelimiter(text);
  const matrix = parseDelimited(text.replace(/^\uFEFF/, ""), delimiter);
  if (matrix.length < 2) throw new Error("CSV contains no transaction rows");

  const headers = matrix[0]!.map((value) => value.trim());
  const rawRows = matrix.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index]?.trim() ?? "";
    });
    return row;
  });

  return {
    headers,
    delimiter,
    rawRows,
    mapping: autoMapCsv(headers),
  };
}

export function parseCsv(
  text: string,
  mapping: CsvImportMapping,
  fallbackCurrency: string,
): ParsedImportFile {
  const inspected = inspectCsv(text);
  const rows: ParsedImportRow[] = inspected.rawRows.map((raw, index) => {
    const bookedAt = parseDate(raw[mapping.bookedAt] ?? "", mapping.dateFormat);
    let amountMinor: number;

    if (mapping.amount) {
      amountMinor = parseMoney(raw[mapping.amount] ?? "", mapping.decimalSeparator);
    } else {
      const debitRaw = mapping.debit ? raw[mapping.debit] ?? "" : "";
      const creditRaw = mapping.credit ? raw[mapping.credit] ?? "" : "";
      const debit = debitRaw.trim()
        ? Math.abs(parseMoney(debitRaw, mapping.decimalSeparator))
        : 0;
      const credit = creditRaw.trim()
        ? Math.abs(parseMoney(creditRaw, mapping.decimalSeparator))
        : 0;
      amountMinor = credit - debit;
    }

    if (amountMinor === 0) {
      throw new Error(`CSV row ${index + 2} has a zero amount`);
    }

    const currency =
      (mapping.currency ? raw[mapping.currency] : "")?.trim().toUpperCase() ||
      fallbackCurrency.toUpperCase();

    return {
      externalId:
        (mapping.externalId ? raw[mapping.externalId] : "")?.trim() || null,
      bookedAt,
      valueDate: optionalDate(
        mapping.valueDate ? raw[mapping.valueDate] : undefined,
        mapping.dateFormat,
      ),
      amountMinor,
      currencyCode: currency,
      description:
        (mapping.description ? raw[mapping.description] : "")?.trim() || null,
      counterpartyName:
        (mapping.counterpartyName ? raw[mapping.counterpartyName] : "")?.trim() ||
        null,
      counterpartyIban:
        (mapping.counterpartyIban ? raw[mapping.counterpartyIban] : "")
          ?.replace(/\s/g, "")
          .toUpperCase() || null,
      reference:
        (mapping.reference ? raw[mapping.reference] : "")?.trim() || null,
      raw,
    };
  });

  const dates = rows.map((row) => row.bookedAt.slice(0, 10)).sort();

  return {
    format: "csv",
    rows,
    statement: {
      ...emptyStatement(),
      currencyCode:
        rows.every((row) => row.currencyCode === rows[0]?.currencyCode)
          ? rows[0]?.currencyCode ?? fallbackCurrency
          : null,
      statementFrom: dates[0] ?? null,
      statementTo: dates.at(-1) ?? null,
      metadata: {
        delimiter: inspected.delimiter,
        row_count: rows.length,
      },
    },
    csv: {
      ...inspected,
      mapping,
    },
  };
}

function getElementsByLocalName(root: ParentNode, name: string): Element[] {
  return Array.from(root.querySelectorAll("*")).filter(
    (element) => element.localName === name,
  );
}

function firstLocal(root: ParentNode, name: string): Element | null {
  return getElementsByLocalName(root, name)[0] ?? null;
}

function directChild(root: Element, name: string): Element | null {
  return Array.from(root.children).find(
    (child) => child.localName === name,
  ) ?? null;
}

function nestedText(root: Element, path: readonly string[]): string | null {
  let current: Element | null = root;
  for (const part of path) {
    if (!current) return null;
    current = directChild(current, part);
  }
  return current?.textContent?.trim() || null;
}

function xmlDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00Z`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseCamt053(text: string): ParsedImportFile {
  if (typeof DOMParser === "undefined") {
    throw new Error("CAMT parsing requires a browser DOMParser");
  }
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid CAMT XML");

  const statement =
    firstLocal(doc, "Stmt") ??
    firstLocal(doc, "BkToCstmrStmt");
  if (!statement) throw new Error("No CAMT statement found");

  const account = firstLocal(statement, "Acct");
  const accountIdentifier = account
    ? nestedText(account, ["Id", "IBAN"]) ??
      nestedText(account, ["Id", "Othr", "Id"])
    : null;
  const statementCurrency =
    account ? nestedText(account, ["Ccy"]) : null;

  const rows = getElementsByLocalName(statement, "Ntry").map((entry) => {
    const amountEl = directChild(entry, "Amt");
    const amount = Number(amountEl?.textContent?.trim());
    if (!Number.isFinite(amount)) throw new Error("CAMT entry has invalid amount");
    const currency =
      amountEl?.getAttribute("Ccy") ??
      statementCurrency ??
      "EUR";
    const direction = nestedText(entry, ["CdtDbtInd"]);
    const signed = direction === "DBIT" ? -amount : amount;

    const booking =
      nestedText(entry, ["BookgDt", "DtTm"]) ??
      nestedText(entry, ["BookgDt", "Dt"]);
    const value =
      nestedText(entry, ["ValDt", "Dt"]) ??
      nestedText(entry, ["ValDt", "DtTm"]);

    const txDetails = firstLocal(entry, "TxDtls");
    const related = txDetails ? firstLocal(txDetails, "RltdPties") : null;
    const debtor = related ? nestedText(related, ["Dbtr", "Pty", "Nm"]) : null;
    const creditor = related ? nestedText(related, ["Cdtr", "Pty", "Nm"]) : null;
    const debtorIban = related ? nestedText(related, ["DbtrAcct", "Id", "IBAN"]) : null;
    const creditorIban = related ? nestedText(related, ["CdtrAcct", "Id", "IBAN"]) : null;

    const remittance = txDetails ? firstLocal(txDetails, "RmtInf") : null;
    const unstructured = remittance
      ? getElementsByLocalName(remittance, "Ustrd")
          .map((el) => el.textContent?.trim())
          .filter(Boolean)
          .join(" ")
      : "";

    return {
      externalId:
        nestedText(entry, ["AcctSvcrRef"]) ??
        nestedText(entry, ["NtryRef"]) ??
        (txDetails ? nestedText(txDetails, ["Refs", "EndToEndId"]) : null),
      bookedAt: xmlDate(booking) ?? (() => {
        throw new Error("CAMT entry has no booking date");
      })(),
      valueDate: xmlDate(value)?.slice(0, 10) ?? null,
      amountMinor: Math.round(signed * 100),
      currencyCode: currency.toUpperCase(),
      description:
        unstructured ||
        nestedText(entry, ["AddtlNtryInf"]) ||
        nestedText(entry, ["BkTxCd", "Prtry", "Cd"]),
      counterpartyName:
        direction === "DBIT"
          ? creditor ?? debtor
          : debtor ?? creditor,
      counterpartyIban:
        (direction === "DBIT"
          ? creditorIban ?? debtorIban
          : debtorIban ?? creditorIban
        )?.replace(/\s/g, "").toUpperCase() ?? null,
      reference:
        txDetails
          ? nestedText(txDetails, ["Refs", "EndToEndId"]) ??
            nestedText(txDetails, ["Refs", "MndtId"]) ??
            nestedText(txDetails, ["Refs", "TxId"])
          : null,
      raw: {
        xml: entry.textContent?.trim() ?? "",
      },
    } satisfies ParsedImportRow;
  });

  const balances = getElementsByLocalName(statement, "Bal").map((balance) => {
    const code =
      nestedText(balance, ["Tp", "CdOrPrtry", "Cd"]) ??
      nestedText(balance, ["Tp", "CdOrPrtry", "Prtry"]);
    const amountEl = directChild(balance, "Amt");
    const amount = Number(amountEl?.textContent?.trim());
    const direction = nestedText(balance, ["CdtDbtInd"]);
    const date =
      nestedText(balance, ["Dt", "DtTm"]) ??
      nestedText(balance, ["Dt", "Dt"]);
    return {
      code,
      amountMinor: Number.isFinite(amount)
        ? Math.round((direction === "DBIT" ? -amount : amount) * 100)
        : null,
      currencyCode: amountEl?.getAttribute("Ccy") ?? null,
      at: xmlDate(date),
    };
  });

  const closing =
    balances.find((item) => item.code === "CLBD") ??
    balances.find((item) => item.code === "CLAV") ??
    balances.at(-1);

  const dates = rows.map((row) => row.bookedAt.slice(0, 10)).sort();
  const namespace =
    doc.documentElement.namespaceURI ?? "";
  const version = namespace.match(/camt\.053\.001\.\d+/)?.[0] ?? null;

  return {
    format: "camt053",
    rows,
    statement: {
      accountIdentifier,
      currencyCode:
        closing?.currencyCode ??
        statementCurrency ??
        rows[0]?.currencyCode ??
        null,
      statementFrom: dates[0] ?? null,
      statementTo: dates.at(-1) ?? null,
      closingBalanceMinor: closing?.amountMinor ?? null,
      closingBalanceAt: closing?.at ?? null,
      metadata: {
        camt_version: version,
        balance_code: closing?.code ?? null,
        row_count: rows.length,
      },
    },
  };
}

function ofxTag(block: string, tag: string): string | null {
  const xml = block.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  if (xml) return xml[1]!.trim();
  const sgml = block.match(
    new RegExp(`<${tag}[^>]*>([^<\\r\\n]+)`, "i"),
  );
  return sgml?.[1]?.trim() ?? null;
}

function ofxBlocks(text: string, tag: string): string[] {
  const closed = Array.from(
    text.matchAll(
      new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"),
    ),
  ).map((match) => match[1] ?? "");
  if (closed.length > 0) return closed;

  const starts = Array.from(
    text.matchAll(new RegExp(`<${tag}[^>]*>`, "gi")),
  );
  return starts.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = starts[index + 1]?.index ?? text.length;
    return text.slice(start, end);
  });
}

function parseOfxDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T12:00:00Z`;
}

export function parseOfx(
  text: string,
  format: "ofx" | "qfx" = "ofx",
): ParsedImportFile {
  const currency = ofxTag(text, "CURDEF")?.toUpperCase() ?? "EUR";
  const accountIdentifier = ofxTag(text, "ACCTID");
  const rows = ofxBlocks(text, "STMTTRN").map((block) => {
    const amountRaw = ofxTag(block, "TRNAMT");
    const amount = amountRaw ? Number(amountRaw) : Number.NaN;
    const bookedAt = parseOfxDate(ofxTag(block, "DTPOSTED"));
    if (!Number.isFinite(amount) || !bookedAt) {
      throw new Error("OFX transaction is missing amount or posted date");
    }

    const name = ofxTag(block, "NAME");
    const memo = ofxTag(block, "MEMO");
    const reference =
      ofxTag(block, "REFNUM") ??
      ofxTag(block, "CHECKNUM");

    return {
      externalId: ofxTag(block, "FITID"),
      bookedAt,
      valueDate: parseOfxDate(ofxTag(block, "DTUSER"))?.slice(0, 10) ?? null,
      amountMinor: Math.round(amount * 100),
      currencyCode: currency,
      description: memo ?? name,
      counterpartyName: name,
      counterpartyIban: null,
      reference,
      raw: {
        trntype: ofxTag(block, "TRNTYPE"),
        fitid: ofxTag(block, "FITID"),
        name,
        memo,
      },
    } satisfies ParsedImportRow;
  });

  const ledgerBlock = ofxBlocks(text, "LEDGERBAL")[0] ?? text;
  const closingAmountRaw = ofxTag(ledgerBlock, "BALAMT");
  const closingAmount = closingAmountRaw
    ? Number(closingAmountRaw)
    : Number.NaN;
  const closingAt = parseOfxDate(ofxTag(ledgerBlock, "DTASOF"));
  const dates = rows.map((row) => row.bookedAt.slice(0, 10)).sort();

  return {
    format,
    rows,
    statement: {
      accountIdentifier,
      currencyCode: currency,
      statementFrom: dates[0] ?? null,
      statementTo: dates.at(-1) ?? null,
      closingBalanceMinor: Number.isFinite(closingAmount)
        ? Math.round(closingAmount * 100)
        : null,
      closingBalanceAt: closingAt,
      metadata: {
        row_count: rows.length,
        bank_id: ofxTag(text, "BANKID"),
        branch_id: ofxTag(text, "BRANCHID"),
      },
    },
  };
}

export function parseBankFile(
  text: string,
  format: BankImportFormat,
  fallbackCurrency: string,
  csvMapping?: CsvImportMapping | null,
): ParsedImportFile {
  if (format === "csv") {
    const inspected = inspectCsv(text);
    const mapping = csvMapping ?? inspected.mapping;
    if (!mapping) {
      return {
        format: "csv",
        rows: [],
        statement: emptyStatement(),
        csv: inspected,
      };
    }
    return parseCsv(text, mapping, fallbackCurrency);
  }
  if (format === "camt053") return parseCamt053(text);
  return parseOfx(text, format);
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function importHeaderSignature(headers: readonly string[]): string {
  return headers.map(normalizeHeader).sort().join("|");
}
