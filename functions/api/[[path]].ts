export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const workerUrl = "https://haulsync-worker.goca475.workers.dev";

  const targetUrl = `${workerUrl}${url.pathname}${url.search}`;

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== "GET" && context.request.method !== "HEAD"
      ? context.request.body
      : undefined,
    redirect: "follow",
  });

  // Copy headers manually to preserve multiple Set-Cookie headers
  const headers = new Headers();
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") continue;
    headers.set(key, value);
  }
  const cookies = (response.headers as any).getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
