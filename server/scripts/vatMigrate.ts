import "dotenv/config";
import { writeFileSync } from "node:fs";
import { getUserByUsername } from "../db";
import { applyVatMigration, planVatMigration, rollbackVatMigration } from "../vat";

// PRD Round 18, Section 8.4: migrate the existing revenue transactions to
// NET + VAT. Run it against a restored TEST COPY first (point DATABASE_URL at
// the copy), check the table, and only then against the live database.
//
//   pnpm vat:migrate                       dry run — changes nothing
//   pnpm vat:migrate --apply --i-have-a-backup --user <super admin username>
//   pnpm vat:migrate --rollback --reason "..." --user <super admin username>
//   add --out report.json to save the full result (every transaction)
//
// Apply writes only the new vatAmount / netAmount columns (the original
// amounts are never changed), re-reads every protected total and rolls
// itself back if any check fails.

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const money = (value: number) => value.toFixed(3).padStart(12);

function printDays(days: Array<{ date: string; transactions: number; gross: number; revenueBefore: number; vat: number; revenueAfter: number; stored: number; derived: number; none: number }>) {
  console.log(`${"Date".padEnd(12)}${"Txns".padStart(6)}${"Gross".padStart(12)}${"Rev before".padStart(12)}${"VAT".padStart(12)}${"Rev after".padStart(12)}  stored/derived/none`);
  const total = { transactions: 0, gross: 0, revenueBefore: 0, vat: 0, revenueAfter: 0, stored: 0, derived: 0, none: 0 };
  for (const day of days) {
    console.log(`${day.date.padEnd(12)}${String(day.transactions).padStart(6)}${money(day.gross)}${money(day.revenueBefore)}${money(day.vat)}${money(day.revenueAfter)}  ${day.stored}/${day.derived}/${day.none}`);
    for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] = Math.round((total[key] + day[key]) * 1000) / 1000;
  }
  console.log(`${"TOTAL".padEnd(12)}${String(total.transactions).padStart(6)}${money(total.gross)}${money(total.revenueBefore)}${money(total.vat)}${money(total.revenueAfter)}  ${total.stored}/${total.derived}/${total.none}`);
}

async function userId() {
  const username = option("--user");
  if (!username) throw new Error("Pass --user <super admin username> (recorded in the audit report)");
  const user = await getUserByUsername(username.toLowerCase());
  if (!user || user.role !== "super_admin") throw new Error(`${username} is not a Super Admin`);
  return user.id;
}

async function main() {
  const out = option("--out");
  if (flag("--rollback")) {
    const reason = option("--reason");
    if (!reason || reason.trim().length < 3) throw new Error("Pass --reason \"...\" for the rollback");
    const result = await rollbackVatMigration(await userId(), reason);
    console.log("Rolled back. Revenue before / after:", result.before.revenue, "/", result.after.revenue);
    if (out) writeFileSync(out, JSON.stringify(result, null, 2));
    return;
  }
  const plan = await planVatMigration();
  console.log(`VAT rate ${plan.settings.vatRatePercent}% · VAT from ${plan.settings.vatStartDate} · already applied: ${plan.active ? "YES" : "no"}`);
  console.log(`Transactions to convert: ${plan.pendingEntries} (stored VAT ${plan.cases.stored}, derived ${plan.cases.derived}, no VAT ${plan.cases.none}) · total VAT ${plan.totalVat.toFixed(3)}`);
  printDays(plan.days);
  console.log(`\nNET + VAT = GROSS on every transaction: ${plan.netPlusVatEqualsGross ? "yes" : `NO (${plan.lineCheckFailures.join(", ")})`}`);
  console.log(`Revenue now ${plan.before.revenue.toFixed(3)} → expected after ${plan.expected.revenue.toFixed(3)}`);
  console.log(`Protected totals (must not change): Cash ${plan.before.cashAccount.toFixed(3)}, Bank ${plan.before.bankAccount.toFixed(3)}, Cash Flow ${plan.before.cashFlowClosing.toFixed(3)}, Petty Cash ${plan.before.pettyCash.toFixed(3)}, Receivable ${plan.before.receivable.toFixed(3)}, Payable ${plan.before.payable.toFixed(3)}`);
  console.log(plan.vatNamedCategories.length
    ? `\nCategories named like VAT/tax (left untouched — VAT is never deducted for them again):\n${plan.vatNamedCategories.map((row) => `  ${row.kind} category "${row.name}": ${row.records} records, OMR ${row.total.toFixed(3)}`).join("\n")}`
    : "\nNo expense or revenue category is named like VAT/tax.");
  console.log(`\nItems carrying VAT now:\n${plan.items.map((item) => `  ${item.kind.padEnd(14)} ${item.applyVat ? `VAT ${item.vatPercent}%` : "no VAT   "}  ${item.name}${item.isActive ? "" : " (inactive)"}`).join("\n")}`);
  if (!flag("--apply")) {
    if (out) writeFileSync(out, JSON.stringify(plan, null, 2));
    console.log("\nDry run only — nothing was changed. Re-run with --apply --i-have-a-backup --user <name> to apply.");
    return;
  }
  if (!flag("--i-have-a-backup")) throw new Error("Take a full backup first, then add --i-have-a-backup");
  const result = await applyVatMigration(await userId(), true);
  console.log(`\n${result.applied ? "APPLIED" : "NOT APPLIED — a check failed and the change was rolled back"}`);
  for (const check of result.checks) console.log(`  ${check.passed ? "PASS" : "FAIL"}  ${check.name}: before ${check.before} · after ${check.after} · expected ${check.expected}`);
  if (out) writeFileSync(out, JSON.stringify(result, null, 2));
  if (!result.applied) process.exitCode = 2;
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
