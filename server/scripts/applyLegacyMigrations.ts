import { readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

// The repository's schema history predates drizzle-kit's own migration
// journal (drizzle/meta/_journal.json only knows about 0000_chubby_marrow).
// Migrations 0001-0008 are hand-written SQL files layered on top and were
// never wired into `pnpm db:push`. This script applies all of them, in
// order, against DATABASE_URL, tracking what's already been applied so it's
// safe to re-run (e.g. after a failure partway through).
const MIGRATION_FILES = [
  "drizzle/0000_chubby_marrow.sql",
  "drizzle/migrations/0001_add_hr_attendance_and_leave.sql",
  "drizzle/migrations/0002_add_settlement_and_petty_cash.sql",
  "drizzle/migrations/0003_add_ticketing_and_expense_management.sql",
  "drizzle/migrations/0004_add_service_rates.sql",
  "drizzle/migrations/0005_add_public_tickets_gate_scans_whatsapp.sql",
  "drizzle/migrations/0006_add_super_admin_auth_and_ticket_fee_lines.sql",
  "drizzle/migrations/0007_fix_reservation_omr_precision.sql",
  "drizzle/migrations/0008_add_prd_ticketing_model.sql",
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const connection = await mysql.createConnection({ uri: connectionString, multipleStatements: true });
  await connection.query(
    "CREATE TABLE IF NOT EXISTS `_schema_migrations` (`filename` VARCHAR(255) NOT NULL PRIMARY KEY, `applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );

  const [appliedRows] = await connection.query("SELECT filename FROM `_schema_migrations`");
  const applied = new Set((appliedRows as Array<{ filename: string }>).map((row) => row.filename));

  for (const relativePath of MIGRATION_FILES) {
    if (applied.has(relativePath)) {
      console.log(`skip  ${relativePath} (already applied)`);
      continue;
    }
    console.log(`apply ${relativePath} ...`);
    const raw = readFileSync(join(process.cwd(), relativePath), "utf8");
    // drizzle-kit's own generated files (e.g. 0000_chubby_marrow.sql) use
    // "--> statement-breakpoint" to mark statement boundaries for its own
    // migrator — it isn't valid SQL and must be stripped/split on, not
    // executed. Hand-written migrations don't contain this marker, so the
    // split is a no-op for them.
    const statements = raw.split(/--\>\s*statement-breakpoint/g).map((part) => part.trim()).filter(Boolean);
    for (const statement of statements) await connection.query(statement);
    await connection.query("INSERT INTO `_schema_migrations` (filename) VALUES (?)", [relativePath]);
    console.log(`done  ${relativePath}`);
  }

  await connection.end();
  console.log("All migrations applied.");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
