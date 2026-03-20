import { defineConfig } from "drizzle-kit";

/**
 * drizzle.config.ts — used ONLY by drizzle-kit CLI (schema push / generate).
 * NOT used at runtime by the Cloudflare Worker.
 *
 * drizzle-kit 0.31.x does NOT accept driver: "pg" — the driver field only
 * exists for special runtimes (D1, Expo, PGlite, etc.). Standard PostgreSQL
 * must omit the driver field entirely.
 *
 * The neon auto-detection problem is solved by running drizzle-kit from the
 * repo ROOT (not from packages/worker), so that hoisted `pg` is found first.
 * See root package.json db:push script and README for the exact command.
 *
 * URL to use: Supabase DIRECT connection, port 5432.
 * Found in: Supabase dashboard → Settings → Database → Connection string → URI
 * Format:  postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
 */

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is not set.\n" +
    "Run from the repo root:\n" +
    '  $env:DATABASE_URL="postgresql://postgres:PASS@db.REF.supabase.co:5432/postgres"\n' +
    "  npx drizzle-kit push --config packages/worker/drizzle.config.ts"
  );
}

export default defineConfig({
  out: "./packages/worker/migrations",
  schema: "./packages/shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  verbose: true,
  strict: false,
});
