/**
 * middleware/auth.ts — Hono auth + role middleware
 *
 * Replaces: authMiddleware and requireRole() from server/auth.ts
 * Changes:
 *   - Express req/res/next → Hono createMiddleware
 *   - cookie-parser → Hono getCookie()
 *   - req.user → c.set("user", payload) / c.get("user")
 *   - jwt.verify → verifyAccessToken() from lib/auth.ts (jose-based)
 *
 * Unchanged: token source priority (cookie first, then Authorization header),
 *            role comparison logic, 401/403 response shapes.
 */

import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { Env } from "../db";
import { verifyAccessToken, type UserPayload } from "../lib/auth";

// Extend Hono context variables type
declare module "hono" {
  interface ContextVariableMap {
    user: UserPayload;
  }
}

// ── authMiddleware ─────────────────────────────────────────────────────────
export const authMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const token =
      getCookie(c, "accessToken") ??
      c.req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return c.json({ message: "Authentication required" }, 401);
    }

    const payload = await verifyAccessToken(token, c.env.SESSION_SECRET);
    if (!payload) {
      return c.json({ message: "Invalid or expired token" }, 401);
    }

    c.set("user", payload);
    await next();
  }
);

// ── requireRole ────────────────────────────────────────────────────────────
export function requireRole(...roles: string[]) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ message: "Authentication required" }, 401);
    }
    if (!roles.includes(user.role)) {
      return c.json({ message: "Insufficient permissions" }, 403);
    }
    await next();
  });
}
