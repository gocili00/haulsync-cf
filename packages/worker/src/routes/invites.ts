/**
 * routes/invites.ts — Invite system (T10 — fully implemented)
 * Replaces: server/routes.ts lines 2331–2605
 * Changes: crypto.randomBytes → crypto.getRandomValues, crypto.createHash → crypto.subtle.digest
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../db";
import { createDb } from "../db";
import { DatabaseStorage } from "../storage";
import { authMiddleware, requireRole } from "../middleware/auth";
import { generateAccessToken, createRefreshToken, generateRandomToken, hashToken, refreshTokenMaxAgeDays, hashPassword } from "../lib/auth";
import { setCookie } from "hono/cookie";
import { getClientIp } from "../lib/helpers";
import { z } from "zod";

export const inviteRoutes = new Hono<{ Bindings: Env }>();

function st(c: Context<{ Bindings: Env }>) { return new DatabaseStorage(createDb(c.env)); }

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

// POST /api/invites
inviteRoutes.post("/invites", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const { email, role, companyId: targetCompanyId } = await c.req.json();
    if (!email || typeof email !== "string") return c.json({ message: "Email is required" }, 400);
    const normalizedEmail = email.trim().toLowerCase();
    const allowedRoles: string[] = ["DRIVER", "DISPATCHER"];
    if (user.role === "SUPERADMIN") {
      allowedRoles.push("ADMIN");
    } else if (user.role === "ADMIN" && role === "ADMIN") {
      const settings = await storage.getCompanySettings(user.companyId ?? 0);
      if (settings?.allowAdminInvites) allowedRoles.push("ADMIN");
    }
    const inviteRole = allowedRoles.includes(role) ? role : "DRIVER";
    let companyId: number;
    if (user.role === "SUPERADMIN" && targetCompanyId) { companyId = targetCompanyId; }
    else if (user.companyId) { companyId = user.companyId; }
    else return c.json({ message: "No company context available" }, 400);
    const existingUser = await storage.getUserByEmail(normalizedEmail);
    if (existingUser?.companyId && existingUser.companyId !== companyId) return c.json({ message: "This email belongs to a user in a different company" }, 400);
    const companyInvites = await storage.getInvitesByCompany(companyId);
    const active = companyInvites.find(inv => inv.email === normalizedEmail && inv.role === inviteRole && !inv.acceptedAt && !inv.revokedAt && new Date(inv.expiresAt) > new Date());
    if (active) return c.json({ message: "An active invite already exists for this email and role" }, 400);
    const rawToken = generateRandomToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const invite = await storage.createInvite({ companyId, email: normalizedEmail, role: inviteRole, tokenHash, expiresAt, createdByUserId: user.userId });
    await storage.createAuditLog({ actorId: user.userId, companyId, action: "INVITE_CREATED", entity: "INVITE", entityId: invite.id, after: { email: normalizedEmail, role: inviteRole } });
    const origin = c.req.header("Origin") ?? "https://haulsync.pages.dev";
    const inviteLink = `${origin}/accept-invite?token=${rawToken}`;
    return c.json({ inviteId: invite.id, inviteLink });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/invites
inviteRoutes.get("/invites", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    let companyId: number | undefined;
    if (user.role === "SUPERADMIN" && c.req.query("companyId")) { companyId = parseInt(c.req.query("companyId")!); }
    else { companyId = user.companyId ?? undefined; }
    if (!companyId) return c.json({ message: "No company context" }, 400);
    const search = c.req.query("search")?.trim() || undefined;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "20"), 1), 100);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);
    const result = await storage.getInvitesPaginated({ companyId, search, limit, offset });
    return c.json({ items: result.items, total: result.total, limit, offset, hasMore: result.total > offset + limit });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// POST /api/invites/revoke
inviteRoutes.post("/invites/revoke", authMiddleware, requireRole("ADMIN", "SUPERADMIN"), async (c) => {
  try {
    const user = c.get("user");
    const storage = st(c);
    const { inviteId } = await c.req.json();
    if (!inviteId) return c.json({ message: "inviteId is required" }, 400);
    const invite = await storage.getInvite(inviteId);
    if (!invite) return c.json({ message: "Invite not found" }, 404);
    if (user.role === "ADMIN" && invite.companyId !== user.companyId) return c.json({ message: "Access denied" }, 403);
    if (invite.acceptedAt) return c.json({ message: "Cannot revoke an already accepted invite" }, 400);
    if (invite.revokedAt) return c.json({ message: "Invite is already revoked" }, 400);
    await storage.updateInvite(inviteId, { revokedAt: new Date(), revokedByUserId: user.userId });
    await storage.createAuditLog({ actorId: user.userId, companyId: invite.companyId, action: "INVITE_REVOKED", entity: "INVITE", entityId: inviteId });
    return c.json({ message: "Invite revoked" });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// POST /api/invites/accept — public, no auth
inviteRoutes.post("/invites/accept", async (c) => {
  try {
    const db = createDb(c.env);
    const storage = new DatabaseStorage(db);
    const parsed = acceptInviteSchema.parse(await c.req.json());
    const { token, password, firstName, lastName, phone } = parsed;
    const tokenHash = await hashToken(token);
    const invite = await storage.getInviteByTokenHash(tokenHash);
    if (!invite) return c.json({ message: "Invalid invite token. Please ask your admin for a new invite." }, 400);
    if (invite.acceptedAt) return c.json({ message: "This invite has already been used." }, 400);
    if (invite.revokedAt) return c.json({ message: "This invite has been revoked. Please ask your admin for a new invite." }, 400);
    if (new Date(invite.expiresAt) < new Date()) return c.json({ message: "This invite has expired. Please ask your admin for a new invite." }, 410);
    const existingUser = await storage.getUserByEmail(invite.email);
    let user;
    if (existingUser) {
      if (existingUser.companyId && existingUser.companyId !== invite.companyId) return c.json({ message: "This email is already associated with a different company." }, 400);
      await storage.updateUser(existingUser.id, { role: invite.role, companyId: invite.companyId });
      user = await storage.getUser(existingUser.id);
    } else {
      const passwordHash = await hashPassword(password);
      user = await storage.createUser({ email: invite.email, passwordHash, firstName: firstName || invite.email.split("@")[0], lastName: lastName || "", role: invite.role, companyId: invite.companyId });
    }
    if (!user) return c.json({ message: "Failed to create user" }, 500);
    if (invite.role === "DRIVER") {
      const existingProfile = await storage.getDriverProfile(user.id);
      if (!existingProfile) {
        const inviter = await storage.getUser(invite.createdByUserId);
        const autoAssign = inviter?.role === "DISPATCHER";
        await storage.createDriverProfile({ userId: user.id, phone: phone ?? null, ratePerMile: "0.5000", employmentType: "W2_COMPANY_DRIVER", status: "ACTIVE", ...(autoAssign ? { assignedDispatcherId: invite.createdByUserId, assignedAt: new Date(), assignedByUserId: invite.createdByUserId } : {}) });
      }
    }
    await storage.updateInvite(invite.id, { acceptedAt: new Date(), acceptedByUserId: user.id });
    await storage.createAuditLog({ actorId: user.id, companyId: invite.companyId, action: "INVITE_ACCEPTED", entity: "INVITE", entityId: invite.id });
    const accessToken = await generateAccessToken({ userId: user.id, role: user.role, companyId: user.companyId }, c.env.SESSION_SECRET);
    const rawRefresh = await createRefreshToken(db, user.id, false, getClientIp(c), c.req.header("User-Agent") ?? undefined);
    setCookie(c, "accessToken", accessToken, { httpOnly: true, sameSite: "Lax", secure: true, path: "/", maxAge: 900 });
    setCookie(c, "refreshToken", rawRefresh, { httpOnly: true, sameSite: "Lax", secure: true, path: "/", maxAge: 86400 });
    const profile = await storage.getDriverProfile(user.id);
    const company = user.companyId ? await storage.getCompany(user.companyId) : null;
    return c.json({ user: { ...user, passwordHash: undefined, profile, companyName: company?.name } });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});

// GET /api/invites/validate — public
inviteRoutes.get("/invites/validate", async (c) => {
  try {
    const storage = new DatabaseStorage(createDb(c.env));
    const token = c.req.query("token");
    if (!token) return c.json({ message: "Token is required" }, 400);
    const tokenHash = await hashToken(token);
    const invite = await storage.getInviteByTokenHash(tokenHash);
    if (!invite) return c.json({ message: "Invalid invite token. Please ask your admin for a new invite." }, 400);
    if (invite.acceptedAt) return c.json({ message: "This invite has already been used." }, 400);
    if (invite.revokedAt) return c.json({ message: "This invite has been revoked. Please ask your admin for a new invite." }, 400);
    if (new Date(invite.expiresAt) < new Date()) return c.json({ message: "This invite has expired. Please ask your admin for a new invite." }, 410);
    const company = await storage.getCompany(invite.companyId);
    return c.json({ email: invite.email, role: invite.role, companyName: company?.name ?? "Unknown Company", expiresAt: invite.expiresAt });
  } catch (err: any) { return c.json({ message: err.message }, 400); }
});
