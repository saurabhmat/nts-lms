import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

export function getDb() {
  return drizzle(postgres(databaseUrl ?? "", { prepare: false }), { schema });
}
