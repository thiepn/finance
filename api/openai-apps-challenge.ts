export async function GET(): Promise<Response> {
  const token = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.OPENAI_APPS_CHALLENGE?.trim();

  if (!token) {
    return new Response("Not configured", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  return new Response(token, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
