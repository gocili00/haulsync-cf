// db.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

export type Env = {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  GOOGLE_APPLICATION_CREDENTIALS_JSON: string;
  MAPBOX_TOKEN: string;
  BOL_BUCKET: R2Bucket;
  JOBS_KV: KVNamespace;
};

export function createDb(env: Pick<Env, "DATABASE_URL">) {
  const sql = neon(env.DATABASE_URL);
  return drizzle(sql);
}

export type Db = ReturnType<typeof createDb>;