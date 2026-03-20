/**
 * routes/company.ts — Companies, settings, cost items (T10 — fully implemented)
 * Replaces: server/routes.ts lines 1926–2152
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";

export const companyRoutes = new Hono<{ Bindings: Env }>();

function st(c: Context<{ Bindings: Env }>) { return new DatabaseStorage(createDb(c.env)); }

// GET /api/companies (SUPERADMIN)
companyRoutes.get("/companies", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  const storage = st(c);
  const all = await storage.getAllCompanies();
  const results = [];
  for (const co of all) { const users = await storage.getCompanyUsers(co.id); results.push({ ...co, userCount: users.length }); }
  return c.json(results);
});

// POST /api/companies (SUPERADMIN)
companyRoutes.post("/companies", authMiddleware, requireRole("SUPERADMIN"), async (c) => {
  try {
    const storage = st(c);
    const { name, address, phone } = await c.req.json();
    if (!name) return c.json({ message: "Company name is required" }, 400);
    const company = await storage.createCompany({ name, address: address ?? null, phone: phone ?? null });
    await storage.upsertCompanySettings(company.id, { allowAdminInvites: false });
    return c.json(company);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/companies/:id/users
companyRoutes.get("/companies/:id/users", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = parseInt(c.req.param("id"));
    if (user.role === "ADMIN" && user.companyId !== companyId) return c.json({ message: "Access denied" }, 403);
    const users = await storage.getCompanyUsers(companyId);
    return c.json(users.map(u => ({ ...u, passwordHash: undefined })));
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/company-settings
companyRoutes.get("/company-settings", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    let companyId: number | undefined;
    if (user.role === "SUPERADMIN" && c.req.query("companyId")) { companyId = parseInt(c.req.query("companyId")!); }
    else { companyId = user.companyId ?? undefined; }
    if (!companyId) return c.json({ message: "No company context" }, 400);
    const settings = await storage.getCompanySettings(companyId);
    return c.json(settings ?? { companyId, allowAdminInvites: false, dispatcherCanSeeUnassigned: false, defaultRevenueMode: "MANUAL", defaultRevenueRpm: null, defaultRevenueFlat: null });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PUT /api/company-settings
companyRoutes.put("/company-settings", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const body = await c.req.json();
    let companyId: number | undefined;
    if (user.role === "SUPERADMIN" && body.companyId) { companyId = body.companyId; }
    else { companyId = user.companyId ?? undefined; }
    if (!companyId) return c.json({ message: "No company context" }, 400);
    if (user.role === "ADMIN" && user.companyId !== companyId) return c.json({ message: "Access denied" }, 403);
    const { allowAdminInvites, dispatcherCanSeeUnassigned, defaultRevenueMode, defaultRevenueRpm, defaultRevenueFlat } = body;
    const upd: any = {};
    if (allowAdminInvites !== undefined) upd.allowAdminInvites = allowAdminInvites === true;
    if (dispatcherCanSeeUnassigned !== undefined) upd.dispatcherCanSeeUnassigned = dispatcherCanSeeUnassigned === true;
    if (defaultRevenueMode !== undefined) upd.defaultRevenueMode = defaultRevenueMode;
    if (defaultRevenueRpm !== undefined) upd.defaultRevenueRpm = defaultRevenueRpm;
    if (defaultRevenueFlat !== undefined) upd.defaultRevenueFlat = defaultRevenueFlat;
    const settings = await storage.upsertCompanySettings(companyId, upd);
    if (defaultRevenueMode !== undefined || defaultRevenueRpm !== undefined || defaultRevenueFlat !== undefined) {
      await storage.createAuditLog({ actorId: user.userId, companyId, action: "COMPANY_REVENUE_SETTINGS_UPDATED", entity: "COMPANY_SETTINGS", entityId: companyId, after: { defaultRevenueMode: settings.defaultRevenueMode, defaultRevenueRpm: settings.defaultRevenueRpm, defaultRevenueFlat: settings.defaultRevenueFlat } });
    }
    return c.json(settings);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/company-costs/items
companyRoutes.get("/company-costs/items", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 400);
    const search = c.req.query("search") ?? "";
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 100);
    const offset = parseInt(c.req.query("offset") ?? "0");
    const { items, total } = await storage.getCompanyCostItemsPaginated(companyId, search, limit, offset);
    return c.json({ items, total, limit, offset, page: Math.floor(offset / limit) + 1, pageCount: Math.ceil(total / limit) || 1 });
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// POST /api/company-costs/items
companyRoutes.post("/company-costs/items", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 400);
    const { name, frequency, amount, enabled, employmentType, costScope, truckId } = await c.req.json();
    if (!name || amount === undefined || amount === null || amount === "") return c.json({ message: "Name and amount required" }, 400);
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) return c.json({ message: "Amount must be a valid non-negative number" }, 400);
    const validEmpTypes = ["W2_COMPANY_DRIVER", "N1099_COMPANY_DRIVER", "OWNER_OPERATOR", "LEASE_TO_PURCHASE"];
    const validEmpType = employmentType && validEmpTypes.includes(employmentType) ? employmentType : null;
    const validScopes = ["GLOBAL", "DRIVER_TYPE", "TRUCK"];
    const validScope = costScope && validScopes.includes(costScope) ? costScope : (validEmpType ? "DRIVER_TYPE" : "GLOBAL");
    const item = await storage.createCompanyCostItem({ companyId, name, frequency: frequency === "WEEKLY" ? "WEEKLY" : "MONTHLY", amount: parsedAmount.toFixed(2), enabled: enabled !== false, employmentType: validEmpType, costScope: validScope, truckId: truckId ? parseInt(truckId) : null });
    return c.json(item);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/company-costs/items/:id
companyRoutes.patch("/company-costs/items/:id", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 400);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getCompanyCostItem(id, companyId);
    if (!existing) return c.json({ message: "Cost item not found" }, 404);
    const body = await c.req.json();
    const upd: any = {};
    if (body.name !== undefined) upd.name = body.name;
    if (body.frequency !== undefined) upd.frequency = body.frequency === "WEEKLY" ? "WEEKLY" : "MONTHLY";
    if (body.amount !== undefined) { const p = parseFloat(body.amount); if (isNaN(p) || p < 0) return c.json({ message: "Amount must be a valid non-negative number" }, 400); upd.amount = p.toFixed(2); }
    if (body.enabled !== undefined) upd.enabled = body.enabled;
    if (body.employmentType !== undefined) { const vt = ["W2_COMPANY_DRIVER", "N1099_COMPANY_DRIVER", "OWNER_OPERATOR", "LEASE_TO_PURCHASE"]; upd.employmentType = body.employmentType && vt.includes(body.employmentType) ? body.employmentType : null; }
    if (body.costScope !== undefined) { const vs = ["GLOBAL", "DRIVER_TYPE", "TRUCK"]; upd.costScope = vs.includes(body.costScope) ? body.costScope : "GLOBAL"; }
    if (body.truckId !== undefined) upd.truckId = body.truckId ? parseInt(body.truckId) : null;
    return c.json(await storage.updateCompanyCostItem(id, companyId, upd));
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// POST /api/company-costs/items/bulk
companyRoutes.post("/company-costs/items/bulk", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 400);
    const { items } = await c.req.json();
    if (!Array.isArray(items) || items.length === 0) return c.json({ message: "Items array required" }, 400);
    const validEmpTypes = ["W2_COMPANY_DRIVER", "N1099_COMPANY_DRIVER", "OWNER_OPERATOR", "LEASE_TO_PURCHASE"];
    let insertedCount = 0;
    for (const item of items) {
      if (!item.name || item.amount === undefined || item.amount === null) return c.json({ message: `Invalid item: name and amount required` }, 400);
      const p = parseFloat(item.amount);
      if (isNaN(p) || p < 0) return c.json({ message: `Invalid amount for "${item.name}"` }, 400);
      const validEmpType = item.employmentType && validEmpTypes.includes(item.employmentType) ? item.employmentType : null;
      const validScopes = ["GLOBAL", "DRIVER_TYPE", "TRUCK"];
      const validScope = item.costScope && validScopes.includes(item.costScope) ? item.costScope : (validEmpType ? "DRIVER_TYPE" : "GLOBAL");
      await storage.createCompanyCostItem({ companyId, name: item.name, frequency: item.frequency === "WEEKLY" ? "WEEKLY" : "MONTHLY", amount: p.toFixed(2), enabled: true, employmentType: validEmpType, costScope: validScope });
      insertedCount++;
    }
    return c.json({ insertedCount });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// DELETE /api/company-costs/items/:id
companyRoutes.delete("/company-costs/items/:id", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 400);
    const deleted = await storage.deleteCompanyCostItem(parseInt(c.req.param("id")), companyId);
    if (!deleted) return c.json({ message: "Cost item not found" }, 404);
    return c.json({ success: true });
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});
