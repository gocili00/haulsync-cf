/**
 * routes/pay-items.ts — Pay item routes (T8 — fully implemented)
 * Replaces: server/routes.ts lines 1567–1678
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";

export const payItemRoutes = new Hono<{ Bindings: Env }>();

function st(c: Context<{ Bindings: Env }>) { return new DatabaseStorage(createDb(c.env)); }

async function validateDriver(storage: DatabaseStorage, driverId: number, companyId: number | null | undefined, role: string) {
  if (role === "SUPERADMIN") return true;
  if (!companyId) return false;
  const d = await storage.getUser(driverId);
  return !!d && d.companyId === companyId;
}

// GET /api/pay-items
payItemRoutes.get("/pay-items", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const role = user.role;
    const companyId = role === "SUPERADMIN" ? undefined : (user.companyId || undefined);
    if (role !== "SUPERADMIN" && role !== "DRIVER" && !companyId) return c.json({ message: "No company context" }, 403);
    const search = c.req.query("search")?.trim() || undefined;
    const typeQ = c.req.query("type");
    const type = typeQ && typeQ !== "ALL" ? typeQ : undefined;
    const statusQ = c.req.query("status");
    const status = statusQ && statusQ !== "ALL" ? statusQ : undefined;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20"), 1), 100);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);
    const groupByDriver = c.req.query("groupByDriver") === "true";

    if (role === "DRIVER") {
      const result = await storage.getPayItemsPaginated({ companyId, driverUserId: user.userId, search, type, status, limit, offset });
      return c.json({ items: result.items, total: result.total, limit, offset, hasMore: result.total > offset + limit });
    }

    let driverUserIds: number[] | undefined;
    if (role === "DISPATCHER" && user.companyId) {
      const settings = await storage.getCompanySettings(user.companyId);
      const includeUnassigned = settings?.dispatcherCanSeeUnassigned ?? false;
      driverUserIds = await storage.getDriverUserIdsForDispatcher(user.userId, user.companyId, includeUnassigned);
      if (driverUserIds.length === 0) return c.json({ items: [], total: 0, limit, offset, hasMore: false });
    }

    if (groupByDriver) {
      const result = await storage.getPayItemsGroupedByDriver({ companyId, driverUserIds, search, type, status, limit, offset });
      return c.json({ items: result.items, total: result.total, limit, offset, hasMore: result.total > offset + limit });
    }

    const result = await storage.getPayItemsPaginated({ companyId, driverUserIds, search, type, status, limit, offset });
    return c.json({ items: result.items, total: result.total, limit, offset, hasMore: result.total > offset + limit });
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// POST /api/pay-items
payItemRoutes.post("/pay-items", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const { driverUserId, loadId, type, category, amount, description, status: itemStatus } = await c.req.json();
    const actualDriverId = user.role === "DRIVER" ? user.userId : driverUserId;
    const actualStatus = user.role === "DRIVER" ? "SUBMITTED" : (itemStatus || "DRAFT");
    if (user.role !== "DRIVER" && user.role !== "SUPERADMIN") {
      const valid = await validateDriver(storage, actualDriverId, user.companyId, user.role);
      if (!valid) return c.json({ message: "Driver not found" }, 404);
    }
    const item = await storage.createPayItem({ driverUserId: actualDriverId, companyId: user.companyId ?? null, loadId: loadId ?? null, type, category, amount, description: description ?? null, status: actualStatus, createdBy: user.userId });
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "CREATE", entity: "PAY_ITEM", entityId: item.id });
    return c.json(item);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/pay-items/:id/status
payItemRoutes.patch("/pay-items/:id/status", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getPayItem(id);
    if (!existing) return c.json({ message: "Pay item not found" }, 404);
    if (user.role !== "SUPERADMIN") {
      const valid = await validateDriver(storage, existing.driverUserId, user.companyId, user.role);
      if (!valid) return c.json({ message: "Pay item not found" }, 404);
    }
    const { status } = await c.req.json();
    const updated = await storage.updatePayItem(id, { status, approvedBy: user.userId });
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: `PAY_ITEM_${status}`, entity: "PAY_ITEM", entityId: id });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});
