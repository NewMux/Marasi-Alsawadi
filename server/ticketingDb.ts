import { randomBytes } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  expenseAdjustments, expenseCategories, expenseRecords, guests, salesTicketSequences, salesTransactionLines, salesTransactions,
  serviceRateFees, serviceRates, ticketFeeDefinitions, ticketCheckIns, ticketNumberSequences, ticketDiscountTiers,
  ticketPurchases, ticketPurchaseLines, ticketPurchaseFees, financeEntries,
} from "../drizzle/schema";
import { getDb } from "./db";
import { calculateOperationalNet, calculatePrdPurchasePricing, decideGateEntry, formatPrdTicketNumber, formatTicketNumber, type PrdDiscountTierInput, type PrdTicketLineInput } from "./ticketingRules";

export type SalesTransactionDraft = {
  customerId: number;
  rateId?: number;
  visitDate: string;
  department: "aqua_park" | "rooms" | "fnb" | "general";
  quantity: number;
  unitPrice: string;
  baseSubtotal: string;
  feeTotal: string;
  totalAmount: string;
  lines: Array<typeof salesTransactionLines.$inferInsert>;
  paymentMethod: "cash" | "card" | "bank" | "mixed";
  notes?: string;
  issuedBy: number;
};

export async function listServiceRates(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(serviceRates).orderBy(serviceRates.department, serviceRates.name);
  return includeInactive ? base : base.where(eq(serviceRates.isActive, true));
}

export async function getServiceRate(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(serviceRates).where(eq(serviceRates.id, id)).limit(1);
  return rows[0];
}

export async function listPrdRates(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const predicate = and(eq(serviceRates.department, "aqua_park"), or(eq(serviceRates.ticketType, "waterpark"), eq(serviceRates.ticketType, "companion")));
  const query = db.select().from(serviceRates).where(predicate).orderBy(serviceRates.ticketType, serviceRates.name);
  return includeInactive ? db.select().from(serviceRates).where(predicate).orderBy(serviceRates.ticketType, serviceRates.name) : query;
}

export async function listTicketDiscountTiers(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const query = db.select().from(ticketDiscountTiers).orderBy(desc(ticketDiscountTiers.minTickets), ticketDiscountTiers.id);
  return includeInactive ? query : query.where(eq(ticketDiscountTiers.isActive, true));
}

export async function getTicketDiscountTier(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(ticketDiscountTiers).where(eq(ticketDiscountTiers.id, id)).limit(1);
  return rows[0];
}

export async function createTicketDiscountTier(data: typeof ticketDiscountTiers.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(ticketDiscountTiers).values(data);
  const rows = await db.select().from(ticketDiscountTiers).orderBy(desc(ticketDiscountTiers.id)).limit(1);
  return rows[0]!;
}

export async function updateTicketDiscountTier(id: number, data: Partial<typeof ticketDiscountTiers.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(ticketDiscountTiers).set(data).where(eq(ticketDiscountTiers.id, id));
  return getTicketDiscountTier(id);
}

export async function deleteTicketDiscountTier(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(ticketDiscountTiers).set({ isActive: false }).where(eq(ticketDiscountTiers.id, id));
  return { deactivated: true };
}

export async function createPrdTicketPurchase(data: {
  customerId: number;
  visitDate: string;
  lines: PrdTicketLineInput[];
  discountTiers: PrdDiscountTierInput[];
  fees: Array<{ id: number; name: string; code: string; calculationType: "fixed" | "percentage"; value: string; applicationBasis: "per_ticket" | "per_transaction"; displayOrder: number }>;
  paymentMethod: "cash" | "card" | "bank" | "mixed";
  notes?: string;
  issuedBy: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const pricing = calculatePrdPurchasePricing({ lines: data.lines, discountTiers: data.discountTiers, fees: data.fees });
  return db.transaction(async (tx) => {
    await tx.insert(ticketNumberSequences).values({ id: 1, lastNumber: 0 }).onDuplicateKeyUpdate({ set: { id: 1 } });
    await tx.update(ticketNumberSequences).set({ lastNumber: sql`${ticketNumberSequences.lastNumber} + ${data.lines.length}` }).where(eq(ticketNumberSequences.id, 1));
    const sequenceRows = await tx.select().from(ticketNumberSequences).where(eq(ticketNumberSequences.id, 1)).limit(1);
    const endNumber = Number(sequenceRows[0]?.lastNumber ?? 0);
    const startNumber = endNumber - data.lines.length + 1;
    await tx.insert(ticketPurchases).values({
      customerId: data.customerId, visitDate: data.visitDate as any, chargeableTicketCount: pricing.chargeableTicketCount,
      discountPercentage: pricing.discountPercentage, baseSubtotal: pricing.baseSubtotal, discountAmount: pricing.discountAmount,
      vatAmount: pricing.vatAmount, feeTotal: pricing.feeTotal, totalAmount: pricing.totalAmount,
      paymentMethod: data.paymentMethod, notes: data.notes || null, issuedBy: data.issuedBy,
    } as any);
    const purchaseRows = await tx.select().from(ticketPurchases).orderBy(desc(ticketPurchases.id)).limit(1);
    const purchase = purchaseRows[0]!;
    const lines = pricing.lines.map((line, index) => ({
      purchaseId: purchase.id, ticketNumber: formatPrdTicketNumber(startNumber + index),
      ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory, rateId: line.rateId, label: line.label,
      basePrice: line.basePrice, discountPercentage: line.discountPercentage, discountAmount: line.discountAmount,
      vatAmount: line.vatAmount, feeAmount: line.feeAmount, totalAmount: line.totalAmount,
    }));
    await tx.insert(ticketPurchaseLines).values(lines as any);
    if (pricing.fees.length) await tx.insert(ticketPurchaseFees).values(pricing.fees.map((fee) => ({ purchaseId: purchase.id, ...fee, amount: fee.amount })) as any);
    return { purchase, lines, fees: pricing.fees, pricing };
  });
}

export async function listPrdTicketPurchases(query?: string, from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${ticketPurchases.visitDate} >= ${from}`);
  if (to) conditions.push(sql`${ticketPurchases.visitDate} <= ${to}`);
  if (query?.trim()) {
    const pattern = `%${query.trim()}%`;
    conditions.push(or(sql`LOWER(${guests.fullName}) LIKE LOWER(${pattern})`, sql`${guests.phone} LIKE ${pattern}`, sql`${ticketPurchaseLines.ticketNumber} LIKE ${pattern}`));
  }
  const base = db.select({ purchase: ticketPurchases, customer: guests, line: ticketPurchaseLines }).from(ticketPurchases)
    .leftJoin(guests, eq(ticketPurchases.customerId, guests.id)).leftJoin(ticketPurchaseLines, eq(ticketPurchaseLines.purchaseId, ticketPurchases.id))
    .orderBy(desc(ticketPurchases.visitDate), desc(ticketPurchases.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function listPrdTicketLines(purchaseId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(ticketPurchaseLines).where(eq(ticketPurchaseLines.purchaseId, purchaseId)).orderBy(ticketPurchaseLines.id);
}

export async function createServiceRate(data: typeof serviceRates.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(serviceRates).values(data);
  const rows = await db.select().from(serviceRates).orderBy(desc(serviceRates.id)).limit(1);
  return rows[0]!;
}

export async function updateServiceRate(id: number, data: Partial<typeof serviceRates.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(serviceRates).set(data).where(eq(serviceRates.id, id));
  return getServiceRate(id);
}

export async function deleteServiceRate(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const linked = await db.select({ id: salesTransactions.id }).from(salesTransactions)
    .where(eq(salesTransactions.rateId, id)).limit(1);
  if (linked.length) {
    await db.update(serviceRates).set({ isActive: false }).where(eq(serviceRates.id, id));
    return { deactivated: true };
  }
  await db.delete(serviceRateFees).where(eq(serviceRateFees.rateId, id));
  await db.delete(serviceRates).where(eq(serviceRates.id, id));
  return { deactivated: false };
}

export async function listTicketFees(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(ticketFeeDefinitions).orderBy(ticketFeeDefinitions.displayOrder, ticketFeeDefinitions.name);
  return includeInactive ? base : base.where(eq(ticketFeeDefinitions.isActive, true));
}

export async function getTicketFee(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(ticketFeeDefinitions).where(eq(ticketFeeDefinitions.id, id)).limit(1);
  return rows[0];
}

export async function createTicketFee(data: typeof ticketFeeDefinitions.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(ticketFeeDefinitions).values(data);
  const rows = await db.select().from(ticketFeeDefinitions).orderBy(desc(ticketFeeDefinitions.id)).limit(1);
  return rows[0]!;
}

export async function updateTicketFee(id: number, data: Partial<typeof ticketFeeDefinitions.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(ticketFeeDefinitions).set(data).where(eq(ticketFeeDefinitions.id, id));
  return getTicketFee(id);
}

export async function deleteTicketFee(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const fee = await getTicketFee(id);
  if (!fee) return { deactivated: false };
  const linked = await db.select({ id: salesTransactionLines.id }).from(salesTransactionLines)
    .where(and(eq(salesTransactionLines.lineType, "fee"), eq(salesTransactionLines.code, fee.code))).limit(1);
  if (linked.length) {
    await db.update(ticketFeeDefinitions).set({ isActive: false }).where(eq(ticketFeeDefinitions.id, id));
    return { deactivated: true };
  }
  await db.delete(serviceRateFees).where(eq(serviceRateFees.feeId, id));
  await db.delete(ticketFeeDefinitions).where(eq(ticketFeeDefinitions.id, id));
  return { deactivated: false };
}

export async function listFeeAssignments() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(serviceRateFees).where(eq(serviceRateFees.isActive, true));
}

export async function replaceFeeAssignments(feeId: number, rateIds: number[]) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.transaction(async (tx) => {
    await tx.delete(serviceRateFees).where(eq(serviceRateFees.feeId, feeId));
    if (rateIds.length) await tx.insert(serviceRateFees).values(rateIds.map((rateId) => ({ feeId, rateId, isActive: true })));
  });
}

export async function listApplicableTicketFees(rateId: number) {
  const db = await getDb(); if (!db) return [];
  return db.selectDistinct({ fee: ticketFeeDefinitions }).from(ticketFeeDefinitions)
    .leftJoin(serviceRateFees, and(eq(serviceRateFees.feeId, ticketFeeDefinitions.id), eq(serviceRateFees.isActive, true)))
    .where(and(eq(ticketFeeDefinitions.isActive, true), or(eq(ticketFeeDefinitions.appliesGlobally, true), eq(serviceRateFees.rateId, rateId))))
    .orderBy(ticketFeeDefinitions.displayOrder, ticketFeeDefinitions.id)
    .then((rows) => rows.map((entry) => entry.fee));
}

export async function searchCustomers(query?: string, country?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions = [];
  const normalized = query?.trim();
  if (normalized) {
    const pattern = `%${normalized}%`;
    conditions.push(or(
      sql`LOWER(${guests.fullName}) LIKE LOWER(${pattern})`,
      sql`${guests.phone} LIKE ${pattern}`,
      sql`LOWER(${guests.email}) LIKE LOWER(${pattern})`,
    ));
  }
  const countryNormalized = country?.trim();
  if (countryNormalized) conditions.push(sql`LOWER(${guests.nationality}) LIKE LOWER(${`%${countryNormalized}%`})`);
  const base = db.select().from(guests);
  const filtered = conditions.length ? base.where(and(...conditions)) : base;
  return filtered.orderBy(desc(guests.createdAt)).limit(200);
}

export async function getCustomerById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
  return rows[0];
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
    const { lines, ...transactionData } = data;
    await tx.insert(salesTransactions).values({
      ...transactionData,
      visitDate: data.visitDate as any,
      ticketYear,
      sequenceNumber,
      ticketNumber,
      publicToken: randomBytes(32).toString("base64url"),
      status: "paid",
    } as any);
    const created = await tx.select().from(salesTransactions)
      .where(eq(salesTransactions.ticketNumber, ticketNumber)).limit(1);
    const ticket = created[0]!;
    if (lines.length) await tx.insert(salesTransactionLines).values(lines.map((line) => ({ ...line, transactionId: ticket.id })) as any);
    return ticket;
  });
}

export async function listSalesTransactionLines(transactionId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(salesTransactionLines).where(eq(salesTransactionLines.transactionId, transactionId)).orderBy(salesTransactionLines.sortOrder, salesTransactionLines.id);
}

export async function getSalesTransactionById(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select({ t: salesTransactions, c: guests, r: serviceRates })
    .from(salesTransactions)
    .leftJoin(guests, eq(salesTransactions.customerId, guests.id))
    .leftJoin(serviceRates, eq(salesTransactions.rateId, serviceRates.id))
    .where(eq(salesTransactions.id, id)).limit(1);
  return rows[0];
}

export async function getSalesTransactionByToken(publicToken: string) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select({ t: salesTransactions, c: guests, r: serviceRates })
    .from(salesTransactions)
    .leftJoin(guests, eq(salesTransactions.customerId, guests.id))
    .leftJoin(serviceRates, eq(salesTransactions.rateId, serviceRates.id))
    .where(eq(salesTransactions.publicToken, publicToken)).limit(1);
  return rows[0];
}

export async function recordTicketScan(input: {
  scannedValue: string;
  publicToken: string;
  scannedBy?: number;
  requestKey: string;
  today: string;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const rows = await tx.select({ t: salesTransactions, c: guests })
      .from(salesTransactions)
      .leftJoin(guests, eq(salesTransactions.customerId, guests.id))
      .where(eq(salesTransactions.publicToken, input.publicToken)).limit(1);
    const joined = rows[0];
    if (!joined) {
      await tx.insert(ticketCheckIns).values({
        ticketId: null,
        scannedBy: input.scannedBy ?? null,
        result: "denied",
        denialReason: "not_found",
        scannedValue: input.scannedValue,
        requestKey: input.requestKey,
      } as any);
      return { allowed: false, reason: "not_found" as const };
    }

    const decision = decideGateEntry(joined.t.status, String(joined.t.visitDate), input.today);

    if (decision.allowed) {
      const result: any = await tx.update(salesTransactions)
        .set({ status: "checked_in" })
        .where(and(eq(salesTransactions.id, joined.t.id), eq(salesTransactions.status, "paid")));
      const affectedRows = Number(result?.[0]?.affectedRows ?? result?.affectedRows ?? 0);
      if (affectedRows !== 1) {
        await tx.insert(ticketCheckIns).values({
          ticketId: joined.t.id, scannedBy: input.scannedBy ?? null, result: "denied",
          denialReason: "already_checked_in", scannedValue: input.scannedValue, requestKey: input.requestKey,
        });
        return { allowed: false, reason: "already_checked_in" as const, ticket: joined.t, customer: joined.c };
      }
    }

    await tx.insert(ticketCheckIns).values({
      ticketId: joined.t.id,
      scannedBy: input.scannedBy ?? null,
      result: decision.allowed ? "allowed" : "denied",
      denialReason: decision.allowed ? null : decision.reason,
      scannedValue: input.scannedValue,
      requestKey: input.requestKey,
    });
    return { ...decision, ticket: { ...joined.t, status: decision.allowed ? "checked_in" : joined.t.status }, customer: joined.c };
  });
}

export async function listRecentTicketScans(limit = 20) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(ticketCheckIns).orderBy(desc(ticketCheckIns.id)).limit(limit);
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
  const base = db.select({ t: salesTransactions, c: guests, r: serviceRates })
    .from(salesTransactions).leftJoin(guests, eq(salesTransactions.customerId, guests.id))
    .leftJoin(serviceRates, eq(salesTransactions.rateId, serviceRates.id))
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
  const linked = await db.select({ id: expenseRecords.id }).from(expenseRecords).where(eq(expenseRecords.categoryId, id)).limit(1);
  if (linked.length) {
    await db.update(expenseCategories).set({ isActive: false }).where(eq(expenseCategories.id, id));
    return { deactivated: true };
  }
  await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
  return { deactivated: false };
}

export async function listExpenseRecords(from?: string, to?: string, descriptionPrefix?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${expenseRecords.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${expenseRecords.businessDate} <= ${to}`);
  if (descriptionPrefix) conditions.push(sql`${expenseRecords.description} LIKE ${`${descriptionPrefix}%`}`);
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

// ─── Expense category adjustments (+/- and transfers) ──────────────────────
export async function listExpenseAdjustments(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${expenseAdjustments.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${expenseAdjustments.businessDate} <= ${to}`);
  const base = db.select().from(expenseAdjustments).orderBy(desc(expenseAdjustments.businessDate), desc(expenseAdjustments.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function createExpenseAdjustment(data: {
  businessDate: string; categoryId: number; categoryName: string; type: "add" | "deduct";
  amount: string; note?: string; createdBy: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(expenseAdjustments).values(data as any);
  const rows = await db.select().from(expenseAdjustments).orderBy(desc(expenseAdjustments.id)).limit(1);
  return rows[0]!;
}

// Balance = money added to the category, plus transfers in, minus money
// deducted, transfers out, and actual recorded expenses against it — i.e.
// what's left to spend in that category for the given period.
export async function getExpenseCategoryBalances(from?: string, to?: string) {
  const [categories, adjustments, expenses] = await Promise.all([
    listExpenseCategories(false),
    listExpenseAdjustments(from, to),
    listExpenseRecords(from, to),
  ]);
  return categories.map((category) => {
    const categoryAdjustments = adjustments.filter((entry) => entry.categoryId === category.id);
    const totalAdded = categoryAdjustments.filter((entry) => entry.type === "add").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalDeducted = categoryAdjustments.filter((entry) => entry.type === "deduct").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalTransferredIn = categoryAdjustments.filter((entry) => entry.type === "transfer_in").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalTransferredOut = categoryAdjustments.filter((entry) => entry.type === "transfer_out").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalExpenses = expenses.filter((entry) => entry.categoryId === category.id).reduce((sum, entry) => sum + Number(entry.amount), 0);
    const balance = totalAdded - totalDeducted + totalTransferredIn - totalTransferredOut - totalExpenses;
    return { categoryId: category.id, categoryName: category.name, categoryCode: category.code, totalAdded, totalDeducted, totalTransferredIn, totalTransferredOut, totalExpenses, balance };
  });
}

export async function createExpenseTransfer(data: {
  businessDate: string; fromCategoryId: number; fromCategoryName: string;
  toCategoryId: number; toCategoryName: string; amount: string; note?: string; createdBy: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    await tx.insert(expenseAdjustments).values({
      businessDate: data.businessDate, categoryId: data.fromCategoryId, categoryName: data.fromCategoryName,
      type: "transfer_out", amount: data.amount, relatedCategoryId: data.toCategoryId, relatedCategoryName: data.toCategoryName,
      note: data.note, createdBy: data.createdBy,
    } as any);
    await tx.insert(expenseAdjustments).values({
      businessDate: data.businessDate, categoryId: data.toCategoryId, categoryName: data.toCategoryName,
      type: "transfer_in", amount: data.amount, relatedCategoryId: data.fromCategoryId, relatedCategoryName: data.fromCategoryName,
      note: data.note, createdBy: data.createdBy,
    } as any);
    const rows = await tx.select().from(expenseAdjustments).orderBy(desc(expenseAdjustments.id)).limit(2);
    return rows;
  });
}

export async function getOperationalFinancialSummary(from: string, to: string) {
  const db = await getDb(); if (!db) return { revenue: 0, expenses: 0, net: 0 };
  const [revenueRows, expenseRows] = await Promise.all([
    db.select({ total: sql<number>`COALESCE(SUM(${financeEntries.amount}), 0)` }).from(financeEntries)
      .where(and(eq(financeEntries.type, "revenue"), sql`${financeEntries.date} >= ${from} AND ${financeEntries.date} <= ${to}`)),
    db.select({ total: sql<number>`COALESCE(SUM(${financeEntries.amount}), 0)` }).from(financeEntries)
      .where(and(eq(financeEntries.type, "expense"), sql`${financeEntries.date} >= ${from} AND ${financeEntries.date} <= ${to}`)),
  ]);
  const revenue = Number(revenueRows[0]?.total ?? 0);
  const expenseTotal = Number(expenseRows[0]?.total ?? 0);
  return { revenue, expenses: expenseTotal, net: calculateOperationalNet(revenue, expenseTotal) };
}
