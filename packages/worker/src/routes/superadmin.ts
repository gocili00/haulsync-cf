/**
 * routes/superadmin.ts — Superadmin portal routes (T11 — fully implemented)
 * Replaces: server/routes.ts lines 2606–3170
 * Deferred to Phase 2: regenerate-statement (disk PDF), recalculate-miles (file dep), db-export
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";
import { generateAccessToken } from "../lib/auth";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

export const superadminRoutes = new Hono<{ Bindings: Env }>();

function st(c: Context<{ Bindings: Env }>) { return new DatabaseStorage(createDb(c.env)); }

// GET /api/users
superadminRoutes.get("/users", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  const storage = st(c);
  const allUsers = await storage.getAllUsers();
  const results = [];
  for (const u of allUsers) { const co = u.companyId ? await storage.getCompany(u.companyId) : null; results.push({ ...u, passwordHash: undefined, companyName: co?.name ?? null }); }
  return c.json(results);
});

// GET /api/superadmin/stats
superadminRoutes.get("/superadmin/stats", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  return c.json(await st(c).getSuperAdminStats());
});

// GET /api/superadmin/companies/:id
superadminRoutes.get("/superadmin/companies/:id", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const storage = st(c);
    const companyId = parseInt(c.req.param("id"));
    const company = await storage.getCompany(companyId);
    if (!company) return c.json({ message: "Company not found" }, 404);
    const stats = await storage.getCompanyDetailStats(companyId);
    const settings = await storage.getCompanySettings(companyId);
    return c.json({ ...company, stats, settings: settings ?? { allowAdminInvites: false, dispatcherCanSeeUnassigned: false } });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/superadmin/companies/:id
superadminRoutes.patch("/superadmin/companies/:id", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = parseInt(c.req.param("id"));
    const company = await storage.getCompany(companyId);
    if (!company) return c.json({ message: "Company not found" }, 404);
    const { name, address, phone, timezone } = await c.req.json();
    const upd: any = {};
    if (name !== undefined) upd.name = name;
    if (address !== undefined) upd.address = address;
    if (phone !== undefined) upd.phone = phone;
    if (timezone !== undefined) upd.timezone = timezone;
    const updated = await storage.updateCompany(companyId, upd);
    await storage.createAuditLog({ actorId: user.userId, companyId, action: "COMPANY_UPDATED", entity: "COMPANY", entityId: companyId, before: company, after: updated });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// POST activate/deactivate
superadminRoutes.post("/superadmin/companies/:id/activate", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = parseInt(c.req.param("id"));
    const company = await storage.getCompany(companyId);
    if (!company) return c.json({ message: "Company not found" }, 404);
    const updated = await storage.updateCompany(companyId, { isActive: true } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId, action: "COMPANY_ACTIVATED", entity: "COMPANY", entityId: companyId });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

superadminRoutes.post("/superadmin/companies/:id/deactivate", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = parseInt(c.req.param("id"));
    const company = await storage.getCompany(companyId);
    if (!company) return c.json({ message: "Company not found" }, 404);
    const updated = await storage.updateCompany(companyId, { isActive: false } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId, action: "COMPANY_DEACTIVATED", entity: "COMPANY", entityId: companyId });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// Company sub-resources
superadminRoutes.get("/superadmin/companies/:id/users", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  const storage = st(c);
  const companyId = parseInt(c.req.param("id"));
  const users = await storage.getAllUsers(companyId);
  const results = [];
  for (const u of users) { const profile = u.role === "DRIVER" ? await storage.getDriverProfile(u.id) : null; results.push({ ...u, passwordHash: undefined, profile }); }
  return c.json(results);
});

superadminRoutes.get("/superadmin/companies/:id/drivers", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  return c.json(await st(c).getDriversWithProfiles(parseInt(c.req.param("id"))));
});

superadminRoutes.get("/superadmin/companies/:id/dispatchers", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  const storage = st(c);
  const companyId = parseInt(c.req.param("id"));
  const dispatchers = await storage.getDispatchersByCompany(companyId);
  const results = [];
  for (const d of dispatchers) {
    const profiles = await storage.getDriversWithProfiles(companyId);
    const count = profiles.filter((p: any) => p.profile?.assignedDispatcherId === d.id).length;
    results.push({ ...d, assignedDriverCount: count });
  }
  return c.json(results);
});

superadminRoutes.get("/superadmin/companies/:id/loads", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const storage = st(c);
    const companyId = parseInt(c.req.param("id"));
    const includeDeletedVoided = c.req.query("includeDeletedVoided") === "true";
    const driverIdFilter = c.req.query("driverId") ? parseInt(c.req.query("driverId")!) : undefined;
    const dispatcherFilter = c.req.query("dispatcherId") ? parseInt(c.req.query("dispatcherId")!) : undefined;
    const statusFilter = c.req.query("status") ?? undefined;
    let loads = await storage.getLoads(undefined, companyId, includeDeletedVoided, { driverIdFilter, dispatcherId: dispatcherFilter });
    if (statusFilter) loads = loads.filter((l: any) => l.status === statusFilter);
    return c.json(loads);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

superadminRoutes.get("/superadmin/companies/:id/payroll", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  return c.json(await st(c).getPayrollWeeks(undefined, parseInt(c.req.param("id"))));
});

superadminRoutes.get("/superadmin/companies/:id/invites", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  const storage = st(c);
  const companyId = parseInt(c.req.param("id"));
  const all = await storage.getInvitesByCompany(companyId);
  const now = new Date();
  const enriched = await Promise.all(all.map(async (inv) => {
    const status = inv.acceptedAt ? "accepted" : inv.revokedAt ? "revoked" : new Date(inv.expiresAt) < now ? "expired" : "active";
    const createdBy = await storage.getUser(inv.createdByUserId);
    return { ...inv, tokenHash: undefined, status, createdByName: createdBy ? `${createdBy.firstName} ${createdBy.lastName}` : undefined };
  }));
  return c.json(enriched);
});

superadminRoutes.get("/superadmin/invites", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  const storage = st(c);
  const all = await storage.getAllInvites();
  const now = new Date();
  const enriched = await Promise.all(all.map(async (inv) => {
    const status = inv.acceptedAt ? "accepted" : inv.revokedAt ? "revoked" : new Date(inv.expiresAt) < now ? "expired" : "active";
    const createdBy = await storage.getUser(inv.createdByUserId);
    const co = await storage.getCompany(inv.companyId);
    return { ...inv, tokenHash: undefined, status, createdByName: createdBy ? `${createdBy.firstName} ${createdBy.lastName}` : undefined, companyName: co?.name };
  }));
  return c.json(enriched);
});

superadminRoutes.get("/superadmin/audit", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const storage = st(c);
    const companyId = c.req.query("companyId") ? parseInt(c.req.query("companyId")!) : undefined;
    const action = c.req.query("action") ?? undefined;
    const actorId = c.req.query("actorId") ? parseInt(c.req.query("actorId")!) : undefined;
    const entityId = c.req.query("entityId") ? parseInt(c.req.query("entityId")!) : undefined;
    const limit = parseInt(c.req.query("limit") ?? "200");
    const offset = parseInt(c.req.query("offset") ?? "0");
    return c.json(await storage.getAuditLogs(companyId, { action, actorId, entityId, limit, offset }));
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// User role/enable/disable
superadminRoutes.patch("/superadmin/users/:id/role", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const targetId = parseInt(c.req.param("id"));
    const { role } = await c.req.json();
    if (!["DRIVER", "DISPATCHER", "ADMIN"].includes(role)) return c.json({ message: "Invalid role" }, 400);
    const target = await storage.getUser(targetId);
    if (!target) return c.json({ message: "User not found" }, 404);
    if (target.role === "SUPERADMIN") return c.json({ message: "Cannot change superadmin role" }, 403);
    const before = { role: target.role };
    const updated = await storage.updateUser(targetId, { role } as any);
    if (role === "DRIVER" && !(await storage.getDriverProfile(targetId))) {
      await storage.createDriverProfile({ userId: targetId, ratePerMile: "0.5000", employmentType: "W2_COMPANY_DRIVER", status: "ACTIVE" });
    }
    await storage.createAuditLog({ actorId: user.userId, companyId: target.companyId ?? undefined, action: "USER_ROLE_CHANGED", entity: "USER", entityId: targetId, before, after: { role } });
    return c.json({ ...updated, passwordHash: undefined });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

superadminRoutes.patch("/superadmin/users/:id/disable", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const targetId = parseInt(c.req.param("id"));
    const target = await storage.getUser(targetId);
    if (!target) return c.json({ message: "User not found" }, 404);
    if (target.role === "SUPERADMIN") return c.json({ message: "Cannot disable a superadmin" }, 403);
    if (targetId === user.userId) return c.json({ message: "Cannot disable yourself" }, 400);
    const updated = await storage.updateUser(targetId, { isActive: false } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: target.companyId ?? undefined, action: "USER_DISABLED", entity: "USER", entityId: targetId });
    return c.json({ ...updated, passwordHash: undefined });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

superadminRoutes.patch("/superadmin/users/:id/enable", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const targetId = parseInt(c.req.param("id"));
    const target = await storage.getUser(targetId);
    if (!target) return c.json({ message: "User not found" }, 404);
    const updated = await storage.updateUser(targetId, { isActive: true } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: target.companyId ?? undefined, action: "USER_ENABLED", entity: "USER", entityId: targetId });
    return c.json({ ...updated, passwordHash: undefined });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// Impersonation
superadminRoutes.post("/superadmin/impersonate", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const { userId } = await c.req.json();
    if (!userId) return c.json({ message: "userId is required" }, 400);
    const target = await storage.getUser(userId);
    if (!target) return c.json({ message: "User not found" }, 404);
    if (target.role === "SUPERADMIN") return c.json({ message: "Cannot impersonate another superadmin" }, 400);
    if (!target.isActive) return c.json({ message: "Cannot impersonate a disabled user" }, 400);
    const token = await generateAccessToken({ userId: target.id, role: target.role, companyId: target.companyId, impersonatorId: user.userId, isImpersonating: true }, c.env.SESSION_SECRET);
    await storage.createAuditLog({ actorId: user.userId, companyId: target.companyId ?? undefined, action: "IMPERSONATION_STARTED", entity: "USER", entityId: userId, metadata: { targetEmail: target.email, targetRole: target.role } });
    const originalToken = getCookie(c, "accessToken") ?? "";
    setCookie(c, "originalAccessToken", originalToken, { httpOnly: true, sameSite: "Lax", secure: true, path: "/", maxAge: 86400 });
    setCookie(c, "accessToken", token, { httpOnly: true, sameSite: "Lax", secure: true, path: "/", maxAge: 7200 });
    const co = target.companyId ? await storage.getCompany(target.companyId) : null;
    const profile = target.role === "DRIVER" ? await storage.getDriverProfile(target.id) : null;
    return c.json({ user: { ...target, passwordHash: undefined, profile, companyName: co?.name, isImpersonating: true, impersonatorId: user.userId } });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

superadminRoutes.post("/superadmin/stop-impersonation", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    if (!user.isImpersonating || !user.impersonatorId) return c.json({ message: "Not currently impersonating" }, 400);
    await storage.createAuditLog({ actorId: user.impersonatorId, action: "IMPERSONATION_ENDED", entity: "USER", entityId: user.userId });
    const originalToken = getCookie(c, "originalAccessToken");
    if (originalToken) {
      setCookie(c, "accessToken", originalToken, { httpOnly: true, sameSite: "Lax", secure: true, path: "/", maxAge: 86400 });
      deleteCookie(c, "originalAccessToken", { path: "/" });
    } else {
      const superadmin = await storage.getUser(user.impersonatorId);
      if (superadmin) {
        const newToken = await generateAccessToken({ userId: superadmin.id, role: superadmin.role, companyId: superadmin.companyId }, c.env.SESSION_SECRET);
        setCookie(c, "accessToken", newToken, { httpOnly: true, sameSite: "Lax", secure: true, path: "/", maxAge: 900 });
      }
    }
    const superadmin = await storage.getUser(user.impersonatorId);
    if (!superadmin) return c.json({ message: "Original user not found" }, 500);
    const co = superadmin.companyId ? await storage.getCompany(superadmin.companyId) : null;
    return c.json({ user: { ...superadmin, passwordHash: undefined, companyName: co?.name } });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// Superadmin override actions
superadminRoutes.post("/superadmin/companies/:companyId/loads/:loadId/void", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const loadId = parseInt(c.req.param("loadId"));
    const { reason } = await c.req.json();
    if (!reason) return c.json({ message: "Reason is required for voiding a load" }, 400);
    const load = await storage.getLoad(loadId);
    if (!load) return c.json({ message: "Load not found" }, 404);
    if (load.isVoided) return c.json({ message: "Load is already voided" }, 400);
    const updated = await storage.updateLoad(loadId, { isVoided: true, voidedAt: new Date(), voidedByUserId: user.userId, voidReason: reason } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: load.companyId ?? undefined, action: "LOAD_VOIDED", entity: "LOAD", entityId: loadId, metadata: { reason } });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

superadminRoutes.post("/superadmin/companies/:companyId/loads/:loadId/restore", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const loadId = parseInt(c.req.param("loadId"));
    const load = await storage.getLoad(loadId);
    if (!load) return c.json({ message: "Load not found" }, 404);
    if (!load.isDeleted && !load.isVoided) return c.json({ message: "Load is not deleted or voided" }, 400);
    const updated = await storage.updateLoad(loadId, { isDeleted: false, deletedAt: null, deletedByUserId: null, isVoided: false, voidedAt: null, voidedByUserId: null, voidReason: null } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: load.companyId ?? undefined, action: "LOAD_RESTORED", entity: "LOAD", entityId: loadId });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

superadminRoutes.post("/superadmin/companies/:companyId/payroll/:weekId/unlock", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const weekId = parseInt(c.req.param("weekId"));
    const { reason } = await c.req.json();
    if (!reason) return c.json({ message: "Reason is required for unlocking payroll" }, 400);
    const week = await storage.getPayrollWeek(weekId);
    if (!week) return c.json({ message: "Payroll week not found" }, 404);
    const before = { status: week.status };
    const updated = await storage.updatePayrollWeek(weekId, { status: "OPEN" } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: week.companyId ?? undefined, action: "PAYROLL_UNLOCKED", entity: "PAYROLL_WEEK", entityId: weekId, before, after: { status: "OPEN" }, metadata: { reason } });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// Phase 2 stubs
superadminRoutes.post("/superadmin/companies/:companyId/payroll/:weekId/regenerate-statement", authMiddleware, requireRole("SUPERADMIN"), (c) =>
  c.json({ message: "PDF regeneration available after Phase 2 deployment (requires R2)" }, 501)
);
superadminRoutes.post("/superadmin/companies/:companyId/loads/:loadId/recalculate-miles", authMiddleware, requireRole("SUPERADMIN"), (c) =>
  c.json({ message: "Miles recalculation available after Phase 2 deployment" }, 501)
);
superadminRoutes.post("/superadmin/db-export", authMiddleware, requireRole("SUPERADMIN"), (c) =>
  c.json({ message: "DB export available after Phase 2 deployment. Use Supabase dashboard for exports." }, 501)
);
