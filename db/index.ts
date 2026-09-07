import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// Lazily create the connection pool once and reuse it. Each call used to open a brand
// new pool, and with more lib modules calling getDb() repeatedly this was exhausting
// Postgres's connection limit. Lazy (not module-load-time) so the env var is read after
// whatever loads it (Next.js, or an explicit dotenv call) has run, not at import time.
let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (!client) {
    client = postgres(process.env.DATABASE_URL ?? "", { prepare: false });
  }
  return drizzle(client, { schema });
}
