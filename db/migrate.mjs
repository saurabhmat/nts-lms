// Production migration runner.
//
// `npm run db:migrate` uses drizzle-kit, and both drizzle-kit and tsx are devDependencies,
// so that command cannot run in a production image where devDependencies are pruned. This
// script uses only runtime dependencies (drizzle-orm + postgres) and plain node, so it works
// as a Coolify pre-deployment command.
//
// It reads the same `drizzle/` folder and writes the same `drizzle.__drizzle_migrations`
// journal as drizzle-kit, so the two stay in step and already-applied migrations are skipped.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Refusing to run migrations.");
  process.exit(1);
}

// max: 1 because migrations must run on a single connection, and the CLI exits straight
// after, so there is no pool to reuse.
const client = postgres(url, { max: 1, prepare: false });

try {
  console.log("Running migrations from ./drizzle ...");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations are up to date.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
