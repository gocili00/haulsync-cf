export async function onRequest(context: any) {
  const url = new URL(context.request.url);
  const workerUrl = "https://haulsync-worker.goca475.workers.dev";
  
  // Rewrite the URL to point to the worker
  const targetUrl = `${workerUrl}${url.pathname}${url.search}`;
  
  // Forward the request to the worker with all headers and body
  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== "GET" && context.request.method !== "HEAD" 
      ? context.request.body 
      : undefined,
    redirect: "follow",
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
