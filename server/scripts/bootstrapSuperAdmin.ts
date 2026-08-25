import "dotenv/config";
import { hashPassword } from "../auth";
import { createLocalUser, getUserByUsername, updateLocalUser } from "../db";

async function main() {
  const username = process.env.BOOTSTRAP_SUPER_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_SUPER_ADMIN_NAME?.trim() || "Marasi Super Admin";
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim() || null;

  if (!username || username.length < 3) throw new Error("Set BOOTSTRAP_SUPER_ADMIN_USERNAME (minimum 3 characters)");
  if (!password || password.length < 12) throw new Error("Set BOOTSTRAP_SUPER_ADMIN_PASSWORD (minimum 12 characters)");

  const passwordHash = await hashPassword(password);
  const existing = await getUserByUsername(username);
  if (existing) {
    await updateLocalUser(existing.id, { name, email, role: "super_admin", passwordHash, mustChangePassword: true, isActive: true });
    console.log(`Updated ${username} as Super Admin. Remove the bootstrap environment variables now.`);
  } else {
    await createLocalUser({ username, passwordHash, name, email, role: "super_admin", mustChangePassword: true, isActive: true });
    console.log(`Created ${username} as Super Admin. Remove the bootstrap environment variables now.`);
  }
}

main().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
