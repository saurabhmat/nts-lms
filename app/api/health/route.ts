import { sql } from "drizzle-orm";

import { getDb } from "@/db";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);

    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("[health] database check failed:", error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
