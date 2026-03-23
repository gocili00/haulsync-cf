/**
 * routes/auth.ts — Authentication routes
 *
 * Replaces: POST/GET /api/auth/* handlers in server/routes.ts (lines 249–393)
 * Changes:
 *   - Express req/res → Hono Context
 *   - req.body → await c.req.json()
 *   - res.cookie / res.clearCookie → setCookie / deleteCookie (hono/cookie)
 *   - req.ip → CF-Connecting-IP header
 *   - generateAccessToken / createRefreshToken now async (jose-based)
 *   - Simple in-memory rate limit for login/register (replaced by KV in P1-T14)
 *
 * Unchanged: all validation schemas, all business logic, cookie names,
 *            httpOnly/secure/sameSite settings, token rotation on refresh.
 */

import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import {
  hashPassword,
  comparePassword,
  needsRehash,
  generateAccessToken,
  createRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  refreshTokenMaxAgeDays,
} from "../lib/auth";
import { authMiddleware } from "../middleware/auth";
import { getClientIp } from "../lib/helpers";
import { loginSchema, registerSchema } from "@haulsync/shared";

export const authRoutes = new Hono<{ Bindings: Env }>();

// ── Cookie helpers ─────────────────────────────────────────────────────────
// Mirrors setAccessTokenCookie / setRefreshCookie / clearAccessTokenCookie /
// clearRefreshCookie from server/auth.ts — same names, same settings.

function setAccessTokenCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, "accessToken", token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    path: "/",
    maxAge: 900, // 15 minutes
  });
}

function setRefreshCookie(c: Parameters<typeof setCookie>[0], token: string, maxAgeDays: number) {
  setCookie(c, "refreshToken", token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: true,
    path: "/",
    maxAge: maxAgeDays * 24 * 60 * 60,
  });
}

function clearAuthCookies(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, "accessToken", { httpOnly: true, sameSite: "Lax", secure: true, path: "/" });
  deleteCookie(c, "refreshToken", { httpOnly: true, sameSite: "Lax", secure: true, path: "/" });
}

// ── Simple in-memory rate limit (replaced by KV in P1-T14) ────────────────
const authAttempts = new Map<string, { count: number; windowStart: number }>();

function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    authAttempts.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= 10;
}

// ── POST /api/auth/register ────────────────────────────────────────────────
authRoutes.post("/register", async (c) => {
  const ip = getClientIp(c);
  if (!checkAuthRateLimit(ip)) {
    return c.json({ message: "Too many requests, please try again later" }, 429);
  }

  try {
    const body = await c.req.json();
    const parsed = registerSchema.parse(body);

    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);

    const existing = await storage.getUserByEmail(parsed.email);
    if (existing) {
      return c.json({ message: "Email already in use" }, 400);
    }

    const passwordHash = await hashPassword(parsed.password);
    const user = await storage.createUser({
      email: parsed.email,
      passwordHash,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      role: "DRIVER",
    });

    if (user.role === "DRIVER") {
      await storage.createDriverProfile({
        userId: user.id,
        ratePerMile: "0.5000",
        employmentType: "W2_COMPANY_DRIVER",
        status: "ACTIVE",
      });
    }

    const accessToken = await generateAccessToken(
      { userId: user.id, role: user.role, companyId: user.companyId },
      c.env.SESSION_SECRET
    );
    const rawRefresh = await createRefreshToken(
      db,
      user.id,
      false,
      ip,
      c.req.header("User-Agent") ?? undefined
    );

    setAccessTokenCookie(c, accessToken);
    setRefreshCookie(c, rawRefresh, 1);

    const profile = await storage.getDriverProfile(user.id);
    return c.json({ user: { ...user, passwordHash: undefined, profile } });
  } catch (err: any) {
    return c.json({ message: err.message ?? "Registration failed" }, 400);
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
authRoutes.post("/login", async (c) => {
  const ip = getClientIp(c);
  if (!checkAuthRateLimit(ip)) {
    return c.json({ message: "Too many requests, please try again later" }, 429);
  }

  try {
    const body = await c.req.json();
    const parsed = loginSchema.parse(body);

    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);

    const user = await storage.getUserByEmail(parsed.email);
    if (!user) {
      return c.json({ message: "Invalid email or password" }, 401);
    }
    if (user.isActive === false) {
      return c.json(
        { message: "Your account has been deactivated. Contact your administrator." },
        401
      );
    }

    const valid = await comparePassword(parsed.password, user.passwordHash);
    if (!valid) {
      return c.json({ message: "Invalid email or password" }, 401);
    }

    // Transparently re-hash with the current cost factor if the stored hash
    // was created with a higher cost (e.g. cost=10 from the original Replit app).
    // waitUntil keeps this running after the response is sent so it doesn't
    // add latency to the login request.
    if (needsRehash(user.passwordHash)) {
      const newHash = await hashPassword(parsed.password);
      c.executionCtx.waitUntil(
        storage.updateUser(user.id, { passwordHash: newHash } as any)
      );
    }

    const remember = parsed.remember ?? false;
    const accessToken = await generateAccessToken(
      { userId: user.id, role: user.role, companyId: user.companyId },
      c.env.SESSION_SECRET
    );
    const rawRefresh = await createRefreshToken(
      db,
      user.id,
      remember,
      ip,
      c.req.header("User-Agent") ?? undefined
    );
    const maxAgeDays = refreshTokenMaxAgeDays(remember);

    setAccessTokenCookie(c, accessToken);
    setRefreshCookie(c, rawRefresh, maxAgeDays);

    const profile = await storage.getDriverProfile(user.id);
    const company = user.companyId ? await storage.getCompany(user.companyId) : null;
    return c.json({
      user: { ...user, passwordHash: undefined, profile, companyName: company?.name },
    });
  } catch (err: any) {
    return c.json({ message: err.message ?? "Login failed" }, 400);
  }
});

// ── POST /api/auth/migrate-password ────────────────────────────────────────
// One-time migration helper: resets a cost-10 (Replit-era) password to cost-4.
// Protected by MIGRATION_SECRET env var. Only works on cost > 4 hashes so it
// cannot be used to hijack accounts that were already migrated.
authRoutes.post("/migrate-password", async (c) => {
  try {
    const { email, migrationKey, newPassword } = await c.req.json();
    const secret = (c.env as any).MIGRATION_SECRET;
    if (!secret || migrationKey !== secret) {
      return c.json({ message: "Forbidden" }, 403);
    }
    if (!email || !newPassword || newPassword.length < 6) {
      return c.json({ message: "email and newPassword (min 6 chars) required" }, 400);
    }
    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);
    const user = await storage.getUserByEmail(email.trim().toLowerCase());
    if (!user) return c.json({ message: "User not found" }, 404);
    if (!needsRehash(user.passwordHash)) {
      return c.json({ message: "Account already uses current password format — reset via superadmin panel instead" }, 400);
    }
    const passwordHash = await hashPassword(newPassword);
    await storage.updateUser(user.id, { passwordHash } as any);
    return c.json({ message: `Password reset for ${email}` });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
authRoutes.get("/me", authMiddleware, async (c) => {
  const currentUser = c.get("user");
  const db = createDb(c.env);
  const storage = new DatabaseStorage(db);

  const user = await storage.getUser(currentUser.userId);
  if (!user) return c.json({ message: "User not found" }, 401);

  if (user.isActive === false) {
    clearAuthCookies(c);
    return c.json({ message: "Account has been deactivated" }, 401);
  }

  const profile = await storage.getDriverProfile(user.id);
  const company = user.companyId ? await storage.getCompany(user.companyId) : null;
  return c.json({
    user: {
      ...user,
      passwordHash: undefined,
      profile,
      companyName: company?.name,
      isImpersonating: currentUser.isImpersonating ?? false,
      impersonatorId: currentUser.impersonatorId,
    },
  });
});

// ── POST /api/auth/refresh ─────────────────────────────────────────────────
authRoutes.post("/refresh", async (c) => {
  try {
    const rawToken = getCookie(c, "refreshToken");
    if (!rawToken) {
      return c.json({ message: "No refresh token" }, 401);
    }

    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);

    const tokenData = await validateRefreshToken(db, rawToken);
    if (!tokenData) {
      clearAuthCookies(c);
      return c.json({ message: "Invalid or expired refresh token" }, 401);
    }

    const user = await storage.getUser(tokenData.userId);
    if (!user || user.isActive === false) {
      await revokeRefreshToken(db, tokenData.id);
      clearAuthCookies(c);
      return c.json({ message: "User not found or deactivated" }, 401);
    }

    // Rotate: revoke old, issue new
    await revokeRefreshToken(db, tokenData.id);

    const remember = tokenData.remember;
    const accessToken = await generateAccessToken(
      { userId: user.id, role: user.role, companyId: user.companyId },
      c.env.SESSION_SECRET
    );
    const newRawRefresh = await createRefreshToken(
      db,
      user.id,
      remember,
      getClientIp(c),
      c.req.header("User-Agent") ?? undefined
    );
    const maxAgeDays = refreshTokenMaxAgeDays(remember);

    setAccessTokenCookie(c, accessToken);
    setRefreshCookie(c, newRawRefresh, maxAgeDays);

    const profile = await storage.getDriverProfile(user.id);
    const company = user.companyId ? await storage.getCompany(user.companyId) : null;
    return c.json({
      user: { ...user, passwordHash: undefined, profile, companyName: company?.name },
    });
  } catch {
    clearAuthCookies(c);
    return c.json({ message: "Refresh failed" }, 401);
  }
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
authRoutes.post("/logout", async (c) => {
  const rawToken = getCookie(c, "refreshToken");
  if (rawToken) {
    const db = createDb(c.env);
    const tokenData = await validateRefreshToken(db, rawToken);
    if (tokenData) {
      await revokeRefreshToken(db, tokenData.id);
    }
  }
  clearAuthCookies(c);
  return c.json({ message: "Logged out" });
});
