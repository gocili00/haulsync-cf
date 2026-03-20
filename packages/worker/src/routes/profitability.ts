/**
 * routes/profitability.ts — Driver & Truck profitability routes
 *
 * Migrated from: server/routes.ts lines 3143–3960
 * Changes: Express req/res → Hono Context, storage singleton → per-request
 * Unchanged: all business logic, scoring, cost allocation, helper functions
 */

import { Hono } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";
import { eq } from "drizzle-orm";
import { driverProfitabilityWeeks } from "@haulsync/shared";

export const profitabilityRoutes = new Hono<{ Bindings: Env }>();

// ── Helpers ────────────────────────────────────────────────────────────────

function getWeekBounds(dateStr?: string): { weekStart: string; weekEnd: string } {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    weekStart: monday.toISOString().split("T")[0],
    weekEnd: sunday.toISOString().split("T")[0],
  };
}

function computeAutoScore(miles: number, revenue: number, profit: number, profitPerMile: number): string {
  if (profit < 0) return "F";
  if (miles < 500 || revenue === 0) return "D";
  if (profitPerMile >= 0.50) return "A";
  if (profitPerMile >= 0.30) return "B";
  if (profitPerMile >= 0.10) return "C";
  if (profitPerMile >= 0.00) return "D";
  return "F";
}

function computeCompanyCostForRange(costItems: any[], startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rangeDays = Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1);
  let total = 0;
  for (const item of costItems) {
    const amount = parseFloat(item.amount || "0");
    if (item.frequency === "WEEKLY") {
      total += amount * (rangeDays / 7);
    } else if (item.frequency === "YEARLY") {
      total += amount * (rangeDays / 365.25);
    } else if (item.frequency === "PER_MILE") {
      total += item._miles ? amount * item._miles : 0;
    } else {
      total += amount * (rangeDays / 30.44);
    }
  }
  return total;
}

function computeDriverTotalCompanyCost(
  empType: string | null,
  driverMiles: number,
  allEnabledCostItems: any[],
  milesByType: Record<string, number>,
  totalMilesAll: number,
  startDate: string,
  endDate: string,
  driverLoadsByTruck: Map<number, number> = new Map(),
  truckMilesMap: Map<number, number> = new Map(),
): number {
  const effectiveScope = (ci: any): string => {
    if (ci.costScope === "TRUCK" || ci.costScope === "DRIVER_TYPE" || ci.costScope === "GLOBAL") return ci.costScope;
    return ci.employmentType === null ? "GLOBAL" : "DRIVER_TYPE";
  };
  const matchesType = (ci: any) => ci.employmentType === null || ci.employmentType === empType;

  let truckCost = 0;
  const truckItems = allEnabledCostItems.filter((ci) => effectiveScope(ci) === "TRUCK" && matchesType(ci));
  for (const ci of truckItems) {
    const itemCost = computeCompanyCostForRange([ci], startDate, endDate);
    if (ci.truckId != null) {
      const driverTruckMiles = driverLoadsByTruck.get(ci.truckId) || 0;
      const fleetTruckMiles = truckMilesMap.get(ci.truckId) || 0;
      truckCost += fleetTruckMiles > 0 ? (driverTruckMiles / fleetTruckMiles) * itemCost : 0;
    } else {
      const driverTruckMilesTotal = [...driverLoadsByTruck.values()].reduce((a, b) => a + b, 0);
      const fleetTruckMilesTotal = [...truckMilesMap.values()].reduce((a, b) => a + b, 0);
      truckCost += fleetTruckMilesTotal > 0 ? (driverTruckMilesTotal / fleetTruckMilesTotal) * itemCost : 0;
    }
  }

  const typeItems = allEnabledCostItems.filter((ci) => effectiveScope(ci) === "DRIVER_TYPE" && ci.employmentType === empType);
  const totalTypeCost = computeCompanyCostForRange(typeItems, startDate, endDate);
  const typeMiles = empType ? (milesByType[empType] || 0) : 0;
  const driverTypeCost = typeMiles > 0 ? (totalTypeCost / typeMiles) * driverMiles : 0;

  const globalItems = allEnabledCostItems.filter((ci) => effectiveScope(ci) === "GLOBAL");
  const totalGlobalCost = computeCompanyCostForRange(globalItems, startDate, endDate);
  const driverGlobalCost = totalMilesAll > 0 ? (totalGlobalCost / totalMilesAll) * driverMiles : 0;

  return truckCost + driverTypeCost + driverGlobalCost;
}

function computeDriverBaseMetrics(driverLoads: any[], driverPayItems: any[], driverProfile?: any) {
  let miles = 0, revenue = 0, missingRevenueCount = 0;
  for (const load of driverLoads) {
    miles += parseFloat(load.finalMiles || load.adjustedMiles || load.calculatedMiles || "0");
    if (load.revenueAmount) revenue += parseFloat(load.revenueAmount);
    else missingRevenueCount++;
  }

  // Owner operators and lease drivers use REVENUE_SHARE — pay = revenue × share%
  // CPM and flat drivers use pay items as before
  const payModel = driverProfile?.payModel || "CPM";
  const revenueSharePercent = parseFloat(driverProfile?.revenueSharePercent || "0");
  let driverPay = 0;

  if (payModel === "REVENUE_SHARE" && revenueSharePercent > 0) {
    driverPay = revenue * (revenueSharePercent / 100);
  } else {
    for (const pi of driverPayItems) {
      const amt = parseFloat(pi.amount || "0");
      if (pi.type === "EARNING" || pi.type === "REIMBURSEMENT") driverPay += amt;
      else if (pi.type === "DEDUCTION") driverPay -= amt;
    }
  }

  return { miles, revenue, driverPay, missingRevenueCount, loadsCount: driverLoads.length };
}

async function computeDriverProfitability(
  storage: InstanceType<typeof DatabaseStorage>,
  driverUserId: number,
  companyId: number,
  weekStart: string,
  weekEnd: string,
  actorUserId?: number,
  companyCostTotal?: number,
  preloadedLoads?: any[],
  preloadedPayItems?: any[],
) {
  const driverLoads = preloadedLoads ?? await storage.getLoadsForDriverWeek(driverUserId, companyId, weekStart, weekEnd);
  const driverPayItems = preloadedPayItems ?? await storage.getPayItemsForDriverWeek(driverUserId, companyId, weekStart, weekEnd);
  const base = computeDriverBaseMetrics(driverLoads, driverPayItems);
  const companyCost = companyCostTotal ?? 0;
  const profit = base.revenue - base.driverPay - companyCost;
  const profitPerMile = base.miles > 0 ? profit / base.miles : 0;
  const autoScore = computeAutoScore(base.miles, base.revenue, profit, profitPerMile);

  return await storage.upsertProfitabilityRow({
    companyId,
    weekStart,
    weekEnd,
    driverUserId,
    autoScore,
    revenueTotal: base.revenue.toFixed(2),
    driverPayTotal: base.driverPay.toFixed(2),
    companyCostTotal: companyCost.toFixed(2),
    profitTotal: profit.toFixed(2),
    profitPerMile: profitPerMile.toFixed(4),
    milesTotal: base.miles.toFixed(2),
    loadsCount: base.loadsCount,
    missingRevenueCount: base.missingRevenueCount,
    updatedByUserId: actorUserId ?? null,
  });
}

// ── GET /api/profitability ─────────────────────────────────────────────────
profitabilityRoutes.get("/profitability", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);

    const companyId = user.role === "SUPERADMIN"
      ? parseInt(c.req.query("companyId") ?? "0") || user.companyId
      : user.companyId;
    if (!companyId) return c.json({ message: "Company context required" }, 400);

    let startDate = c.req.query("startDate") ?? "";
    let endDate = c.req.query("endDate") ?? "";
    const rangeType = c.req.query("rangeType") ?? "week";
    if (!startDate || !endDate) {
      const bounds = getWeekBounds();
      startDate = bounds.weekStart;
      endDate = bounds.weekEnd;
    }

    const isWeeklyRange = rangeType === "this_week" || rangeType === "last_week" || rangeType === "week";
    const search = (c.req.query("search") ?? "").trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20"), 1), 100);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);
    const sortField = c.req.query("sortField") ?? "profit";
    const sortDir = c.req.query("sortDir") ?? "desc";

    const profScoreToNum = (s: string) => ({ A: 5, B: 4, C: 3, D: 2, F: 1 } as Record<string, number>)[s] || 0;

    const enabledCostItems = await storage.getEnabledCompanyCostItems(companyId);
    let allRows: any[] = [];
    let totalMissingRevenue = 0;
    let loadsWithoutTruckCount = 0;

    if (isWeeklyRange) {
      const drivers = await storage.getDriversWithProfiles(companyId);
      const activeDrivers = drivers.filter((d: any) => d.isActive && d.role === "DRIVER");

      const [allCompanyLoads, allCompanyPayItems] = await Promise.all([
        storage.getLoadsForCompanyDateRange(companyId, startDate, endDate),
        storage.getPayItemsForCompanyDateRange(companyId, startDate, endDate),
      ]);
      loadsWithoutTruckCount = allCompanyLoads.filter((l: any) => !l.truckId && !l.isDeleted && !l.isVoided).length;

      const loadsByDriver = new Map<number, any[]>();
      for (const load of allCompanyLoads) {
        const arr = loadsByDriver.get(load.driverUserId!) || [];
        arr.push(load);
        loadsByDriver.set(load.driverUserId!, arr);
      }
      const payItemsByDriver = new Map<number, any[]>();
      for (const pi of allCompanyPayItems) {
        const arr = payItemsByDriver.get(pi.driverUserId!) || [];
        arr.push(pi);
        payItemsByDriver.set(pi.driverUserId!, arr);
      }

      const dispatcherIds = [...new Set(
        activeDrivers.map((d: any) => d.profile?.assignedDispatcherId).filter(Boolean) as number[]
      )];
      const dispatcherMap = new Map<number, string>();
      await Promise.all(dispatcherIds.map(async (did) => {
        const u = await storage.getUser(did);
        if (u) dispatcherMap.set(did, `${u.firstName} ${u.lastName}`);
      }));

      const truckMilesMap = new Map<number, number>();
      for (const load of allCompanyLoads) {
        if (load.truckId != null) {
          const m = parseFloat(load.finalMiles || load.adjustedMiles || load.calculatedMiles || "0");
          truckMilesMap.set(load.truckId, (truckMilesMap.get(load.truckId) || 0) + m);
        }
      }

      let totalMilesAllDrivers = 0;
      const milesByType: Record<string, number> = {};
      const driverBaseData: any[] = [];

      for (const driver of activeDrivers) {
        const driverLoads = loadsByDriver.get(driver.id) || [];
        const driverPayItems = payItemsByDriver.get(driver.id) || [];
        const base = computeDriverBaseMetrics(driverLoads, driverPayItems, driver.profile);
        const empType = driver.profile?.employmentType || null;
        const driverLoadsByTruck = new Map<number, number>();
        for (const load of driverLoads) {
          if (load.truckId != null) {
            const m = parseFloat(load.finalMiles || load.adjustedMiles || load.calculatedMiles || "0");
            driverLoadsByTruck.set(load.truckId, (driverLoadsByTruck.get(load.truckId) || 0) + m);
          }
        }
        totalMilesAllDrivers += base.miles;
        if (empType) milesByType[empType] = (milesByType[empType] || 0) + base.miles;
        driverBaseData.push({ driver, miles: base.miles, empType, driverLoads, driverPayItems, driverLoadsByTruck });
      }

      for (const { driver, miles: driverMiles, empType, driverLoads, driverPayItems, driverLoadsByTruck } of driverBaseData) {
        const companyCostTotal = computeDriverTotalCompanyCost(empType, driverMiles, enabledCostItems, milesByType, totalMilesAllDrivers, startDate, endDate, driverLoadsByTruck, truckMilesMap);
        const row = await computeDriverProfitability(storage, driver.id, companyId, startDate, endDate, user.userId, companyCostTotal, driverLoads, driverPayItems);
        const dispatcherName = driver.profile?.assignedDispatcherId
          ? (dispatcherMap.get(driver.profile.assignedDispatcherId) || null)
          : null;
        allRows.push({
          ...row,
          driverName: `${driver.firstName} ${driver.lastName}`,
          dispatcherName,
          finalScore: row.overrideScore || row.autoScore,
          profitLeak: parseFloat(row.milesTotal) > 0 && parseFloat(row.profitPerMile) < 0.15,
        });
      }
      totalMissingRevenue = allRows.reduce((sum, r) => sum + (r.missingRevenueCount || 0), 0);
    } else {
      const [aggRows, allLoadsAgg] = await Promise.all([
        storage.getAggregatedProfitabilityForRange(companyId, startDate, endDate),
        storage.getLoadsForCompanyDateRange(companyId, startDate, endDate),
      ]);

      const truckMilesMapAgg = new Map<number, number>();
      const driverLoadsByTruckAgg = new Map<number, Map<number, number>>();
      for (const load of allLoadsAgg) {
        if (load.truckId != null) {
          const m = parseFloat(load.finalMiles || load.adjustedMiles || load.calculatedMiles || "0");
          truckMilesMapAgg.set(load.truckId, (truckMilesMapAgg.get(load.truckId) || 0) + m);
          if (load.driverUserId != null) {
            if (!driverLoadsByTruckAgg.has(load.driverUserId)) driverLoadsByTruckAgg.set(load.driverUserId, new Map());
            const dm = driverLoadsByTruckAgg.get(load.driverUserId)!;
            dm.set(load.truckId, (dm.get(load.truckId) || 0) + m);
          }
        }
      }

      let totalMilesAllDrivers = 0;
      const milesByType: Record<string, number> = {};
      for (const r of aggRows) {
        const m = parseFloat(r.miles_total) || 0;
        totalMilesAllDrivers += m;
        const et = r.employment_type || null;
        if (et) milesByType[et] = (milesByType[et] || 0) + m;
      }

      const dispatcherCache: Record<number, string> = {};
      for (const r of aggRows) {
        const miles = parseFloat(r.miles_total) || 0;
        const revenue = parseFloat(r.revenue_total) || 0;
        const driverPay = (parseFloat(r.earnings) || 0) - (parseFloat(r.deductions) || 0);
        const driverEmpType = r.employment_type || null;
        const driverIdAgg = parseInt(r.driver_user_id);
        const driverLoadsByTruckEntry = driverLoadsByTruckAgg.get(driverIdAgg) || new Map<number, number>();
        const companyCost = computeDriverTotalCompanyCost(driverEmpType, miles, enabledCostItems, milesByType, totalMilesAllDrivers, startDate, endDate, driverLoadsByTruckEntry, truckMilesMapAgg);
        const profit = revenue - driverPay - companyCost;
        const profitPerMile = miles > 0 ? profit / miles : 0;
        const autoScore = computeAutoScore(miles, revenue, profit, profitPerMile);

        let dispatcherName: string | null = null;
        if (r.assigned_dispatcher_id) {
          const did = parseInt(r.assigned_dispatcher_id);
          if (!dispatcherCache[did]) {
            const dUser = await storage.getUser(did);
            dispatcherCache[did] = dUser ? `${dUser.firstName} ${dUser.lastName}` : "Unknown";
          }
          dispatcherName = dispatcherCache[did];
        }

        allRows.push({
          driverUserId: driverIdAgg,
          driverName: r.driver_name,
          dispatcherName,
          milesTotal: miles.toFixed(2),
          revenueTotal: revenue.toFixed(2),
          driverPayTotal: driverPay.toFixed(2),
          companyCostTotal: companyCost.toFixed(2),
          profitTotal: profit.toFixed(2),
          profitPerMile: profitPerMile.toFixed(4),
          loadsCount: parseInt(r.loads_count) || 0,
          missingRevenueCount: parseInt(r.missing_revenue_count) || 0,
          autoScore,
          finalScore: autoScore,
          overrideScore: null,
          profitLeak: miles > 0 && profitPerMile < 0.15,
        });
      }
      totalMissingRevenue = allRows.reduce((sum, r) => sum + r.missingRevenueCount, 0);
    }

    const scoreDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let fleetRevenue = 0, fleetDriverPay = 0, fleetCompanyCost = 0, fleetMiles = 0;
    for (const r of allRows) {
      const score = r.finalScore || r.autoScore;
      if (score in scoreDistribution) scoreDistribution[score]++;
      fleetRevenue += parseFloat(r.revenueTotal) || 0;
      fleetDriverPay += parseFloat(r.driverPayTotal) || 0;
      fleetCompanyCost += parseFloat(r.companyCostTotal) || 0;
      fleetMiles += parseFloat(r.milesTotal) || 0;
    }
    const fleetProfit = fleetRevenue - fleetDriverPay - fleetCompanyCost;
    const fleetProfitPerMile = fleetMiles > 0 ? fleetProfit / fleetMiles : 0;
    const fleetSummary = {
      totalRevenue: fleetRevenue.toFixed(2),
      totalDriverPay: fleetDriverPay.toFixed(2),
      totalCompanyCost: fleetCompanyCost.toFixed(2),
      totalProfit: fleetProfit.toFixed(2),
      totalMiles: fleetMiles.toFixed(0),
      profitPerMile: fleetProfitPerMile.toFixed(4),
      scoreDistribution,
    };

    const filteredRows = search
      ? allRows.filter((r) => (r.driverName || "").toLowerCase().includes(search))
      : allRows;

    filteredRows.sort((a, b) => {
      let diff = 0;
      if (sortField === "profit") diff = parseFloat(a.profitTotal) - parseFloat(b.profitTotal);
      else if (sortField === "profitPerMile") diff = parseFloat(a.profitPerMile) - parseFloat(b.profitPerMile);
      else if (sortField === "miles") diff = parseFloat(a.milesTotal) - parseFloat(b.milesTotal);
      else if (sortField === "score") diff = profScoreToNum(a.finalScore) - profScoreToNum(b.finalScore);
      return sortDir === "desc" ? -diff : diff;
    });

    const total = filteredRows.length;
    const rows = filteredRows.slice(offset, offset + limit);
    const hasActiveCosts = enabledCostItems.length > 0;

    return c.json({ rows, total, startDate, endDate, rangeType, totalMissingRevenue, fleetSummary, loadsWithoutTruck: loadsWithoutTruckCount, hasActiveCosts });
  } catch (err: any) {
    return c.json({ message: err.message }, 500);
  }
});

// ── GET /api/profitability/:driverUserId ───────────────────────────────────
profitabilityRoutes.get("/profitability/:driverUserId", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);

    const companyId = user.role === "SUPERADMIN"
      ? parseInt(c.req.query("companyId") ?? "0") || user.companyId
      : user.companyId;
    if (!companyId) return c.json({ message: "Company context required" }, 400);

    const driverUserId = parseInt(c.req.param("driverUserId"));
    const driver = await storage.getUser(driverUserId);
    if (!driver || (user.role !== "SUPERADMIN" && driver.companyId !== companyId)) {
      return c.json({ message: "Driver not in your company" }, 403);
    }

    let startDate = c.req.query("startDate") ?? "";
    let endDate = c.req.query("endDate") ?? "";
    const rangeType = c.req.query("rangeType") ?? "week";
    if (!startDate || !endDate) {
      const bounds = getWeekBounds();
      startDate = bounds.weekStart;
      endDate = bounds.weekEnd;
    }
    const isWeeklyRange = rangeType === "this_week" || rangeType === "last_week" || rangeType === "week";

    const [driverLoads, driverPayItems, enabledCostItems, allDrivers, allCompanyLoadsDetail] = await Promise.all([
      storage.getLoadsForDriverWeek(driverUserId, companyId, startDate, endDate),
      storage.getPayItemsForDriverWeek(driverUserId, companyId, startDate, endDate),
      storage.getEnabledCompanyCostItems(companyId),
      storage.getDriversWithProfiles(companyId),
      storage.getLoadsForCompanyDateRange(companyId, startDate, endDate),
    ]);
    const base = computeDriverBaseMetrics(driverLoads, driverPayItems);
    const activeDrivers = allDrivers.filter((d: any) => d.isActive && d.role === "DRIVER");
    const targetDriver = activeDrivers.find((d: any) => d.id === driverUserId);
    const driverEmpType = targetDriver?.profile?.employmentType || null;

    let totalMilesAllDrivers = 0;
    const detailMilesByType: Record<string, number> = {};
    const truckMilesMapDetail = new Map<number, number>();
    const allDriverLoadsByTruckDetail = new Map<number, Map<number, number>>();
    for (const load of allCompanyLoadsDetail) {
      const m = parseFloat(load.finalMiles || load.adjustedMiles || load.calculatedMiles || "0");
      totalMilesAllDrivers += m;
      const et = load.driverUserId ? allDrivers.find((d: any) => d.id === load.driverUserId)?.profile?.employmentType : null;
      if (et) detailMilesByType[et] = (detailMilesByType[et] || 0) + m;
      if (load.truckId != null) {
        truckMilesMapDetail.set(load.truckId, (truckMilesMapDetail.get(load.truckId) || 0) + m);
        if (load.driverUserId != null) {
          if (!allDriverLoadsByTruckDetail.has(load.driverUserId)) allDriverLoadsByTruckDetail.set(load.driverUserId, new Map());
          const dm = allDriverLoadsByTruckDetail.get(load.driverUserId)!;
          dm.set(load.truckId, (dm.get(load.truckId) || 0) + m);
        }
      }
    }
    const driverLoadsByTruckDetail = allDriverLoadsByTruckDetail.get(driverUserId) || new Map<number, number>();
    const companyCost = computeDriverTotalCompanyCost(driverEmpType, base.miles, enabledCostItems, detailMilesByType, totalMilesAllDrivers, startDate, endDate, driverLoadsByTruckDetail, truckMilesMapDetail);
    const profit = base.revenue - base.driverPay - companyCost;
    const profitPerMile = base.miles > 0 ? profit / base.miles : 0;
    const autoScore = computeAutoScore(base.miles, base.revenue, profit, profitPerMile);

    let overrideScore: string | null = null;
    let overrideReason: string | null = null;
    if (isWeeklyRange) {
      const row = await computeDriverProfitability(storage, driverUserId, companyId, startDate, endDate, user.userId, companyCost);
      overrideScore = row.overrideScore;
      overrideReason = row.overrideReason;
    }

    const driverName = `${driver.firstName} ${driver.lastName}`;
    return c.json({
      driverUserId, driverName,
      milesTotal: base.miles.toFixed(2),
      revenueTotal: base.revenue.toFixed(2),
      driverPayTotal: base.driverPay.toFixed(2),
      companyCostTotal: companyCost.toFixed(2),
      profitTotal: profit.toFixed(2),
      profitPerMile: profitPerMile.toFixed(4),
      loadsCount: base.loadsCount,
      missingRevenueCount: base.missingRevenueCount,
      autoScore, overrideScore, overrideReason,
      finalScore: overrideScore || autoScore,
      rangeType,
      loads: driverLoads.map((l) => ({
        id: l.id, pickupDate: l.pickupDate,
        pickupAddress: l.pickupAddress, deliveryAddress: l.deliveryAddress,
        miles: l.finalMiles || l.adjustedMiles || l.calculatedMiles,
        revenueAmount: l.revenueAmount, status: l.status, brokerName: l.brokerName,
      })),
      payItems: driverPayItems.map((pi) => ({
        id: pi.id, type: pi.type, category: pi.category,
        amount: pi.amount, description: pi.description, status: pi.status,
      })),
    });
  } catch (err: any) {
    return c.json({ message: err.message }, 500);
  }
});

// ── POST /api/profitability/:driverUserId/override ─────────────────────────
profitabilityRoutes.post("/profitability/:driverUserId/override", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);

    const companyId = user.role === "SUPERADMIN"
      ? parseInt((await c.req.json()).companyId ?? "0") || user.companyId
      : user.companyId;
    if (!companyId) return c.json({ message: "Company context required" }, 400);

    const driverUserId = parseInt(c.req.param("driverUserId"));
    const driver = await storage.getUser(driverUserId);
    if (!driver || (user.role !== "SUPERADMIN" && driver.companyId !== companyId)) {
      return c.json({ message: "Driver not in your company" }, 403);
    }

    const body = await c.req.json();
    const { weekStart, overrideScore, overrideReason } = body;
    if (!weekStart || !overrideScore) return c.json({ message: "weekStart and overrideScore required" }, 400);
    if (!["A", "B", "C", "D", "F"].includes(overrideScore)) return c.json({ message: "Invalid score" }, 400);

    const existing = await storage.getProfitabilityRow(companyId, driverUserId, weekStart);
    if (!existing) return c.json({ message: "Profitability row not found. Load the profitability page first." }, 404);

    const [updated] = await db.update(driverProfitabilityWeeks)
      .set({ overrideScore, overrideReason: overrideReason || null, updatedByUserId: user.userId, updatedAt: new Date() })
      .where(eq(driverProfitabilityWeeks.id, existing.id))
      .returning();

    await storage.createAuditLog({
      actorId: user.userId, companyId,
      action: "PROFIT_OVERRIDE_SET", entity: "driver_profitability_weeks", entityId: existing.id,
      before: { autoScore: existing.autoScore, overrideScore: existing.overrideScore },
      after: { overrideScore, overrideReason },
    });

    return c.json({ ...updated, finalScore: updated.overrideScore || updated.autoScore });
  } catch (err: any) {
    return c.json({ message: err.message }, 500);
  }
});

// ── POST /api/profitability/:driverUserId/override/clear ───────────────────
profitabilityRoutes.post("/profitability/:driverUserId/override/clear", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);

    const companyId = user.role === "SUPERADMIN"
      ? parseInt((await c.req.json()).companyId ?? "0") || user.companyId
      : user.companyId;
    if (!companyId) return c.json({ message: "Company context required" }, 400);

    const driverUserId = parseInt(c.req.param("driverUserId"));
    const driver = await storage.getUser(driverUserId);
    if (!driver || (user.role !== "SUPERADMIN" && driver.companyId !== companyId)) {
      return c.json({ message: "Driver not in your company" }, 403);
    }

    const { weekStart } = await c.req.json();
    if (!weekStart) return c.json({ message: "weekStart required" }, 400);

    const existing = await storage.getProfitabilityRow(companyId, driverUserId, weekStart);
    if (!existing) return c.json({ message: "Profitability row not found" }, 404);

    const [updated] = await db.update(driverProfitabilityWeeks)
      .set({ overrideScore: null, overrideReason: null, updatedByUserId: user.userId, updatedAt: new Date() })
      .where(eq(driverProfitabilityWeeks.id, existing.id))
      .returning();

    await storage.createAuditLog({
      actorId: user.userId, companyId,
      action: "PROFIT_OVERRIDE_CLEARED", entity: "driver_profitability_weeks", entityId: existing.id,
      before: { overrideScore: existing.overrideScore, overrideReason: existing.overrideReason },
      after: { overrideScore: null },
    });

    return c.json({ ...updated, finalScore: updated.autoScore });
  } catch (err: any) {
    return c.json({ message: err.message }, 500);
  }
});

// ── GET /api/truck-profitability ───────────────────────────────────────────
profitabilityRoutes.get("/truck-profitability", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);

    const companyId = user.companyId;
    if (!companyId) return c.json({ message: "No company context" }, 403);

    const defaultStart = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; })();
    const startDate = c.req.query("startDate") ?? defaultStart;
    const endDate = c.req.query("endDate") ?? new Date().toISOString().split("T")[0];
    const search = (c.req.query("search") ?? "").trim().toLowerCase();
    const ownershipFilter = c.req.query("ownershipType") ?? "";
    const statusFilter = c.req.query("status") ?? "";
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20"), 1), 100);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);

    const [allTrucks, driversWithProfiles, enabledCosts, allLoads, allPayItemsList] = await Promise.all([
      storage.getTrucks(companyId),
      storage.getDriversWithProfiles(companyId),
      storage.getEnabledCompanyCostItems(companyId),
      storage.getLoadsForCompanyDateRange(companyId, startDate, endDate),
      storage.getPayItemsForCompanyDateRange(companyId, startDate, endDate),
    ]);

    const loadsByTruck = new Map<number, any[]>();
    for (const load of allLoads) {
      if (load.truckId == null) continue;
      const arr = loadsByTruck.get(load.truckId) || [];
      arr.push(load);
      loadsByTruck.set(load.truckId, arr);
    }

    const driverEmpType = new Map<number, string>();
    for (const d of driversWithProfiles) {
      if (d.profile?.employmentType) driverEmpType.set(d.id, d.profile.employmentType);
    }

    const driverTotalMiles = new Map<number, number>();
    const driverTotalPay = new Map<number, number>();
    const driverRevenueTotal = new Map<number, number>();
    const loadMiles = (l: any) => parseFloat(l.finalMiles || l.adjustedMiles || l.calculatedMiles || "0");

    // Build driver profile map for pay model lookup
    const driverProfileMap = new Map<number, any>();
    for (const d of driversWithProfiles) {
      if (d.profile) driverProfileMap.set(d.id, d.profile);
    }

    for (const load of allLoads) {
      if (load.driverUserId == null) continue;
      driverTotalMiles.set(load.driverUserId, (driverTotalMiles.get(load.driverUserId) || 0) + loadMiles(load));
      driverRevenueTotal.set(load.driverUserId, (driverRevenueTotal.get(load.driverUserId) || 0) + parseFloat(load.revenueAmount || "0"));
    }

    // Calculate driver pay: revenue share for owner ops/lease, pay items for CPM/flat
    for (const pi of allPayItemsList) {
      if (pi.driverUserId == null) continue;
      const profile = driverProfileMap.get(pi.driverUserId);
      if (profile?.payModel === "REVENUE_SHARE") continue; // handled below
      const payVal = pi.type === "DEDUCTION" ? -(parseFloat(pi.amount || "0")) : parseFloat(pi.amount || "0");
      driverTotalPay.set(pi.driverUserId, (driverTotalPay.get(pi.driverUserId) || 0) + payVal);
    }
    // Revenue share drivers: pay = revenue × share%
    for (const [driverId, driverRevenue] of driverRevenueTotal) {
      const profile = driverProfileMap.get(driverId);
      if (profile?.payModel === "REVENUE_SHARE" && parseFloat(profile?.revenueSharePercent || "0") > 0) {
        const share = parseFloat(profile.revenueSharePercent) / 100;
        driverTotalPay.set(driverId, driverRevenue * share);
      }
    }

    let totalFleetMiles = 0;
    const milesByEmpType: Record<string, number> = {};
    const truckMilesMap = new Map<number, number>();
    for (const load of allLoads) {
      const m = loadMiles(load);
      totalFleetMiles += m;
      const et = load.driverUserId ? (driverEmpType.get(load.driverUserId) || null) : null;
      if (et) milesByEmpType[et] = (milesByEmpType[et] || 0) + m;
      if (load.truckId != null) truckMilesMap.set(load.truckId, (truckMilesMap.get(load.truckId) || 0) + m);
    }

    const truckRows: any[] = [];
    const effectiveScope = (ci: any): string => {
      if (ci.costScope === "TRUCK" || ci.costScope === "DRIVER_TYPE" || ci.costScope === "GLOBAL") return ci.costScope;
      return ci.employmentType === null ? "GLOBAL" : "DRIVER_TYPE";
    };
    const totalTruckFleetMiles = [...truckMilesMap.values()].reduce((a, b) => a + b, 0);

    for (const truck of allTrucks) {
      const truckLoads = loadsByTruck.get(truck.id) || [];
      if (truckLoads.length === 0) continue;

      const truckMiles = truckLoads.reduce((s, l) => s + loadMiles(l), 0);
      const truckRevenue = truckLoads.reduce((s, l) => s + parseFloat(l.revenueAmount || "0"), 0);
      const loadCount = truckLoads.length;
      const driverIds = [...new Set(truckLoads.map((l: any) => l.driverUserId).filter(Boolean) as number[])];
      const assignedDrivers = driverIds.map((did) => {
        const d = driversWithProfiles.find((dr: any) => dr.id === did);
        return d ? { id: d.id, firstName: d.firstName, lastName: d.lastName } : { id: did, firstName: "?", lastName: "" };
      });

      let truckDriverPay = 0;
      const driverMilesOnTruck = new Map<number, number>();
      for (const load of truckLoads) {
        if (load.driverUserId == null) continue;
        driverMilesOnTruck.set(load.driverUserId, (driverMilesOnTruck.get(load.driverUserId) || 0) + loadMiles(load));
      }
      for (const [did, truckMilesForDriver] of driverMilesOnTruck) {
        const totalDriverMiles = driverTotalMiles.get(did) || 0;
        const driverPay = driverTotalPay.get(did) || 0;
        const fraction = totalDriverMiles > 0 ? truckMilesForDriver / totalDriverMiles : 0;
        truckDriverPay += driverPay * fraction;
      }

      let truckCompanyCost = 0;
      for (const ci of enabledCosts) {
        const scope = effectiveScope(ci);
        const itemCost = computeCompanyCostForRange([ci], startDate, endDate);
        if (scope === "TRUCK") {
          if (ci.truckId != null) {
            truckCompanyCost += ci.truckId === truck.id ? itemCost : 0;
          } else {
            truckCompanyCost += totalTruckFleetMiles > 0 ? (truckMiles / totalTruckFleetMiles) * itemCost : 0;
          }
        } else if (scope === "DRIVER_TYPE") {
          if (ci.employmentType) {
            let truckEmpMiles = 0;
            for (const load of truckLoads) {
              const et = load.driverUserId ? (driverEmpType.get(load.driverUserId) || null) : null;
              if (et === ci.employmentType) truckEmpMiles += loadMiles(load);
            }
            const totalEmpMiles = milesByEmpType[ci.employmentType] || 0;
            truckCompanyCost += totalEmpMiles > 0 ? (truckEmpMiles / totalEmpMiles) * itemCost : 0;
          }
        } else {
          truckCompanyCost += totalFleetMiles > 0 ? (truckMiles / totalFleetMiles) * itemCost : 0;
        }
      }

      const profit = truckRevenue - truckDriverPay - truckCompanyCost;
      const profitPerMile = truckMiles > 0 ? profit / truckMiles : 0;
      const companyCostPerMile = truckMiles > 0 ? truckCompanyCost / truckMiles : 0;

      truckRows.push({
        truckId: truck.id, truckNumber: truck.truckNumber,
        ownershipType: truck.ownershipType, status: truck.status,
        miles: truckMiles, revenue: truckRevenue,
        driverPay: truckDriverPay, companyCost: truckCompanyCost,
        companyCostPerMile, profit, profitPerMile, loadCount, assignedDrivers,
        profitLeak: truckMiles > 0 && profitPerMile < 0.15,
      });
    }

    let filtered = truckRows;
    if (search) filtered = filtered.filter((r) => r.truckNumber.toLowerCase().includes(search));
    if (ownershipFilter) filtered = filtered.filter((r) => r.ownershipType === ownershipFilter);
    if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);

    const summary = {
      totalRevenue: filtered.reduce((s, r) => s + r.revenue, 0),
      totalDriverPay: filtered.reduce((s, r) => s + r.driverPay, 0),
      totalCompanyCost: filtered.reduce((s, r) => s + r.companyCost, 0),
      totalProfit: filtered.reduce((s, r) => s + r.profit, 0),
      totalMiles: filtered.reduce((s, r) => s + r.miles, 0),
      profitPerMile: 0 as number,
    };
    summary.profitPerMile = summary.totalMiles > 0 ? summary.totalProfit / summary.totalMiles : 0;

    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit).map((r) => ({
      ...r,
      miles: r.miles.toFixed(2),
      revenue: r.revenue.toFixed(2),
      driverPay: r.driverPay.toFixed(2),
      companyCost: r.companyCost.toFixed(2),
      companyCostPerMile: r.companyCostPerMile.toFixed(4),
      profit: r.profit.toFixed(2),
      profitPerMile: r.profitPerMile.toFixed(4),
    }));

    return c.json({
      items, total, offset, limit,
      hasMore: total > offset + limit,
      summary: {
        ...summary,
        totalRevenue: summary.totalRevenue.toFixed(2),
        totalDriverPay: summary.totalDriverPay.toFixed(2),
        totalCompanyCost: summary.totalCompanyCost.toFixed(2),
        totalProfit: summary.totalProfit.toFixed(2),
        totalMiles: summary.totalMiles.toFixed(2),
        profitPerMile: summary.profitPerMile.toFixed(4),
      },
    });
  } catch (err: any) {
    return c.json({ message: err.message }, 500);
  }
});