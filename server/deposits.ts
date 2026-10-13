import { desc, eq, inArray } from "drizzle-orm";
import { facilityBookings, facilityDeposits, financeEntries, users } from "../drizzle/schema";
import { getDb } from "./db";
import { writeFinanceAudit } from "./financeControl";
import { minorToMoney, moneyToMinor } from "./ticketingRules";
import { refreshEntryVat } from "./vat";

// PRD Round 18, item 7.1: Security Deposit on a facility booking.
//
// A deposit is money held for the visitor — a liability, never revenue and
// never VAT. Receiving it raises the Cash or Bank Account (card = Bank);
// refunding it lowers the account it is refunded through (see
// listCashMovements). Only a deduction (or a forfeit) becomes income: one
// revenue entry referenceType "deposit_deduction", with no VAT, which the Cash
// Flow skips because its money was already counted when it was received.

export type DepositOutcome = "returned" | "returned_partial" | "forfeited";
// Deduction and forfeit are for the Manager, Admin, Super Admin and the
// Accountant ("staff"); recording and a full return for anyone handling
// bookings.
export const DEPOSIT_DEDUCTION_ROLES = ["manager", "admin", "super_admin", "staff"];

const dateOnly = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : null;

export async function listDeposits(filters: { bookingIds?: number[]; unsettledOnly?: boolean } = {}) {
  const db = await getDb(); if (!db) return [];
  const base = db.select({ deposit: facilityDeposits, createdByName: users.name }).from(facilityDeposits)
    .leftJoin(users, eq(facilityDeposits.createdBy, users.id)).orderBy(desc(facilityDeposits.id));
  const rows = await (filters.bookingIds?.length ? base.where(inArray(facilityDeposits.bookingId, filters.bookingIds)) : base);
  return rows
    .filter((row) => !filters.unsettledOnly || row.deposit.status === "held")
    .map((row) => ({ ...row.deposit, businessDate: dateOnly(row.deposit.businessDate), settledDate: dateOnly(row.deposit.settledDate), createdByName: row.createdByName }));
}

export async function getDeposit(id: number) {
  const db = await getDb(); if (!db) return null;
  const [row] = await db.select().from(facilityDeposits).where(eq(facilityDeposits.id, id)).limit(1);
  return row ?? null;
}

export async function recordDeposit(input: { bookingId: number; amount: string; paymentMethod: "cash" | "card"; businessDate: string; userId: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const [booking] = await db.select().from(facilityBookings).where(eq(facilityBookings.id, input.bookingId)).limit(1);
  if (!booking) throw new Error("Facility booking was not found");
  if (booking.status === "cancelled") throw new Error("This booking has been cancelled");
  if (!(moneyToMinor(input.amount) > 0)) throw new Error("Enter the deposit amount");
  if ((await listDeposits({ bookingIds: [input.bookingId] })).some((deposit) => deposit.status === "held")) throw new Error("This booking already has a deposit held — settle it first");
  await db.insert(facilityDeposits).values({ bookingId: input.bookingId, amount: input.amount, paymentMethod: input.paymentMethod, businessDate: input.businessDate as any, status: "held", createdBy: input.userId } as any);
  const [deposit] = await db.select().from(facilityDeposits).orderBy(desc(facilityDeposits.id)).limit(1);
  await writeFinanceAudit({
    action: "deposit_received", recordType: "facility_deposit", recordId: deposit!.id, reference: `${booking.facilityTypeName} #${booking.id}${booking.customerName ? ` — ${booking.customerName}` : ""}`,
    amount: input.amount, newValues: { bookingId: booking.id, amount: input.amount, paymentMethod: input.paymentMethod, status: "held" }, businessDate: input.businessDate, userId: input.userId,
  });
  return deposit!;
}

export async function settleDeposit(input: {
  depositId: number; outcome: DepositOutcome; deductionAmount?: string; deductionReason?: string; refundMethod?: "cash" | "card";
  businessDate: string; userId: number; userRole: string;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const deposit = await getDeposit(input.depositId);
  if (!deposit) throw new Error("Deposit was not found");
  if (deposit.status !== "held") throw new Error("This deposit has already been settled");
  if (input.outcome !== "returned" && !DEPOSIT_DEDUCTION_ROLES.includes(input.userRole)) throw new Error("Only a Manager, Admin or Accountant can deduct from or forfeit a deposit");
  const amountMinor = moneyToMinor(String(deposit.amount));
  const deductionMinor = input.outcome === "returned" ? 0 : input.outcome === "forfeited" ? amountMinor : moneyToMinor(input.deductionAmount || "0");
  if (input.outcome === "returned_partial" && !(deductionMinor > 0 && deductionMinor < amountMinor)) throw new Error("The deduction must be more than zero and less than the deposit");
  if (input.outcome !== "returned" && (input.deductionReason || "").trim().length < 3) throw new Error("Enter the reason for the deduction (e.g. late key, damage)");
  const refundMinor = amountMinor - deductionMinor;
  if (refundMinor > 0 && !input.refundMethod) throw new Error("Choose how the deposit is refunded (Cash or Card)");
  const [booking] = await db.select().from(facilityBookings).where(eq(facilityBookings.id, deposit.bookingId)).limit(1);
  const reference = `${booking?.facilityTypeName ?? "Booking"} #${deposit.bookingId}${booking?.customerName ? ` — ${booking.customerName}` : ""}`;

  let deductionFinanceEntryId: number | null = null;
  if (deductionMinor > 0) {
    await db.insert(financeEntries).values({
      date: input.businessDate as any, stream: "extras", type: "revenue", amount: minorToMoney(deductionMinor),
      description: `Deposit deduction — ${reference} — ${(input.deductionReason || "").trim()}`.slice(0, 256), referenceType: "deposit_deduction", referenceId: deposit.id, createdBy: input.userId,
    } as any);
    const [entry] = await db.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
    deductionFinanceEntryId = entry!.id;
    await refreshEntryVat([entry!.id]);
  }
  await db.update(facilityDeposits).set({
    status: input.outcome, refundAmount: minorToMoney(refundMinor), deductionAmount: minorToMoney(deductionMinor), deductionReason: input.outcome === "returned" ? null : (input.deductionReason || "").trim(),
    refundMethod: refundMinor > 0 ? input.refundMethod : null, settledDate: input.businessDate as any, settledAt: new Date(), settledBy: input.userId, deductionFinanceEntryId,
  } as any).where(eq(facilityDeposits.id, deposit.id));
  await writeFinanceAudit({
    action: input.outcome === "returned" ? "deposit_returned" : input.outcome === "returned_partial" ? "deposit_returned_partial" : "deposit_forfeited",
    recordType: "facility_deposit", recordId: deposit.id, reference, amount: deposit.amount,
    oldValues: { status: "held", amount: String(deposit.amount), paymentMethod: deposit.paymentMethod },
    newValues: { status: input.outcome, refundAmount: minorToMoney(refundMinor), refundMethod: refundMinor > 0 ? input.refundMethod : null, deductionAmount: minorToMoney(deductionMinor) },
    reason: input.deductionReason || null, businessDate: input.businessDate, userId: input.userId,
  });
  return (await getDeposit(deposit.id))!;
}
