import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@haulsync/shared";

export type Env = {
  DATABASE_URL: string;
  SESSION_SECRET: string;
  GOOGLE_APPLICATION_CREDENTIALS_JSON: string;
  MAPBOX_TOKEN: string;
  BOL_BUCKET: R2Bucket;
  JOBS_KV: KVNamespace;
};

export function createDb(env: Pick<Env, "DATABASE_URL">) {
  const client = postgres(env.DATABASE_URL, {
    prepare: false, // required for Supabase transaction pooler / Cloudflare Workers
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;