/**
 * routes/drivers.ts — Driver, dispatcher & truck routes (T6 — fully implemented)
 *
 * Replaces: server/routes.ts lines 404–786
 * Changes:  Express req/res → Hono Context. req.user → c.get("user").
 *           req.query.x → c.req.query("x"). req.params.x → c.req.param("x").
 *           req.body → await c.req.json(). req.user!.id → c.get("user").userId
 * Unchanged: all business logic, all storage method calls, all role checks,
 *            audit log writes, response shapes.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";
import { hashPassword } from "../lib/auth";

export const driverRoutes = new Hono<{ Bindings: Env }>();

function st(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env);
  return new DatabaseStorage(db);
}

// GET /api/dispatchers
driverRoutes.get("/dispatchers", authMiddleware, async (c) => {
  const user = c.get("user");
  const storage = st(c);
  const companyId = user.companyId;
  if (!companyId && user.role !== "SUPERADMIN") return c.json([]);
  if (user.role === "SUPERADMIN") {
    const qCompanyId = c.req.query("companyId") ? parseInt(c.req.query("companyId")!) : null;
    if (!qCompanyId) return c.json([]);
    return c.json(await storage.getDispatchersByCompany(qCompanyId));
  }
  return c.json(await storage.getDispatchersByCompany(companyId!));
});

// GET /api/drivers
driverRoutes.get("/drivers", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    if (user.role === "DRIVER") {
      const dbUser = await storage.getUser(user.userId);
      const profile = await storage.getDriverProfile(user.userId);
      return c.json({ items: [{ ...dbUser, passwordHash: undefined, profile }], total: 1, limit: 1, offset: 0, hasMore: false });
    }
    if (user.role !== "SUPERADMIN" && !user.companyId) return c.json({ message: "No company context" }, 403);
    const companyId = user.role === "SUPERADMIN" ? undefined : user.companyId!;
    const search = c.req.query("search")?.trim() || undefined;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20"), 1), 100);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);
    let driverUserIds: number[] | undefined;
    if (user.role === "DISPATCHER" && user.companyId) {
      const settings = await storage.getCompanySettings(user.companyId);
      const includeUnassigned = settings?.dispatcherCanSeeUnassigned ?? false;
      driverUserIds = await storage.getDriverUserIdsForDispatcher(user.userId, user.companyId, includeUnassigned);
      if (driverUserIds.length === 0) return c.json({ items: [], total: 0, limit, offset, hasMore: false });
    }
    const result = await storage.getDriversWithProfilesPaginated({ companyId, driverUserIds, search, limit, offset });
    return c.json({ items: result.items, total: result.total, limit, offset, hasMore: result.total > offset + limit });
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// POST /api/drivers
driverRoutes.post("/drivers", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const body = await c.req.json();
    const { firstName, lastName, email, password, phone, address, cdlNumber, cdlExpiration, medicalExpiration, ratePerMile, employmentType, status, notes, payModel, revenueSharePercent, flatFeeAmount, fuelPaidBy } = body;
    const existing = await storage.getUserByEmail(email);
    if (existing) return c.json({ message: "Email already in use" }, 400);
    const passwordHash = await hashPassword(password || "driver123");
    let companyId: number | null;
    if (user.role === "SUPERADMIN") {
      companyId = body.companyId ? parseInt(body.companyId) : null;
      if (!companyId) return c.json({ message: "SUPERADMIN must specify companyId when creating a driver" }, 400);
    } else {
      companyId = user.companyId ?? null;
      if (!companyId) return c.json({ message: "Cannot create driver without company context" }, 403);
    }
    const newUser = await storage.createUser({ email, passwordHash, firstName, lastName, role: "DRIVER", companyId });
    const autoAssign = user.role === "DISPATCHER";
    await storage.createDriverProfile({
      userId: newUser.id,
      phone: phone ?? null, address: address ?? null, cdlNumber: cdlNumber ?? null,
      cdlExpiration: cdlExpiration ?? null, medicalExpiration: medicalExpiration ?? null,
      ratePerMile: ratePerMile || "0.5000", employmentType: employmentType || "W2_COMPANY_DRIVER",
      status: status || "ACTIVE", notes: notes ?? null, payModel: payModel || "CPM",
      revenueSharePercent: revenueSharePercent ?? null, flatFeeAmount: flatFeeAmount ?? null,
      fuelPaidBy: fuelPaidBy || "COMPANY",
      ...(autoAssign ? { assignedDispatcherId: user.userId, assignedAt: new Date(), assignedByUserId: user.userId } : {}),
    });
    await storage.createAuditLog({ actorId: user.userId, companyId: companyId ?? undefined, action: "CREATE", entity: "DRIVER", entityId: newUser.id });
    const profile = await storage.getDriverProfile(newUser.id);
    let assignedDispatcherName: string | undefined;
    if (profile?.assignedDispatcherId) {
      const disp = await storage.getUser(profile.assignedDispatcherId);
      if (disp) assignedDispatcherName = `${disp.firstName} ${disp.lastName}`;
    }
    return c.json({ ...newUser, passwordHash: undefined, profile, assignedDispatcherName });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/drivers/:id
driverRoutes.patch("/drivers/:id", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const target = await storage.getUser(id);
    if (!target || target.role !== "DRIVER") return c.json({ message: "Driver not found" }, 404);
    if (user.role !== "SUPERADMIN" && (!user.companyId || target.companyId !== user.companyId)) return c.json({ message: "Driver not found" }, 404);
    const { firstName, lastName, email, phone, address, cdlNumber, cdlExpiration, medicalExpiration, ratePerMile, employmentType, status, notes, payModel, revenueSharePercent, flatFeeAmount, fuelPaidBy } = body;
    await storage.updateUser(id, { firstName, lastName, email });
    await storage.updateDriverProfile(id, {
      phone, address, cdlNumber, cdlExpiration, medicalExpiration,
      ratePerMile: ratePerMile || undefined, employmentType: employmentType || undefined,
      status: status || undefined, notes, payModel: payModel || undefined,
      revenueSharePercent: revenueSharePercent ?? null, flatFeeAmount: flatFeeAmount ?? null,
      fuelPaidBy: fuelPaidBy || undefined,
    });
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "UPDATE", entity: "DRIVER", entityId: id });
    const updatedUser = await storage.getUser(id);
    const profile = await storage.getDriverProfile(id);
    return c.json({ ...updatedUser, passwordHash: undefined, profile });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/drivers/:id/assign-dispatcher
driverRoutes.patch("/drivers/:id/assign-dispatcher", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const driverUserId = parseInt(c.req.param("id"));
    const { dispatcherId } = await c.req.json();
    const driver = await storage.getUser(driverUserId);
    if (!driver) return c.json({ message: "Driver not found" }, 404);
    if (driver.role !== "DRIVER") return c.json({ message: "User is not a driver" }, 400);
    if (user.role !== "SUPERADMIN" && (!user.companyId || driver.companyId !== user.companyId)) return c.json({ message: "Access denied" }, 403);
    if (dispatcherId) {
      const dispatcher = await storage.getUser(dispatcherId);
      if (!dispatcher) return c.json({ message: "Dispatcher not found" }, 404);
      if (dispatcher.role !== "DISPATCHER") return c.json({ message: "User is not a dispatcher" }, 400);
      if (dispatcher.companyId !== driver.companyId) return c.json({ message: "Dispatcher must be in the same company" }, 400);
    }
    await storage.updateDriverProfile(driverUserId, {
      assignedDispatcherId: dispatcherId ?? null,
      assignedAt: dispatcherId ? new Date() : null,
      assignedByUserId: dispatcherId ? user.userId : null,
    } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: driver.companyId ?? undefined, action: "DRIVER_DISPATCHER_ASSIGNED", entity: "DRIVER", entityId: driverUserId, after: { dispatcherId: dispatcherId ?? null } });
    const profile = await storage.getDriverProfile(driverUserId);
    let assignedDispatcherName: string | undefined;
    if (profile?.assignedDispatcherId) {
      const disp = await storage.getUser(profile.assignedDispatcherId);
      if (disp) assignedDispatcherName = `${disp.firstName} ${disp.lastName}`;
    }
    return c.json({ ...driver, passwordHash: undefined, profile, assignedDispatcherName });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/trucks
driverRoutes.get("/trucks", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    const list = user.role === "DISPATCHER"
      ? await storage.getTrucksForDispatcher(companyId, user.userId)
      : await storage.getTrucks(companyId);
    return c.json(list.map((t) => ({
      ...t,
      monthlyCost: (parseFloat(t.monthlyPayment || "0") + parseFloat(t.insuranceMonthly || "0") + parseFloat(t.maintenanceReserve || "0") + parseFloat(t.eldCost || "0")).toFixed(2) || null,
    })));
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// POST /api/trucks
driverRoutes.post("/trucks", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    const { truckNumber, vin, make, model, year, ownershipType, purchasePrice, monthlyCost, monthlyPayment, insuranceMonthly, maintenanceReserve, eldCost, status, notes } = await c.req.json();
    if (!truckNumber) return c.json({ message: "Truck number is required" }, 400);
    const resolvedMonthlyPayment = monthlyPayment ?? monthlyCost ?? null;
    const truck = await storage.createTruck({ companyId, truckNumber, vin: vin ?? null, make: make ?? null, model: model ?? null, year: year ? parseInt(year) : null, ownershipType: ownershipType || "COMPANY_OWNED", purchasePrice: purchasePrice ?? null, monthlyPayment: resolvedMonthlyPayment, insuranceMonthly: insuranceMonthly ?? null, maintenanceReserve: maintenanceReserve ?? null, eldCost: eldCost ?? null, status: status || "ACTIVE", notes: notes ?? null });
    await storage.createAuditLog({ actorId: user.userId, companyId, action: "CREATE", entity: "TRUCK", entityId: truck.id });
    return c.json(truck);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/trucks/:id
driverRoutes.patch("/trucks/:id", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    const existing = await storage.getTruck(id, companyId);
    if (!existing) return c.json({ message: "Truck not found" }, 404);
    const { truckNumber, vin, make, model, year, ownershipType, purchasePrice, monthlyCost, monthlyPayment, insuranceMonthly, maintenanceReserve, eldCost, status, notes } = await c.req.json();
    const resolvedMonthlyPayment = monthlyPayment !== undefined ? monthlyPayment : monthlyCost !== undefined ? monthlyCost : existing.monthlyPayment;
    const updated = await storage.updateTruck(id, companyId, {
      truckNumber: truckNumber || undefined, vin: vin ?? existing.vin, make: make ?? existing.make,
      model: model ?? existing.model, year: year !== undefined ? (year ? parseInt(year) : null) : existing.year,
      ownershipType: ownershipType || undefined, purchasePrice: purchasePrice ?? existing.purchasePrice,
      monthlyPayment: resolvedMonthlyPayment ?? existing.monthlyPayment,
      insuranceMonthly: insuranceMonthly ?? existing.insuranceMonthly,
      maintenanceReserve: maintenanceReserve ?? existing.maintenanceReserve,
      eldCost: eldCost ?? existing.eldCost, status: status || undefined, notes: notes ?? existing.notes,
    });
    await storage.createAuditLog({ actorId: user.userId, companyId, action: "UPDATE", entity: "TRUCK", entityId: id });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// DELETE /api/trucks/:id
driverRoutes.delete("/trucks/:id", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    const deleted = await storage.deleteTruck(id, companyId);
    if (!deleted) return c.json({ message: "Truck not found" }, 404);
    await storage.createAuditLog({ actorId: user.userId, companyId, action: "DELETE", entity: "TRUCK", entityId: id });
    return c.json({ success: true });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/dispatcher-trucks
driverRoutes.get("/dispatcher-trucks", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    const dispatcherUserId = c.req.query("dispatcherUserId") ? parseInt(c.req.query("dispatcherUserId")!) : undefined;
    return c.json(await storage.getDispatcherTrucks(companyId, dispatcherUserId));
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// POST /api/dispatcher-trucks
driverRoutes.post("/dispatcher-trucks", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    const { dispatcherUserId, truckId } = await c.req.json();
    if (!dispatcherUserId || !truckId) return c.json({ message: "dispatcherUserId and truckId required" }, 400);
    return c.json(await storage.addDispatcherTruck({ companyId, dispatcherUserId: parseInt(dispatcherUserId), truckId: parseInt(truckId) }));
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// DELETE /api/dispatcher-trucks/:id
driverRoutes.delete("/dispatcher-trucks/:id", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    const ok = await storage.removeDispatcherTruck(parseInt(c.req.param("id")), companyId);
    if (!ok) return c.json({ message: "Assignment not found" }, 404);
    return c.json({ success: true });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/dispatcher-performance
driverRoutes.get("/dispatcher-performance", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    let dispatcherId = user.userId;
    if ((user.role === "ADMIN" || user.role === "SUPERADMIN") && c.req.query("dispatcherId")) {
      dispatcherId = parseInt(c.req.query("dispatcherId")!);
    } else if (user.role !== "DISPATCHER") {
      return c.json({ message: "Access denied" }, 403);
    }
    const result = await storage.getDispatcherPerformance(dispatcherId, companyId, c.req.query("startDate") ?? undefined, c.req.query("endDate") ?? undefined);
    if (!result) return c.json({ message: "Dispatcher not found" }, 404);
    return c.json(result);
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// PATCH /api/dispatchers/:id/pay
driverRoutes.patch("/dispatchers/:id/pay", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);
    const { payModel, payRate } = await c.req.json();
    if (!payModel || !["PER_TRUCK", "PERCENT_REVENUE", "PER_LOAD"].includes(payModel)) return c.json({ message: "Invalid pay model" }, 400);
    const updated = await storage.updateDispatcherPay(parseInt(c.req.param("id")), companyId, payModel, parseFloat(payRate) || 0);
    if (!updated) return c.json({ message: "Dispatcher not found" }, 404);
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});
