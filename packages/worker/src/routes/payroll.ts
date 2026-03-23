/**
 * routes/payroll.ts — Payroll routes
 * Replaces: server/routes.ts lines 1680–1832
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";
import { generateStatementPdf } from "../lib/pdf-statement";

export const payrollRoutes = new Hono<{ Bindings: Env }>();

function st(c: Context<{ Bindings: Env }>) { return new DatabaseStorage(createDb(c.env)); }

async function validateDriver(storage: DatabaseStorage, driverId: number, companyId: number | null | undefined, role: string) {
  if (role === "SUPERADMIN") return true;
  if (!companyId) return false;
  const d = await storage.getUser(driverId);
  return !!d && d.companyId === companyId;
}

// GET /api/payroll
payrollRoutes.get("/payroll", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const role = user.role;
    const companyId = role === "SUPERADMIN" ? undefined : (user.companyId || undefined);
    const search = c.req.query("search")?.trim() || undefined;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20"), 1), 100);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);
    let driverUserId: number | undefined;
    let driverUserIds: number[] | undefined;
    if (role === "DRIVER") {
      driverUserId = user.userId;
    } else if (role === "DISPATCHER" && companyId) {
      const settings = await storage.getCompanySettings(companyId);
      const includeUnassigned = settings?.dispatcherCanSeeUnassigned ?? false;
      driverUserIds = await storage.getDriverUserIdsForDispatcher(user.userId, companyId, includeUnassigned);
      if (driverUserIds.length === 0) return c.json({ items: [], total: 0, limit, offset, hasMore: false });
    }
    const result = await storage.getPayrollWeeksPaginated({ companyId, driverUserId, driverUserIds, search, limit, offset });
    return c.json({ items: result.items, total: result.total, driverCount: result.driverCount, limit, offset, hasMore: result.total > offset + limit });
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// POST /api/payroll/generate
payrollRoutes.post("/payroll/generate", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const { driverUserId, weekStart } = await c.req.json();

    if (user.role !== "SUPERADMIN") {
      const valid = await validateDriver(storage, driverUserId, user.companyId, user.role);
      if (!valid) return c.json({ message: "Driver not found" }, 404);
      if (user.role === "DISPATCHER" && user.companyId) {
        const settings = await storage.getCompanySettings(user.companyId);
        const includeUnassigned = settings?.dispatcherCanSeeUnassigned ?? false;
        const assignedIds = await storage.getDriverUserIdsForDispatcher(user.userId, user.companyId, includeUnassigned);
        if (!assignedIds.includes(driverUserId)) return c.json({ message: "Access denied" }, 403);
      }
    }

    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    const weekEnd = endDate.toISOString().split("T")[0];

    const profile = await storage.getDriverProfile(driverUserId);
    const ratePerMile = Number(profile?.ratePerMile || 0);

    const approvedLoads = await storage.getApprovedLoadsForWeek(driverUserId, weekStart, weekEnd);
    const milesTotal = approvedLoads.reduce((sum, l) => sum + Number(l.finalMilesSnapshot || l.finalMiles || 0), 0);
    const basePay = approvedLoads.reduce((sum, l) => {
      const miles = Number(l.finalMilesSnapshot || l.finalMiles || 0);
      const rate = Number(l.ratePerMileSnapshot || ratePerMile);
      return sum + miles * rate;
    }, 0);

    const allPayItems = await storage.getApprovedPayItemsForWeek(driverUserId, weekStart, weekEnd);
    const earnings = allPayItems.filter(pi => pi.type === "EARNING").reduce((s, pi) => s + Number(pi.amount), 0);
    const deductions = allPayItems.filter(pi => pi.type === "DEDUCTION").reduce((s, pi) => s + Number(pi.amount), 0);
    const reimbursements = allPayItems.filter(pi => pi.type === "REIMBURSEMENT").reduce((s, pi) => s + Number(pi.amount), 0);
    const netPay = basePay + earnings - deductions + reimbursements;

    const week = await storage.createPayrollWeek({ driverUserId, companyId: user.companyId ?? null, weekStart, weekEnd, status: "OPEN", milesTotalSnapshot: milesTotal.toFixed(2), basePayTotal: basePay.toFixed(2), earningsTotal: earnings.toFixed(2), deductionsTotal: deductions.toFixed(2), reimbursementsTotal: reimbursements.toFixed(2), netPayTotal: netPay.toFixed(2) });
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "GENERATE_PAYROLL", entity: "PAYROLL_WEEK", entityId: week.id });
    return c.json(week);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// PATCH /api/payroll/:id/status
payrollRoutes.patch("/payroll/:id/status", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getPayrollWeek(id);
    if (!existing) return c.json({ message: "Payroll week not found" }, 404);
    if (user.role !== "SUPERADMIN") {
      const valid = await validateDriver(storage, existing.driverUserId, user.companyId, user.role);
      if (!valid) return c.json({ message: "Payroll week not found" }, 404);
      if (user.role === "DISPATCHER" && user.companyId) {
        const settings = await storage.getCompanySettings(user.companyId);
        const includeUnassigned = settings?.dispatcherCanSeeUnassigned ?? false;
        const assignedIds = await storage.getDriverUserIdsForDispatcher(user.userId, user.companyId, includeUnassigned);
        if (!assignedIds.includes(existing.driverUserId)) return c.json({ message: "Access denied" }, 403);
      }
    }
    const { status } = await c.req.json();
    const updated = await storage.updatePayrollWeek(id, { status });
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: `PAYROLL_${status}`, entity: "PAYROLL_WEEK", entityId: id });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/payroll/weeks/:id/statement.pdf
payrollRoutes.get("/payroll/weeks/:id/statement.pdf", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));

    const week = await storage.getPayrollWeek(id);
    if (!week) return c.json({ message: "Payroll week not found" }, 404);

    if (user.role !== "SUPERADMIN") {
      const valid = await validateDriver(storage, week.driverUserId, user.companyId, user.role);
      if (!valid) return c.json({ message: "Payroll week not found" }, 404);
    }

    const [driver, profile, company] = await Promise.all([
      storage.getUser(week.driverUserId),
      storage.getDriverProfile(week.driverUserId),
      week.companyId ? storage.getCompany(week.companyId) : null,
    ]);

    const companyId = week.companyId ?? 0;
    const [loads, payItems] = await Promise.all([
      storage.getLoadsForDriverWeek(week.driverUserId, companyId, week.weekStart, week.weekEnd),
      storage.getPayItemsForDriverWeek(week.driverUserId, companyId, week.weekStart, week.weekEnd),
    ]);

    const driverName = driver
      ? [driver.firstName, driver.lastName].filter(Boolean).join(" ") || driver.email
      : "Unknown Driver";

    const pdfBytes = await generateStatementPdf({
      payrollWeek: week,
      companyName: company?.name ?? "HaulSync",
      driverName,
      employmentType: profile?.employmentType ?? "W2_COMPANY_DRIVER",
      loads,
      payItems,
    });

    return new Response(pdfBytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="statement-week-${week.weekStart}.pdf"`,
      },
    });
  } catch (err: any) {
    return c.json({ message: err.message }, 500);
  }
});
