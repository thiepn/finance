import { legalPage } from "./legal-page.js";

export async function GET(): Promise<Response> {
  return legalPage(
    "Privacy Policy",
    "This policy describes how THIEPN Finance handles information when you use the Finance web application or connect its read-only ChatGPT plugin.",
    [
      {
        heading: "Information processed",
        paragraphs: [
          "THIEPN Finance processes the financial records you choose to store in the service, such as accounts, transactions, categories, merchants, receipt evidence, product-level purchase data, budgets, recurring costs, and derived analytics.",
          "When you connect the ChatGPT plugin, THIEPN Account OAuth is used to authenticate you. Finance validates the token and scopes every read request to the authenticated account.",
        ],
      },
      {
        heading: "How the plugin uses data",
        paragraphs: [
          "The plugin is read-only. It retrieves only the Finance information needed to answer the question or structured query you asked.",
          "Tool responses may include financial totals, labels, evidence, provenance, and caveats. Finance does not intentionally include passwords, OAuth access tokens, API keys, recovery codes, or server credentials in tool results.",
        ],
      },
      {
        heading: "Service providers",
        paragraphs: [
          "THIEPN Finance uses hosted infrastructure to operate the service. Requests and stored data may be processed by service providers used for application hosting, authentication, database hosting, and gateway delivery.",
          "When you use the plugin in ChatGPT, OpenAI also processes the prompts, tool requests, and tool responses under the terms and privacy choices that apply to your ChatGPT account.",
        ],
      },
      {
        heading: "Data sharing and advertising",
        paragraphs: [
          "THIEPN Finance does not sell personal financial data or use it for third-party advertising.",
          "Data is disclosed only as needed to operate the service, fulfill your requests, comply with applicable law, or protect the security and integrity of the service.",
        ],
      },
      {
        heading: "Security",
        paragraphs: [
          "Finance uses account-scoped authorization, a read-only plugin tool surface, bounded server-side read models, and resource-bound OAuth tokens. The ChatGPT client is never given database credentials or unrestricted SQL access.",
        ],
      },
      {
        heading: "Questions and requests",
        paragraphs: [
          "For privacy questions, account-data requests, or deletion assistance, use the support page. Do not post passwords, access tokens, bank credentials, or other secrets in a public support ticket.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "This policy may be updated as THIEPN Finance changes. The current version is published at this URL.",
        ],
      },
    ],
  );
}
