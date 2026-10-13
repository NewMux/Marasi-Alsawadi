import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  accountMovements, addonServices, expenseCategories, financeAuditLog, facilityBookingAddons, facilityBookings, facilityTypes, financeEntries, revenueCategories,
  revenueRecords, systemSettings, ticketPurchaseLines, ticketPurchases, ticketTypes, users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getAccountBalancesAsAt, getVatSettings, writeFinanceAudit } from "./financeControl";
import { businessToday, getCashFlowStatus, getOperationalFinancialSummary, getReceivablePayableAsAt, listPettyCashFundsWithBalances } from "./ticketingDb";
import { minorToMoney, moneyToMinor, netOfStoredVat, splitGrossVat } from "./ticketingRules";

// PRD Round 18, Section 8: Tax Account (VAT).
//
// The customer pays GROSS. Revenue is NET (gross minus VAT); the VAT part is
// owed to the tax authority (the Tax Account). Cash and Bank keep the gross.
// finance_entries.amount always stays the gross — the split lives in the
// additive vatAmount / netAmount columns, so the change can be reversed by
// clearing them.
//
// One rule decides the VAT of every revenue entry, for new sales and for the
// migration of the existing ones alike:
//   1. VAT stored on the sale (ticket purchase / facility booking / add-on)
//      → that VAT ("stored").
//   2. otherwise, if the item carries VAT (its own applyVat setting, or a
//      manual revenue whose category is linked to such an item)
//      → VAT = round(gross − gross / (1 + rate), 3) ("derived").
//   3. otherwise → VAT 0, net = gross ("none").
// Opening balances, security-deposit deductions and anything dated before the
// VAT start date never carry VAT.

export type VatSource = "stored" | "derived" | "none";
export type VatDecision = { entryId: number; date: string; type: string; reference: string; gross: string; vatAmount: string; netAmount: string; source: VatSource; note: string };
type FinanceEntryRow = typeof financeEntries.$inferSelect;

const dateOnly = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const toMinor = (value: unknown) => moneyToMinor(Math.abs(Number(value || 0)).toFixed(3)) * (Number(value || 0) < 0 ? -1 : 1);

export function vatTypeOf(referenceType: string | null | undefined) {
  if (referenceType === "prd_ticket_purchase") return "ticket";
  if (referenceType === "facility_booking") return "facility";
  if (referenceType === "facility_booking_addon") return "facility_addon";
  if (referenceType === "revenue_record") return "manual";
  if (referenceType === "deposit_deduction") return "deposit_deduction";
  return referenceType || "other";
}

// Everything the rule needs for a batch of entries, loaded in a few queries.
async function loadVatContext(entries: FinanceEntryRow[]) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const ids = (type: string) => Array.from(new Set(entries.filter((entry) => entry.referenceType === type && entry.referenceId).map((entry) => entry.referenceId!)));
  const purchaseIds = ids("prd_ticket_purchase");
  const bookingIds = Array.from(new Set([...ids("facility_booking"), ...ids("facility_booking_addon")]));
  const entryIds = entries.map((entry) => entry.id);
  const [purchases, lines, bookings, addons, records, ticketTypeRows, facilityTypeRows, addonServiceRows] = await Promise.all([
    purchaseIds.length ? db.select().from(ticketPurchases).where(inArray(ticketPurchases.id, purchaseIds)) : Promise.resolve([]),
    purchaseIds.length ? db.select().from(ticketPurchaseLines).where(inArray(ticketPurchaseLines.purchaseId, purchaseIds)) : Promise.resolve([]),
    bookingIds.length ? db.select().from(facilityBookings).where(inArray(facilityBookings.id, bookingIds)) : Promise.resolve([]),
    bookingIds.length ? db.select().from(facilityBookingAddons).where(inArray(facilityBookingAddons.bookingId, bookingIds)) : Promise.resolve([]),
    entryIds.length ? db.select().from(revenueRecords).where(inArray(revenueRecords.financeEntryId, entryIds)) : Promise.resolve([]),
    db.select({ id: ticketTypes.id, name: ticketTypes.name, applyVat: ticketTypes.applyVat, vatPercent: ticketTypes.vatPercent, revenueCategoryId: ticketTypes.revenueCategoryId }).from(ticketTypes),
    db.select({ id: facilityTypes.id, name: facilityTypes.name, applyVat: facilityTypes.applyVat, vatPercent: facilityTypes.vatPercent, revenueCategoryId: facilityTypes.revenueCategoryId }).from(facilityTypes),
    db.select({ id: addonServices.id, name: addonServices.name, applyVat: addonServices.applyVat, vatPercent: addonServices.vatPercent, revenueCategoryId: addonServices.revenueCategoryId }).from(addonServices),
  ]);
  const linesByPurchase = new Map<number, typeof lines>();
  for (const line of lines) linesByPurchase.set(line.purchaseId, [...(linesByPurchase.get(line.purchaseId) ?? []), line]);
  const addonsByBooking = new Map<number, typeof addons>();
  for (const addon of addons) addonsByBooking.set(addon.bookingId, [...(addonsByBooking.get(addon.bookingId) ?? []), addon]);
  // A revenue category "carries VAT" when a ticket type, facility type or
  // add-on service with VAT switched on posts its revenue to it.
  const vatItemByCategory = new Map<number, { name: string; vatPercent: string }>();
  for (const item of [...ticketTypeRows, ...facilityTypeRows, ...addonServiceRows]) {
    if (item.applyVat && item.revenueCategoryId && !vatItemByCategory.has(item.revenueCategoryId)) vatItemByCategory.set(item.revenueCategoryId, { name: item.name, vatPercent: String(item.vatPercent) });
  }
  return {
    purchaseById: new Map(purchases.map((row) => [row.id, row])), linesByPurchase,
    bookingById: new Map(bookings.map((row) => [row.id, row])), addonsByBooking,
    recordByEntry: new Map(records.map((row) => [row.financeEntryId!, row])),
    ticketTypeById: new Map(ticketTypeRows.map((row) => [row.id, row])),
    facilityTypeById: new Map(facilityTypeRows.map((row) => [row.id, row])),
    addonServiceById: new Map(addonServiceRows.map((row) => [row.id, row])),
    vatItemByCategory,
    // Add-on entries point at their booking, not the add-on line: each line
    // is matched once, by name and amount.
    usedAddonIds: new Set<number>(),
  };
}
type VatContext = Awaited<ReturnType<typeof loadVatContext>>;

function decideVat(entry: FinanceEntryRow, ctx: VatContext, settings: { vatRatePercent: string; vatStartDate: string }, includesVat?: boolean): VatDecision {
  const gross = Number(entry.amount || 0).toFixed(3);
  const date = dateOnly(entry.date);
  const type = vatTypeOf(entry.referenceType);
  const base = { entryId: entry.id, date, type, reference: entry.description || `${type} #${entry.referenceId ?? entry.id}`, gross };
  const none = (note: string): VatDecision => ({ ...base, vatAmount: "0.000", netAmount: gross, source: "none", note });
  const stored = (vat: unknown, note: string): VatDecision => ({ ...base, ...netOfStoredVat(gross, String(vat)), source: "stored", note });
  const derived = (rate: string, note: string): VatDecision => ({ ...base, ...splitGrossVat(gross, rate), source: "derived", note });
  if (entry.type !== "revenue") return none("not revenue");
  if (!(Number(gross) > 0)) return none("zero or negative amount");
  if (date < settings.vatStartDate) return none(`before the VAT start date (${settings.vatStartDate})`);
  if (String(entry.description || "").startsWith("Opening balance")) return none("opening balance");
  if (entry.referenceType === "deposit_deduction") return none("security deposit deduction — no VAT");

  if (entry.referenceType === "prd_ticket_purchase") {
    const purchase = entry.referenceId ? ctx.purchaseById.get(entry.referenceId) : undefined;
    if (purchase && Number(purchase.vatAmount) > 0) return stored(purchase.vatAmount, "VAT stored on the ticket purchase");
    const lines = entry.referenceId ? ctx.linesByPurchase.get(entry.referenceId) ?? [] : [];
    let vatMinor = 0;
    for (const line of lines) {
      const ticketType = line.ticketTypeId ? ctx.ticketTypeById.get(line.ticketTypeId) : undefined;
      if (ticketType?.applyVat) vatMinor += moneyToMinor(splitGrossVat(String(line.totalAmount), String(ticketType.vatPercent)).vatAmount);
    }
    if (vatMinor > 0) return { ...base, ...netOfStoredVat(gross, minorToMoney(vatMinor)), source: "derived", note: "ticket type carries VAT; derived per ticket line" };
    return none("ticket types without VAT");
  }

  if (entry.referenceType === "facility_booking") {
    const booking = entry.referenceId ? ctx.bookingById.get(entry.referenceId) : undefined;
    const addons = entry.referenceId ? ctx.addonsByBooking.get(entry.referenceId) ?? [] : [];
    if (booking) {
      const facilityVatMinor = toMinor(booking.vatAmount) - addons.reduce((sum, addon) => sum + toMinor(addon.vatAmount), 0);
      if (facilityVatMinor > 0) return stored(minorToMoney(facilityVatMinor), "VAT stored on the facility booking");
      const facility = ctx.facilityTypeById.get(booking.facilityTypeId);
      if (facility?.applyVat && Number(facility.vatPercent) > 0) return derived(String(facility.vatPercent), `facility type "${facility.name}" carries VAT`);
    }
    return none("facility type without VAT");
  }

  if (entry.referenceType === "facility_booking_addon") {
    const addons = entry.referenceId ? ctx.addonsByBooking.get(entry.referenceId) ?? [] : [];
    const grossMinor = toMinor(gross);
    const match = addons.find((addon) => !ctx.usedAddonIds.has(addon.id) && String(entry.description || "").endsWith(addon.addonServiceName) && toMinor(addon.amount) + toMinor(addon.vatAmount) === grossMinor)
      ?? addons.find((addon) => !ctx.usedAddonIds.has(addon.id) && toMinor(addon.amount) + toMinor(addon.vatAmount) === grossMinor);
    if (match) {
      ctx.usedAddonIds.add(match.id);
      if (Number(match.vatAmount) > 0) return stored(match.vatAmount, "VAT stored on the add-on line");
      const service = ctx.addonServiceById.get(match.addonServiceId);
      if (service?.applyVat && Number(service.vatPercent) > 0) return derived(String(service.vatPercent), `add-on "${service.name}" carries VAT`);
    }
    return none("add-on without VAT");
  }

  const record = ctx.recordByEntry.get(entry.id);
  if (record) {
    if (includesVat !== undefined) return includesVat ? derived(settings.vatRatePercent, "entered as including VAT") : none("entered as without VAT");
    const item = record.categoryId ? ctx.vatItemByCategory.get(record.categoryId) : undefined;
    if (item) return derived(item.vatPercent, `category linked to "${item.name}", which carries VAT`);
    return none("revenue category without VAT");
  }
  return none("no VAT item");
}

async function decideForEntries(entries: FinanceEntryRow[], overrides?: Map<number, boolean>) {
  const settings = await getVatSettings();
  const ctx = await loadVatContext(entries);
  const sorted = [...entries].sort((a, b) => a.id - b.id);
  return sorted.map((entry) => decideVat(entry, ctx, settings, overrides?.get(entry.id)));
}

async function writeDecisions(decisions: VatDecision[], appliedAt: Date) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  for (const decision of decisions) {
    await db.update(financeEntries).set({ vatAmount: decision.vatAmount, netAmount: decision.netAmount, vatSource: decision.source, vatAppliedAt: appliedAt } as any)
      .where(eq(financeEntries.id, decision.entryId));
  }
}

export async function isVatActive() {
  return (await getVatSettings()).vatActive;
}

// Called after a revenue entry is created or amended. A no-op until the
// migration has been applied, so new and old figures are never mixed.
export async function refreshEntryVat(entryIds: number[], includesVat?: boolean) {
  if (!entryIds.length || !(await isVatActive())) return [];
  const db = await getDb(); if (!db) return [];
  const entries = await db.select().from(financeEntries).where(inArray(financeEntries.id, entryIds));
  const overrides = includesVat === undefined ? undefined : new Map(entries.map((entry) => [entry.id, includesVat]));
  const decisions = await decideForEntries(entries, overrides);
  await writeDecisions(decisions, new Date());
  return decisions;
}

export async function refreshVatForReference(referenceTypes: string[], referenceId: number) {
  if (!(await isVatActive())) return [];
  const db = await getDb(); if (!db) return [];
  const entries = await db.select({ id: financeEntries.id }).from(financeEntries)
    .where(and(inArray(financeEntries.referenceType, referenceTypes), eq(financeEntries.referenceId, referenceId)));
  return refreshEntryVat(entries.map((entry) => entry.id));
}

// A manual revenue's existing choice (with / without VAT), kept on amend.
export async function entryIncludesVat(entryId: number | null | undefined) {
  if (!entryId) return undefined;
  const db = await getDb(); if (!db) return undefined;
  const [entry] = await db.select({ vatAmount: financeEntries.vatAmount, netAmount: financeEntries.netAmount }).from(financeEntries).where(eq(financeEntries.id, entryId)).limit(1);
  if (!entry || entry.netAmount === null) return undefined;
  return Number(entry.vatAmount || 0) > 0;
}

// Safety net: any revenue entry created by a path without its own hook is
// split the next time the Tax Account or a VAT report is read.
export async function syncPendingVat() {
  if (!(await isVatActive())) return 0;
  const db = await getDb(); if (!db) return 0;
  const pending = await db.select().from(financeEntries).where(and(eq(financeEntries.type, "revenue"), isNull(financeEntries.netAmount)));
  if (!pending.length) return 0;
  await writeDecisions(await decideForEntries(pending), new Date());
  return pending.length;
}

// Whether a revenue category carries VAT — the default of the "includes
// VAT" choice when recording manual revenue.
export async function revenueCategoryCarriesVat(categoryId: number) {
  const db = await getDb(); if (!db) return false;
  const [ticket, facility, addon] = await Promise.all([
    db.select({ id: ticketTypes.id }).from(ticketTypes).where(and(eq(ticketTypes.revenueCategoryId, categoryId), eq(ticketTypes.applyVat, true))).limit(1),
    db.select({ id: facilityTypes.id }).from(facilityTypes).where(and(eq(facilityTypes.revenueCategoryId, categoryId), eq(facilityTypes.applyVat, true))).limit(1),
    db.select({ id: addonServices.id }).from(addonServices).where(and(eq(addonServices.revenueCategoryId, categoryId), eq(addonServices.applyVat, true))).limit(1),
  ]);
  return Boolean(ticket[0] || facility[0] || addon[0]);
}

// ─── 8.5: tax periods ───────────────────────────────────────────────────────
// Three-month periods, the cycle starting in vatPeriodStartMonth (1 = Jan:
// calendar quarters). The first period starts on the VAT start date.
function addMonths(year: number, month: number, count: number) {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
const isoOf = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function vatPeriodFor(date: string, startMonth: number) {
  const [year, month] = date.split("-").map(Number);
  const offset = (((month - startMonth) % 3) + 3) % 3;
  const start = addMonths(year, month, -offset);
  const end = addMonths(start.year, start.month, 2);
  return { from: isoOf(start.year, start.month, 1), to: isoOf(end.year, end.month, lastDayOf(end.year, end.month)) };
}

export function listVatPeriodsBetween(vatStartDate: string, today: string, startMonth: number) {
  const periods: Array<{ from: string; to: string; label: string }> = [];
  if (today < vatStartDate) today = vatStartDate;
  let cursor = vatPeriodFor(vatStartDate, startMonth);
  for (let guard = 0; guard < 400 && cursor.from <= today; guard += 1) {
    const from = cursor.from < vatStartDate ? vatStartDate : cursor.from;
    periods.push({ from, to: cursor.to, label: `${from} – ${cursor.to}` });
    const [year, month] = cursor.to.split("-").map(Number);
    const next = addMonths(year, month, 1);
    cursor = vatPeriodFor(isoOf(next.year, next.month, 1), startMonth);
  }
  return periods.reverse();
}

export async function listVatPeriods() {
  const settings = await getVatSettings();
  const today = businessToday();
  return listVatPeriodsBetween(settings.vatStartDate, today, settings.vatPeriodStartMonth).map((period) => ({
    ...period, current: period.from <= today && today <= period.to, settled: Boolean(settings.vatSettledThrough && period.to <= settings.vatSettledThrough),
  }));
}

// ─── 8.3: Tax Account ───────────────────────────────────────────────────────
async function vatCollected(from?: string, to?: string) {
  const db = await getDb(); if (!db) return 0;
  const conditions: any[] = [eq(financeEntries.type, "revenue")];
  if (from) conditions.push(sql`${financeEntries.date} >= ${from}`);
  if (to) conditions.push(sql`${financeEntries.date} <= ${to}`);
  const [row] = await db.select({ total: sql<string>`COALESCE(SUM(${financeEntries.vatAmount}), 0)` }).from(financeEntries).where(and(...conditions));
  return round3(Number(row?.total || 0));
}
async function vatPaid(from?: string, to?: string) {
  const db = await getDb(); if (!db) return 0;
  const conditions: any[] = [eq(accountMovements.kind, "vat_payment")];
  if (from) conditions.push(sql`${accountMovements.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${accountMovements.businessDate} <= ${to}`);
  const [row] = await db.select({ total: sql<string>`COALESCE(SUM(${accountMovements.amount}), 0)` }).from(accountMovements).where(and(...conditions));
  return round3(Number(row?.total || 0));
}

// The Tax Account as it stood at the end of `asAt`: VAT collected, VAT paid
// to the authority, and the balance still owed (a payable, not the resort's
// own money).
export async function getTaxAccount(asAt: string, from?: string) {
  await syncPendingVat();
  const settings = await getVatSettings();
  const [collected, paid, periodCollected, periodPaid] = await Promise.all([vatCollected(undefined, asAt), vatPaid(undefined, asAt), from ? vatCollected(from, asAt) : Promise.resolve(null), from ? vatPaid(from, asAt) : Promise.resolve(null)]);
  return { asAt, collected, paid, balance: round3(collected - paid), periodCollected, periodPaid, active: settings.vatActive };
}

export async function listVatPayments(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [eq(accountMovements.kind, "vat_payment")];
  if (from) conditions.push(sql`${accountMovements.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${accountMovements.businessDate} <= ${to}`);
  const rows = await db.select({ movement: accountMovements, createdByName: users.name }).from(accountMovements)
    .leftJoin(users, eq(accountMovements.createdBy, users.id)).where(and(...conditions)).orderBy(desc(accountMovements.businessDate), desc(accountMovements.id));
  return rows.map((row) => ({ ...row.movement, businessDate: dateOnly(row.movement.businessDate), vatPeriodFrom: row.movement.vatPeriodFrom ? dateOnly(row.movement.vatPeriodFrom) : null, vatPeriodTo: row.movement.vatPeriodTo ? dateOnly(row.movement.vatPeriodTo) : null, createdByName: row.createdByName }));
}

// 8.5 / 8.6: the VAT report for a period — totals plus the clean
// transaction table (date, reference, type, net, VAT, gross) a future
// authority-format export can be built from.
export async function getVatReport(from: string, to: string) {
  await syncPendingVat();
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(financeEntries)
    .where(and(eq(financeEntries.type, "revenue"), sql`${financeEntries.date} >= ${from}`, sql`${financeEntries.date} <= ${to}`))
    .orderBy(financeEntries.date, financeEntries.id);
  const transactions = rows.map((entry) => {
    const gross = round3(Number(entry.amount || 0));
    const vat = round3(Number(entry.vatAmount || 0));
    return { id: entry.id, date: dateOnly(entry.date), reference: entry.description || "", type: vatTypeOf(entry.referenceType), referenceId: entry.referenceId, net: entry.netAmount === null ? gross : round3(Number(entry.netAmount)), vat, gross, source: entry.vatSource ?? null };
  });
  const totals = transactions.reduce((sum, row) => ({ net: round3(sum.net + row.net), vat: round3(sum.vat + row.vat), gross: round3(sum.gross + row.gross) }), { net: 0, vat: 0, gross: 0 });
  // VAT paid for this period: payments recorded against it, whatever day
  // they were made on.
  const payments = (await listVatPayments()).filter((payment) => payment.vatPeriodFrom ? payment.vatPeriodFrom <= to && (payment.vatPeriodTo ?? payment.vatPeriodFrom) >= from : payment.businessDate >= from && payment.businessDate <= to);
  const paid = round3(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const settings = await getVatSettings();
  return {
    from, to, active: settings.vatActive, settled: Boolean(settings.vatSettledThrough && to <= settings.vatSettledThrough),
    netSales: totals.net, vatCollected: totals.vat, grossSales: totals.gross, vatPaid: paid, balanceDue: round3(totals.vat - paid),
    transactions, payments,
  };
}

export async function recordVatPayment(input: { businessDate: string; fromAccount: "cash" | "bank"; amount: string; periodFrom: string; periodTo: string; reason: string; userId: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  if (!(Number(input.amount) > 0)) throw new Error("Enter the amount paid");
  const balances = await getAccountBalancesAsAt(input.businessDate);
  const available = balances[input.fromAccount];
  if (moneyToMinor(input.amount) > Math.round(available * 1000)) {
    throw new Error(`This would make the ${input.fromAccount === "cash" ? "Cash" : "Bank"} Account negative (balance on ${input.businessDate}: OMR ${available.toFixed(3)})`);
  }
  const before = await getTaxAccount(input.businessDate);
  await db.insert(accountMovements).values({
    kind: "vat_payment", businessDate: input.businessDate as any, fromAccount: input.fromAccount, amount: input.amount, reason: input.reason.trim() || "VAT payment",
    vatPeriodFrom: input.periodFrom as any, vatPeriodTo: input.periodTo as any, createdBy: input.userId,
  } as any);
  const [movement] = await db.select().from(accountMovements).orderBy(desc(accountMovements.id)).limit(1);
  await writeFinanceAudit({
    action: "vat_payment", recordType: "account_movement", recordId: movement!.id, reference: `VAT ${input.periodFrom} – ${input.periodTo} from ${input.fromAccount === "cash" ? "Cash" : "Bank"} Account`,
    amount: input.amount, oldValues: { taxAccountBalance: before.balance, [input.fromAccount]: available }, newValues: { taxAccountBalance: round3(before.balance - Number(input.amount)), [input.fromAccount]: round3(available - Number(input.amount)) },
    reason: input.reason, businessDate: input.businessDate, userId: input.userId,
  });
  return movement!;
}

// 8.7: mark every period up to `through` as settled — later changes to a
// transaction dated inside need an explicit confirmation. null reopens all.
export async function setVatSettledThrough(through: string | null, userId: number, reason?: string) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const before = await getVatSettings();
  await db.update(systemSettings).set({ vatSettledThrough: through as any }).where(eq(systemSettings.id, 1));
  await writeFinanceAudit({
    action: through ? "vat_period_settled" : "vat_period_reopened", recordType: "system_settings", recordId: 1, reference: through ? `VAT settled up to ${through}` : "VAT periods reopened",
    oldValues: { vatSettledThrough: before.vatSettledThrough }, newValues: { vatSettledThrough: through }, reason: reason || null, businessDate: through, userId,
  });
}

export async function updateVatSettings(input: { vatRatePercent: string; vatPeriodStartMonth: number }, userId: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const before = await getVatSettings();
  await db.update(systemSettings).set({ vatRatePercent: input.vatRatePercent, vatPeriodStartMonth: input.vatPeriodStartMonth }).where(eq(systemSettings.id, 1));
  await writeFinanceAudit({
    action: "vat_settings", recordType: "system_settings", recordId: 1, reference: "VAT settings",
    oldValues: { vatRatePercent: before.vatRatePercent, vatPeriodStartMonth: before.vatPeriodStartMonth }, newValues: input, userId,
  });
}

// ─── 8.4: migration of the existing transactions ────────────────────────────
// Dry run → apply → (rollback). The dry run changes nothing. Apply writes
// only the new VAT columns (never `amount`), then re-reads every protected
// total through the same functions the screens use; if any check fails it
// rolls itself back and reports the failure instead.

async function protectedTotals() {
  const [cashFlow, receivablePayable, pettyCash, revenue] = await Promise.all([
    getCashFlowStatus("1900-01-01", "2999-12-31"),
    getReceivablePayableAsAt("2999-12-31"),
    listPettyCashFundsWithBalances(),
    getOperationalFinancialSummary("1900-01-01", "2999-12-31"),
  ]);
  const db = await getDb();
  const [gross] = db ? await db.select({ total: sql<string>`COALESCE(SUM(${financeEntries.amount}), 0)`, count: sql<number>`COUNT(*)` }).from(financeEntries).where(eq(financeEntries.type, "revenue")) : [{ total: "0", count: 0 }];
  return {
    grossRevenue: round3(Number(gross?.total || 0)), revenueEntries: Number(gross?.count || 0), revenue: round3(revenue.revenue),
    cashFlowClosing: round3(cashFlow.closingBalance), cashAccount: round3(cashFlow.accounts.cash.closingBalance), bankAccount: round3(cashFlow.accounts.bank.closingBalance),
    pettyCash: round3((pettyCash as any[]).reduce((sum, fund) => sum + Number(fund.balance || 0), 0)),
    receivable: round3(receivablePayable.receivable.total), payable: round3(receivablePayable.payable.total),
  };
}
type ProtectedTotals = Awaited<ReturnType<typeof protectedTotals>>;

async function revenueByDay() {
  const db = await getDb(); if (!db) return new Map<string, number>();
  const rows = await db.select({ date: sql<string>`DATE_FORMAT(${financeEntries.date}, '%Y-%m-%d')`, total: sql<string>`COALESCE(SUM(COALESCE(${financeEntries.netAmount}, ${financeEntries.amount})), 0)` })
    .from(financeEntries).where(eq(financeEntries.type, "revenue")).groupBy(sql`DATE_FORMAT(${financeEntries.date}, '%Y-%m-%d')`);
  return new Map(rows.map((row) => [row.date, round3(Number(row.total || 0))]));
}

// 8.4: "check the expense categories for anything named like VAT". Listed
// only — the migration never touches expenses, so VAT is never removed twice.
async function vatNamedCategories() {
  const db = await getDb(); if (!db) return [];
  const like = (column: any) => sql`LOWER(${column}) LIKE '%vat%' OR LOWER(${column}) LIKE '%tax%' OR ${column} LIKE '%ضريبة%'`;
  const [expense, revenue] = await Promise.all([
    db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(like(expenseCategories.name)),
    db.select({ id: revenueCategories.id, name: revenueCategories.name }).from(revenueCategories).where(like(revenueCategories.name)),
  ]);
  const counts = async (kind: "expense" | "revenue", ids: number[]) => {
    if (!ids.length) return new Map<number, { count: number; total: number }>();
    const table = kind === "expense" ? sql.raw("expense_records") : sql.raw("revenue_records");
    const result: any = await db.execute(sql`SELECT categoryId, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS t FROM ${table} WHERE categoryId IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) GROUP BY categoryId`);
    const list = Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : [];
    return new Map<number, { count: number; total: number }>(list.map((row: any) => [Number(row.categoryId), { count: Number(row.c), total: round3(Number(row.t)) }]));
  };
  const [expenseCounts, revenueCounts] = await Promise.all([counts("expense", expense.map((row) => row.id)), counts("revenue", revenue.map((row) => row.id))]);
  return [
    ...expense.map((row) => ({ kind: "expense" as const, ...row, records: expenseCounts.get(row.id)?.count ?? 0, total: expenseCounts.get(row.id)?.total ?? 0 })),
    ...revenue.map((row) => ({ kind: "revenue" as const, ...row, records: revenueCounts.get(row.id)?.count ?? 0, total: revenueCounts.get(row.id)?.total ?? 0 })),
  ];
}

// Which items carry VAT, as configured right now (for the delivery notes and
// the dry-run screen).
export async function listVatItemConfiguration() {
  const db = await getDb(); if (!db) return [];
  const [tickets, facilities, addons] = await Promise.all([
    db.select({ name: ticketTypes.name, applyVat: ticketTypes.applyVat, vatPercent: ticketTypes.vatPercent, isActive: ticketTypes.isActive }).from(ticketTypes),
    db.select({ name: facilityTypes.name, applyVat: facilityTypes.applyVat, vatPercent: facilityTypes.vatPercent, isActive: facilityTypes.isActive }).from(facilityTypes),
    db.select({ name: addonServices.name, applyVat: addonServices.applyVat, vatPercent: addonServices.vatPercent, isActive: addonServices.isActive }).from(addonServices),
  ]);
  return [
    ...tickets.map((row) => ({ kind: "ticket_type", ...row, vatPercent: String(row.vatPercent) })),
    ...facilities.map((row) => ({ kind: "facility_type", ...row, vatPercent: String(row.vatPercent) })),
    ...addons.map((row) => ({ kind: "addon_service", ...row, vatPercent: String(row.vatPercent) })),
  ];
}

function buildDayTable(decisions: VatDecision[], revenueBefore: Map<string, number>) {
  const days = new Map<string, { date: string; transactions: number; gross: number; revenueBefore: number; vat: number; net: number; revenueAfter: number; stored: number; derived: number; none: number }>();
  for (const decision of decisions) {
    const day = days.get(decision.date) ?? { date: decision.date, transactions: 0, gross: 0, revenueBefore: revenueBefore.get(decision.date) ?? 0, vat: 0, net: 0, revenueAfter: 0, stored: 0, derived: 0, none: 0 };
    day.transactions += 1;
    day.gross = round3(day.gross + Number(decision.gross));
    day.vat = round3(day.vat + Number(decision.vatAmount));
    day.net = round3(day.net + Number(decision.netAmount));
    day[decision.source] += 1;
    days.set(decision.date, day);
  }
  return Array.from(days.values()).map((day) => ({ ...day, revenueAfter: round3(day.revenueBefore - day.vat) })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function planVatMigration() {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const settings = await getVatSettings();
  const entries = await db.select().from(financeEntries).where(and(eq(financeEntries.type, "revenue"), isNull(financeEntries.netAmount)));
  const decisions = await decideForEntries(entries);
  const [before, revenueBefore, vatCategories, items] = await Promise.all([protectedTotals(), revenueByDay(), vatNamedCategories(), listVatItemConfiguration()]);
  const days = buildDayTable(decisions, revenueBefore);
  const totalVat = round3(decisions.reduce((sum, decision) => sum + Number(decision.vatAmount), 0));
  const cases = { stored: decisions.filter((row) => row.source === "stored").length, derived: decisions.filter((row) => row.source === "derived").length, none: decisions.filter((row) => row.source === "none").length };
  const lineChecks = decisions.filter((decision) => toMinor(decision.netAmount) + toMinor(decision.vatAmount) !== toMinor(decision.gross) || Number(decision.vatAmount) < 0);
  return {
    active: settings.vatActive, settings: { vatRatePercent: settings.vatRatePercent, vatStartDate: settings.vatStartDate },
    pendingEntries: decisions.length, cases, totalVat, days, decisions, before,
    expected: { revenue: round3(before.revenue - totalVat) },
    netPlusVatEqualsGross: lineChecks.length === 0, lineCheckFailures: lineChecks.map((row) => row.entryId),
    vatNamedCategories: vatCategories, items,
  };
}

export type VatMigrationCheck = { name: string; before: number; after: number; expected: number; passed: boolean };

function compareTotals(before: ProtectedTotals, after: ProtectedTotals, totalVat: number, decisions: VatDecision[], storedDecisions: Array<{ id: number; amount: string; vatAmount: string | null; netAmount: string | null }>) {
  const same = (name: string, key: keyof ProtectedTotals): VatMigrationCheck => ({ name, before: before[key], after: after[key], expected: before[key], passed: Math.abs(before[key] - after[key]) < 0.0005 });
  const lineFailures = storedDecisions.filter((row) => row.netAmount === null || row.vatAmount === null || toMinor(row.netAmount) + toMinor(row.vatAmount) !== toMinor(row.amount));
  return [
    same("Total gross (all revenue transactions)", "grossRevenue"),
    same("Number of revenue transactions", "revenueEntries"),
    same("Cash Account", "cashAccount"),
    same("Bank Account", "bankAccount"),
    same("Cash Flow (closing balance)", "cashFlowClosing"),
    same("Petty Cash (all funds)", "pettyCash"),
    same("Account Receivable", "receivable"),
    same("Account Payable", "payable"),
    { name: "Revenue = previous revenue − total VAT", before: before.revenue, after: after.revenue, expected: round3(before.revenue - totalVat), passed: Math.abs(after.revenue - round3(before.revenue - totalVat)) < 0.0005 },
    { name: "NET + VAT = GROSS on every transaction", before: decisions.length, after: decisions.length - lineFailures.length, expected: decisions.length, passed: lineFailures.length === 0 },
  ];
}

export async function applyVatMigration(userId: number, confirmBackup: boolean) {
  if (!confirmBackup) throw new Error("Take and keep a full backup first, then confirm it");
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const settings = await getVatSettings();
  if (settings.vatActive) throw new Error("The VAT migration has already been applied");
  const plan = await planVatMigration();
  if (!plan.netPlusVatEqualsGross) throw new Error("The dry run found transactions where NET + VAT ≠ GROSS; nothing was applied");
  const before = plan.before;
  const appliedAt = new Date();
  await writeDecisions(plan.decisions, appliedAt);
  await db.update(systemSettings).set({ vatActivatedAt: appliedAt, vatActivatedBy: userId } as any).where(eq(systemSettings.id, 1));
  const after = await protectedTotals();
  const written = plan.decisions.length ? await db.select({ id: financeEntries.id, amount: financeEntries.amount, vatAmount: financeEntries.vatAmount, netAmount: financeEntries.netAmount }).from(financeEntries).where(inArray(financeEntries.id, plan.decisions.map((row) => row.entryId))) : [];
  const checks = compareTotals(before, after, plan.totalVat, plan.decisions, written.map((row) => ({ id: row.id, amount: String(row.amount), vatAmount: row.vatAmount === null ? null : String(row.vatAmount), netAmount: row.netAmount === null ? null : String(row.netAmount) })));
  const revenueAfter = await revenueByDay();
  const days = plan.days.map((day) => ({ ...day, revenueAfterActual: revenueAfter.get(day.date) ?? 0 }));
  const passed = checks.every((check) => check.passed) && days.every((day) => Math.abs(day.revenueAfterActual - day.revenueAfter) < 0.0005);
  const summary = { cases: plan.cases, totalVat: plan.totalVat, days, checks, before, after, vatNamedCategories: plan.vatNamedCategories };
  if (!passed) {
    await clearVatSplit();
    await writeFinanceAudit({ action: "vat_migration_rolled_back", recordType: "system_settings", recordId: 1, reference: "VAT migration failed a check — rolled back automatically", amount: plan.totalVat, newValues: summary, userId });
    return { applied: false, ...summary };
  }
  await writeFinanceAudit({ action: "vat_migration_applied", recordType: "system_settings", recordId: 1, reference: `VAT migration applied to ${plan.decisions.length} transactions`, amount: plan.totalVat, newValues: summary, userId });
  return { applied: true, ...summary };
}

async function clearVatSplit() {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(financeEntries).set({ vatAmount: null, netAmount: null, vatSource: null, vatAppliedAt: null } as any).where(sql`${financeEntries.netAmount} IS NOT NULL OR ${financeEntries.vatAmount} IS NOT NULL`);
  await db.update(systemSettings).set({ vatActivatedAt: null, vatActivatedBy: null } as any).where(eq(systemSettings.id, 1));
}

// 8.4 step 6: the original amounts were never changed, so rolling back is
// clearing the split — every report returns to the gross figures.
export async function rollbackVatMigration(userId: number, reason: string) {
  const before = await protectedTotals();
  const totalVat = await vatCollected();
  await clearVatSplit();
  const after = await protectedTotals();
  await writeFinanceAudit({ action: "vat_migration_rolled_back", recordType: "system_settings", recordId: 1, reference: "VAT migration rolled back", amount: totalVat, oldValues: before, newValues: after, reason, userId });
  return { before, after };
}

export async function getLastVatMigrationRun() {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.select().from(financeAuditLog).where(inArray(financeAuditLog.action, ["vat_migration_applied", "vat_migration_rolled_back"])).orderBy(desc(financeAuditLog.id)).limit(1);
  if (!row) return null;
  let summary: unknown = null;
  try { summary = row.newValues ? JSON.parse(row.newValues) : null; } catch { summary = null; }
  return { action: row.action, createdAt: row.createdAt, reference: row.reference, summary };
}
