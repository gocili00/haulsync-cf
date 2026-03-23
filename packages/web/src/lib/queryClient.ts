import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { extractRequestFromQueryKey } from "./tenantQueryKey";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Auth callbacks — registered by AuthProvider so queryClient can sync user state
let _onRefreshSuccess: ((user: any) => void) | null = null;
let _onAuthExpired: (() => void) | null = null;

export function setAuthCallbacks(callbacks: {
  onRefreshSuccess: (user: any) => void;
  onAuthExpired: () => void;
}) {
  _onRefreshSuccess = callbacks.onRefreshSuccess;
  _onAuthExpired = callbacks.onAuthExpired;
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        // Sync the refreshed user back into AuthContext so companyId/role stay valid
        if (data?.user) _onRefreshSuccess?.(data.user);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function buildUrl(url: string, params?: Record<string, any>): string {
  if (!params) return url;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") {
          qs.append(key, String(item));
        }
      }
    } else {
      qs.set(key, String(value));
    }
  }
  const str = qs.toString();
  return str ? `${url}?${str}` : url;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  let res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (res.status === 401 && !url.includes("/api/auth/")) {
    const refreshed = await attemptRefresh();
    if (!refreshed) {
      // Refresh token is invalid/expired — session is truly over
      _onAuthExpired?.();
    } else {
      res = await fetch(url, {
        method,
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const { url, params } = extractRequestFromQueryKey(queryKey);
    const finalUrl = buildUrl(url, params);
    let res = await fetch(finalUrl, {
      credentials: "include",
    });

    if (res.status === 401) {
      const refreshed = await attemptRefresh();
      if (!refreshed) {
        // Refresh token is invalid/expired — session is truly over
        _onAuthExpired?.();
      } else {
        res = await fetch(finalUrl, {
          credentials: "include",
        });
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
