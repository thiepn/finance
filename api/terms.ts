import { legalPage } from "./legal-page.js";

export async function GET(): Promise<Response> {
  return legalPage(
    "Terms of Use",
    "These terms apply to your use of THIEPN Finance and its read-only ChatGPT plugin.",
    [
      {
        heading: "Purpose",
        paragraphs: [
          "THIEPN Finance is a personal finance information and analytics tool. The ChatGPT plugin provides read-only access to supported Finance analytics through the connected user's account.",
        ],
      },
      {
        heading: "No financial, tax, or legal advice",
        paragraphs: [
          "Finance calculations and summaries are informational. They are not individualized investment, tax, legal, lending, or accounting advice and do not replace professional advice where appropriate.",
        ],
      },
      {
        heading: "Your data and account",
        paragraphs: [
          "You are responsible for the accuracy of information you import or enter and for keeping your THIEPN Account credentials secure.",
          "Do not provide passwords, bank login credentials, access tokens, recovery codes, or other secrets through ChatGPT prompts or support tickets.",
        ],
      },
      {
        heading: "Read-only plugin boundary",
        paragraphs: [
          "The published Finance plugin is read-only. It does not initiate payments, transfer money, trade securities, modify transactions, delete records, or change budgets or goals.",
        ],
      },
      {
        heading: "Availability",
        paragraphs: [
          "The service may change, experience interruptions, or become unavailable. Features can be added, removed, or revised while preserving reasonable security and data-access boundaries.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "Do not attempt to bypass authentication, access another user's data, extract secrets, interfere with the service, or use the plugin for unlawful activity.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "These terms may be updated as THIEPN Finance evolves. Continued use after an update is subject to the current version published at this URL.",
        ],
      },
    ],
  );
}
