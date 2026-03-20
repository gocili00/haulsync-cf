import type { User } from "@shared";

type AuthUser = User & { profile?: any; companyName?: string; isImpersonating?: boolean; impersonatorId?: number };

export function getTenantScopeKey(user: AuthUser | null | undefined): (string | number)[] {
  if (user && user.id && user.companyId) {
    return ["tenant", user.companyId, user.id, user.role];
  }
  return ["tenant", "anon"];
}

export function tenantQueryKey(user: AuthUser | null | undefined, ...rest: any[]): any[] {
  return [...getTenantScopeKey(user), ...rest];
}

function isPlainObject(v: unknown): v is Record<string, any> {
  if (v === null || v === undefined || typeof v !== "object") return false;
  if (Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function extractRequestFromQueryKey(queryKey: readonly unknown[]): { url: string; params?: Record<string, any> } {
  const firstUrlIdx = queryKey.findIndex(
    (part) => typeof part === "string" && part.startsWith("/")
  );
  if (firstUrlIdx === -1) return { url: "" };

  const pathSegments: string[] = [];
  let nextIdx = firstUrlIdx;
  for (let i = firstUrlIdx; i < queryKey.length; i++) {
    const part = queryKey[i];
    if (typeof part === "string") {
      pathSegments.push(part.startsWith("/") ? part : `/${part}`);
    } else if (typeof part === "number") {
      pathSegments.push(`/${part}`);
    } else {
      nextIdx = i;
      break;
    }
    nextIdx = i + 1;
  }

  const url = pathSegments.join("");
  const candidate = nextIdx < queryKey.length ? queryKey[nextIdx] : undefined;

  if (isPlainObject(candidate)) {
    return { url, params: candidate };
  }

  return { url };
}
