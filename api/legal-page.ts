function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface LegalSection {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}

export function legalPage(
  title: string,
  intro: string,
  sections: readonly LegalSection[],
): Response {
  const body = sections
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section.heading)}</h2>
          ${section.paragraphs
            .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
            .join("")}
          ${section.bullets?.length
            ? `<ul>${section.bullets
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}</ul>`
            : ""}
        </section>
      `,
    )
    .join("");

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} · THIEPN Finance</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0 80px; }
    a { color: LinkText; }
    h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0 0 12px; letter-spacing: -0.03em; }
    h2 { margin-top: 36px; font-size: 1.25rem; }
    p, li { line-height: 1.65; }
    .brand { font-size: .8rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; opacity: .65; }
    .intro { font-size: 1.08rem; opacity: .82; }
    nav { margin-top: 40px; display: flex; gap: 18px; flex-wrap: wrap; font-size: .9rem; }
  </style>
</head>
<body>
  <main>
    <div class="brand">THIEPN Finance</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">${escapeHtml(intro)}</p>
    ${body}
    <nav>
      <a href="/">Finance</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/support">Support</a>
    </nav>
  </main>
</body>
</html>`,
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
