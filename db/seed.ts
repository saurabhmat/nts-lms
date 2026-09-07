import { eq } from "drizzle-orm";

import { auth } from "../lib/auth";
import { getDb } from "./index";
import { authUsers } from "./schema";

async function main() {
  const email = process.env.SEED_MASTER_EMAIL ?? "admin@ntslms.test";
  const password = process.env.SEED_MASTER_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_MASTER_NAME ?? "NTS Master Admin";

  const db = getDb();
  const [existing] = await db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);

  if (existing) {
    if (existing.role !== "master") {
      await db.update(authUsers).set({ role: "master" }).where(eq(authUsers.id, existing.id));
      console.log(`Promoted existing user ${email} to master.`);
    } else {
      console.log(`Master user ${email} already exists.`);
    }
    return;
  }

  await auth.api.signUpEmail({ body: { email, password, name } });
  await db.update(authUsers).set({ role: "master" }).where(eq(authUsers.email, email));

  console.log(`Created master user:\n  email: ${email}\n  password: ${password}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
