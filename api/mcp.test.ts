import { GET, POST } from "./mcp.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runtime = globalThis as unknown as {
  process: { env: Record<string, string | undefined> };
  fetch: typeof fetch;
};

runtime.process.env.THIEPN_ACCOUNT_URL = "https://account.example";
runtime.process.env.THIEPN_ACCOUNT_PUBLISHABLE_KEY = "publishable-test-key";
runtime.process.env.THIEPN_CORE_GATEWAY_URL = "https://core.example";
runtime.process.env.THIEPN_FINANCE_MCP_CLIENT_IDS = "chatgpt-test-client";

const userId = "11111111-1111-4111-8111-111111111111";

function token(overrides: Record<string, unknown> = {}): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

  return [
    encode({ alg: "RS256", typ: "JWT" }),
    encode({
      iss: "https://account.example/auth/v1",
      sub: userId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      client_id: "chatgpt-test-client",
      scope: "openid email profile offline_access",
      ...overrides,
    }),
    "test-signature",
  ].join(".");
}

function request(
  body: unknown,
  bearer = token(),
): Request {
  return new Request("https://finance.example/api/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

let accountCalls = 0;
let coreCalls = 0;

runtime.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url === "https://account.example/auth/v1/user") {
    accountCalls += 1;
    return Response.json({ id: userId });
  }
  if (url === "https://core.example/v1/finance/read-model") {
    coreCalls += 1;
    throw new Error("Core must not be called by this fixture");
  }
  throw new Error(`Unexpected fetch: ${url}`);
}) as typeof fetch;

const unauthenticated = await POST(
  new Request("https://finance.example/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  }),
);
assert(unauthenticated.status === 401, "missing bearer token must be rejected");
assert(
  unauthenticated.headers
    .get("WWW-Authenticate")
    ?.includes("/.well-known/oauth-protected-resource"),
  "401 must advertise protected-resource metadata",
);

const wrongIssuer = await POST(
  request(
    { jsonrpc: "2.0", id: 2, method: "initialize" },
    token({ iss: "https://evil.example/auth/v1" }),
  ),
);
assert(wrongIssuer.status === 401, "wrong token issuer must be rejected");
assert(accountCalls === 0, "invalid claims must fail before Account lookup");

const wrongClient = await POST(
  request(
    { jsonrpc: "2.0", id: 21, method: "initialize" },
    token({ client_id: "hub-client" }),
  ),
);
assert(wrongClient.status === 401, "unapproved OAuth client must be rejected");
assert(
  accountCalls === 0,
  "unapproved OAuth client must fail before Account lookup",
);

const initialized = await POST(
  request({
    jsonrpc: "2.0",
    id: 3,
    method: "initialize",
    params: { protocolVersion: "2025-11-25" },
  }),
);
assert(initialized.status === 200, "valid initialize request must succeed");
const initializedBody = (await initialized.json()) as {
  result?: {
    protocolVersion?: string;
    capabilities?: { tools?: unknown };
  };
};
assert(
  initializedBody.result?.protocolVersion === "2025-11-25",
  "MCP protocol negotiation failed",
);
assert(
  initializedBody.result?.capabilities?.tools !== undefined,
  "MCP server must advertise tools capability",
);

const listed = await POST(
  request({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
);
const listedBody = (await listed.json()) as {
  result?: {
    tools?: Array<{
      name?: string;
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        openWorldHint?: boolean;
      };
    }>;
  };
};
const listedTools = listedBody.result?.tools ?? [];
assert(listedTools.length === 2, "P20 must expose exactly two MCP tools");
assert(
  listedTools.map((tool) => tool.name).join(",") ===
    "finance_ask,finance_query",
  "unexpected MCP tool surface",
);
assert(
  listedTools.every(
    (tool) =>
      tool.annotations?.readOnlyHint === true &&
      tool.annotations?.destructiveHint === false &&
      tool.annotations?.openWorldHint === false,
  ),
  "every P20 Finance tool must remain explicitly read-only and closed-world",
);

const malformed = await POST(
  request({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "finance_query",
      arguments: {
        intent: "spending",
        question: "What did I spend?",
        period: {
          kind: "month",
          anchorDate: "not-a-date",
          label: "this month",
        },
      },
    },
  }),
);
const malformedBody = (await malformed.json()) as {
  result?: { isError?: boolean };
};
assert(
  malformedBody.result?.isError === true,
  "malformed structured query must return a tool error",
);
assert(coreCalls === 0, "malformed query must not reach Core Gateway");

const getResponse = await GET(
  new Request("https://finance.example/api/mcp", {
    headers: { Authorization: `Bearer ${token()}` },
  }),
);
assert(getResponse.status === 405, "stateless P20 MCP GET must be disabled");
assert(
  getResponse.headers.get("Allow") === "POST",
  "GET rejection must advertise POST",
);

assert(
  [4].includes(accountCalls),
  "unexpected Account token verification count",
);

console.log("Finance P20 MCP HTTP/auth fixtures passed");
