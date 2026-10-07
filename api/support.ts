import { legalPage } from "./legal-page.js";

export async function GET(): Promise<Response> {
  return legalPage(
    "Support",
    "Support for THIEPN Finance, account connections, and the read-only ChatGPT plugin.",
    [
      {
        heading: "Before reporting a problem",
        paragraphs: [
          "For ChatGPT plugin issues, confirm that THIEPN Finance is installed, the THIEPN Account connection is active, and the question is within the plugin's supported read-only Finance workflows.",
        ],
      },
      {
        heading: "Report an issue",
        paragraphs: [
          "Use the THIEPN Finance GitHub issue tracker for reproducible product or integration problems: https://github.com/thiepn/finance/issues",
          "Include the action you attempted, the approximate time, and any non-sensitive error message. Do not include passwords, OAuth tokens, bank credentials, recovery codes, or private financial records in a public issue.",
        ],
      },
      {
        heading: "Privacy or data requests",
        paragraphs: [
          "For privacy, access, correction, or deletion requests, open a minimal support issue asking for a private follow-up path. Do not put sensitive financial data in the issue itself.",
        ],
      },
    ],
  );
}
