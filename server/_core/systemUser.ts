import type { User } from "../../drizzle/schema";
import * as db from "../db";

// This deployment runs without a login wall — every request acts as a single,
// auto-provisioned system user so existing `ctx.user.id` foreign keys and
// protected/admin procedures keep working unchanged.
const SYSTEM_OPEN_ID = "local-system";

let cachedUser: User | null = null;

export async function getSystemUser(): Promise<User> {
  if (cachedUser) return cachedUser;

  let user = await db.getUserByOpenId(SYSTEM_OPEN_ID);
  if (!user) {
    await db.upsertUser({
      openId: SYSTEM_OPEN_ID,
      name: "Marasi Operations",
      role: "admin",
    });
    user = await db.getUserByOpenId(SYSTEM_OPEN_ID);
  }

  if (!user) throw new Error("Failed to provision the system user");
  cachedUser = user;
  return user;
}
