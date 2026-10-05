import {
  autoMapCsv,
  detectImportFormat,
  inspectCsv,
  parseBankFile,
  parseCsv,
  parseOfx,
} from "./parsers.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const csv = [
  '"Buchungstag";"Begünstigter/Zahlungspflichtiger";"Verwendungszweck";"Betrag";"Währung";"Transaktions-ID"',
  '"01.10.2026";"REWE";"Einkauf";"-12,34";"EUR";"abc-1"',
  '"02.10.2026";"Arbeitgeber";"Gehalt";"2.000,00";"EUR";"abc-2"',
].join("\n");

const inspected = inspectCsv(csv);
assert(inspected.delimiter === ";", "CSV delimiter detection failed");
assert(inspected.headers.length === 6, "CSV header parsing failed");
const mapping = autoMapCsv(inspected.headers);
assert(mapping?.bookedAt === "Buchungstag", "CSV date mapping failed");
assert(mapping?.amount === "Betrag", "CSV amount mapping failed");

const parsedCsv = parseCsv(csv, mapping!, "EUR");
assert(parsedCsv.rows.length === 2, "CSV row count failed");
assert(parsedCsv.rows[0]?.amountMinor === -1234, "CSV decimal comma debit failed");
assert(parsedCsv.rows[1]?.amountMinor === 200000, "CSV thousands separator credit failed");
assert(parsedCsv.rows[0]?.counterpartyName === "REWE", "CSV counterparty failed");
assert(parsedCsv.rows[0]?.externalId === "abc-1", "CSV external ID failed");
assert(parsedCsv.statement.statementFrom === "2026-10-01", "CSV start date failed");
assert(parsedCsv.statement.statementTo === "2026-10-02", "CSV end date failed");

const separate = [
  "Date,Description,Debit,Credit,Currency",
  "2026-10-03,Coffee,4.50,,EUR",
  "2026-10-04,Refund,,6.25,EUR",
].join("\n");
const separateInspect = inspectCsv(separate);
const separateMap = autoMapCsv(separateInspect.headers);
assert(separateMap?.debit === "Debit", "CSV debit mapping failed");
assert(separateMap?.credit === "Credit", "CSV credit mapping failed");
const parsedSeparate = parseCsv(separate, separateMap!, "EUR");
assert(parsedSeparate.rows[0]?.amountMinor === -450, "CSV debit/credit debit failed");
assert(parsedSeparate.rows[1]?.amountMinor === 625, "CSV debit/credit credit failed");

const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>EUR
<BANKACCTFROM>
<BANKID>12345678
<ACCTID>DE1234
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261001120000
<TRNAMT>-10.50
<FITID>fit-1
<NAME>REWE
<MEMO>Groceries
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261002120000
<TRNAMT>25.00
<FITID>fit-2
<NAME>Refund
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>100.25
<DTASOF>20261002235959
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

assert(detectImportFormat("statement.ofx", "application/x-ofx", ofx) === "ofx", "OFX detection failed");
const parsedOfx = parseOfx(ofx);
assert(parsedOfx.rows.length === 2, "OFX row count failed");
assert(parsedOfx.rows[0]?.externalId === "fit-1", "OFX FITID failed");
assert(parsedOfx.rows[0]?.amountMinor === -1050, "OFX debit failed");
assert(parsedOfx.rows[1]?.amountMinor === 2500, "OFX credit failed");
assert(parsedOfx.statement.accountIdentifier === "DE1234", "OFX account id failed");
assert(parsedOfx.statement.closingBalanceMinor === 10025, "OFX closing balance failed");
assert(parsedOfx.statement.closingBalanceAt?.startsWith("2026-10-02"), "OFX closing date failed");

const deferred = parseBankFile(csv, "csv", "EUR", null);
assert(deferred.rows.length === 2, "CSV auto mapping path failed");

console.log("P17 CSV and OFX parser fixtures passed");
