/**
 * lib/helpers.ts — Shared utilities used across route handlers
 *
 * Replaces: inline helpers scattered throughout server/routes.ts
 */

import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";

/** Create a db + storage pair from the request context. Call at top of every handler. */
export function getStorage(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env);
  return { db, storage: new DatabaseStorage(db) };
}

/** Get the real client IP — prefers CF header, falls back to X-Forwarded-For. */
export function getClientIp(c: Context): string {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0].trim() ??
    "unknown"
  );
}

/** Parse and clamp pagination query params. */
export function getPagination(c: Context): { limit: number; offset: number; page: number } {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20")));
  return { limit, offset: (page - 1) * limit, page };
}
