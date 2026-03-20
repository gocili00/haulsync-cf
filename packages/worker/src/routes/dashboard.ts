/**
 * routes/dashboard.ts — Dashboard stats, audit logs, env-info (T12 — fully implemented)
 * Replaces: server/routes.ts lines 395–403, 2295–2330
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";

export const dashboardRoutes = new Hono<{ Bindings: Env }>();

function st(c: Context<{ Bindings: Env }>) { return new DatabaseStorage(createDb(c.env)); }

// GET /api/dashboard/stats
dashboardRoutes.get("/dashboard/stats", authMiddleware, async (c) => {
  const user = c.get("user");
  const storage = st(c);
  const stats = await storage.getDashboardStats(user.userId, user.role, user.companyId ?? undefined);
  return c.json(stats);
});

// GET /api/admin/stats
dashboardRoutes.get("/admin/stats", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  const user = c.get("user");
  const storage = st(c);
  const companyId = user.role === "SUPERADMIN" ? undefined : (user.companyId ?? undefined);
  return c.json(await storage.getAdminStats(companyId));
});

// GET /api/superadmin/stats (also mounted here for convenience)
dashboardRoutes.get("/superadmin/stats-summary", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  const storage = st(c);
  return c.json(await storage.getSuperAdminStats());
});

// GET /api/audit-logs
dashboardRoutes.get("/audit-logs", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  const user = c.get("user");
  const storage = st(c);
  const isSuperadmin = user.role === "SUPERADMIN";
  const companyId = isSuperadmin ? undefined : (user.companyId ?? undefined);
  const filters: any = isSuperadmin ? {} : { excludeSuperadmin: true };
  const logs = await storage.getAuditLogs(companyId, Object.keys(filters).length > 0 ? filters : undefined);
  return c.json(logs);
});

// GET /api/env-info
dashboardRoutes.get("/env-info", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), (c) => {
  return c.json({ environment: "cloudflare-worker", worker: "haulsync-worker" });
});
