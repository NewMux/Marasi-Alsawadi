import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { getCashFlowStatus, getOperationalFinancialSummary, listRevenueLedger } from "./ticketingDb";

// PRD Round 18, Section 9: read-only checks of the live data after the
// client removed his test transactions. Changes nothing.
//   1. The real days: transactions and gross per day.
//   2. The same totals agree across the screens that show them.
//   3. No orphaned records remain (a link pointing at something deleted).

const round3 = (value: number) => Math.round(value * 1000) / 1000;

async function rows<T = any>(query: ReturnType<typeof sql>): Promise<T[]> {
  const db = await getDb(); if (!db) return [];
  const result: any = await db.execute(query);
  return (Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result) as T[];
}

export async function verifyData(input: { days?: string[]; from?: string; to?: string } = {}) {
  const days = input.days?.length ? input.days : ["2026-10-08", "2026-10-09", "2026-10-10"];
  const from = input.from ?? "1900-01-01";
  const to = input.to ?? "2999-12-31";

  // 1. Per day: every revenue transaction, as the daily report counts them.
  const perDay = await Promise.all(days.map(async (day) => {
    const [summary, ledger, breakdown] = await Promise.all([
      getOperationalFinancialSummary(day, day),
      listRevenueLedger(day, day),
      rows<{ referenceType: string | null; c: number; gross: string }>(sql`SELECT referenceType, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS gross FROM finance_entries WHERE type = 'revenue' AND date = ${day} GROUP BY referenceType`),
    ]);
    return {
      date: day, transactions: ledger.length, gross: round3(summary.revenueGross), revenue: round3(summary.revenue), vat: round3(summary.vat), expenses: round3(summary.expenses),
      byType: breakdown.map((row) => ({ type: row.referenceType ?? "other", count: Number(row.c), gross: round3(Number(row.gross)) })),
    };
  }));

  // 2. Consistency across screens for the whole range.
  const [summary, ledger, cashFlow, streams] = await Promise.all([
    getOperationalFinancialSummary(from, to),
    listRevenueLedger(from === "1900-01-01" ? undefined : from, to === "2999-12-31" ? undefined : to),
    getCashFlowStatus(from, to),
    rows<{ total: string }>(sql`SELECT COALESCE(SUM(COALESCE(netAmount, amount)), 0) AS total FROM finance_entries WHERE type = 'revenue' AND date BETWEEN ${from} AND ${to}`),
  ]);
  const ledgerNet = round3(ledger.reduce((sum, row) => sum + Number(row.netAmount ?? row.amount), 0));
  const accountsTotal = round3(cashFlow.accounts.cash.closingBalance + cashFlow.accounts.bank.closingBalance);
  const consistency = [
    { name: "Command Centre / Finance Control revenue = General Ledger revenue total", a: round3(summary.revenue), b: ledgerNet },
    { name: "Finance Reports revenue (by stream) = Command Centre revenue", a: round3(Number(streams[0]?.total || 0)), b: round3(summary.revenue) },
    { name: "Cash Account + Bank Account = Cash Flow closing balance", a: accountsTotal, b: round3(cashFlow.closingBalance) },
  ].map((check) => ({ ...check, passed: Math.abs(check.a - check.b) < 0.0005 }));

  // 3. Orphans: links that point at a record that no longer exists, or a
  // sale whose revenue entry is missing / left behind.
  const orphanQueries: Array<{ name: string; query: ReturnType<typeof sql> }> = [
    { name: "Ticket revenue entries whose purchase is missing or refunded", query: sql`SELECT fe.id, fe.date, fe.amount FROM finance_entries fe LEFT JOIN ticket_purchases tp ON tp.id = fe.referenceId WHERE fe.referenceType = 'prd_ticket_purchase' AND (tp.id IS NULL OR tp.status <> 'issued')` },
    { name: "Issued ticket purchases with no revenue entry", query: sql`SELECT tp.id, tp.visitDate AS date, tp.totalAmount AS amount FROM ticket_purchases tp WHERE tp.status = 'issued' AND NOT EXISTS (SELECT 1 FROM finance_entries fe WHERE fe.referenceType = 'prd_ticket_purchase' AND fe.referenceId = tp.id)` },
    { name: "Facility revenue entries whose booking is missing, cancelled or unpaid", query: sql`SELECT fe.id, fe.date, fe.amount FROM finance_entries fe LEFT JOIN facility_bookings fb ON fb.id = fe.referenceId WHERE fe.referenceType IN ('facility_booking', 'facility_booking_addon') AND (fb.id IS NULL OR fb.status <> 'confirmed')` },
    { name: "Paid facility bookings with no revenue entry", query: sql`SELECT fb.id, fb.bookingDate AS date, fb.totalAmount AS amount FROM facility_bookings fb WHERE fb.status = 'confirmed' AND NOT EXISTS (SELECT 1 FROM finance_entries fe WHERE fe.referenceType = 'facility_booking' AND fe.referenceId = fb.id)` },
    { name: "Revenue records linked to a missing finance entry", query: sql`SELECT rr.id, rr.businessDate AS date, rr.amount FROM revenue_records rr WHERE rr.financeEntryId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM finance_entries fe WHERE fe.id = rr.financeEntryId)` },
    { name: "Manual revenue entries with no revenue record", query: sql`SELECT fe.id, fe.date, fe.amount FROM finance_entries fe WHERE fe.referenceType = 'revenue_record' AND NOT EXISTS (SELECT 1 FROM revenue_records rr WHERE rr.financeEntryId = fe.id)` },
    { name: "Expense records linked to a missing finance entry", query: sql`SELECT er.id, er.businessDate AS date, er.amount FROM expense_records er WHERE er.financeEntryId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM finance_entries fe WHERE fe.id = er.financeEntryId)` },
    { name: "Expense finance entries with no expense record", query: sql`SELECT fe.id, fe.date, fe.amount FROM finance_entries fe WHERE fe.type = 'expense' AND NOT EXISTS (SELECT 1 FROM expense_records er WHERE er.financeEntryId = fe.id)` },
    { name: "Petty cash entries linked to a deleted expense", query: sql`SELECT ps.id, ps.businessDate AS date, ps.amount FROM petty_cash_spends ps WHERE ps.expenseRecordId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM expense_records er WHERE er.id = ps.expenseRecordId)` },
    { name: "Balance payments (settlements) for a deleted transaction", query: sql`SELECT fs.id, fs.settlementDate AS date, fs.amount FROM finance_settlements fs WHERE (fs.recordType = 'revenue' AND NOT EXISTS (SELECT 1 FROM revenue_records r WHERE r.id = fs.recordId)) OR (fs.recordType = 'expense' AND NOT EXISTS (SELECT 1 FROM expense_records e WHERE e.id = fs.recordId)) OR (fs.recordType = 'asset' AND NOT EXISTS (SELECT 1 FROM asset_records a WHERE a.id = fs.recordId))` },
    { name: "Attachments of a deleted transaction", query: sql`SELECT at.id, at.createdAt AS date, NULL AS amount FROM attachments at WHERE (at.entryType = 'revenue' AND NOT EXISTS (SELECT 1 FROM revenue_records r WHERE r.id = at.entryId)) OR (at.entryType = 'expense' AND NOT EXISTS (SELECT 1 FROM expense_records e WHERE e.id = at.entryId)) OR (at.entryType = 'asset' AND NOT EXISTS (SELECT 1 FROM asset_records a WHERE a.id = at.entryId))` },
    { name: "Facility add-on lines of a deleted booking", query: sql`SELECT fa.id, NULL AS date, fa.amount FROM facility_booking_addons fa WHERE NOT EXISTS (SELECT 1 FROM facility_bookings fb WHERE fb.id = fa.bookingId)` },
    { name: "Security deposits of a deleted booking", query: sql`SELECT d.id, d.businessDate AS date, d.amount FROM facility_deposits d WHERE NOT EXISTS (SELECT 1 FROM facility_bookings fb WHERE fb.id = d.bookingId)` },
    { name: "Ticket lines of a deleted purchase", query: sql`SELECT l.id, NULL AS date, l.totalAmount AS amount FROM ticket_purchase_lines l WHERE NOT EXISTS (SELECT 1 FROM ticket_purchases tp WHERE tp.id = l.purchaseId)` },
  ];
  const orphans = await Promise.all(orphanQueries.map(async ({ name, query }) => {
    const found = await rows<{ id: number; date: unknown; amount: unknown }>(query).catch((error: Error) => [{ id: -1, date: null, amount: error.message }]);
    return { name, count: found.length, sample: found.slice(0, 10).map((row) => ({ id: Number(row.id), date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date ? String(row.date).slice(0, 10) : null, amount: row.amount === null || row.amount === undefined ? null : String(row.amount) })) };
  }));

  const passed = consistency.every((check) => check.passed) && orphans.every((check) => check.count === 0);
  return { generatedAt: new Date().toISOString(), range: { from, to }, perDay, consistency, orphans, passed };
}
