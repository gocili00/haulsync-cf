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
import { z } from "zod";

const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024; // 5MB

const expenseSchema = z.object({
  category: z.enum(["LUMPER", "TOLL", "SCALE_TICKET", "PARKING", "FUEL", "OTHER"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount").refine((v) => parseFloat(v) > 0, "Amount must be greater than $0.00"),
  description: z.string().max(500).optional().nullable(),
  loadId: z.number().int().positive().optional().nullable(),
  receiptUrl: z.string().url().optional().nullable(),
});

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

// POST /api/pay-items/receipt-upload
payItemRoutes.post("/pay-items/receipt-upload", authMiddleware, requireRole("DRIVER"), async (c) => {
  try {
    const user = c.get("user");
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return c.json({ message: "No file provided" }, 400);
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
      return c.json({ message: "Invalid file type. Allowed: JPEG, PNG, WEBP, HEIC" }, 400);
    }
    if (file.size > MAX_RECEIPT_SIZE) {
      return c.json({ message: "File too large. Maximum size is 5MB" }, 400);
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const key = `receipts/${user.companyId}/${user.userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = await file.arrayBuffer();
    await c.env.DOCUMENTS_BUCKET.put(key, buffer, { httpMetadata: { contentType: file.type } });
    const receiptUrl = `/api/documents/${key}`;
    return c.json({ receiptUrl });
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// GET /api/documents/* — serve receipt files from DOCUMENTS_BUCKET
payItemRoutes.get("/documents/*", authMiddleware, async (c) => {
  const key = c.req.path.replace("/api/documents/", "");
  const user = c.get("user");
  const companySegment = key.split("/")[1];
  if (user.role !== "SUPERADMIN" && String(user.companyId) !== companySegment) {
    return c.json({ message: "Forbidden" }, 403);
  }
  const obj = await c.env.DOCUMENTS_BUCKET.get(key);
  if (!obj) return c.json({ message: "Not found" }, 404);
  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(obj.body, { headers });
});

// POST /api/pay-items/expense — driver submits a reimbursement expense
payItemRoutes.post("/pay-items/expense", authMiddleware, requireRole("DRIVER"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const raw = await c.req.json();
    const parse = expenseSchema.safeParse(raw);
    if (!parse.success) return c.json({ message: "Invalid input", errors: parse.error.flatten() }, 400);
    const { category, amount, description, loadId, receiptUrl } = parse.data;
    const item = await storage.createPayItem({
      driverUserId: user.userId,
      companyId: user.companyId ?? null,
      loadId: loadId ?? null,
      type: "REIMBURSEMENT",
      category,
      amount,
      description: description ?? null,
      status: "SUBMITTED",
      createdBy: user.userId,
      receiptUrl: receiptUrl ?? null,
    });
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
