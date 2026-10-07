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

The MCP resource server trusts only THIEPN Account OAuth access tokens from a valid Supabase DCR client whose OAuth session has been resource-bound by THIEPN Account to the canonical `https://finance.thiepn.dev/api/mcp` endpoint. It requires a bearer token, validates bounded issuer/subject/expiry/client claims, the complete advertised OAuth scope set, plus the Finance `aud` and `resource` claims, rejects tokens issued to other THIEPN OAuth clients or resources such as Hub, verifies the token against THIEPN Account /auth/v1/user, requires the verified Account UUID to equal the token subject, and forwards the token only to THIEPN Core Gateway.

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

Both tools are read-only, non-destructive, idempotent, and closed-world. Each tool declares OAuth 2 with `openid email profile offline_access` in both the standard `securitySchemes` field and the compatibility `_meta.securitySchemes` mirror.

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
3. enable the THIEPN Account OAuth 2.1 authorization server with dynamic client registration;
4. configure `/oauth/consent` as its authorization path and enable the staged Account access-token hook; Account automatically binds each approved ChatGPT Finance OAuth session to `https://finance.thiepn.dev/api/mcp`;
5. verify the issued token contains both `aud=https://finance.thiepn.dev/api/mcp` and `resource=https://finance.thiepn.dev/api/mcp`;
6. enable the Finance Account consent feature flag and verify refresh-token / `offline_access` discovery;
7. connect the remote Finance MCP endpoint from a ChatGPT plan that supports custom read-only MCP apps;
8. scan tools and complete Account consent;
9. run real-user acceptance tests.

## P21 handoff

P21 should be live activation, real-user MCP qualification and failure hardening. It should not add write tools until the read-only integration has been qualified with real Finance data and explicit confirmation semantics are designed separately.

## Production qualification — 2026-10-07

The Finance MCP production path is live and qualified:

- Vercel team: `thiepn-project` (`team_LVo30en2fIX29vZH3gnYxmoi`);
- Vercel project: `finance` (`prj_F8B50EMixZcK5BIQKo1OxkeOaE1c`);
- Git source: `thiepn/finance` on `main`;
- verified custom domain: `https://finance.thiepn.dev`;
- canonical MCP resource: `https://finance.thiepn.dev/api/mcp`;
- protected-resource metadata: `https://finance.thiepn.dev/.well-known/oauth-protected-resource`;
- Core Gateway: `https://thiepn-core-gateway.thiepn.workers.dev`.

Production environment values are configured for production, preview and development:

~~~text
VITE_SUPABASE_URL=https://bskfihouwdogrunnglbg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<THIEPN Core publishable key>
THIEPN_ACCOUNT_URL=https://hycegznamzjhwinegaai.supabase.co
THIEPN_ACCOUNT_PUBLISHABLE_KEY=<THIEPN Account publishable key>
THIEPN_CORE_GATEWAY_URL=https://thiepn-core-gateway.thiepn.workers.dev
~~~

The real ChatGPT client allowlist remains intentionally dynamic: no guessed client UUID is configured. The actual client must come from the ChatGPT/OpenAI connection DCR flow and then be bound through THIEPN Account.

Canonical-host qualification from an external Vercel sandbox passed all of these assertions:

- public DNS/TLS for `finance.thiepn.dev`;
- protected-resource metadata returns HTTP 200;
- metadata advertises the canonical Finance resource, THIEPN Account authorization server, and `openid email profile offline_access`;
- unauthenticated MCP initialization returns HTTP 401;
- `WWW-Authenticate` advertises the protected-resource metadata URL and complete OAuth scope set;
- THIEPN Account OAuth discovery returns HTTP 200;
- DCR registration endpoint is advertised;
- PKCE `S256`, authorization-code flow, refresh-token flow and public-client `none` token exchange are advertised;
- `offline_access` is advertised.

A real hosted DCR transaction was also qualified with a temporary synthetic client. Account returned HTTP 201 with a public, dynamic client using `token_endpoint_auth_method=none`, authorization-code + refresh grants and the requested scopes. The fixture client and any binding were deleted immediately afterward; post-test counts were zero.

Public review/support surfaces are also live:

- `/` → 200;
- `/support` → 200;
- `/privacy` → 200;
- `/terms` → 200;
- `/.well-known/openai-apps-challenge` → 404 until a portal-issued challenge token is configured, by design.


## Personal / Plus distribution

Direct custom-MCP developer mode is not the primary distribution path for personal ChatGPT accounts. THIEPN Finance therefore packages the same production MCP server as a public Plugin Directory submission.

The public plugin source is in `plugin/`, and the complete submission/review checklist is in `docs/P20_PLUS_PLUGIN_SUBMISSION.md`.

After OpenAI approves and the publisher releases the plugin, eligible personal accounts can install THIEPN Finance from the universal Plugins Directory and complete the same THIEPN Account OAuth flow. The deterministic P19 engine, Core Gateway, OAuth boundaries, and read-only tool contracts remain identical across direct-MCP and Plugin Directory distribution.
