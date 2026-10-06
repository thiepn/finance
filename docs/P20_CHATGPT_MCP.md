# P20 — ChatGPT / MCP Integration

P20 exposes the deterministic P19 Finance query engine to ChatGPT through a narrow, read-only MCP boundary.

## Core invariant

ChatGPT may choose or phrase a Finance query. ChatGPT never calculates authoritative money values and never receives SQL, a Supabase secret, a service-role key, or unrestricted database access.

~~~text
ChatGPT
  ↓ OAuth 2.1 bearer token
THIEPN Finance MCP
  ↓ same bearer token
THIEPN Core Gateway
  ↓ verified THIEPN Account UUID
gateway.finance_read_model
  ↓ allowlisted deterministic read model
P19 AskFinanceEngine
  ↓
AskFinanceAnswer + evidence + provenance
~~~

## Authentication

The MCP resource server trusts only THIEPN Account OAuth access tokens issued to an explicitly allowlisted Finance MCP OAuth client. It requires a bearer token, validates bounded issuer/subject/expiry/client claims, rejects tokens issued to other THIEPN OAuth clients such as Hub, verifies the token against THIEPN Account /auth/v1/user, requires the verified Account UUID to equal the token subject, and forwards the token only to THIEPN Core Gateway.

## Canonical identity correction

Before P20, Finance user rows referenced THIEPN Core auth.users. P20 migration 20261006143144_finance_p20_account_identity_boundary.sql removes that coupling and defines Finance user_id as the canonical THIEPN Account UUID.

The migration deliberately fails if Finance already contains profile, transaction, or receipt data. Production was verified empty before it was applied, so no financial history was re-keyed or discarded.

## Core Gateway

The service-role-only Core function gateway.finance_read_model(p_user_id, p_request) is SECURITY INVOKER and dispatches only these existing Finance read models:

- activity filter catalog;
- Spending Explorer;
- product purchase evidence;
- Overview;
- product catalog;
- product intelligence;
- recurring dashboard;
- planning dashboard;
- wealth dashboard;
- receipt-match dashboard.

The gateway cannot accept SQL, arbitrary RPC names, table names, user ids supplied by ChatGPT, or write operations. Core Gateway derives p_user_id from the verified THIEPN Account bearer token.

## MCP tools

### finance_ask

Accepts a natural-language finance question and runs the existing P19 deterministic parser and query engine.

### finance_query

Accepts the typed P19 query contract: intent, question, period, optional dimension/entity/necessity scope, and a bounded result limit. Structured queries still pass through P19 entity resolution.

Both tools are read-only, non-destructive, idempotent, and closed-world.

## Prompt-injection boundary

Merchant names, product names, receipt text, category names and other Finance evidence are user data. The MCP server explicitly tells the model that returned labels and evidence are data, never instructions. P20 exposes no mutation tool.

## MCP transport

The server advertises stateless MCP Streamable HTTP revision 2025-11-25. It supports initialize, notifications/initialized, ping, tools/list and tools/call. Legacy GET/SSE sessions and DELETE session termination are intentionally unsupported and return HTTP 405 after authentication.

Endpoint:

~~~text
https://finance.thiepn.dev/api/mcp
~~~

Protected-resource metadata:

~~~text
https://finance.thiepn.dev/.well-known/oauth-protected-resource
~~~

## Account consent

THIEPN Account owns OAuth authorization and user approval. The existing /oauth/consent route is generalized without weakening the strict Hub path.

Finance consent accepts only ChatGPT-owned callback URLs under https://chatgpt.com/connector/oauth/<callback-id>, the verified current Account owner, a bounded OAuth client id, standard identity/refresh scopes (openid, email, profile, offline_access), and explicit user approval.

## Server configuration

Finance deployment needs server-side environment values:

~~~text
THIEPN_ACCOUNT_URL
THIEPN_ACCOUNT_PUBLISHABLE_KEY
THIEPN_CORE_GATEWAY_URL
THIEPN_FINANCE_MCP_CLIENT_IDS
~~~

Account staging flag:

~~~text
VITE_FINANCE_MCP_OAUTH_ENABLED=staged-v1
~~~

Keep that flag disabled until hosted Account OAuth 2.1 is configured with /oauth/consent as its authorization path.

## Verification

- production Finance contained no user financial data before identity migration;
- all Finance foreign keys to Core auth.users were removed;
- canonical Account UUID projection works through the existing auth.uid()-based read models;
- first-use initialization returns EUR / de-DE / Europe/Berlin;
- gateway.finance_read_model is not callable by public, anon, or authenticated;
- Supabase security advisors reported no Finance/Gateway finding caused by P20;
- current Finance performance notices are unused-index INFO findings on an empty dataset.

## Activation gates

Code merge is not the same as live ChatGPT activation. Before connecting ChatGPT:

1. deploy the Core Gateway revision;
2. deploy Finance with the three server environment values;
3. enable the THIEPN Account OAuth 2.1 authorization server and register/determine the dedicated ChatGPT Finance OAuth client id;
4. configure /oauth/consent as its authorization path and add that client id to THIEPN_FINANCE_MCP_CLIENT_IDS;
5. enable the Finance Account consent feature flag;
6. ensure refresh-token / offline_access support is advertised;
7. connect the remote Finance MCP endpoint from a ChatGPT plan that supports custom read-only MCP apps;
8. scan tools and complete Account consent;
9. run real-user acceptance tests.

## P21 handoff

P21 should be live activation, real-user MCP qualification and failure hardening. It should not add write tools until the read-only integration has been qualified with real Finance data and explicit confirmation semantics are designed separately.