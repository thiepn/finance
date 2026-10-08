import {
  normalizeCoreGatewayUrl,
  parseFinanceAiInterpretation,
} from "./finance-ai-interpreter.js";

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


for (const anchorDate of ["2026-02-29", "2026-04-31", "2026-13-01"]) {
  let rejected = false;
  try {
    parseFinanceAiInterpretation("test", {
      status: "parsed",
      intent: "spending",
      period: { kind: "month", anchorDate, label: "invalid date" },
      dimension: null,
      necessity: null,
      reason: null,
    });
  } catch {
    rejected = true;
  }
  assert(rejected, `invalid calendar date ${anchorDate} must be rejected`);
}

const leapDate = parseFinanceAiInterpretation("test", {
  status: "parsed",
  intent: "spending",
  period: { kind: "month", anchorDate: "2028-02-29", label: "February" },
  dimension: null,
  necessity: null,
  reason: null,
});
assert(
  leapDate.query?.period.anchorDate === "2028-02-29",
  "valid leap-day anchor must be accepted",
);

for (const url of [
  "http://core.example.com",
  "http://core.example.com:8080",
  "https://user:pass@core.example.com",
  "https://core.example.com/alternate",
  "https://core.example.com/?token=unsafe",
  "javascript:alert(1)",
]) {
  assert(
    normalizeCoreGatewayUrl(url) === null,
    `unsafe gateway URL ${url} must be rejected`,
  );
}

assert(
  normalizeCoreGatewayUrl("https://core.example.com/") ===
    "https://core.example.com",
  "production HTTPS gateway should be normalized",
);
assert(
  normalizeCoreGatewayUrl("http://localhost:8787") ===
    "http://localhost:8787",
  "local development gateway should remain available",
);

console.log("Finance AI interpretation fixtures passed");
