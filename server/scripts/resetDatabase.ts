import mysql from "mysql2/promise";

// Recovery tool: drops every table in the target database. Only ever safe
// to run against a fresh, empty database — e.g. to clean up after a
// migration run failed partway through and left a partial schema behind.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const connection = await mysql.createConnection({ uri: connectionString });
  const [rows] = await connection.query("SHOW TABLES");
  const tables = (rows as Record<string, string>[]).map((row) => Object.values(row)[0]);

  if (tables.length) {
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of tables) {
      console.log(`drop  ${table}`);
      await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  }

  console.log(`Dropped ${tables.length} table(s). Database is now empty.`);
  await connection.end();
}

main().catch((error) => {
  console.error("Reset failed:", error);
  process.exit(1);
});
