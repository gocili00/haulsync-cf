/**
 * routes/loads.ts — Load routes (T7 — fully implemented, non-file subset)
 *
 * Replaces: server/routes.ts lines 788–1565 (excluding upload-bol + calculate-miles)
 * Changes:  Express req/res → Hono. req.user → c.get("user"). req.body → c.req.json().
 *           calculateMiles: fetch() replaces process.env — reads MAPBOX_TOKEN from c.env.
 *           validateDriverBelongsToCompany + calculateRevenueForLoad: take storage param.
 * Unchanged: all business logic, all status transitions, all revenue calculations,
 *            approval validations, void/restore logic, audit log writes.
 * Deferred to Phase 2: POST /api/loads/upload-bol, POST /api/loads/:id/calculate-miles
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";
import { extractAddresses } from "../address-extract";
import { processDocument, isOcrAvailable } from "../ocr";

export const loadRoutes = new Hono<{ Bindings: Env }>();

// ── helpers ────────────────────────────────────────────────────────────────

function st(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env);
  return new DatabaseStorage(db);
}

async function calcMiles(pickup: string, delivery: string, mapboxToken: string | undefined): Promise<number | null> {
  if (!mapboxToken) { console.error("[calcMiles] No MAPBOX_TOKEN"); return null; }
  try {
    const pgRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(pickup)}.json?access_token=${mapboxToken}&limit=1`);
    if (!pgRes.ok) { console.error(`[calcMiles] Pickup geocode failed: ${pgRes.status} ${await pgRes.text()}`); return null; }
    const pd = await pgRes.json() as any;
    const pCoords = pd.features?.[0]?.center;
    if (!pCoords) { console.error(`[calcMiles] No coords for pickup "${pickup}". Response: ${JSON.stringify(pd).slice(0, 200)}`); return null; }

    const dgRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(delivery)}.json?access_token=${mapboxToken}&limit=1`);
    if (!dgRes.ok) { console.error(`[calcMiles] Delivery geocode failed: ${dgRes.status} ${await dgRes.text()}`); return null; }
    const dd = await dgRes.json() as any;
    const dCoords = dd.features?.[0]?.center;
    if (!dCoords) { console.error(`[calcMiles] No coords for delivery "${delivery}". Response: ${JSON.stringify(dd).slice(0, 200)}`); return null; }

    const drRes = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${pCoords[0]},${pCoords[1]};${dCoords[0]},${dCoords[1]}?access_token=${mapboxToken}`);
    if (!drRes.ok) { console.error(`[calcMiles] Directions failed: ${drRes.status} ${await drRes.text()}`); return null; }
    const drData = await drRes.json() as any;
    const dist = drData.routes?.[0]?.distance;
    console.log(`[calcMiles] ${pickup} → ${delivery}: ${dist}m → ${dist ? Math.round(dist / 1609.34) : null} miles`);
    return dist ? Math.round(dist / 1609.34) : null;
  } catch (err: any) { console.error("[calcMiles] Exception:", err.message); return null; }
}

async function validateDriver(storage: DatabaseStorage, driverUserId: number, userCompanyId: number | null | undefined, userRole: string): Promise<boolean> {
  if (userRole === "SUPERADMIN") return true;
  if (!userCompanyId) return false;
  const driver = await storage.getUser(driverUserId);
  if (!driver) return false;
  return driver.companyId === userCompanyId;
}

async function calcRevenue(storage: DatabaseStorage, companyId: number | null, miles: string | null) {
  if (!companyId) return { revenueAmount: null, revenueSource: null, revenueRpmUsed: null };
  const settings = await storage.getCompanySettings(companyId);
  if (!settings) return { revenueAmount: null, revenueSource: null, revenueRpmUsed: null };
  if (settings.defaultRevenueMode === "AUTO_RPM" && settings.defaultRevenueRpm && miles) {
    const mv = parseFloat(miles), rv = parseFloat(settings.defaultRevenueRpm);
    if (!isNaN(mv) && !isNaN(rv)) return { revenueAmount: (mv * rv).toFixed(2), revenueSource: "AUTO_RPM", revenueRpmUsed: settings.defaultRevenueRpm };
  }
  if (settings.defaultRevenueMode === "FLAT" && settings.defaultRevenueFlat) {
    return { revenueAmount: settings.defaultRevenueFlat, revenueSource: "FLAT", revenueRpmUsed: null };
  }
  return { revenueAmount: null, revenueSource: null, revenueRpmUsed: null };
}

// ── GET /api/loads ─────────────────────────────────────────────────────────
loadRoutes.get("/loads", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    if (user.role !== "SUPERADMIN" && user.role !== "DRIVER" && !user.companyId) return c.json({ message: "No company context" }, 403);
    const role = user.role;
    const companyId = role === "SUPERADMIN" ? undefined : (user.companyId || undefined);
    const includeDeletedVoided = c.req.query("includeDeletedVoided") === "true" && role !== "DRIVER";
    const search = c.req.query("search")?.trim() || undefined;
    const statusQ = c.req.query("status");
    const status = statusQ && statusQ !== "ALL" ? statusQ : undefined;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20"), 1), 100);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);
    const driverIdFilter = c.req.query("driverId") ? parseInt(c.req.query("driverId")!) : undefined;

    let driverUserId: number | undefined;
    let driverUserIds: number[] | undefined;
    let dispatcherIdFilter: number | undefined;

    if (role === "DRIVER") {
      driverUserId = user.userId;
    } else if (role === "DISPATCHER" && user.companyId) {
      const settings = await storage.getCompanySettings(user.companyId);
      const includeUnassigned = settings?.dispatcherCanSeeUnassigned ?? false;
      driverUserIds = await storage.getDriverUserIdsForDispatcher(user.userId, user.companyId, includeUnassigned);
      if (driverUserIds.length === 0) return c.json({ items: [], total: 0, limit, offset, page: 1, pageCount: 0 });
    } else if (c.req.query("dispatcherId") && (role === "ADMIN" || role === "SUPERADMIN")) {
      dispatcherIdFilter = parseInt(c.req.query("dispatcherId")!);
    }

    const result = await storage.getLoadsPaginated({ companyId, driverUserId, driverUserIds, search, status, includeDeletedVoided, dispatcherId: dispatcherIdFilter, driverIdFilter, limit, offset });
    let items = result.items;
    if (role === "DRIVER") {
      items = items.map((l: any) => { const { revenueAmount, revenueSource, revenueRpmUsed, revenueLastCalculatedAt, brokerName, ...rest } = l; return rest; });
    }
    const page = Math.floor(offset / limit) + 1;
    return c.json({ items, total: result.total, limit, offset, page, pageCount: Math.ceil(result.total / limit) });
  } catch (err: any) { return c.json({ message: err.message }, 500); }
});

// ── POST /api/loads ────────────────────────────────────────────────────────
loadRoutes.post("/loads", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const body = await c.req.json();
    const { driverUserId, pickupAddress, deliveryAddress, pickupDate, deliveryDate, calculatedMiles, adjustedMiles, finalMiles, brokerName, truckId } = body;
    const actualDriverId = user.role === "DRIVER" ? user.userId : driverUserId;
    if (user.role !== "DRIVER" && user.role !== "SUPERADMIN") {
      const valid = await validateDriver(storage, actualDriverId, user.companyId, user.role);
      if (!valid) return c.json({ message: "Driver not found" }, 404);
    }
    const load = await storage.createLoad({
      driverUserId: actualDriverId,
      companyId: user.companyId ?? null,
      truckId: truckId ? parseInt(truckId) : null,
      pickupAddress: pickupAddress ?? null,
      deliveryAddress: deliveryAddress ?? null,
      pickupDate: pickupDate ?? null,
      deliveryDate: deliveryDate ?? null,
      calculatedMiles: calculatedMiles ?? null,
      adjustedMiles: adjustedMiles ?? null,
      finalMiles: finalMiles || calculatedMiles || null,
      status: "DRAFT",
      brokerName: user.role !== "DRIVER" ? (brokerName ?? null) : null,
    });
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "CREATE", entity: "LOAD", entityId: load.id });
    const loadMiles = load.finalMiles || load.adjustedMiles || load.calculatedMiles;
    if (loadMiles) {
      const revenue = await calcRevenue(storage, load.companyId, loadMiles);
      if (revenue.revenueAmount) {
        const updated = await storage.updateLoad(load.id, { revenueAmount: revenue.revenueAmount, revenueSource: revenue.revenueSource, revenueRpmUsed: revenue.revenueRpmUsed, revenueLastCalculatedAt: new Date() } as any);
        return c.json(updated);
      }
    }
    return c.json(load);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── POST /api/loads/upload-bol ─────────────────────────────────────────────
loadRoutes.post("/loads/upload-bol", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);

    const contentType = c.req.header("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return c.json({ message: "Expected multipart/form-data" }, 400);
    }

    const formData = await c.req.formData();
    const fileEntries = formData.getAll("bol") as File[];
    if (!fileEntries || fileEntries.length === 0) {
      return c.json({ message: "No file uploaded" }, 400);
    }

    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    for (const f of fileEntries) {
      if (!allowedTypes.includes(f.type)) {
        return c.json({ message: "Only PDF, JPG, and PNG files are allowed" }, 400);
      }
      if (f.size > 10 * 1024 * 1024) {
        return c.json({ message: "File size must not exceed 10MB" }, 400);
      }
    }

    const pickupCity = (formData.get("pickupCity") as string) || null;
    const deliveryCity = (formData.get("deliveryCity") as string) || null;

    // Store files to R2 and collect keys
    const fileBuffers: { buffer: ArrayBuffer; mimeType: string; key: string }[] = [];
    const bolFileUrls: string[] = [];

    for (const file of fileEntries) {
      const ext = file.name.split(".").pop() || "bin";
      const key = `bol/${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
      const buffer = await file.arrayBuffer();
      await c.env.BOL_BUCKET.put(key, buffer, { httpMetadata: { contentType: file.type } });
      fileBuffers.push({ buffer, mimeType: file.type, key });
      bolFileUrls.push(`/api/loads/bol/${key}`);
    }

    const bolFileUrl = bolFileUrls[0];

    // Create load
    const load = await storage.createLoad({
      driverUserId: user.userId,
      companyId: user.companyId || null,
      pickupAddress: pickupCity,
      deliveryAddress: deliveryCity,
      pickupDate: new Date().toISOString().split("T")[0],
      status: "BOL_UPLOADED",
      bolFileUrl,
      createdByDriver: true,
    } as any);

    await storage.updateLoadOcr(load.id, { bolFileUrls });

    await storage.createAuditLog({
      actorId: user.userId,
      companyId: user.companyId ?? undefined,
      action: "BOL_UPLOAD",
      entity: "LOAD",
      entityId: load.id,
    });

    // Generate jobId and store initial state in KV
    let jobId: string | null = null;
    if (isOcrAvailable(c.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)) {
      jobId = crypto.randomUUID();
      await c.env.JOBS_KV.put(
        jobId,
        JSON.stringify({ id: jobId, status: "queued", result: null, error: null, attempts: 0, createdAt: Date.now(), updatedAt: Date.now() }),
        { expirationTtl: 3600 }
      );

      // Run OCR in background after response is sent
      const loadId = load.id;
      const credJson = c.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
      const jobsKv = c.env.JOBS_KV;
      const db = createDb(c.env);
      const bgStorage = new DatabaseStorage(db);

      c.executionCtx.waitUntil(
        (async () => {
          try {
            await jobsKv.put(jobId!, JSON.stringify({ id: jobId, status: "running", result: null, error: null, attempts: 1, createdAt: Date.now(), updatedAt: Date.now() }), { expirationTtl: 3600 });

            const texts: string[] = [];
            for (const { buffer, mimeType } of fileBuffers) {
              const rawText = await processDocument(buffer, mimeType, credJson);
              if (rawText) texts.push(rawText);
            }

            if (texts.length > 0) {
              const mergedText = texts.join("\n\n---DOC_PAGE---\n\n");
              const addresses = extractAddresses(mergedText);
              const needsManual = !addresses.deliveryAddress || addresses.confidenceDelivery < 20;
              await bgStorage.updateLoadOcr(loadId, {
                bolRawText: mergedText,
                bolParsed: true,
                extractedPickupAddress: addresses.pickupAddress,
                extractedDeliveryAddress: addresses.deliveryAddress,
                confidencePickup: addresses.confidencePickup.toFixed(2),
                confidenceDelivery: addresses.confidenceDelivery.toFixed(2),
                pickupCandidates: addresses.pickupCandidates.length > 0 ? addresses.pickupCandidates : null,
                deliveryCandidates: addresses.deliveryCandidates.length > 0 ? addresses.deliveryCandidates : null,
                pickupSourceLines: addresses.pickupSourceLines.length > 0 ? addresses.pickupSourceLines : null,
                deliverySourceLines: addresses.deliverySourceLines.length > 0 ? addresses.deliverySourceLines : null,
                needsManualDelivery: needsManual,
                status: "OCR_DONE",
                pickupAddress: addresses.pickupAddress || pickupCity,
                deliveryAddress: addresses.deliveryAddress || deliveryCity,
              });
              console.log(`[OCR Job] Load ${loadId} processed: pickup="${addresses.pickupAddress}", delivery="${addresses.deliveryAddress}", needsManual=${needsManual}`);
              const jobResult = { pickupAddress: addresses.pickupAddress, deliveryAddress: addresses.deliveryAddress, confidencePickup: addresses.confidencePickup, confidenceDelivery: addresses.confidenceDelivery, pickupCandidates: addresses.pickupCandidates, deliveryCandidates: addresses.deliveryCandidates, needsManual };
              await jobsKv.put(jobId!, JSON.stringify({ id: jobId, status: "succeeded", result: jobResult, error: null, attempts: 1, createdAt: Date.now(), updatedAt: Date.now() }), { expirationTtl: 3600 });
            } else {
              await bgStorage.updateLoadOcr(loadId, { bolParsed: false, bolRawText: null });
              console.log(`[OCR Job] Load ${loadId}: No text extracted from ${fileBuffers.length} file(s)`);
              await jobsKv.put(jobId!, JSON.stringify({ id: jobId, status: "succeeded", result: { noText: true }, error: null, attempts: 1, createdAt: Date.now(), updatedAt: Date.now() }), { expirationTtl: 3600 });
            }
          } catch (err: any) {
            console.error(`[OCR Job] Load ${loadId} failed:`, err.message);
            await jobsKv.put(jobId!, JSON.stringify({ id: jobId, status: "failed", result: null, error: err.message, attempts: 1, createdAt: Date.now(), updatedAt: Date.now() }), { expirationTtl: 3600 });
          }
        })()
      );
    }

    return c.json({ ...load, bolFileUrls, jobId });
  } catch (err: any) {
    return c.json({ message: err.message }, 400);
  }
});

// ── GET /api/jobs/:id ──────────────────────────────────────────────────────
loadRoutes.get("/jobs/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  const raw = await c.env.JOBS_KV.get(id);
  if (!raw) return c.json({ message: "Job not found" }, 404);
  return c.json(JSON.parse(raw));
});

// ── GET /api/loads/broker-stats ────────────────────────────────────────────
loadRoutes.get("/loads/broker-stats", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const companyId = user.companyId;
    if (!companyId) return c.json([]);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    let allLoads = await storage.getLoads(undefined, companyId, false, {});
    if (user.role === "DISPATCHER") {
      const settings = await storage.getCompanySettings(companyId);
      const includeUnassigned = settings?.dispatcherCanSeeUnassigned ?? false;
      const ids = await storage.getDriverUserIdsForDispatcher(user.userId, companyId, includeUnassigned);
      allLoads = allLoads.filter((l: any) => ids.includes(l.driverUserId));
    }
    const weekLoads = allLoads.filter((l: any) => l.brokerName && new Date(l.createdAt) >= startOfWeek);
    const counts: Record<string, number> = {};
    for (const l of weekLoads) { const n = l.brokerName.trim(); counts[n] = (counts[n] || 0) + 1; }
    return c.json(Object.entries(counts).map(([broker, count]) => ({ broker, count })).sort((a, b) => b.count - a.count));
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── GET /api/loads/:id ─────────────────────────────────────────────────────
loadRoutes.get("/loads/:id", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const load = await storage.getLoad(id);
    if (!load) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN") {
      const valid = await validateDriver(storage, load.driverUserId, user.companyId, user.role);
      if (!valid) return c.json({ message: "Load not found" }, 404);
    }
    if (user.role === "DRIVER" && load.driverUserId !== user.userId) return c.json({ message: "Load not found" }, 404);
    const driver = await storage.getUser(load.driverUserId);
    let pickupContext: string | null = null, deliveryContext: string | null = null;
    let pickupCandidates: string[] = load.pickupCandidates || [];
    let deliveryCandidates: string[] = load.deliveryCandidates || [];
    let pickupSourceLines: string[] = load.pickupSourceLines || [];
    let deliverySourceLines: string[] = load.deliverySourceLines || [];
    if (load.bolRawText && load.bolParsed) {
      const re = extractAddresses(load.bolRawText);
      pickupContext = re.pickupContext;
      deliveryContext = re.deliveryContext;
      if (!pickupCandidates.length) pickupCandidates = re.pickupCandidates;
      if (!deliveryCandidates.length) deliveryCandidates = re.deliveryCandidates;
      if (!pickupSourceLines.length) pickupSourceLines = re.pickupSourceLines;
      if (!deliverySourceLines.length) deliverySourceLines = re.deliverySourceLines;
    }
    const resp: any = { ...load, driverName: driver ? `${driver.firstName} ${driver.lastName}` : undefined, pickupContext, deliveryContext, pickupCandidates, deliveryCandidates, pickupSourceLines, deliverySourceLines };
    if (user.role === "DRIVER") { delete resp.revenueAmount; delete resp.revenueSource; delete resp.revenueRpmUsed; delete resp.revenueLastCalculatedAt; delete resp.brokerName; }
    return c.json(resp);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── POST /api/loads/:id/verify ─────────────────────────────────────────────
loadRoutes.post("/loads/:id/verify", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getLoad(id);
    if (!existing) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN") { const v = await validateDriver(storage, existing.driverUserId, user.companyId, user.role); if (!v) return c.json({ message: "Load not found" }, 404); }
    if (!["BOL_UPLOADED", "OCR_DONE", "SUBMITTED"].includes(existing.status)) return c.json({ message: `Cannot verify load in ${existing.status} status` }, 400);
    const { pickupAddress, deliveryAddress, calculatedMiles } = await c.req.json();
    const updateData: any = {
      verifiedPickupAddress: pickupAddress || existing.extractedPickupAddress || existing.pickupAddress,
      verifiedDeliveryAddress: deliveryAddress || existing.extractedDeliveryAddress || existing.deliveryAddress,
      pickupAddress: pickupAddress || existing.extractedPickupAddress || existing.pickupAddress,
      deliveryAddress: deliveryAddress || existing.extractedDeliveryAddress || existing.deliveryAddress,
      status: "VERIFIED",
    };
    if (calculatedMiles) { updateData.calculatedMiles = calculatedMiles; updateData.finalMiles = calculatedMiles; }
    await storage.updateLoad(id, updateData);
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "LOAD_VERIFIED", entity: "LOAD", entityId: id });
    let milesResult: number | null = null;
    if (!calculatedMiles) {
      const vp = updateData.verifiedPickupAddress, vd = updateData.verifiedDeliveryAddress;
      if (vp && vd) {
        milesResult = await calcMiles(vp, vd, (c.env as any).MAPBOX_TOKEN);
        if (milesResult) await storage.updateLoad(id, { calculatedMiles: milesResult.toFixed(2), finalMiles: milesResult.toFixed(2) });
      }
    }
    const finalLoad = await storage.getLoad(id);
    if (finalLoad && finalLoad.revenueSource !== "MANUAL") {
      const revMiles = finalLoad.finalMiles || finalLoad.adjustedMiles || finalLoad.calculatedMiles;
      if (revMiles) {
        const revenue = await calcRevenue(storage, existing.companyId, revMiles);
        if (revenue.revenueAmount) await storage.updateLoad(id, { revenueAmount: revenue.revenueAmount, revenueSource: revenue.revenueSource, revenueRpmUsed: revenue.revenueRpmUsed, revenueLastCalculatedAt: new Date() } as any);
      }
    }
    const returnLoad = await storage.getLoad(id);
    return c.json({ ...returnLoad, autoCalculatedMiles: milesResult });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── POST /api/loads/:id/calculate-miles ────────────────────────────────────
loadRoutes.post("/loads/:id/calculate-miles", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const load = await storage.getLoad(id);
    if (!load) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN") {
      const valid = await validateDriver(storage, load.driverUserId, user.companyId, user.role);
      if (!valid) return c.json({ message: "Load not found" }, 404);
    }
    const body = await c.req.json();
    const { manualMiles, pickup: reqPickup, delivery: reqDelivery } = body;
    const pickup = reqPickup || load.verifiedPickupAddress || load.extractedPickupAddress || load.pickupAddress;
    const delivery = reqDelivery || load.verifiedDeliveryAddress || load.extractedDeliveryAddress || load.deliveryAddress;

    let miles: number | null = null;
    if (pickup && delivery) {
      miles = await calcMiles(pickup, delivery, c.env.MAPBOX_TOKEN);
    }
    if (!miles && manualMiles) {
      miles = parseFloat(manualMiles);
    }

    if (miles) {
      const updateData: any = { calculatedMiles: miles.toFixed(2) };
      if (!load.adjustedMiles) updateData.finalMiles = miles.toFixed(2);
      const updated = await storage.updateLoad(id, updateData);
      if (load.revenueSource !== "MANUAL") {
        const revMiles = updated!.finalMiles || updated!.adjustedMiles || updated!.calculatedMiles;
        if (revMiles) {
          const revenue = await calcRevenue(storage, load.companyId, revMiles);
          if (revenue.revenueAmount) {
            const revenueUpdated = await storage.updateLoad(id, { revenueAmount: revenue.revenueAmount, revenueSource: revenue.revenueSource, revenueRpmUsed: revenue.revenueRpmUsed, revenueLastCalculatedAt: new Date() } as any);
            return c.json(revenueUpdated);
          }
        }
      }
      return c.json(updated);
    } else {
      return c.json({ message: "Could not calculate miles. Please enter miles manually.", needsManual: true }, 400);
    }
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── POST /api/loads/:id/revenue/recalculate ────────────────────────────────
loadRoutes.post("/loads/:id/revenue/recalculate", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const load = await storage.getLoad(id);
    if (!load) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN") { const v = await validateDriver(storage, load.driverUserId, user.companyId, user.role); if (!v) return c.json({ message: "Load not found" }, 404); }
    const miles = load.finalMiles || load.adjustedMiles || load.calculatedMiles;
    const revenue = await calcRevenue(storage, load.companyId, miles);
    const updated = await storage.updateLoad(id, { revenueAmount: revenue.revenueAmount, revenueSource: revenue.revenueSource, revenueRpmUsed: revenue.revenueRpmUsed, revenueLastCalculatedAt: new Date() } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "LOAD_REVENUE_AUTO_RECALCULATED", entity: "LOAD", entityId: id, after: { revenueAmount: revenue.revenueAmount, revenueSource: revenue.revenueSource } });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── PATCH /api/loads/:id ───────────────────────────────────────────────────
loadRoutes.patch("/loads/:id", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getLoad(id);
    if (!existing) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN") { const v = await validateDriver(storage, existing.driverUserId, user.companyId, user.role); if (!v) return c.json({ message: "Load not found" }, 404); }
    if (existing.status === "LOCKED" && user.role !== "ADMIN" && user.role !== "SUPERADMIN") return c.json({ message: "Load is locked" }, 403);
    if (existing.status === "APPROVED" && user.role !== "ADMIN" && user.role !== "SUPERADMIN") return c.json({ message: "Load is approved and cannot be edited" }, 403);
    const body = await c.req.json();
    const { pickupAddress, deliveryAddress, pickupDate, deliveryDate, calculatedMiles, adjustedMiles, finalMiles, driverUserId, revenueAmount: manualRevenueAmount, revenueSource: manualRevenueSource, brokerName, truckId } = body;
    if (manualRevenueSource === "MANUAL" && manualRevenueAmount && user.role !== "DRIVER") {
      await storage.updateLoad(id, { revenueAmount: manualRevenueAmount, revenueSource: "MANUAL", revenueRpmUsed: null, revenueLastCalculatedAt: new Date() } as any);
      await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "LOAD_REVENUE_MANUAL_SET", entity: "LOAD", entityId: id, after: { revenueAmount: manualRevenueAmount, revenueSource: "MANUAL" } });
    }
    if (driverUserId && driverUserId !== existing.driverUserId && user.role !== "SUPERADMIN") {
      const v = await validateDriver(storage, driverUserId, user.companyId, user.role);
      if (!v) return c.json({ message: "Target driver not found" }, 404);
    }
    const newPickup = pickupAddress ?? existing.pickupAddress;
    const newDelivery = deliveryAddress ?? existing.deliveryAddress;
    const updatePayload: any = { pickupAddress: newPickup, deliveryAddress: newDelivery, pickupDate: pickupDate ?? existing.pickupDate, deliveryDate: deliveryDate ?? existing.deliveryDate, calculatedMiles: calculatedMiles ?? existing.calculatedMiles, adjustedMiles: adjustedMiles ?? existing.adjustedMiles, finalMiles: finalMiles || adjustedMiles || calculatedMiles || existing.finalMiles, driverUserId: driverUserId || existing.driverUserId };
    if (user.role !== "DRIVER" && brokerName !== undefined) updatePayload.brokerName = brokerName || null;
    if (user.role !== "DRIVER" && truckId !== undefined) updatePayload.truckId = truckId ? parseInt(truckId) : null;
    const updated = await storage.updateLoad(id, updatePayload);
    if (newPickup && newDelivery && !calculatedMiles && !adjustedMiles && !finalMiles) {
      const addrChanged = newPickup !== existing.pickupAddress || newDelivery !== existing.deliveryAddress;
      if (addrChanged || !existing.calculatedMiles) {
        try {
          const miles = await calcMiles(newPickup, newDelivery, (c.env as any).MAPBOX_TOKEN);
          if (miles) {
            const mu: any = { calculatedMiles: miles.toFixed(2) };
            if (!updated!.adjustedMiles) mu.finalMiles = miles.toFixed(2);
            const fl = await storage.updateLoad(id, mu);
            if (existing.revenueSource !== "MANUAL" && manualRevenueSource !== "MANUAL") {
              const rm = fl!.finalMiles || fl!.adjustedMiles || fl!.calculatedMiles;
              if (rm) { const rev = await calcRevenue(storage, existing.companyId, rm); if (rev.revenueAmount) await storage.updateLoad(id, { revenueAmount: rev.revenueAmount, revenueSource: rev.revenueSource, revenueRpmUsed: rev.revenueRpmUsed, revenueLastCalculatedAt: new Date() } as any); }
            }
            return c.json({ ...await storage.getLoad(id), autoCalculatedMiles: miles });
          }
        } catch (e) { console.error("[UpdateLoad] Auto miles failed:", e); }
      }
    }
    if ((calculatedMiles || adjustedMiles || finalMiles) && existing.revenueSource !== "MANUAL" && manualRevenueSource !== "MANUAL") {
      const rm = updated!.finalMiles || updated!.adjustedMiles || updated!.calculatedMiles;
      if (rm) { const rev = await calcRevenue(storage, existing.companyId, rm); if (rev.revenueAmount) { await storage.updateLoad(id, { revenueAmount: rev.revenueAmount, revenueSource: rev.revenueSource, revenueRpmUsed: rev.revenueRpmUsed, revenueLastCalculatedAt: new Date() } as any); return c.json(await storage.getLoad(id)); } }
    }
    return c.json(await storage.getLoad(id));
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── PATCH /api/loads/:id/status ────────────────────────────────────────────
loadRoutes.patch("/loads/:id/status", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getLoad(id);
    if (!existing) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN" && user.role !== "DRIVER") { const v = await validateDriver(storage, existing.driverUserId, user.companyId, user.role); if (!v) return c.json({ message: "Load not found" }, 404); }
    if (user.role === "DRIVER" && existing.driverUserId !== user.userId) return c.json({ message: "Load not found" }, 404);
    const { status } = await c.req.json();
    const validTransitions: Record<string, string[]> = { DRAFT: ["SUBMITTED"], BOL_UPLOADED: ["OCR_DONE", "SUBMITTED", "VERIFIED"], OCR_DONE: ["SUBMITTED", "VERIFIED"], SUBMITTED: ["VERIFIED", "DRAFT"], VERIFIED: ["APPROVED", "SUBMITTED"], APPROVED: ["LOCKED"], LOCKED: ["APPROVED"] };
    if (!validTransitions[existing.status]?.includes(status)) return c.json({ message: `Cannot transition from ${existing.status} to ${status}` }, 400);
    const updateData: any = { status };
    if (status === "APPROVED") {
      const missing: string[] = [];
      if (!existing.driverUserId) missing.push("Driver");
      if (!existing.pickupAddress?.trim()) missing.push("Pickup Address");
      if (!existing.deliveryAddress?.trim()) missing.push("Delivery Address");
      if (!(parseFloat(existing.finalMiles || "0") > 0)) missing.push("Final Miles");
      if (!(parseFloat(existing.revenueAmount || "0") > 0)) missing.push("Revenue Amount");
      if (!existing.truckId) missing.push("Truck Number");
      if (missing.length > 0) return c.json({ message: `Cannot approve load. Missing required fields: ${missing.join(", ")}.` }, 400);
      const driver = await storage.getUser(existing.driverUserId);
      const profile = driver ? await storage.getDriverProfile(driver.id) : null;
      updateData.finalMilesSnapshot = existing.finalMiles || existing.adjustedMiles || existing.calculatedMiles;
      updateData.ratePerMileSnapshot = profile?.ratePerMile || "0.0000";
      updateData.approvedAt = new Date();
    }
    const updated = await storage.updateLoad(id, updateData);
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: `LOAD_STATUS_${status}`, entity: "LOAD", entityId: id });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── DELETE /api/loads/:id ──────────────────────────────────────────────────
loadRoutes.delete("/loads/:id", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getLoad(id);
    if (!existing) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN") { const v = await validateDriver(storage, existing.driverUserId, user.companyId, user.role); if (!v) return c.json({ message: "Load not found" }, 404); }
    if (existing.isDeleted) return c.json({ message: "Load is already deleted" }, 400);
    if (!["DRAFT", "BOL_UPLOADED", "OCR_DONE", "SUBMITTED", "VERIFIED"].includes(existing.status) && user.role !== "SUPERADMIN") return c.json({ message: "Approved/locked loads cannot be deleted. Use Void instead." }, 400);
    await storage.updateLoad(id, { isDeleted: true, deletedAt: new Date(), deletedByUserId: user.userId } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "LOAD_DELETED", entity: "LOAD", entityId: id, before: { status: existing.status } });
    return c.json({ message: "Load deleted" });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── POST /api/loads/:id/void ───────────────────────────────────────────────
loadRoutes.post("/loads/:id/void", authMiddleware, requireRole("DISPATCHER", "ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getLoad(id);
    if (!existing) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN") { const v = await validateDriver(storage, existing.driverUserId, user.companyId, user.role); if (!v) return c.json({ message: "Load not found" }, 404); }
    if (existing.isVoided) return c.json({ message: "Load is already voided" }, 400);
    if (existing.isDeleted) return c.json({ message: "Cannot void a deleted load" }, 400);
    const { reason } = await c.req.json();
    if (!reason?.trim()) return c.json({ message: "A reason is required to void a load" }, 400);
    if (!["VERIFIED", "APPROVED", "LOCKED"].includes(existing.status)) return c.json({ message: `Cannot void a load in ${existing.status} status. Delete it instead.` }, 400);
    await storage.updateLoad(id, { isVoided: true, voidedAt: new Date(), voidedByUserId: user.userId, voidReason: reason.trim() } as any);
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "LOAD_VOIDED", entity: "LOAD", entityId: id, before: { status: existing.status }, after: { voidReason: reason.trim() } });
    return c.json({ message: "Load voided" });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// ── POST /api/loads/:id/restore ────────────────────────────────────────────
loadRoutes.post("/loads/:id/restore", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const id = parseInt(c.req.param("id"));
    const existing = await storage.getLoad(id);
    if (!existing) return c.json({ message: "Load not found" }, 404);
    if (user.role !== "SUPERADMIN") { const v = await validateDriver(storage, existing.driverUserId, user.companyId, user.role); if (!v) return c.json({ message: "Load not found" }, 404); }
    if (!existing.isDeleted && !existing.isVoided) return c.json({ message: "Load is not deleted or voided" }, 400);
    const upd: any = {};
    if (existing.isDeleted) { upd.isDeleted = false; upd.deletedAt = null; upd.deletedByUserId = null; }
    if (existing.isVoided) { upd.isVoided = false; upd.voidedAt = null; upd.voidedByUserId = null; upd.voidReason = null; }
    const updated = await storage.updateLoad(id, upd);
    await storage.createAuditLog({ actorId: user.userId, companyId: user.companyId ?? undefined, action: "LOAD_RESTORED", entity: "LOAD", entityId: id });
    return c.json(updated);
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});
