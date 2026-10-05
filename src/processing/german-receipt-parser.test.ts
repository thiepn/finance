import type { ReceiptCapture } from "../domain/receipt-capture.js";
import type { ReceiptOcrPage } from "../domain/receipt-processing.js";
import { GermanReceiptParser } from "./german-receipt-parser.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const capture: ReceiptCapture = {
  id: "11111111-1111-4111-8111-111111111111",
  clientCaptureId: "22222222-2222-4222-8222-222222222222",
  captureMethod: "camera",
  captureStatus: "ready",
  processingStatus: "captured",
  captureDeviceId: "test",
  captureStartedAt: "2026-10-05T10:00:00.000Z",
  captureFinalizedAt: "2026-10-05T10:01:00.000Z",
  captureCancelledAt: null,
  captureMetadata: {},
  merchantId: null,
  purchasedAt: null,
  currencyCode: "EUR",
  totalMinor: null,
  bucket: "finance-receipts",
  pages: [],
};

const pages: ReceiptOcrPage[] = [
  {
    pageId: "33333333-3333-4333-8333-333333333333",
    pageIndex: 0,
    confidence: 0.96,
    rawText: [
      "REWE MARKT 1234",
      "Musterstraße 1",
      "50667 Köln",
      "MILCH 2,00",
      "M&M PEANUT 3,49",
      "PFAND 0,25",
      "RABATT -0,50",
      "SUMME EUR 5,24",
      "Bon Nr. 123456",
      "05.10.2026 12:34",
      "GIROCARD",
    ].join("\n"),
    metadata: { language: "deu+eng" },
  },
];

const result = new GermanReceiptParser().parse(capture, pages);

assert(result.header.merchantName === "REWE MARKT 1234", "merchant detection failed");
assert(result.header.totalMinor === 524, "total detection failed");
assert(result.header.discountMinor === 50, "discount detection failed");
assert(result.header.depositMinor === 25, "deposit detection failed");
assert(result.header.receiptNumber === "123456", "receipt number detection failed");
assert(result.header.paymentMethod === "GIROCARD", "payment detection failed");
assert(result.header.currencyCode === "EUR", "currency detection failed");
assert(result.items.length === 3, `expected 3 items, got ${result.items.length}`);

const milk = result.items.find((item) => item.rawName === "MILCH");
const candy = result.items.find((item) => item.rawName === "M&M PEANUT");
const deposit = result.items.find((item) => item.rawName === "PFAND");

assert(milk?.lineTotalMinor === 200, "milk item parse failed");
assert(candy?.lineTotalMinor === 349, "M&M item parse failed");
assert(deposit?.lineTotalMinor === 25, "deposit item parse failed");
assert(deposit?.depositMinor === 25, "deposit classification failed");

console.log("German receipt parser fixture passed");
