import "dotenv/config";
import { writeFileSync } from "node:fs";
import { verifyData } from "../dataVerification";

// PRD Round 18, Section 9: read-only verification of the live data.
//   pnpm verify:data                                   days 8, 9 and 10 Oct 2026
//   pnpm verify:data --days 2026-10-08,2026-10-09 --out verify.json

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };

async function main() {
  const result = await verifyData({ days: option("--days")?.split(",").map((day) => day.trim()).filter(Boolean) });
  console.log("Per day (revenue transactions):");
  for (const day of result.perDay) {
    console.log(`  ${day.date}: ${day.transactions} transactions · gross ${day.gross.toFixed(3)} · revenue ${day.revenue.toFixed(3)} · VAT ${day.vat.toFixed(3)} · expenses ${day.expenses.toFixed(3)}`);
    for (const type of day.byType) console.log(`      ${type.type}: ${type.count} · ${type.gross.toFixed(3)}`);
  }
  console.log("\nConsistency across screens:");
  for (const check of result.consistency) console.log(`  ${check.passed ? "PASS" : "FAIL"}  ${check.name}: ${check.a.toFixed(3)} / ${check.b.toFixed(3)}`);
  console.log("\nOrphaned records:");
  for (const check of result.orphans) console.log(`  ${check.count === 0 ? "none" : `${check.count} FOUND`}  ${check.name}${check.count ? ` — ${JSON.stringify(check.sample)}` : ""}`);
  console.log(`\n${result.passed ? "Everything is consistent." : "Something needs attention — report it before continuing."}`);
  const out = option("--out");
  if (out) writeFileSync(out, JSON.stringify(result, null, 2));
}

main().then(() => process.exit(0)).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
