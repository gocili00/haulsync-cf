/**
 * routes/team.ts — Team user management (T10 — fully implemented)
 * Replaces: server/routes.ts lines 2153–2294
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";

export const teamRoutes = new Hono<{ Bindings: Env }>();

function st(c: Context<{ Bindings: Env }>) { return new DatabaseStorage(createDb(c.env)); }

// GET /api/team/users
teamRoutes.get("/team/users", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    if (user.role === "DRIVER") return c.json({ message: "Access denied" }, 403);
    let companyId: number | undefined;
    if (user.role === "SUPERADMIN" && c.req.query("companyId")) {
      companyId = parseInt(c.req.query("companyId")!);
    } else {
      companyId = user.companyId ?? undefined;
    }
    if (!companyId && user.role !== "SUPERADMIN") return c.json({ message: "No company context" }, 400);
    const search = c.req.query("search")?.trim() || undefined;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20"), 1), 100);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);
    let visibleRoles: string[];
    if (user.role === "SUPERADMIN") visibleRoles = ["DRIVER", "DISPATCHER", "ADMIN", "SUPERADMIN"];
    else if (user.role === "ADMIN") visibleRoles = ["DRIVER", "DISPATCHER"];
    else visibleRoles = ["DRIVER"];
    const result = await storage.getTeamUsersPaginated({ companyId, visibleRoles, search, limit, offset });
    return c.json({ items: result.items, total: result.total, limit, offset, hasMore: result.total > offset + limit });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/team/users/:id/deactivate
teamRoutes.patch("/team/users/:id/deactivate", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const targetId = parseInt(c.req.param("id"));
    const target = await storage.getUser(targetId);
    if (!target) return c.json({ message: "User not found" }, 404);
    if (user.role === "ADMIN" && target.companyId !== user.companyId) return c.json({ message: "Access denied" }, 403);
    if (target.role === "SUPERADMIN") return c.json({ message: "Cannot deactivate a platform admin" }, 403);
    if (targetId === user.userId) return c.json({ message: "Cannot deactivate yourself" }, 400);
    const updated = await storage.updateUser(targetId, { isActive: false } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: target.companyId ?? undefined, action: "USER_DEACTIVATED", entity: "USER", entityId: targetId });
    return c.json({ ...updated, passwordHash: undefined });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/team/users/:id/activate
teamRoutes.patch("/team/users/:id/activate", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const targetId = parseInt(c.req.param("id"));
    const target = await storage.getUser(targetId);
    if (!target) return c.json({ message: "User not found" }, 404);
    if (user.role === "ADMIN" && target.companyId !== user.companyId) return c.json({ message: "Access denied" }, 403);
    const updated = await storage.updateUser(targetId, { isActive: true } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: target.companyId ?? undefined, action: "USER_ACTIVATED", entity: "USER", entityId: targetId });
    return c.json({ ...updated, passwordHash: undefined });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// DELETE /api/users/:id
teamRoutes.delete("/users/:id", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    if (user.role === "DRIVER") return c.json({ message: "Access denied" }, 403);
    const targetId = parseInt(c.req.param("id"));
    const target = await storage.getUser(targetId);
    if (!target || target.deletedAt) return c.json({ message: "User not found" }, 404);
    if (user.role !== "SUPERADMIN" && target.companyId !== user.companyId) return c.json({ message: "User not found" }, 404);
    if (targetId === user.userId) return c.json({ message: "Cannot delete yourself" }, 400);
    if (user.role === "SUPERADMIN" && target.role === "SUPERADMIN") {
      const all = await storage.getAllUsers();
      if (all.filter(u => u.role === "SUPERADMIN").length <= 1) return c.json({ message: "Cannot delete the last superadmin" }, 400);
    } else if (user.role === "ADMIN" && target.role !== "DISPATCHER" && target.role !== "DRIVER") {
      return c.json({ message: "Admins can only delete dispatchers and drivers" }, 403);
    } else if (user.role === "DISPATCHER" && target.role !== "DRIVER") {
      return c.json({ message: "Dispatchers can only delete drivers" }, 403);
    }
    await storage.softDeleteUser(targetId);
    await storage.createAuditLog({ actorId: user.userId, companyId: target.companyId ?? undefined, action: "USER_DELETED", entity: "USER", entityId: targetId });
    return c.json({ message: "User deleted successfully" });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});
