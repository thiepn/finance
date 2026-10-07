import { parseFinanceAiInterpretation } from "./finance-ai-interpreter.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parsed = parseFinanceAiInterpretation(
  "Was habe ich letzten Monat ausgegeben?",
  {
    status: "parsed",
    intent: "spending",
    period: {
      kind: "month",
      anchorDate: "2026-09-15",
      label: "last month",
    },
    dimension: null,
    necessity: null,
    reason: null,
  },
);

assert(parsed.query?.intent === "spending", "AI intent was not accepted");
assert(
  parsed.query.period.anchorDate === "2026-09-15",
  "AI period was not accepted",
);
assert(
  parsed.query.question === "Was habe ich letzten Monat ausgegeben?",
  "original question must be preserved",
);

const unsupported = parseFinanceAiInterpretation("Should I buy Nvidia?", {
  status: "unsupported",
  intent: null,
  period: null,
  dimension: null,
  necessity: null,
  reason: "Investment advice is outside Ask Finance.",
});

assert(unsupported.query === null, "unsupported AI result must not execute");
assert(
  unsupported.reason === "Investment advice is outside Ask Finance.",
  "unsupported reason must be preserved",
);

let invalidRejected = false;
try {
  parseFinanceAiInterpretation("test", {
    status: "parsed",
    intent: "spending",
    period: {
      kind: "day",
      anchorDate: "2026-10-07",
      label: "today",
    },
    dimension: null,
    necessity: null,
    reason: null,
  });
} catch {
  invalidRejected = true;
}
assert(invalidRejected, "unsupported period granularity must be rejected");

console.log("Finance AI interpretation fixtures passed");
