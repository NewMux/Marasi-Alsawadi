import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  expenseCategories, expenseRecords, guests, salesTicketSequences, salesTransactions,
} from "../drizzle/schema";
import { getDb } from "./db";
import { calculateOperationalNet, formatTicketNumber } from "./ticketingRules";

export type SalesTransactionDraft = {
  customerId: number;
  visitDate: string;
  department: "aqua_park" | "rooms" | "fnb" | "general";
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  paymentMethod: "cash" | "card" | "bank" | "mixed";
  notes?: string;
  issuedBy: number;
};

export async function searchCustomers(query?: string) {
  const db = await getDb(); if (!db) return [];
  const normalized = query?.trim();
  if (!normalized) return db.select().from(guests).orderBy(desc(guests.createdAt)).limit(100);
  const pattern = `%${normalized}%`;
  return db.select().from(guests)
    .where(or(sql`LOWER(${guests.fullName}) LIKE LOWER(${pattern})`, sql`${guests.phone} LIKE ${pattern}`))
    .orderBy(desc(guests.createdAt)).limit(100);
}

export async function createSalesTransaction(data: SalesTransactionDraft) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const ticketYear = Number(data.visitDate.slice(0, 4));
  if (!Number.isInteger(ticketYear) || ticketYear < 2000) throw new Error("A valid visit date is required");
  return db.transaction(async (tx) => {
    await tx.insert(salesTicketSequences).values({ ticketYear, lastSequence: 0 })
      .onDuplicateKeyUpdate({ set: { ticketYear } });
    await tx.update(salesTicketSequences)
      .set({ lastSequence: sql`${salesTicketSequences.lastSequence} + 1` })
      .where(eq(salesTicketSequences.ticketYear, ticketYear));
    const sequenceRow = await tx.select().from(salesTicketSequences)
      .where(eq(salesTicketSequences.ticketYear, ticketYear)).limit(1);
    const sequenceNumber = Number(sequenceRow[0]?.lastSequence ?? 0);
    const ticketNumber = formatTicketNumber(ticketYear, sequenceNumber);
    await tx.insert(salesTransactions).values({
      ...data, visitDate: data.visitDate as any, ticketYear, sequenceNumber, ticketNumber,
    } as any);
    const created = await tx.select().from(salesTransactions)
      .where(eq(salesTransactions.ticketNumber, ticketNumber)).limit(1);
    return created[0]!;
  });
}

export async function listSalesTransactions(from?: string, to?: string, customerQuery?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${salesTransactions.visitDate} >= ${from}`);
  if (to) conditions.push(sql`${salesTransactions.visitDate} <= ${to}`);
  if (customerQuery?.trim()) {
    const pattern = `%${customerQuery.trim()}%`;
    conditions.push(or(
      sql`LOWER(${guests.fullName}) LIKE LOWER(${pattern})`,
      sql`${guests.phone} LIKE ${pattern}`,
      sql`${salesTransactions.ticketNumber} LIKE ${pattern}`,
    ));
  }
  const base = db.select({ t: salesTransactions, c: guests })
    .from(salesTransactions).leftJoin(guests, eq(salesTransactions.customerId, guests.id))
    .orderBy(desc(salesTransactions.visitDate), desc(salesTransactions.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function listExpenseCategories(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(expenseCategories).orderBy(expenseCategories.name);
  return includeInactive ? base : base.where(eq(expenseCategories.isActive, true));
}

export async function getExpenseCategory(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(expenseCategories).where(eq(expenseCategories.id, id)).limit(1);
  return rows[0];
}

export async function createExpenseCategory(data: typeof expenseCategories.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(expenseCategories).values(data);
  const rows = await db.select().from(expenseCategories).orderBy(desc(expenseCategories.id)).limit(1);
  return rows[0]!;
}

export async function updateExpenseCategory(id: number, data: Partial<typeof expenseCategories.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(expenseCategories).set(data).where(eq(expenseCategories.id, id));
  return getExpenseCategory(id);
}

export async function deleteExpenseCategory(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
}

export async function listExpenseRecords(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${expenseRecords.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${expenseRecords.businessDate} <= ${to}`);
  const base = db.select().from(expenseRecords).orderBy(desc(expenseRecords.businessDate), desc(expenseRecords.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function createExpenseRecord(data: typeof expenseRecords.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(expenseRecords).values(data);
  const rows = await db.select().from(expenseRecords).orderBy(desc(expenseRecords.id)).limit(1);
  return rows[0]!;
}

export async function getExpenseRecord(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(expenseRecords).where(eq(expenseRecords.id, id)).limit(1);
  return rows[0];
}

export async function updateExpenseRecord(id: number, data: Partial<typeof expenseRecords.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(expenseRecords).set(data).where(eq(expenseRecords.id, id));
}

export async function deleteExpenseRecord(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(expenseRecords).where(eq(expenseRecords.id, id));
}

export async function getOperationalFinancialSummary(from: string, to: string) {
  const db = await getDb(); if (!db) return { revenue: 0, expenses: 0, net: 0 };
  const [sales] = await db.select({ total: sql<number>`COALESCE(SUM(${salesTransactions.totalAmount}), 0)` })
    .from(salesTransactions).where(sql`${salesTransactions.visitDate} >= ${from} AND ${salesTransactions.visitDate} <= ${to}`);
  const [expenses] = await db.select({ total: sql<number>`COALESCE(SUM(${expenseRecords.amount}), 0)` })
    .from(expenseRecords).where(sql`${expenseRecords.businessDate} >= ${from} AND ${expenseRecords.businessDate} <= ${to}`);
  const revenue = Number(sales?.total ?? 0);
  const expenseTotal = Number(expenses?.total ?? 0);
  return { revenue, expenses: expenseTotal, net: calculateOperationalNet(revenue, expenseTotal) };
}
