/**
 * index.ts — Cloudflare Worker entry point
 *
 * Replaces: server/index.ts (Express + http.createServer — Node.js only)
 * Pattern:  Hono app with typed Env bindings. All routes mounted here.
 *           CORS, health check, and the CF Worker default export.
 */


import { profitabilityRoutes } from "./routes/profitability";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./db";
import { authRoutes } from "./routes/auth";
import { driverRoutes } from "./routes/drivers";
import { loadRoutes } from "./routes/loads";
import { payItemRoutes } from "./routes/pay-items";
import { payrollRoutes } from "./routes/payroll";
import { teamRoutes } from "./routes/team";
import { inviteRoutes } from "./routes/invites";
import { companyRoutes } from "./routes/company";
import { dashboardRoutes } from "./routes/dashboard";
import { superadminRoutes } from "./routes/superadmin";
import { authMiddleware } from "./middleware/auth";

const app = new Hono<{ Bindings: Env }>();

// ── CORS ───────────────────────────────────────────────────────────────────
// Allow CF Pages domain + localhost for dev. Credentials required for cookies.
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        "https://haulsync.pages.dev",
        "http://localhost:5173",
        "http://localhost:4173",
      ];
      // Allow any *.pages.dev preview URL too
      if (origin && (allowed.includes(origin) || origin.endsWith(".pages.dev"))) {
        return origin;
      }
      return allowed[0];
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);

// ── Health check ───────────────────────────────────────────────────────────
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    worker: "haulsync-worker",
    timestamp: new Date().toISOString(),
  });
});

// ── API routes ─────────────────────────────────────────────────────────────
app.route("/api/auth", authRoutes);
app.route("/api", driverRoutes);
app.route("/api", loadRoutes);
app.route("/api", payItemRoutes);
app.route("/api", payrollRoutes);
app.route("/api", teamRoutes);
app.route("/api", inviteRoutes);
app.route("/api", companyRoutes);
app.route("/api", dashboardRoutes);
app.route("/api", superadminRoutes);
app.route("/api", profitabilityRoutes);

// ── Serve BOL files from R2 ────────────────────────────────────────────────
app.get("/api/loads/bol/*", authMiddleware, async (c) => {
  const key = c.req.path.replace("/api/loads/bol/", "");
  const obj = await (c.env as any).BOL_BUCKET.get(key);
  if (!obj) return c.json({ message: "File not found" }, 404);
  const contentType = obj.httpMetadata?.contentType || "application/octet-stream";
  return new Response(obj.body, { headers: { "Content-Type": contentType } });
});

// ── 404 fallback ───────────────────────────────────────────────────────────
app.notFound((c) => c.json({ message: "Not found" }, 404));

// ── Error handler ──────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ message: "Internal server error" }, 500);
});

// ── CF Worker export ───────────────────────────────────────────────────────
export default app;
