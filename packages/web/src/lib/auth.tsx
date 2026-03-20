import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { User } from "@shared";
import { queryClient } from "./queryClient";

interface AuthContextType {
  user: (User & { profile?: any; companyName?: string; isImpersonating?: boolean; impersonatorId?: number }) | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<any>;
  register: (data: { email: string; password: string; firstName: string; lastName: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function tryRefreshTokens(): Promise<any | null> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      return data.user;
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<(User & { profile?: any; companyName?: string; isImpersonating?: boolean; impersonatorId?: number }) | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        return;
      }
      if (res.status === 401) {
        const refreshedUser = await tryRefreshTokens();
        if (refreshedUser) {
          setUser(refreshedUser);
          return;
        }
      }
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string, remember = false) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Login failed");
    }
    const data = await res.json();
    setUser(data.user);
    return data.user;
  };

  const register = async (regData: { email: string; password: string; firstName: string; lastName: string }) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regData),
      credentials: "include",
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Registration failed");
    }
    const data = await res.json();
    setUser(data.user);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  const prevTenantRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const tenantKey = user ? `${user.id}-${user.companyId}-${user.role}` : "anon";
    if (prevTenantRef.current !== undefined && prevTenantRef.current !== tenantKey) {
      queryClient.cancelQueries();
      queryClient.removeQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "tenant",
      });
    }
    prevTenantRef.current = tenantKey;
  }, [user?.id, user?.companyId, user?.role]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
