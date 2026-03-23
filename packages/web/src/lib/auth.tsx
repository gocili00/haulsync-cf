import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { User } from "@shared";
import { queryClient, setAuthCallbacks } from "./queryClient";

type AuthUser = User & {
  profile?: any;
  companyName?: string;
  isImpersonating?: boolean;
  impersonatorId?: number;
};

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<AuthUser>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Safe parser:
 * - ako backend vrati JSON -> vrati parsiran objekat
 * - ako backend vrati HTML/text error page -> ne puca na res.json()
 */
async function parseResponseSafely(res: Response): Promise<any> {
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawText);
    } catch {
      return {
        message: "Invalid JSON response from server",
        raw: rawText,
      };
    }
  }

  return {
    message:
      rawText?.trim()
        ? rawText.slice(0, 300)
        : `Server returned non-JSON response (${res.status})`,
    raw: rawText,
  };
}

/**
 * Helper za jasnu error poruku
 */
function getErrorMessage(data: any, fallback: string) {
  if (data?.message && typeof data.message === "string") return data.message;
  if (data?.error && typeof data.error === "string") return data.error;
  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const prevTenantRef = useRef<string | undefined>(undefined);

  /**
   * Stabilnija varijanta:
   * - proverava samo /api/auth/me
   * - NE radi automatski refresh fallback dok ne sredimo backend
   */
  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
      });

      const data = await parseResponseSafely(res);

      if (res.ok && data?.user) {
        setUser(data.user);
        return;
      }

      if (res.status === 401) {
        setUser(null);
        return;
      }

      console.error("refreshUser failed:", {
        status: res.status,
        data,
      });

      setUser(null);
    } catch (error) {
      console.error("refreshUser network/runtime error:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string, remember = false): Promise<AuthUser> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
      credentials: "include",
    });

    const data = await parseResponseSafely(res);

    if (!res.ok) {
      console.error("login failed:", {
        status: res.status,
        data,
      });
      throw new Error(getErrorMessage(data, `Login failed (${res.status})`));
    }

    if (!data?.user) {
      console.error("login succeeded but no user payload:", data);
      throw new Error("Login response did not include a valid user");
    }

    setUser(data.user);
    return data.user;
  };

  const register = async (regData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regData),
      credentials: "include",
    });

    const data = await parseResponseSafely(res);

    if (!res.ok) {
      console.error("register failed:", {
        status: res.status,
        data,
      });
      throw new Error(getErrorMessage(data, `Registration failed (${res.status})`));
    }

    if (!data?.user) {
      console.error("register succeeded but no user payload:", data);
      throw new Error("Registration response did not include a valid user");
    }

    setUser(data.user);
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("logout request failed:", error);
    } finally {
      setUser(null);
      queryClient.clear();
    }
  };

  /**
   * Čisti tenant query-je kad se promeni user/tenant
   */
  useEffect(() => {
    const tenantKey = user ? `${user.id}-${user.companyId}-${user.role}` : "anon";

    if (prevTenantRef.current !== undefined && prevTenantRef.current !== tenantKey) {
      queryClient.removeQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "tenant",
      });
    }

    prevTenantRef.current = tenantKey;
  }, [user?.id, user?.companyId, user?.role]);

  /**
   * Drži queryClient auth callback-e u sync-u
   */
  useEffect(() => {
    setAuthCallbacks({
      onRefreshSuccess: (freshUser) => {
        if (freshUser) {
          setUser(freshUser);
        } else {
          setUser(null);
        }
      },
      onAuthExpired: () => {
        setUser(null);
      },
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}