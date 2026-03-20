/**
 * lib/auth.ts — Authentication helpers for Cloudflare Workers
 *
 * Replaces: server/auth.ts
 * Changes:
 *   - jsonwebtoken → jose (CF Workers compatible, uses Web Crypto API)
 *   - crypto.randomBytes → crypto.getRandomValues (Web Crypto, CF-native)
 *   - crypto.createHash → crypto.subtle.digest (Web Crypto, CF-native)
 *   - DB functions now accept `db` as a parameter (no module-level singleton)
 *
 * Unchanged: bcryptjs (pure JS, works in CF Workers), all token logic,
 *            refresh token DB schema, cookie names and settings.
 */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq, and, isNull, gt } from "drizzle-orm";
import { refreshTokens } from "@haulsync/shared";
import type { Db } from "../db";

// ── Token config (unchanged from original) ─────────────────────────────────
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_SHORT_EXPIRY_DAYS = 1;
const REFRESH_LONG_EXPIRY_DAYS = 30;

export interface UserPayload {
  userId: number;
  role: string;
  companyId?: number | null;
  impersonatorId?: number;
  isImpersonating?: boolean;
}

// ── Password hashing (unchanged — bcryptjs is pure JS) ─────────────────────
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── JWT (jose replaces jsonwebtoken) ───────────────────────────────────────
function getSecret(sessionSecret: string): Uint8Array {
  return new TextEncoder().encode(sessionSecret);
}

export async function generateAccessToken(
  payload: UserPayload,
  sessionSecret: string
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(getSecret(sessionSecret));
}

export async function verifyAccessToken(
  token: string,
  sessionSecret: string
): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(sessionSecret));
    return payload as unknown as UserPayload;
  } catch {
    return null;
  }
}

// ── Random token + hashing (Web Crypto replaces Node crypto) ───────────────
export function generateRandomToken(): string {
  // Replaces: crypto.randomBytes(32).toString("hex")
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashToken(token: string): Promise<string> {
  // Replaces: crypto.createHash("sha256").update(token).digest("hex")
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Refresh token DB operations (db param replaces module-level singleton) ──
export async function createRefreshToken(
  db: Db,
  userId: number,
  remember: boolean,
  ip?: string,
  userAgent?: string
): Promise<string> {
  const rawToken = generateRandomToken();
  const tokenHashed = await hashToken(rawToken);
  const days = remember ? REFRESH_LONG_EXPIRY_DAYS : REFRESH_SHORT_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: tokenHashed,
    expiresAt,
    remember,
    ip: ip ?? null,
    userAgent: userAgent ?? null,
  });

  return rawToken;
}

export async function validateRefreshToken(
  db: Db,
  rawToken: string
): Promise<{ userId: number; id: number; remember: boolean } | null> {
  const tokenHashed = await hashToken(rawToken);
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHashed),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (rows.length === 0) return null;
  return { userId: rows[0].userId, id: rows[0].id, remember: rows[0].remember };
}

export async function revokeRefreshToken(db: Db, id: number): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, id));
}

export async function revokeAllUserRefreshTokens(db: Db, userId: number): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

// ── Refresh token expiry helper ────────────────────────────────────────────
export function refreshTokenMaxAgeDays(remember: boolean): number {
  return remember ? REFRESH_LONG_EXPIRY_DAYS : REFRESH_SHORT_EXPIRY_DAYS;
}
