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
  generatePasswordResetToken,
  verifyPasswordResetToken,
  generateOAuthState,
  verifyOAuthState,
} from "../lib/auth";
import { authMiddleware } from "../middleware/auth";
import { getClientIp } from "../lib/helpers";
import { loginSchema } from "@haulsync/shared";

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
// Open registration is disabled — new accounts are created via invite only.
// Use POST /api/invites/accept with a valid invite token.
authRoutes.post("/register", (c) => {
  return c.json({ message: "Open registration is disabled. Ask your company admin for an invite link." }, 410);
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
  try {
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
  } catch (err: any) {
    return c.json({ message: err.message ?? "Failed to fetch user" }, 500);
  }
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

// ── POST /api/auth/forgot-password ────────────────────────────────────────
authRoutes.post("/forgot-password", async (c) => {
  try {
    const body = await c.req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
    if (!email) return c.json({ message: "Email is required" }, 400);

    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);
    const user = await storage.getUserByEmail(email);

    // Always respond OK — do not reveal whether email exists
    if (user && user.isActive !== false) {
      const token = await generatePasswordResetToken(user.email, c.env.SESSION_SECRET);
      const appUrl = c.env.APP_URL ?? "https://haulsync.app";
      const resetLink = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

      if (c.env.RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "HaulSync <noreply@haulsync.app>",
            to: [user.email],
            subject: "Reset your HaulSync password",
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                <h2 style="color:#1d4ed8">Reset your password</h2>
                <p>Hi ${user.firstName},</p>
                <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
                <a href="${resetLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">Reset password</a>
                <p style="color:#6b7280;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
              </div>
            `,
          }),
        }).catch(() => {}); // swallow email errors — don't fail the request
      }
    }

    return c.json({ message: "If that email exists, we sent a reset link." });
  } catch {
    return c.json({ message: "Request failed" }, 400);
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────
authRoutes.post("/reset-password", async (c) => {
  try {
    const { token, password } = await c.req.json();
    if (!token || !password || typeof password !== "string" || password.length < 6) {
      return c.json({ message: "Invalid request — password must be at least 6 characters" }, 400);
    }

    const payload = await verifyPasswordResetToken(token, c.env.SESSION_SECRET);
    if (!payload) return c.json({ message: "Reset link is invalid or has expired" }, 400);

    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);
    const user = await storage.getUserByEmail(payload.email);
    if (!user || user.isActive === false) {
      return c.json({ message: "User not found" }, 404);
    }

    const passwordHash = await hashPassword(password);
    await storage.updateUser(user.id, { passwordHash } as any);

    return c.json({ message: "Password updated successfully" });
  } catch {
    return c.json({ message: "Reset failed" }, 400);
  }
});

// ── GET /api/auth/google ───────────────────────────────────────────────────
authRoutes.get("/google", async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) return c.json({ message: "Google OAuth not configured" }, 503);

  const appUrl = c.env.APP_URL ?? "https://haulsync.app";
  const state = await generateOAuthState(c.env.SESSION_SECRET);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/auth/google/callback`,
    response_type: "code",
    scope: "email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return c.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
});

// ── POST /api/auth/google/exchange ─────────────────────────────────────────
authRoutes.post("/google/exchange", async (c) => {
  try {
    const { code, state } = await c.req.json();
    if (!code || !state) return c.json({ message: "Missing code or state" }, 400);

    const validState = await verifyOAuthState(state, c.env.SESSION_SECRET);
    if (!validState) return c.json({ message: "Invalid or expired OAuth state" }, 400);

    const clientId = c.env.GOOGLE_CLIENT_ID;
    const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return c.json({ message: "Google OAuth not configured" }, 503);

    const appUrl = c.env.APP_URL ?? "https://haulsync.app";

    // Exchange authorization code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) return c.json({ message: "Failed to exchange OAuth code" }, 400);

    const { access_token } = await tokenRes.json() as { access_token: string };

    // Get user info from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userInfoRes.ok) return c.json({ message: "Failed to fetch Google user info" }, 400);

    const googleUser = await userInfoRes.json() as {
      email: string;
      given_name?: string;
      family_name?: string;
    };
    if (!googleUser.email) return c.json({ message: "No email returned from Google" }, 400);

    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);
    const ip = getClientIp(c);

    let user = await storage.getUserByEmail(googleUser.email.toLowerCase());

    if (!user) {
      // New user — create account with random password (can't log in with password)
      const passwordHash = await hashPassword(crypto.randomUUID());
      user = await storage.createUser({
        email: googleUser.email.toLowerCase(),
        passwordHash,
        firstName: googleUser.given_name || googleUser.email.split("@")[0],
        lastName: googleUser.family_name || "",
        role: "DRIVER",
      });
      await storage.createDriverProfile({
        userId: user.id,
        ratePerMile: "0.5000",
        employmentType: "W2_COMPANY_DRIVER",
        status: "ACTIVE",
      });
    }

    if (user.isActive === false) {
      return c.json({ message: "Your account has been deactivated. Contact your administrator." }, 401);
    }

    const accessToken = await generateAccessToken(
      { userId: user.id, role: user.role, companyId: user.companyId },
      c.env.SESSION_SECRET
    );
    const rawRefresh = await createRefreshToken(
      db, user.id, true, ip, c.req.header("User-Agent") ?? undefined
    );

    setAccessTokenCookie(c, accessToken);
    setRefreshCookie(c, rawRefresh, 30);

    const profile = await storage.getDriverProfile(user.id);
    const company = user.companyId ? await storage.getCompany(user.companyId) : null;

    return c.json({
      user: { ...user, passwordHash: undefined, profile, companyName: company?.name },
    });
  } catch (err: any) {
    return c.json({ message: err.message ?? "Google login failed" }, 400);
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

// ── POST /api/auth/supabase-exchange ──────────────────────────────────────
// Validates a Supabase access_token, finds/creates user in public.users,
// and issues the app's own httpOnly session cookies.
authRoutes.post("/supabase-exchange", async (c) => {
  try {
    const { access_token } = await c.req.json();
    if (!access_token || typeof access_token !== "string") {
      return c.json({ message: "access_token is required" }, 400);
    }

    // Validate the Supabase token by calling Supabase Auth API
    const supabaseUrl = "https://mllfbsjseseavznuyenu.supabase.co";
    const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbGZic2pzZXNlYXZ6bnV5ZW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDIxMDYsImV4cCI6MjA4OTUxODEwNn0.SQ1OUQiif-Kd0xm3OuNb4NWa5C2kfwMh-N_rja9zFQo";

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        apikey: supabaseAnonKey,
      },
    });

    if (!userRes.ok) {
      return c.json({ message: "Invalid or expired Supabase token" }, 401);
    }

    const supabaseUser = await userRes.json() as {
      id: string;
      email: string;
      user_metadata?: { first_name?: string; last_name?: string; full_name?: string; name?: string };
    };

    if (!supabaseUser?.email) {
      return c.json({ message: "No email returned from Supabase" }, 400);
    }

    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);
    const ip = getClientIp(c);

    let user = await storage.getUserByEmail(supabaseUser.email.toLowerCase());

    if (!user) {
      // First time sign-in — create app user record
      const meta = supabaseUser.user_metadata ?? {};
      const firstName = meta.first_name || meta.full_name?.split(" ")[0] || meta.name?.split(" ")[0] || supabaseUser.email.split("@")[0];
      const lastName = meta.last_name || meta.full_name?.split(" ").slice(1).join(" ") || meta.name?.split(" ").slice(1).join(" ") || "";

      const passwordHash = await hashPassword(crypto.randomUUID()); // placeholder — login is via Supabase
      user = await storage.createUser({
        email: supabaseUser.email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role: "DRIVER",
      });
      await storage.createDriverProfile({
        userId: user.id,
        ratePerMile: "0.5000",
        employmentType: "W2_COMPANY_DRIVER",
        status: "ACTIVE",
      });
    }

    if (user.isActive === false) {
      return c.json({ message: "Your account has been deactivated. Contact your administrator." }, 401);
    }

    const accessToken = await generateAccessToken(
      { userId: user.id, role: user.role, companyId: user.companyId },
      c.env.SESSION_SECRET
    );
    const rawRefresh = await createRefreshToken(
      db, user.id, true, ip, c.req.header("User-Agent") ?? undefined
    );

    setAccessTokenCookie(c, accessToken);
    setRefreshCookie(c, rawRefresh, 30);

    const profile = await storage.getDriverProfile(user.id);
    const company = user.companyId ? await storage.getCompany(user.companyId) : null;

    return c.json({
      user: { ...user, passwordHash: undefined, profile, companyName: company?.name },
    });
  } catch (err: any) {
    return c.json({ message: err.message ?? "Exchange failed" }, 400);
  }
});
