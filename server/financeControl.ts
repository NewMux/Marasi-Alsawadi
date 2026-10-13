import { and, desc, eq, sql } from "drizzle-orm";
import {
  accountMovements, assetRecords, attachments, expenseRecords, facilityBookings, financeAuditLog, financeEntries, financeSettlements, pettyCashSpends, revenueRecords, systemSettings, ticketPurchases, users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { getCashFlowStatus } from "./ticketingDb";
import { minorToMoney, moneyToMinor } from "./ticketingRules";

// PRD Round 18, items 4.4 / 4.6: General Ledger corrections — amend, delete,
// payment-method change, Cash <-> Bank transfer and balance adjustment — all
// written to one append-only audit trail (finance_audit_log). Nothing in the
// app updates or deletes an audit row.

export type FinanceAuditAction =
  | "amend" | "delete" | "void_ticket_sale" | "void_facility_booking" | "payment_method_change"
  | "transfer" | "balance_adjustment" | "vat_payment" | "vat_period_settled"
  | "deposit_received" | "deposit_returned" | "deposit_returned_partial" | "deposit_forfeited";

export async function writeFinanceAudit(entry: {
  action: FinanceAuditAction; recordType: string; recordId?: number | null; reference?: string | null; amount?: string | number | null;
  oldValues?: unknown; newValues?: unknown; reason?: string | null; businessDate?: string | null; userId: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const json = (value: unknown) => value === undefined || value === null ? null : JSON.stringify(value, (_key, inner) => typeof inner === "bigint" ? inner.toString() : inner);
  await db.insert(financeAuditLog).values({
    action: entry.action, recordType: entry.recordType, recordId: entry.recordId ?? null, reference: entry.reference ? entry.reference.slice(0, 255) : null,
    amount: entry.amount === undefined || entry.amount === null ? null : Number(entry.amount).toFixed(3),
    oldValues: json(entry.oldValues), newValues: json(entry.newValues), reason: entry.reason?.trim() || null,
    businessDate: (entry.businessDate || null) as any, userId: entry.userId,
  });
}

export async function listFinanceAudit(filters: { from?: string; to?: string; userId?: number; action?: string }) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  // The range is on when the change was made, in the resort's day.
  if (filters.from) conditions.push(sql`DATE(CONVERT_TZ(${financeAuditLog.createdAt}, '+00:00', '+04:00')) >= ${filters.from}`);
  if (filters.to) conditions.push(sql`DATE(CONVERT_TZ(${financeAuditLog.createdAt}, '+00:00', '+04:00')) <= ${filters.to}`);
  if (filters.userId) conditions.push(eq(financeAuditLog.userId, filters.userId));
  if (filters.action) conditions.push(eq(financeAuditLog.action, filters.action));
  const base = db.select({ entry: financeAuditLog, userName: users.name }).from(financeAuditLog)
    .leftJoin(users, eq(financeAuditLog.userId, users.id))
    .orderBy(desc(financeAuditLog.createdAt), desc(financeAuditLog.id)).limit(2000);
  const rows = await (conditions.length ? base.where(and(...conditions)) : base);
  return rows.map((row) => ({ ...row.entry, userName: row.userName }));
}

// ─── VAT settings and settled periods (Section 8.1 / 8.7) ───────────────────
export async function getVatSettings() {
  const db = await getDb();
  const rows = db ? await db.select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1) : [];
  const row = rows[0];
  const dateOnly = (value: unknown) => value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : null;
  return {
    vatRatePercent: String(row?.vatRatePercent ?? "5.00"),
    vatPeriodStartMonth: Number(row?.vatPeriodStartMonth ?? 1),
    vatStartDate: dateOnly(row?.vatStartDate) ?? "2026-10-08",
    vatSettledThrough: dateOnly(row?.vatSettledThrough),
  };
}

export class SettledPeriodError extends Error {
  constructor(public settledThrough: string) {
    super(`This transaction is in a VAT period already settled (up to ${settledThrough}). Confirm to change it anyway.`);
  }
}

// PRD Round 18, item 8.7: a transaction dated inside a settled VAT period is
// never changed silently — the caller must confirm explicitly.
export async function assertNotInSettledPeriod(businessDate: string | null | undefined, confirmed: boolean | undefined) {
  if (!businessDate || confirmed) return;
  const { vatSettledThrough } = await getVatSettings();
  if (vatSettledThrough && businessDate <= vatSettledThrough) throw new SettledPeriodError(vatSettledThrough);
}

// ─── 4.6.1: payment method change ───────────────────────────────────────────
export type PaymentMethodTarget = "ticket" | "facility" | "revenue" | "expense" | "asset";
export type FullPaymentMethod = "cash" | "card" | "bank" | "mixed";

function dateOnlyOf(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
}

// Moves a transaction's money between the Cash and Bank accounts by
// correcting the method it was recorded with. Nothing else changes: the
// amount, revenue, VAT, petty cash, payable and receivable stay identical.
export async function changePaymentMethod(input: {
  target: PaymentMethodTarget; id: number; method: FullPaymentMethod;
  cashAmount?: string; cardAmount?: string; bankAmount?: string;
  reason: string; userId: number; confirmSettledPeriod?: boolean;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  if (input.reason.trim().length < 3) throw new Error("Enter a reason for the change");
  if (input.target === "ticket" || input.target === "facility") {
    const table = input.target === "ticket" ? ticketPurchases : facilityBookings;
    const [row] = await db.select().from(table as any).where(eq((table as any).id, input.id)).limit(1) as any[];
    if (!row) throw new Error("Transaction was not found");
    if (input.target === "ticket" && row.status === "refunded") throw new Error("This ticket purchase was returned");
    if (input.target === "facility" && row.status !== "confirmed") throw new Error("Only a paid booking has a payment method to correct");
    const businessDate = input.target === "ticket" ? dateOnlyOf(row.visitDate) : dateOnlyOf(row.paidAt ?? row.bookingDate);
    await assertNotInSettledPeriod(businessDate, input.confirmSettledPeriod);
    let split = { cashAmount: null as string | null, cardAmount: null as string | null, bankAmount: null as string | null };
    if (input.method === "mixed") {
      const parts = [input.cashAmount, input.cardAmount, input.bankAmount].map((value) => moneyToMinor(value || "0"));
      if (parts.some((part) => part < 0)) throw new Error("Mixed amounts cannot be negative");
      if (parts.reduce((sum, part) => sum + part, 0) !== moneyToMinor(String(row.totalAmount))) throw new Error("The cash, card and bank amounts must add up to the transaction total");
      split = { cashAmount: minorToMoney(parts[0]), cardAmount: minorToMoney(parts[1]), bankAmount: minorToMoney(parts[2]) };
    }
    const oldValues = { paymentMethod: row.paymentMethod, cashAmount: row.cashAmount, cardAmount: row.cardAmount, bankAmount: row.bankAmount };
    const newValues = { paymentMethod: input.method, ...split };
    await db.update(table as any).set(newValues as any).where(eq((table as any).id, input.id));
    await writeFinanceAudit({
      action: "payment_method_change", recordType: input.target === "ticket" ? "ticket_purchase" : "facility_booking", recordId: input.id,
      reference: input.target === "ticket" ? `Ticket purchase #${input.id}` : `${row.facilityTypeName} #${input.id}`,
      amount: row.totalAmount, oldValues, newValues, reason: input.reason, businessDate, userId: input.userId,
    });
    return { oldValues, newValues };
  }
  if (input.method === "mixed") throw new Error("A manual transaction is recorded against one account — choose Cash, Card or Bank");
  const table = input.target === "revenue" ? revenueRecords : input.target === "expense" ? expenseRecords : assetRecords;
  const [row] = await db.select().from(table as any).where(eq((table as any).id, input.id)).limit(1) as any[];
  if (!row) throw new Error("Transaction was not found");
  const businessDate = dateOnlyOf(row.businessDate);
  await assertNotInSettledPeriod(businessDate, input.confirmSettledPeriod);
  const oldValues = { paymentMethod: row.paymentMethod ?? (row.paymentAccount === "bank" ? "bank" : "cash"), paymentAccount: row.paymentAccount };
  const newValues = { paymentMethod: input.method, paymentAccount: input.method === "cash" ? "cash" : "bank" };
  await db.update(table as any).set(newValues as any).where(eq((table as any).id, input.id));
  await writeFinanceAudit({
    action: "payment_method_change", recordType: `${input.target}_record`, recordId: input.id, reference: row.description,
    amount: row.paidAmount ?? row.amount, oldValues, newValues, reason: input.reason, businessDate, userId: input.userId,
  });
  return { oldValues, newValues };
}

// ─── 4.6.2 / 4.6.3: transfers and balance adjustments ───────────────────────
export async function getAccountBalancesAsAt(date: string) {
  const status = await getCashFlowStatus("1900-01-01", date);
  return { cash: status.accounts.cash.closingBalance, bank: status.accounts.bank.closingBalance };
}

export const ADJUSTMENT_CATEGORIES = ["counting_difference", "bank_charges", "bank_interest", "other"] as const;

export async function createAccountTransfer(input: { businessDate: string; fromAccount: "cash" | "bank"; amount: string; reason: string; userId: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  if (input.reason.trim().length < 3) throw new Error("Enter a reason for the transfer");
  const toAccount = input.fromAccount === "cash" ? "bank" : "cash";
  const balances = await getAccountBalancesAsAt(input.businessDate);
  const available = balances[input.fromAccount];
  if (moneyToMinor(input.amount) > Math.round(available * 1000)) {
    throw new Error(`This would make the ${input.fromAccount === "cash" ? "Cash" : "Bank"} Account negative (balance on ${input.businessDate}: OMR ${available.toFixed(3)})`);
  }
  await db.insert(accountMovements).values({ kind: "transfer", businessDate: input.businessDate as any, fromAccount: input.fromAccount, toAccount, amount: input.amount, reason: input.reason.trim(), createdBy: input.userId });
  const [movement] = await db.select().from(accountMovements).orderBy(desc(accountMovements.id)).limit(1);
  await writeFinanceAudit({
    action: "transfer", recordType: "account_movement", recordId: movement!.id, reference: `${input.fromAccount === "cash" ? "Cash" : "Bank"} → ${toAccount === "cash" ? "Cash" : "Bank"}`,
    amount: input.amount, oldValues: balances, newValues: { cash: balances.cash + (toAccount === "cash" ? 1 : -1) * Number(input.amount), bank: balances.bank + (toAccount === "bank" ? 1 : -1) * Number(input.amount) },
    reason: input.reason, businessDate: input.businessDate, userId: input.userId,
  });
  return movement!;
}

export async function createAccountAdjustment(input: { businessDate: string; account: "cash" | "bank"; direction: "increase" | "decrease"; amount: string; category: string; reason: string; userId: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  if (input.reason.trim().length < 3) throw new Error("Enter a reason for the adjustment");
  const balances = await getAccountBalancesAsAt(input.businessDate);
  const previous = balances[input.account];
  const delta = (input.direction === "increase" ? 1 : -1) * Number(input.amount);
  await db.insert(accountMovements).values({ kind: "adjustment", businessDate: input.businessDate as any, account: input.account, direction: input.direction, category: input.category, amount: input.amount, reason: input.reason.trim(), createdBy: input.userId });
  const [movement] = await db.select().from(accountMovements).orderBy(desc(accountMovements.id)).limit(1);
  await writeFinanceAudit({
    action: "balance_adjustment", recordType: "account_movement", recordId: movement!.id,
    reference: `${input.account === "cash" ? "Cash" : "Bank"} Account — ${input.category.replace(/_/g, " ")}`, amount: input.amount,
    oldValues: { account: input.account, balance: previous }, newValues: { account: input.account, balance: Math.round((previous + delta) * 1000) / 1000, direction: input.direction, category: input.category },
    reason: input.reason, businessDate: input.businessDate, userId: input.userId,
  });
  return movement!;
}

export async function listAccountMovements(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${accountMovements.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${accountMovements.businessDate} <= ${to}`);
  const base = db.select({ movement: accountMovements, createdByName: users.name }).from(accountMovements)
    .leftJoin(users, eq(accountMovements.createdBy, users.id))
    .orderBy(desc(accountMovements.businessDate), desc(accountMovements.id));
  const rows = await (conditions.length ? base.where(and(...conditions)) : base);
  return rows.map((row) => ({ ...row.movement, businessDate: dateOnlyOf(row.movement.businessDate), createdByName: row.createdByName }));
}

// ─── 4.4: what a delete keeps ───────────────────────────────────────────────
// The complete original transaction — its record, finance entry, balance
// settlements, attachment metadata and any petty-cash spend behind it — is
// stored in the delete's audit row, so nothing about it is lost.
export async function snapshotLedgerRecord(kind: "expense" | "revenue" | "asset", record: any) {
  const db = await getDb(); if (!db) return { record };
  const [entry] = record.financeEntryId ? await db.select().from(financeEntries).where(eq(financeEntries.id, record.financeEntryId)).limit(1) : [];
  const settlements = await db.select().from(financeSettlements).where(and(eq(financeSettlements.recordType, kind), eq(financeSettlements.recordId, record.id)));
  const files = await db.select().from(attachments).where(and(eq(attachments.entryType, kind), eq(attachments.entryId, record.id)));
  const spends = kind === "expense" ? await db.select().from(pettyCashSpends).where(eq(pettyCashSpends.expenseRecordId, record.id)) : [];
  return { record, financeEntry: entry ?? null, settlements, attachments: files, pettyCashSpends: spends };
}

export async function findPettyCashSpendForExpense(expenseRecordId: number) {
  const db = await getDb(); if (!db) return undefined;
  const [spend] = await db.select().from(pettyCashSpends).where(eq(pettyCashSpends.expenseRecordId, expenseRecordId)).limit(1);
  return spend;
}
