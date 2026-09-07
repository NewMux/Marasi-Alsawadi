import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  addonServices, assetAdjustments, assetCategories, assetRecords, expenseAdjustments, expenseCategories, expenseRecords, facilityBookingAddons, facilityBookings, facilityTypes, guests, partnerEntities, partnerDiscountRules, pettyCashFunds, pettyCashSpends, revenueAdjustments, revenueCategories, revenueRecords, salesTicketSequences, salesTransactionLines, salesTransactions,
  serviceRateFees, serviceRates, ticketFeeDefinitions, ticketCheckIns, ticketNumberSequences, ticketDiscountTiers,
  ticketPurchases, ticketPurchaseLines, ticketPurchaseFees, financeEntries, users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { calculateOperationalNet, calculatePrdPurchasePricing, decideGateEntry, formatPrdTicketNumber, formatTicketNumber, minorToMoney, moneyToMinor, type PrdDiscountTierInput, type PrdTicketLineInput } from "./ticketingRules";

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

// PRD Round 3, bug 1.1: the Ticket Desk resolves "the" Waterpark/Companion
// rate by picking the first active row of that ticketType (see
// resolveRateId in TicketDeskPage.tsx) — a second active rate with the same
// ticketType silently wins if it sorts first alphabetically, which is
// exactly how a misconfigured "Events Hall" base price (created with
// ticketType left at its Waterpark default) hijacked every ticket's price.
// This finds any other active conflicting rate so create/update can refuse
// to allow a second one to coexist.
export async function findConflictingActivePrdRate(ticketType: "waterpark" | "companion", excludeId?: number) {
  const db = await getDb(); if (!db) return undefined;
  const conditions = [eq(serviceRates.department, "aqua_park"), eq(serviceRates.ticketType, ticketType), eq(serviceRates.isActive, true)];
  if (excludeId) conditions.push(sql`${serviceRates.id} != ${excludeId}`);
  const rows = await db.select().from(serviceRates).where(and(...conditions)).limit(1);
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
  overrideDiscountByTicketType?: Partial<Record<"waterpark" | "companion", string>>;
  partnerEntity?: { id: number; name: string } | null;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const pricing = calculatePrdPurchasePricing({ lines: data.lines, discountTiers: data.discountTiers, fees: data.fees, overrideDiscountByTicketType: data.overrideDiscountByTicketType });
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
      partnerEntityId: data.partnerEntity?.id ?? null, partnerEntityName: data.partnerEntity?.name ?? null,
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

export async function getPrdTicketPurchase(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(ticketPurchases).where(eq(ticketPurchases.id, id)).limit(1);
  return rows[0];
}

export async function refundPrdTicketPurchase(id: number, refundedBy: number, refundReason?: string) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const existing = await getPrdTicketPurchase(id);
  if (!existing) throw new Error("Ticket purchase was not found");
  if (existing.status === "refunded") throw new Error("This purchase has already been returned");
  await db.update(ticketPurchases).set({ status: "refunded", refundedAt: new Date(), refundedBy, refundReason: refundReason || null } as any).where(eq(ticketPurchases.id, id));
  return getPrdTicketPurchase(id);
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

export async function getCustomerByPhone(phone: string) {
  const db = await getDb(); if (!db) return undefined;
  const normalized = phone.trim();
  if (!normalized) return undefined;
  const rows = await db.select().from(guests).where(eq(guests.phone, normalized)).limit(1);
  return rows[0];
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

export async function getExpenseCategoryByCode(code: string) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(expenseCategories).where(eq(expenseCategories.code, code)).limit(1);
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

export async function listPartnerEntities(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(partnerEntities).orderBy(partnerEntities.name);
  return includeInactive ? base : base.where(eq(partnerEntities.isActive, true));
}

export async function getPartnerEntity(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(partnerEntities).where(eq(partnerEntities.id, id)).limit(1);
  return rows[0];
}

export async function createPartnerEntity(data: typeof partnerEntities.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(partnerEntities).values(data);
  const rows = await db.select().from(partnerEntities).orderBy(desc(partnerEntities.id)).limit(1);
  return rows[0]!;
}

export async function updatePartnerEntity(id: number, data: Partial<typeof partnerEntities.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(partnerEntities).set(data).where(eq(partnerEntities.id, id));
  return getPartnerEntity(id);
}

export async function deletePartnerEntity(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const linked = await db.select({ id: ticketPurchases.id }).from(ticketPurchases).where(eq(ticketPurchases.partnerEntityId, id)).limit(1);
  if (linked.length) {
    await db.update(partnerEntities).set({ isActive: false }).where(eq(partnerEntities.id, id));
    return { deactivated: true };
  }
  await db.delete(partnerEntities).where(eq(partnerEntities.id, id));
  return { deactivated: false };
}

export async function listPartnerDiscountRules(partnerEntityId?: number) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(partnerDiscountRules).orderBy(desc(partnerDiscountRules.validFrom), desc(partnerDiscountRules.id));
  return partnerEntityId ? base.where(eq(partnerDiscountRules.partnerEntityId, partnerEntityId)) : base;
}

export async function listActivePartnerDiscountRules() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(partnerDiscountRules).where(eq(partnerDiscountRules.isActive, true));
}

export async function getPartnerDiscountRule(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(partnerDiscountRules).where(eq(partnerDiscountRules.id, id)).limit(1);
  return rows[0];
}

export async function createPartnerDiscountRule(data: typeof partnerDiscountRules.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(partnerDiscountRules).values(data);
  const rows = await db.select().from(partnerDiscountRules).orderBy(desc(partnerDiscountRules.id)).limit(1);
  return rows[0]!;
}

export async function updatePartnerDiscountRule(id: number, data: Partial<typeof partnerDiscountRules.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(partnerDiscountRules).set(data).where(eq(partnerDiscountRules.id, id));
  return getPartnerDiscountRule(id);
}

export async function deletePartnerDiscountRule(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(partnerDiscountRules).where(eq(partnerDiscountRules.id, id));
  return { deleted: true };
}

// PRD Round 4, Section 5: "whether TODAY's date falls within that rule's
// Valid From/Valid Until range" — deliberately today, not the visit/booking
// date, so the date comparison is pushed to CURDATE() at the SQL level
// rather than compared in JS (the mysql2 driver returns DATE columns as JS
// Date objects, not "YYYY-MM-DD" strings, which would need careful,
// timezone-safe parsing to compare correctly).
export async function resolveActivePartnerDiscountRule(partnerEntityId: number, appliesTo: "ticket_type" | "facility", match: { ticketType?: string; facilityTypeId?: number }) {
  const db = await getDb(); if (!db) return undefined;
  const conditions = [
    eq(partnerDiscountRules.partnerEntityId, partnerEntityId), eq(partnerDiscountRules.appliesTo, appliesTo), eq(partnerDiscountRules.isActive, true),
    sql`${partnerDiscountRules.validFrom} <= CURDATE()`, sql`${partnerDiscountRules.validUntil} >= CURDATE()`,
  ];
  if (appliesTo === "ticket_type" && match.ticketType) conditions.push(eq(partnerDiscountRules.ticketType, match.ticketType as any));
  if (appliesTo === "facility" && match.facilityTypeId) conditions.push(eq(partnerDiscountRules.facilityTypeId, match.facilityTypeId));
  const rows = await db.select().from(partnerDiscountRules).where(and(...conditions)).orderBy(desc(partnerDiscountRules.id)).limit(1);
  return rows[0];
}

export async function getRevenueCategoryByName(name: string) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(revenueCategories).where(eq(revenueCategories.name, name)).limit(1);
  return rows[0];
}

// PRD Section 2 (Events Hall Booking): each Facility Type/Add-on Service is
// linked to a Revenue category, reusing one with a matching name if it
// already exists rather than always creating a duplicate.
export async function findOrCreateRevenueCategoryForFacility(name: string, code: string, createdBy: number) {
  const existing = await getRevenueCategoryByName(name);
  if (existing) return existing;
  return createRevenueCategory({ name, code, createdBy } as any);
}

export async function listFacilityTypes(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(facilityTypes).orderBy(facilityTypes.name);
  return includeInactive ? base : base.where(eq(facilityTypes.isActive, true));
}

export async function getFacilityType(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(facilityTypes).where(eq(facilityTypes.id, id)).limit(1);
  return rows[0];
}

export async function createFacilityType(data: typeof facilityTypes.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(facilityTypes).values(data);
  const rows = await db.select().from(facilityTypes).orderBy(desc(facilityTypes.id)).limit(1);
  return rows[0]!;
}

export async function updateFacilityType(id: number, data: Partial<typeof facilityTypes.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(facilityTypes).set(data).where(eq(facilityTypes.id, id));
  return getFacilityType(id);
}

export async function deleteFacilityType(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const linked = await db.select({ id: facilityBookings.id }).from(facilityBookings).where(eq(facilityBookings.facilityTypeId, id)).limit(1);
  if (linked.length) {
    await db.update(facilityTypes).set({ isActive: false }).where(eq(facilityTypes.id, id));
    return { deactivated: true };
  }
  await db.delete(facilityTypes).where(eq(facilityTypes.id, id));
  return { deactivated: false };
}

export async function listAddonServices(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(addonServices).orderBy(addonServices.name);
  return includeInactive ? base : base.where(eq(addonServices.isActive, true));
}

export async function getAddonService(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(addonServices).where(eq(addonServices.id, id)).limit(1);
  return rows[0];
}

export async function createAddonService(data: typeof addonServices.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(addonServices).values(data);
  const rows = await db.select().from(addonServices).orderBy(desc(addonServices.id)).limit(1);
  return rows[0]!;
}

export async function updateAddonService(id: number, data: Partial<typeof addonServices.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(addonServices).set(data).where(eq(addonServices.id, id));
  return getAddonService(id);
}

export async function deleteAddonService(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const linked = await db.select({ id: facilityBookingAddons.id }).from(facilityBookingAddons).where(eq(facilityBookingAddons.addonServiceId, id)).limit(1);
  if (linked.length) {
    await db.update(addonServices).set({ isActive: false }).where(eq(addonServices.id, id));
    return { deactivated: true };
  }
  await db.delete(addonServices).where(eq(addonServices.id, id));
  return { deactivated: false };
}

// Records a facility booking AND its add-on lines AND a revenue entry per
// line (facility + each add-on) in one transaction — mirroring
// createPettyCashSpendWithExpense's all-or-nothing pattern, since a failure
// partway through must never leave a finance_entries row with nothing to
// show for it, or a booking with no matching revenue.
export async function createFacilityBooking(data: {
  facilityTypeId: number; facilityTypeName: string; facilityCategoryId: number; facilityCategoryName: string;
  bookingDate: string; quantity: string; facilityAmount: string;
  addons: Array<{ addonServiceId: number; addonServiceName: string; categoryId: number; categoryName: string; quantity: string; amount: string }>;
  customerId?: number | null; customerName?: string; paymentMethod?: "cash" | "card" | "bank" | "mixed"; notes?: string; createdBy: number;
  partnerEntity?: { id: number; name: string; discountPercentage: string } | null;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const addonsAmountMinor = data.addons.reduce((sum, addon) => sum + moneyToMinor(addon.amount), 0);
  const facilityAmountMinor = moneyToMinor(data.facilityAmount);
  return db.transaction(async (tx) => {
    // The booking row is inserted first, before its finance entries, so the
    // revenue/add-on finance_entries rows below can carry referenceId:
    // booking.id — required for cancelFacilityBooking to find and reverse
    // exactly this booking's revenue later.
    await tx.insert(facilityBookings).values({
      facilityTypeId: data.facilityTypeId, facilityTypeName: data.facilityTypeName, bookingDate: data.bookingDate, quantity: data.quantity,
      facilityAmount: data.facilityAmount, addonsAmount: minorToMoney(addonsAmountMinor), totalAmount: minorToMoney(facilityAmountMinor + addonsAmountMinor),
      customerId: data.customerId ?? null, customerName: data.customerName || null, paymentMethod: data.paymentMethod || "cash", notes: data.notes || null, createdBy: data.createdBy,
      partnerEntityId: data.partnerEntity?.id ?? null, partnerEntityName: data.partnerEntity?.name ?? null, discountPercentage: data.partnerEntity?.discountPercentage ?? null,
    } as any);
    const bookingRows = await tx.select().from(facilityBookings).orderBy(desc(facilityBookings.id)).limit(1);
    const booking = bookingRows[0]!;

    await tx.insert(financeEntries).values({
      date: data.bookingDate, stream: "extras", type: "revenue", amount: data.facilityAmount,
      description: `Facility booking — ${data.facilityTypeName}`, referenceType: "facility_booking", referenceId: booking.id, createdBy: data.createdBy,
    } as any);
    const facilityFinanceRows = await tx.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
    await tx.insert(revenueRecords).values({
      businessDate: data.bookingDate, categoryId: data.facilityCategoryId, categoryName: data.facilityCategoryName, amount: data.facilityAmount,
      description: `Facility booking — ${data.facilityTypeName}`, financeEntryId: facilityFinanceRows[0]!.id, createdBy: data.createdBy,
    } as any);

    for (const addon of data.addons) {
      await tx.insert(financeEntries).values({
        date: data.bookingDate, stream: "extras", type: "revenue", amount: addon.amount,
        description: `Facility booking add-on — ${addon.addonServiceName}`, referenceType: "facility_booking_addon", referenceId: booking.id, createdBy: data.createdBy,
      } as any);
      const addonFinanceRows = await tx.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
      await tx.insert(revenueRecords).values({
        businessDate: data.bookingDate, categoryId: addon.categoryId, categoryName: addon.categoryName, amount: addon.amount,
        description: `Facility booking add-on — ${addon.addonServiceName}`, financeEntryId: addonFinanceRows[0]!.id, createdBy: data.createdBy,
      } as any);
      await tx.insert(facilityBookingAddons).values({
        bookingId: booking.id, addonServiceId: addon.addonServiceId, addonServiceName: addon.addonServiceName, quantity: addon.quantity, amount: addon.amount,
      } as any);
    }
    return booking;
  });
}

export async function listFacilityBookings(from?: string, to?: string, query?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${facilityBookings.bookingDate} >= ${from}`);
  if (to) conditions.push(sql`${facilityBookings.bookingDate} <= ${to}`);
  if (query?.trim()) {
    const pattern = `%${query.trim()}%`;
    conditions.push(or(sql`LOWER(${facilityBookings.customerName}) LIKE LOWER(${pattern})`, sql`LOWER(${facilityBookings.facilityTypeName}) LIKE LOWER(${pattern})`, sql`${guests.phone} LIKE ${pattern}`));
  }
  const base = db.select({ booking: facilityBookings, customer: guests }).from(facilityBookings)
    .leftJoin(guests, eq(facilityBookings.customerId, guests.id))
    .orderBy(desc(facilityBookings.bookingDate), desc(facilityBookings.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function listFacilityBookingAddons(bookingId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(facilityBookingAddons).where(eq(facilityBookingAddons.bookingId, bookingId));
}

export async function getFacilityBooking(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(facilityBookings).where(eq(facilityBookings.id, id)).limit(1);
  return rows[0];
}

// PRD Round 4, Section 9.2: edit an existing (confirmed) booking's date and,
// for daily/hourly facilities, its duration — recalculates facilityAmount
// from the facility's current rate and re-applies the booking's own
// (unchanged) discountPercentage snapshot, then keeps the linked
// finance_entries/revenue_records rows in sync so reports reflect the edit.
export async function updateFacilityBookingDetails(id: number, data: { bookingDate: string; quantity: string; facilityAmount: string; totalAmount: string }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, id)).limit(1);
    const booking = rows[0];
    if (!booking) throw new Error("Facility booking was not found");
    if (booking.status === "cancelled") throw new Error("This booking has been cancelled and can no longer be edited");
    await tx.update(facilityBookings).set({ bookingDate: data.bookingDate as any, quantity: data.quantity, facilityAmount: data.facilityAmount, totalAmount: data.totalAmount }).where(eq(facilityBookings.id, id));
    await tx.update(financeEntries).set({ date: data.bookingDate as any, amount: data.facilityAmount }).where(and(eq(financeEntries.referenceType, "facility_booking"), eq(financeEntries.referenceId, id)));
    const financeRows = await tx.select().from(financeEntries).where(and(eq(financeEntries.referenceType, "facility_booking"), eq(financeEntries.referenceId, id))).limit(1);
    if (financeRows[0]) await tx.update(revenueRecords).set({ businessDate: data.bookingDate as any, amount: data.facilityAmount }).where(eq(revenueRecords.financeEntryId, financeRows[0].id));
    const updated = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, id)).limit(1);
    return updated[0]!;
  });
}

// PRD Round 4, Section 9.1/9.4: cancelling a booking keeps the booking row
// itself (status flips to "cancelled", never deleted — the PRD is explicit
// that cancelled records stay for history), but reverses its revenue by
// removing every finance_entries/revenue_records row tied back to it
// (the facility line and every add-on logged against it), the same
// delete-by-reference pattern refundPrdTicketPurchase uses for tickets.
export async function cancelFacilityBooking(id: number, cancelledBy: number, reason?: string) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, id)).limit(1);
    const booking = rows[0];
    if (!booking) throw new Error("Facility booking was not found");
    if (booking.status === "cancelled") throw new Error("This booking has already been cancelled");
    const referenceTypes = ["facility_booking", "facility_booking_addon"];
    const financeRows = await tx.select({ id: financeEntries.id }).from(financeEntries)
      .where(and(inArray(financeEntries.referenceType, referenceTypes), eq(financeEntries.referenceId, id)));
    const financeEntryIds = financeRows.map((row) => row.id);
    if (financeEntryIds.length) await tx.delete(revenueRecords).where(inArray(revenueRecords.financeEntryId, financeEntryIds));
    await tx.delete(financeEntries).where(and(inArray(financeEntries.referenceType, referenceTypes), eq(financeEntries.referenceId, id)));
    await tx.update(facilityBookings).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy, cancelReason: reason || null } as any).where(eq(facilityBookings.id, id));
    const updated = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, id)).limit(1);
    return updated[0]!;
  });
}

// PRD Round 3, Section 5.2/5.3: staff can log an add-on service against a
// booking created earlier ("Add-ons Only") or from that booking's own
// details screen — either way this appends a new, separate revenue line
// item linked to the existing booking rather than editing its original
// facilityAmount, preserving an audit trail of what was added and when.
// addonsAmount/totalAmount are kept as a running summary for display; the
// original facilityAmount is never touched again after creation.
export async function addFacilityBookingAddons(data: {
  bookingId: number; businessDate: string; createdBy: number;
  addons: Array<{ addonServiceId: number; addonServiceName: string; categoryId: number; categoryName: string; quantity: string; amount: string }>;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const bookingRows = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, data.bookingId)).limit(1);
    const booking = bookingRows[0];
    if (!booking) throw new Error("Facility booking was not found");
    if (booking.status === "cancelled") throw new Error("This booking has been cancelled and can no longer be changed");
    let addonsAmountMinor = moneyToMinor(String(booking.addonsAmount));
    for (const addon of data.addons) {
      await tx.insert(financeEntries).values({
        date: data.businessDate, stream: "extras", type: "revenue", amount: addon.amount,
        description: `Facility booking add-on — ${addon.addonServiceName}`, referenceType: "facility_booking_addon", referenceId: data.bookingId, createdBy: data.createdBy,
      } as any);
      const financeRows = await tx.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
      await tx.insert(revenueRecords).values({
        businessDate: data.businessDate, categoryId: addon.categoryId, categoryName: addon.categoryName, amount: addon.amount,
        description: `Facility booking add-on — ${addon.addonServiceName}`, financeEntryId: financeRows[0]!.id, createdBy: data.createdBy,
      } as any);
      await tx.insert(facilityBookingAddons).values({
        bookingId: data.bookingId, addonServiceId: addon.addonServiceId, addonServiceName: addon.addonServiceName, quantity: addon.quantity, amount: addon.amount,
      } as any);
      addonsAmountMinor += moneyToMinor(addon.amount);
    }
    const addonsAmount = minorToMoney(addonsAmountMinor);
    const totalAmount = minorToMoney(moneyToMinor(String(booking.facilityAmount)) + addonsAmountMinor);
    await tx.update(facilityBookings).set({ addonsAmount, totalAmount }).where(eq(facilityBookings.id, data.bookingId));
    const updatedRows = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, data.bookingId)).limit(1);
    return updatedRows[0]!;
  });
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

// ─── Revenue categories and manual revenue ledger ───────────────────────────
export async function listRevenueCategories(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(revenueCategories).orderBy(revenueCategories.name);
  return includeInactive ? base : base.where(eq(revenueCategories.isActive, true));
}

export async function getRevenueCategory(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(revenueCategories).where(eq(revenueCategories.id, id)).limit(1);
  return rows[0];
}

export async function createRevenueCategory(data: typeof revenueCategories.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(revenueCategories).values(data);
  const rows = await db.select().from(revenueCategories).orderBy(desc(revenueCategories.id)).limit(1);
  return rows[0]!;
}

export async function updateRevenueCategory(id: number, data: Partial<typeof revenueCategories.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(revenueCategories).set(data).where(eq(revenueCategories.id, id));
  return getRevenueCategory(id);
}

export async function deleteRevenueCategory(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const linked = await db.select({ id: revenueRecords.id }).from(revenueRecords).where(eq(revenueRecords.categoryId, id)).limit(1);
  if (linked.length) {
    await db.update(revenueCategories).set({ isActive: false }).where(eq(revenueCategories.id, id));
    return { deactivated: true };
  }
  await db.delete(revenueCategories).where(eq(revenueCategories.id, id));
  return { deactivated: false };
}

export async function listRevenueRecords(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${revenueRecords.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${revenueRecords.businessDate} <= ${to}`);
  const base = db.select().from(revenueRecords).orderBy(desc(revenueRecords.businessDate), desc(revenueRecords.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function createRevenueRecord(data: typeof revenueRecords.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(revenueRecords).values(data);
  const rows = await db.select().from(revenueRecords).orderBy(desc(revenueRecords.id)).limit(1);
  return rows[0]!;
}

export async function getRevenueRecord(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(revenueRecords).where(eq(revenueRecords.id, id)).limit(1);
  return rows[0];
}

export async function updateRevenueRecord(id: number, data: Partial<typeof revenueRecords.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(revenueRecords).set(data).where(eq(revenueRecords.id, id));
}

export async function deleteRevenueRecord(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(revenueRecords).where(eq(revenueRecords.id, id));
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

// ─── Revenue category adjustments (+/- and transfers) — the exact mirror of
// the expense category adjustments above, kept as an entirely separate
// table/pool so a transfer can never cross from a revenue category into an
// expense category (that would distort the P&L by moving money between
// what's meant to be two independent ledgers). ────────────────────────────
export async function listRevenueAdjustments(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${revenueAdjustments.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${revenueAdjustments.businessDate} <= ${to}`);
  const base = db.select().from(revenueAdjustments).orderBy(desc(revenueAdjustments.businessDate), desc(revenueAdjustments.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function createRevenueAdjustment(data: {
  businessDate: string; categoryId: number; categoryName: string; type: "add" | "deduct";
  amount: string; note?: string; createdBy: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(revenueAdjustments).values(data as any);
  const rows = await db.select().from(revenueAdjustments).orderBy(desc(revenueAdjustments.id)).limit(1);
  return rows[0]!;
}

// Balance = money added to the category, plus transfers in, minus money
// deducted and transfers out, plus actual recorded revenue against it —
// i.e. the running total earned under that category so far. Unlike an
// expense category (a budget that gets spent down), recorded revenue
// records ADD to the balance rather than subtract from it.
export async function getRevenueCategoryBalances(from?: string, to?: string) {
  const [categories, adjustments, revenue] = await Promise.all([
    listRevenueCategories(false),
    listRevenueAdjustments(from, to),
    listRevenueRecords(from, to),
  ]);
  return categories.map((category) => {
    const categoryAdjustments = adjustments.filter((entry) => entry.categoryId === category.id);
    const totalAdded = categoryAdjustments.filter((entry) => entry.type === "add").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalDeducted = categoryAdjustments.filter((entry) => entry.type === "deduct").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalTransferredIn = categoryAdjustments.filter((entry) => entry.type === "transfer_in").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalTransferredOut = categoryAdjustments.filter((entry) => entry.type === "transfer_out").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalRevenue = revenue.filter((entry) => entry.categoryId === category.id).reduce((sum, entry) => sum + Number(entry.amount), 0);
    const balance = totalAdded - totalDeducted + totalTransferredIn - totalTransferredOut + totalRevenue;
    return { categoryId: category.id, categoryName: category.name, categoryCode: category.code, totalAdded, totalDeducted, totalTransferredIn, totalTransferredOut, totalRevenue, balance };
  });
}

export async function createRevenueTransfer(data: {
  businessDate: string; fromCategoryId: number; fromCategoryName: string;
  toCategoryId: number; toCategoryName: string; amount: string; note?: string; createdBy: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    await tx.insert(revenueAdjustments).values({
      businessDate: data.businessDate, categoryId: data.fromCategoryId, categoryName: data.fromCategoryName,
      type: "transfer_out", amount: data.amount, relatedCategoryId: data.toCategoryId, relatedCategoryName: data.toCategoryName,
      note: data.note, createdBy: data.createdBy,
    } as any);
    await tx.insert(revenueAdjustments).values({
      businessDate: data.businessDate, categoryId: data.toCategoryId, categoryName: data.toCategoryName,
      type: "transfer_in", amount: data.amount, relatedCategoryId: data.fromCategoryId, relatedCategoryName: data.fromCategoryName,
      note: data.note, createdBy: data.createdBy,
    } as any);
    const rows = await tx.select().from(revenueAdjustments).orderBy(desc(revenueAdjustments.id)).limit(2);
    return rows;
  });
}

// ─── Asset categories and fixed-asset register — mirrors the revenue side,
// except records here are never linked to a finance_entries row, since a
// capital asset purchase must never affect the Revenue-vs-Expense Net Result.
export async function listAssetCategories(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(assetCategories).orderBy(assetCategories.name);
  return includeInactive ? base : base.where(eq(assetCategories.isActive, true));
}

export async function getAssetCategory(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(assetCategories).where(eq(assetCategories.id, id)).limit(1);
  return rows[0];
}

export async function createAssetCategory(data: typeof assetCategories.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(assetCategories).values(data);
  const rows = await db.select().from(assetCategories).orderBy(desc(assetCategories.id)).limit(1);
  return rows[0]!;
}

export async function updateAssetCategory(id: number, data: Partial<typeof assetCategories.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(assetCategories).set(data).where(eq(assetCategories.id, id));
  return getAssetCategory(id);
}

export async function deleteAssetCategory(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const linked = await db.select({ id: assetRecords.id }).from(assetRecords).where(eq(assetRecords.categoryId, id)).limit(1);
  if (linked.length) {
    await db.update(assetCategories).set({ isActive: false }).where(eq(assetCategories.id, id));
    return { deactivated: true };
  }
  await db.delete(assetCategories).where(eq(assetCategories.id, id));
  return { deactivated: false };
}

export async function listAssetRecords(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${assetRecords.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${assetRecords.businessDate} <= ${to}`);
  const base = db.select().from(assetRecords).orderBy(desc(assetRecords.businessDate), desc(assetRecords.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function createAssetRecord(data: typeof assetRecords.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(assetRecords).values(data);
  const rows = await db.select().from(assetRecords).orderBy(desc(assetRecords.id)).limit(1);
  return rows[0]!;
}

export async function getAssetRecord(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(assetRecords).where(eq(assetRecords.id, id)).limit(1);
  return rows[0];
}

export async function updateAssetRecord(id: number, data: Partial<typeof assetRecords.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(assetRecords).set(data).where(eq(assetRecords.id, id));
}

export async function deleteAssetRecord(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(assetRecords).where(eq(assetRecords.id, id));
}

export async function listAssetAdjustments(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${assetAdjustments.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${assetAdjustments.businessDate} <= ${to}`);
  const base = db.select().from(assetAdjustments).orderBy(desc(assetAdjustments.businessDate), desc(assetAdjustments.id));
  return conditions.length ? base.where(and(...conditions)) : base;
}

export async function createAssetAdjustment(data: {
  businessDate: string; categoryId: number; categoryName: string; type: "add" | "deduct";
  amount: string; note?: string; createdBy: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(assetAdjustments).values(data as any);
  const rows = await db.select().from(assetAdjustments).orderBy(desc(assetAdjustments.id)).limit(1);
  return rows[0]!;
}

// Balance = money added to the category, plus transfers in, minus money
// deducted and transfers out, plus recorded asset purchases against it — the
// running capital value held under that category. Like revenue (and unlike
// an expense budget), recorded asset purchases ADD to the balance.
export async function getAssetCategoryBalances(from?: string, to?: string) {
  const [categories, adjustments, assets] = await Promise.all([
    listAssetCategories(false),
    listAssetAdjustments(from, to),
    listAssetRecords(from, to),
  ]);
  return categories.map((category) => {
    const categoryAdjustments = adjustments.filter((entry) => entry.categoryId === category.id);
    const totalAdded = categoryAdjustments.filter((entry) => entry.type === "add").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalDeducted = categoryAdjustments.filter((entry) => entry.type === "deduct").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalTransferredIn = categoryAdjustments.filter((entry) => entry.type === "transfer_in").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalTransferredOut = categoryAdjustments.filter((entry) => entry.type === "transfer_out").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalAssets = assets.filter((entry) => entry.categoryId === category.id).reduce((sum, entry) => sum + Number(entry.amount), 0);
    const balance = totalAdded - totalDeducted + totalTransferredIn - totalTransferredOut + totalAssets;
    return { categoryId: category.id, categoryName: category.name, categoryCode: category.code, totalAdded, totalDeducted, totalTransferredIn, totalTransferredOut, totalAssets, balance };
  });
}

export async function createAssetTransfer(data: {
  businessDate: string; fromCategoryId: number; fromCategoryName: string;
  toCategoryId: number; toCategoryName: string; amount: string; note?: string; createdBy: number;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    await tx.insert(assetAdjustments).values({
      businessDate: data.businessDate, categoryId: data.fromCategoryId, categoryName: data.fromCategoryName,
      type: "transfer_out", amount: data.amount, relatedCategoryId: data.toCategoryId, relatedCategoryName: data.toCategoryName,
      note: data.note, createdBy: data.createdBy,
    } as any);
    await tx.insert(assetAdjustments).values({
      businessDate: data.businessDate, categoryId: data.toCategoryId, categoryName: data.toCategoryName,
      type: "transfer_in", amount: data.amount, relatedCategoryId: data.fromCategoryId, relatedCategoryName: data.fromCategoryName,
      note: data.note, createdBy: data.createdBy,
    } as any);
    const rows = await tx.select().from(assetAdjustments).orderBy(desc(assetAdjustments.id)).limit(2);
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

// ─── Petty cash custodian funds ─────────────────────────────────────────────
export async function createPettyCashFund(data: { custodianUserId: number; fixedAmount: string; createdBy: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(pettyCashFunds).values(data as any);
  const rows = await db.select().from(pettyCashFunds).orderBy(desc(pettyCashFunds.id)).limit(1);
  return rows[0]!;
}

export async function getPettyCashFund(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(pettyCashFunds).where(eq(pettyCashFunds.id, id)).limit(1);
  return rows[0];
}

export async function getPettyCashFundByCustodian(custodianUserId: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(pettyCashFunds).where(eq(pettyCashFunds.custodianUserId, custodianUserId)).limit(1);
  return rows[0];
}

export async function updatePettyCashFundAmount(id: number, fixedAmount: string) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(pettyCashFunds).set({ fixedAmount }).where(eq(pettyCashFunds.id, id));
  return getPettyCashFund(id);
}

export async function listPettyCashSpends(fundId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(pettyCashSpends).where(eq(pettyCashSpends.fundId, fundId)).orderBy(desc(pettyCashSpends.businessDate), desc(pettyCashSpends.id));
}

export async function getPettyCashFundBalance(fundId: number) {
  const db = await getDb(); if (!db) return 0;
  const fund = await getPettyCashFund(fundId);
  if (!fund) return 0;
  const spends = await listPettyCashSpends(fundId);
  const totalSpent = spends.reduce((sum, entry) => sum + Number(entry.amount), 0);
  return Number(fund.fixedAmount) - totalSpent;
}

// Every active custodian fund, joined with the custodian's account, with the
// running balance computed (fixedAmount minus everything they've spent) —
// backs the manager's oversight table.
export async function listPettyCashFundsWithBalances() {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ fund: pettyCashFunds, custodian: users }).from(pettyCashFunds)
    .leftJoin(users, eq(pettyCashFunds.custodianUserId, users.id))
    .orderBy(desc(pettyCashFunds.createdAt));
  const spendTotals = await db.select({ fundId: pettyCashSpends.fundId, total: sql<number>`COALESCE(SUM(${pettyCashSpends.amount}),0)` })
    .from(pettyCashSpends).groupBy(pettyCashSpends.fundId);
  const totalsByFund = new Map(spendTotals.map((row) => [row.fundId, Number(row.total)]));
  return rows.map((row) => {
    const totalSpent = totalsByFund.get(row.fund.id) ?? 0;
    return { ...row, totalSpent, balance: Number(row.fund.fixedAmount) - totalSpent };
  });
}

// Logs a petty cash spend AND its backing expense record AND finance entry
// in one transaction — a failure partway through (e.g. a category name that
// no longer fits its column) must never leave a finance_entries row with no
// matching expense_records/petty_cash_spends row behind it, since that would
// silently inflate reported Expenses with nothing to show for it anywhere.
export async function createPettyCashSpendWithExpense(data: {
  fundId: number; businessDate: string; amount: string; description: string;
  categoryId: number; categoryName: string; payee: string; createdBy: number;
  attachmentPath?: string | null; attachmentOriginalName?: string | null;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    await tx.insert(financeEntries).values({
      date: data.businessDate, stream: "extras", type: "expense", amount: data.amount,
      description: `Petty cash — ${data.description}`, referenceType: "petty_cash_spend", createdBy: data.createdBy,
    } as any);
    const financeRows = await tx.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
    const financeEntry = financeRows[0]!;
    await tx.insert(expenseRecords).values({
      businessDate: data.businessDate, categoryId: data.categoryId, categoryName: data.categoryName, amount: data.amount,
      payee: data.payee, description: data.description, department: "general", financeEntryId: financeEntry.id, createdBy: data.createdBy,
      attachmentPath: data.attachmentPath ?? null, attachmentOriginalName: data.attachmentOriginalName ?? null,
    } as any);
    const expenseRows = await tx.select().from(expenseRecords).orderBy(desc(expenseRecords.id)).limit(1);
    const expenseRecord = expenseRows[0]!;
    await tx.insert(pettyCashSpends).values({
      fundId: data.fundId, businessDate: data.businessDate, amount: data.amount, description: data.description,
      expenseRecordId: expenseRecord.id, createdBy: data.createdBy,
      attachmentPath: data.attachmentPath ?? null, attachmentOriginalName: data.attachmentOriginalName ?? null,
    } as any);
    const spendRows = await tx.select().from(pettyCashSpends).orderBy(desc(pettyCashSpends.id)).limit(1);
    return spendRows[0]!;
  });
}

export async function getPettyCashSpend(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(pettyCashSpends).where(eq(pettyCashSpends.id, id)).limit(1);
  return rows[0];
}

// The mirror of createPettyCashSpendWithExpense — removes the spend and its
// linked expense record and finance entry together, so a manager correction
// never leaves an orphaned expense behind either.
export async function deletePettyCashSpendWithExpense(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const spendRows = await tx.select().from(pettyCashSpends).where(eq(pettyCashSpends.id, id)).limit(1);
    const spend = spendRows[0];
    if (!spend) return null;
    if (spend.expenseRecordId) {
      const expenseRows = await tx.select().from(expenseRecords).where(eq(expenseRecords.id, spend.expenseRecordId)).limit(1);
      const record = expenseRows[0];
      await tx.delete(expenseRecords).where(eq(expenseRecords.id, spend.expenseRecordId));
      if (record?.financeEntryId) await tx.delete(financeEntries).where(eq(financeEntries.id, record.financeEntryId));
    }
    await tx.delete(pettyCashSpends).where(eq(pettyCashSpends.id, id));
    return spend;
  });
}
