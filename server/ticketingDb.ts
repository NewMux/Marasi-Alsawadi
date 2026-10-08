import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  addonServices, assetAdjustments, assetCategories, assetRecords, attachments, expenseAdjustments, expenseCategories, expenseRecords, facilityBookingAddons, facilityBookings, facilityTypes, guests, partnerEntities, partnerDiscountRules, pettyCashAllocations, pettyCashFunds, pettyCashSpends, revenueAdjustments, revenueCategories, revenueRecords, salesTicketSequences, salesTransactionLines, salesTransactions,
  serviceRateFees, serviceRates, ticketFeeDefinitions, ticketCheckIns, ticketNumberSequences, ticketDiscountTiers, ticketTypes, visitorCategories, ticketPrices,
  ticketPurchases, ticketPurchaseLines, ticketPurchaseFees, financeEntries, users, systemSettings, cashFlowAdjustments, financeSettlements,
} from "../drizzle/schema";
import { getDb } from "./db";
import { calculateOperationalNet, calculatePrdPurchasePricing, decideGateEntry, formatPrdTicketNumber, formatTicketNumber, minorToMoney, moneyToMinor, validateMixedPaymentBreakdown, type PrdDiscountTierInput, type PrdTicketLineInput } from "./ticketingRules";

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

// PRD Round 7, Section 1: fully Admin-manageable ticket types (grouped
// "Water Park" / "Other Tickets") and visitor categories, replacing the old
// fixed waterpark/companion service-rate pair — see drizzle/schema.ts for
// the ticketTypes/visitorCategories/ticketPrices tables.
export async function listTicketTypes(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(ticketTypes).orderBy(ticketTypes.ticketGroup, ticketTypes.name);
  return includeInactive ? base : base.where(eq(ticketTypes.isActive, true));
}

export async function getTicketType(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(ticketTypes).where(eq(ticketTypes.id, id)).limit(1);
  return rows[0];
}

export async function getTicketTypeByCode(code: string) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(ticketTypes).where(eq(ticketTypes.code, code)).limit(1);
  return rows[0];
}

// A new ticket type or category must immediately have a (zero-priced) cell
// for every category/type it's crossed with, so the Category Pricing matrix
// always stays a complete grid the Admin can fill in — never a partial one
// that silently falls back to "no price configured" for missing pairs.
export async function createTicketType(data: typeof ticketTypes.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(ticketTypes).values(data);
  const rows = await db.select().from(ticketTypes).orderBy(desc(ticketTypes.id)).limit(1);
  const type = rows[0]!;
  const categories = await db.select().from(visitorCategories).where(eq(visitorCategories.isActive, true));
  if (categories.length) await db.insert(ticketPrices).values(categories.map((category) => ({ ticketTypeId: type.id, categoryId: category.id, unitPrice: "0.000", createdBy: data.createdBy })));
  return type;
}

export async function updateTicketType(id: number, data: Partial<typeof ticketTypes.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(ticketTypes).set(data).where(eq(ticketTypes.id, id));
  return getTicketType(id);
}

// PRD Round 11, Section 4: a retired ticket type had no way to actually be
// removed from the list — mirrors deleteFacilityType/deleteAddonService's
// pattern (hard-delete when nothing historical depends on it, otherwise
// fall back to a soft retire). Issued tickets are the one dependency that
// blocks a hard delete, since ticket_purchase_lines.ticketTypeId would be
// left pointing at nothing; category pricing, fee assignments, partner
// discount rules, and group discount tiers are just config for this type
// and are cleaned up along with it.
export async function deleteTicketType(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const issued = await db.select({ id: ticketPurchaseLines.id }).from(ticketPurchaseLines).where(eq(ticketPurchaseLines.ticketTypeId, id)).limit(1);
  if (issued.length) {
    await db.update(ticketTypes).set({ isActive: false }).where(eq(ticketTypes.id, id));
    return { deactivated: true };
  }
  await db.delete(ticketPrices).where(eq(ticketPrices.ticketTypeId, id));
  await db.delete(serviceRateFees).where(and(eq(serviceRateFees.rateType, "ticket_type"), eq(serviceRateFees.rateId, id)));
  await db.delete(partnerDiscountRules).where(eq(partnerDiscountRules.ticketTypeId, id));
  await db.delete(ticketDiscountTiers).where(eq(ticketDiscountTiers.ticketTypeId, id));
  await db.delete(ticketTypes).where(eq(ticketTypes.id, id));
  return { deactivated: false };
}

export async function listVisitorCategories(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const base = db.select().from(visitorCategories).orderBy(visitorCategories.displayOrder, visitorCategories.id);
  return includeInactive ? base : base.where(eq(visitorCategories.isActive, true));
}

export async function createVisitorCategory(data: typeof visitorCategories.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(visitorCategories).values(data);
  const rows = await db.select().from(visitorCategories).orderBy(desc(visitorCategories.id)).limit(1);
  const category = rows[0]!;
  const types = await db.select().from(ticketTypes).where(eq(ticketTypes.isActive, true));
  if (types.length) await db.insert(ticketPrices).values(types.map((type) => ({ ticketTypeId: type.id, categoryId: category.id, unitPrice: "0.000", createdBy: data.createdBy })));
  return category;
}

export async function updateVisitorCategory(id: number, data: Partial<typeof visitorCategories.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(visitorCategories).set(data).where(eq(visitorCategories.id, id));
  const rows = await db.select().from(visitorCategories).where(eq(visitorCategories.id, id)).limit(1);
  return rows[0];
}

// The Category Pricing matrix (PRD Round 7, Section 1.3): every Ticket Type
// x Visitor Category price cell, joined with names for display.
export async function listTicketPrices(includeInactive = false) {
  const db = await getDb(); if (!db) return [];
  const conditions = includeInactive ? [] : [eq(ticketTypes.isActive, true), eq(visitorCategories.isActive, true)];
  const base = db.select({ price: ticketPrices, ticketType: ticketTypes, category: visitorCategories })
    .from(ticketPrices)
    .innerJoin(ticketTypes, eq(ticketPrices.ticketTypeId, ticketTypes.id))
    .innerJoin(visitorCategories, eq(ticketPrices.categoryId, visitorCategories.id))
    .orderBy(ticketTypes.ticketGroup, ticketTypes.name, visitorCategories.displayOrder);
  const rows = await (conditions.length ? base.where(and(...conditions)) : base);
  return rows.map((row) => ({
    id: row.price.id, ticketTypeId: row.price.ticketTypeId, categoryId: row.price.categoryId, unitPrice: row.price.unitPrice, isActive: row.price.isActive,
    ticketTypeName: row.ticketType.name, ticketTypeCode: row.ticketType.code, ticketGroup: row.ticketType.ticketGroup,
    ticketTypeApplyVat: row.ticketType.applyVat, ticketTypeVatPercent: row.ticketType.vatPercent,
    categoryName: row.category.name, categoryCode: row.category.code,
    categoryMaxPerBooking: row.category.maxPerBooking, categoryCountsTowardGroupDiscount: row.category.countsTowardGroupDiscount,
  }));
}

// PRD Round 11, Section 3: `isActive` here means "this ticket type links to
// this visitor category at all" — the Ticket Desk only shows a category row
// for a selected ticket type when its price cell is active, so an
// irrelevant combination (e.g. "Kid's Play Area" x "Retiree") can be
// unlinked without touching its price. Defaults to active for every
// existing/new combination, so nothing already working is hidden by this.
export async function upsertTicketPrice(ticketTypeId: number, categoryId: number, unitPrice: string, createdBy: number, isActive?: boolean) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const existing = await db.select().from(ticketPrices).where(and(eq(ticketPrices.ticketTypeId, ticketTypeId), eq(ticketPrices.categoryId, categoryId))).limit(1);
  const patch: Partial<typeof ticketPrices.$inferInsert> = { unitPrice, ...(isActive !== undefined ? { isActive } : {}) };
  if (existing[0]) {
    await db.update(ticketPrices).set(patch).where(eq(ticketPrices.id, existing[0].id));
    return { ...existing[0], ...patch };
  }
  await db.insert(ticketPrices).values({ ticketTypeId, categoryId, createdBy, ...patch } as typeof ticketPrices.$inferInsert);
  const rows = await db.select().from(ticketPrices).orderBy(desc(ticketPrices.id)).limit(1);
  return rows[0]!;
}

// PRD Round 9 follow-up: `ticketTypeId` optionally scopes the list to one
// ticket type's own tiers (the Group discounts settings tab), otherwise
// every active tier is returned (the pricing engine resolves each line's
// own type against the full set itself).
export async function listTicketDiscountTiers(includeInactive = false, ticketTypeId?: number) {
  const db = await getDb(); if (!db) return [];
  const conditions = [...(includeInactive ? [] : [eq(ticketDiscountTiers.isActive, true)]), ...(ticketTypeId ? [eq(ticketDiscountTiers.ticketTypeId, ticketTypeId)] : [])];
  const query = db.select().from(ticketDiscountTiers).orderBy(desc(ticketDiscountTiers.minTickets), ticketDiscountTiers.id);
  return conditions.length ? query.where(and(...conditions)) : query;
}

export async function getTicketDiscountTier(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(ticketDiscountTiers).where(eq(ticketDiscountTiers.id, id)).limit(1);
  return rows[0];
}

// PRD Round 9 follow-up: the findings report flagged two active Water Park
// tiers overlapping (100-500 and 100-1000, both 30%) with nothing stopping
// it — a purchase in the overlap could arbitrarily match either row. Two
// integer ranges (null upper bound = unbounded) overlap when each range's
// floor falls at or below the other's ceiling.
export async function findOverlappingActiveTier(ticketTypeId: number, minTickets: number, maxTickets: number | null, excludeId?: number) {
  const db = await getDb(); if (!db) return undefined;
  const conditions = [eq(ticketDiscountTiers.ticketTypeId, ticketTypeId), eq(ticketDiscountTiers.isActive, true)];
  if (excludeId) conditions.push(sql`${ticketDiscountTiers.id} != ${excludeId}`);
  const candidates = await db.select().from(ticketDiscountTiers).where(and(...conditions));
  return candidates.find((tier) => minTickets <= (tier.maxTickets ?? Infinity) && tier.minTickets <= (maxTickets ?? Infinity));
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

// PRD Round 11, Section 5: this is the "Remove" button's action, distinct
// from "Retire" (ticketDiscountTiers.update with isActive: false) — it used
// to just soft-deactivate too, so a retired tier could never actually be
// removed from the list. A discount tier has no historical dependents (a
// purchase snapshots its own resolved discountPercentage, never the tier's
// id), so this can always hard-delete.
export async function deleteTicketDiscountTier(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(ticketDiscountTiers).where(eq(ticketDiscountTiers.id, id));
  return { deactivated: false };
}

export async function createPrdTicketPurchase(data: {
  customerId: number;
  visitDate: string;
  lines: PrdTicketLineInput[];
  discountTiers: PrdDiscountTierInput[];
  fees: Array<{ id: number; name: string; code: string; calculationType: "fixed" | "percentage"; value: string; applicationBasis: "per_ticket" | "per_transaction"; displayOrder: number }>;
  paymentMethod: "cash" | "card" | "bank" | "mixed";
  cashAmount?: string; cardAmount?: string; bankAmount?: string;
  notes?: string;
  issuedBy: number;
  overrideDiscountByTicketType?: Record<string, string>;
  partnerEntity?: { id: number; name: string } | null;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const pricing = calculatePrdPurchasePricing({ lines: data.lines, discountTiers: data.discountTiers, fees: data.fees, overrideDiscountByTicketType: data.overrideDiscountByTicketType });
  if (data.paymentMethod === "mixed") validateMixedPaymentBreakdown(pricing.totalAmount, data);
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
      paymentMethod: data.paymentMethod,
      cashAmount: data.paymentMethod === "mixed" ? data.cashAmount || "0" : null, cardAmount: data.paymentMethod === "mixed" ? data.cardAmount || "0" : null, bankAmount: data.paymentMethod === "mixed" ? data.bankAmount || "0" : null,
      notes: data.notes || null, issuedBy: data.issuedBy,
      partnerEntityId: data.partnerEntity?.id ?? null, partnerEntityName: data.partnerEntity?.name ?? null,
    } as any);
    const purchaseRows = await tx.select().from(ticketPurchases).orderBy(desc(ticketPurchases.id)).limit(1);
    const purchase = purchaseRows[0]!;
    const lines = pricing.lines.map((line, index) => ({
      purchaseId: purchase.id, ticketNumber: formatPrdTicketNumber(startNumber + index),
      ticketTypeId: line.ticketTypeId, categoryId: line.categoryId, rateId: line.priceId, label: line.label,
      basePrice: line.basePrice, discountPercentage: line.discountPercentage, discountAmount: line.discountAmount,
      vatAmount: line.vatAmount, feeAmount: line.feeAmount, totalAmount: line.totalAmount,
    }));
    await tx.insert(ticketPurchaseLines).values(lines as any);
    if (pricing.fees.length) await tx.insert(ticketPurchaseFees).values(pricing.fees.map((fee) => ({ purchaseId: purchase.id, ...fee, amount: fee.amount })) as any);
    return { purchase, lines, fees: pricing.fees, pricing };
  });
}

export async function listPrdTicketPurchases(query?: string, from?: string, to?: string, issuedBy?: number) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (issuedBy !== undefined) conditions.push(eq(ticketPurchases.issuedBy, issuedBy));
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

// PRD Round 14 (Client feedback, 25/9/2026): a permanent, reusable "Delete"
// action that replaces "Cancel"/"Return" once a record is already returned —
// only ever offered on a purchase already in that state, so a live one can
// never be removed by mistake. The router already clears this purchase's
// financeEntries row on refund; deleteFinanceEntryByReference is repeated
// here defensively so Delete alone still fully reverses the financial
// impact even if that ever didn't happen first.
export async function deletePrdTicketPurchase(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const existing = await getPrdTicketPurchase(id);
  if (!existing) throw new Error("Ticket purchase was not found");
  if (existing.status !== "refunded") throw new Error("Only a returned purchase can be permanently deleted");
  await db.delete(financeEntries).where(and(eq(financeEntries.referenceType, "prd_ticket_purchase"), eq(financeEntries.referenceId, id)));
  await db.delete(ticketPurchaseFees).where(eq(ticketPurchaseFees.purchaseId, id));
  await db.delete(ticketPurchaseLines).where(eq(ticketPurchaseLines.purchaseId, id));
  await db.delete(ticketPurchases).where(eq(ticketPurchases.id, id));
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
  await db.delete(serviceRateFees).where(and(eq(serviceRateFees.rateType, "ticket_type"), eq(serviceRateFees.rateId, id)));
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

// PRD Round 10, Section 4: a fee item's assignment list can now hold both
// ticket types and facility types in the same call — each entry says which
// kind of price it points at, since `rateId` alone is ambiguous between them.
export async function replaceFeeAssignments(feeId: number, assignments: Array<{ rateType: "ticket_type" | "facility_type"; rateId: number }>) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.transaction(async (tx) => {
    await tx.delete(serviceRateFees).where(eq(serviceRateFees.feeId, feeId));
    if (assignments.length) await tx.insert(serviceRateFees).values(assignments.map(({ rateType, rateId }) => ({ feeId, rateType, rateId, isActive: true })));
  });
}

// PRD Round 10, Section 4: generalized from the ticket-only version so a
// facility booking can resolve its own applicable fees the same way a
// ticket purchase already does. "Applies globally" still only ever means
// every ticket type (the checkbox's own label, unchanged from before this
// round) — a facility type only picks up a fee it's explicitly assigned to.
export async function listApplicableFees(rateType: "ticket_type" | "facility_type", rateId: number) {
  const db = await getDb(); if (!db) return [];
  const matchCondition = rateType === "ticket_type"
    ? or(eq(ticketFeeDefinitions.appliesGlobally, true), and(eq(serviceRateFees.rateType, "ticket_type"), eq(serviceRateFees.rateId, rateId)))
    : and(eq(serviceRateFees.rateType, "facility_type"), eq(serviceRateFees.rateId, rateId));
  return db.selectDistinct({ fee: ticketFeeDefinitions }).from(ticketFeeDefinitions)
    .leftJoin(serviceRateFees, and(eq(serviceRateFees.feeId, ticketFeeDefinitions.id), eq(serviceRateFees.isActive, true)))
    .where(and(eq(ticketFeeDefinitions.isActive, true), matchCondition))
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

// PRD Round 11, Section 1: the Ticket Desk now saves a new walk-in's record
// as soon as phone/name/email are entered, before any ticket type or
// category is picked — so the record survives an abandoned or interrupted
// transaction. Keyed by phone (the same exact-match lookup the desk's
// phone-first flow already uses): a matching record is updated in place,
// otherwise a new one is created — never a second row for the same phone.
export async function upsertGuestByPhone(data: { fullName: string; phone: string; email?: string; nationality?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const phone = data.phone.trim();
  const existing = await getCustomerByPhone(phone);
  if (existing) {
    await db.update(guests).set({ fullName: data.fullName, email: data.email || null, nationality: data.nationality || null }).where(eq(guests.id, existing.id));
    return { ...existing, fullName: data.fullName, email: data.email || null, nationality: data.nationality || null };
  }
  await db.insert(guests).values({ fullName: data.fullName, phone, email: data.email || null, nationality: data.nationality || null });
  const rows = await db.select().from(guests).orderBy(desc(guests.id)).limit(1);
  return rows[0]!;
}

// PRD Round 15, Section 5: edit an existing customer's own details from the
// Customer Directory.
export async function updateGuest(id: number, data: { fullName: string; phone: string; email?: string; nationality?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(guests).set({ fullName: data.fullName, phone: data.phone, email: data.email || null, nationality: data.nationality || null }).where(eq(guests.id, id));
  const rows = await db.select().from(guests).where(eq(guests.id, id)).limit(1);
  return rows[0];
}

// PRD Round 15, Section 5: `guests` has no isActive flag, so — same as the
// established pattern for categories/ticket types elsewhere — a customer
// still referenced by an actual ticket purchase or facility booking is
// blocked from deletion (with a clear reason) rather than silently orphaning
// that history; only a genuinely unused profile is hard-deleted.
export async function deleteGuest(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const [purchaseRows, bookingRows] = await Promise.all([
    db.select({ id: ticketPurchases.id }).from(ticketPurchases).where(eq(ticketPurchases.customerId, id)).limit(1),
    db.select({ id: facilityBookings.id }).from(facilityBookings).where(eq(facilityBookings.customerId, id)).limit(1),
  ]);
  if (purchaseRows.length || bookingRows.length) throw new Error("This customer has existing ticket purchases or facility bookings and cannot be removed");
  await db.delete(guests).where(eq(guests.id, id));
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
//
// PRD Round 9, Section 5: ordered by discount DESC, not id DESC. Migration
// 0030 collapsed every legacy rule (old fixed 'waterpark' AND 'companion'
// enums alike) onto the single new Water Park Entry ticket type, so an
// entity can legitimately hold two overlapping rules for one ticket type.
// Picking by newest id made which one applied arbitrary — one silently
// shadowed the other, which is what "the discount sometimes doesn't apply"
// looked like on the desk. The partner is now always given the best rule
// they actually hold.
export async function resolveActivePartnerDiscountRule(partnerEntityId: number, appliesTo: "ticket_type" | "facility", match: { ticketTypeId?: number; facilityTypeId?: number }) {
  const db = await getDb(); if (!db) return undefined;
  const conditions = [
    eq(partnerDiscountRules.partnerEntityId, partnerEntityId), eq(partnerDiscountRules.appliesTo, appliesTo), eq(partnerDiscountRules.isActive, true),
    sql`${partnerDiscountRules.validFrom} <= CURDATE()`, sql`${partnerDiscountRules.validUntil} >= CURDATE()`,
  ];
  if (appliesTo === "ticket_type" && match.ticketTypeId) conditions.push(eq(partnerDiscountRules.ticketTypeId, match.ticketTypeId));
  if (appliesTo === "facility" && match.facilityTypeId) conditions.push(eq(partnerDiscountRules.facilityTypeId, match.facilityTypeId));
  const rows = await db.select().from(partnerDiscountRules).where(and(...conditions)).orderBy(desc(partnerDiscountRules.discountPercentage), desc(partnerDiscountRules.id)).limit(1);
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
  return createRevenueCategory({ name, code: await uniqueRevenueCategoryCode(code), createdBy } as any);
}

// PRD Round 17, item 3.2: revenue_categories.code is UNIQUE, so a Ticket or
// Facility Type whose code an unrelated, differently-named revenue category
// already uses (e.g. one the Admin created by hand) made the auto-link
// insert fail outright — and with it the whole Finance Control revenue
// category list. Reuse the code when free, otherwise suffix it (_2, _3, ...)
// within the column's 32-character limit.
async function uniqueRevenueCategoryCode(code: string) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const base = (code || "REVENUE").slice(0, 32);
  const taken = async (candidate: string) => (await db.select({ id: revenueCategories.id }).from(revenueCategories).where(eq(revenueCategories.code, candidate)).limit(1)).length > 0;
  if (!(await taken(base))) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 32 - String(suffix).length - 1)}_${suffix}`;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error(`Could not find a free revenue category code for ${base}`);
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
// PRD Round 14, Section 5: a booking no longer posts revenue at creation —
// it's saved as "booking" (awaiting payment) and stays that way, with the
// facility+add-on line items recorded but no finance_entries/revenue_records
// at all, until addFacilityBookingPayment (Stage 2) actually runs. That
// keeps a called-and-reserved-but-never-paid booking from ever inflating
// revenue, matching Stage 3's "nothing to reverse" auto-cancel guarantee.
export async function createFacilityBooking(data: {
  facilityTypeId: number; facilityTypeName: string; facilityCategoryId: number; facilityCategoryName: string;
  bookingDate: string; startTime?: string | null; quantity: string; facilityAmount: string; vatAmount: string; facilityVatAmount: string; feeAmount: string;
  addons: Array<{ addonServiceId: number; addonServiceName: string; categoryId: number; categoryName: string; quantity: string; amount: string; vatAmount: string }>;
  customerId?: number | null; customerName?: string; paymentMethod?: "cash" | "card" | "bank" | "mixed"; notes?: string; createdBy: number;
  partnerEntity?: { id: number; name: string; discountPercentage: string } | null;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const addonsAmountMinor = data.addons.reduce((sum, addon) => sum + moneyToMinor(addon.amount), 0);
  const facilityAmountMinor = moneyToMinor(data.facilityAmount);
  const vatAmountMinor = moneyToMinor(data.vatAmount);
  const feeAmountMinor = moneyToMinor(data.feeAmount);
  return db.transaction(async (tx) => {
    await tx.insert(facilityBookings).values({
      facilityTypeId: data.facilityTypeId, facilityTypeName: data.facilityTypeName, bookingDate: data.bookingDate, startTime: data.startTime || null, quantity: data.quantity,
      facilityAmount: data.facilityAmount, vatAmount: data.vatAmount, feeAmount: data.feeAmount, addonsAmount: minorToMoney(addonsAmountMinor), totalAmount: minorToMoney(facilityAmountMinor + vatAmountMinor + feeAmountMinor + addonsAmountMinor),
      customerId: data.customerId ?? null, customerName: data.customerName || null, paymentMethod: data.paymentMethod || "cash", notes: data.notes || null, createdBy: data.createdBy,
      partnerEntityId: data.partnerEntity?.id ?? null, partnerEntityName: data.partnerEntity?.name ?? null, discountPercentage: data.partnerEntity?.discountPercentage ?? null,
      status: "booking",
    } as any);
    const bookingRows = await tx.select().from(facilityBookings).orderBy(desc(facilityBookings.id)).limit(1);
    const booking = bookingRows[0]!;

    for (const addon of data.addons) {
      await tx.insert(facilityBookingAddons).values({
        bookingId: booking.id, addonServiceId: addon.addonServiceId, addonServiceName: addon.addonServiceName, quantity: addon.quantity, amount: addon.amount, vatAmount: addon.vatAmount,
      } as any);
    }
    return booking;
  });
}

// PRD Round 14, Section 5, Stage 2: revenue is posted only now, dated to
// the actual payment date (not the original booking date) — the facility
// line and every add-on each get their own VAT-inclusive revenue entry,
// the same split createFacilityBooking used to post immediately before
// this round.
export async function addFacilityBookingPayment(data: { bookingId: number; paymentMethod: "cash" | "card" | "bank" | "mixed"; cashAmount?: string; cardAmount?: string; bankAmount?: string; businessDate: string; paidBy: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, data.bookingId)).limit(1);
    const booking = rows[0];
    if (!booking) throw new Error("Facility booking was not found");
    if (booking.status === "cancelled") throw new Error("This booking has been cancelled and can no longer be paid");
    if (booking.status === "confirmed") throw new Error("This booking has already been paid");
    if (data.paymentMethod === "mixed") validateMixedPaymentBreakdown(String(booking.totalAmount), data);
    const facility = await tx.select().from(facilityTypes).where(eq(facilityTypes.id, booking.facilityTypeId)).limit(1);
    const facilityCategoryId = facility[0]?.revenueCategoryId;
    if (!facilityCategoryId) throw new Error("This booking's facility revenue category is missing");
    const facilityCategory = await tx.select().from(revenueCategories).where(eq(revenueCategories.id, facilityCategoryId)).limit(1);
    if (!facilityCategory[0]) throw new Error("This booking's facility revenue category is missing");

    const addons = await tx.select().from(facilityBookingAddons).where(eq(facilityBookingAddons.bookingId, booking.id));
    const addonsVatAmountMinor = addons.reduce((sum, addon) => sum + moneyToMinor(String(addon.vatAmount)), 0);
    const facilityVatAmountMinor = moneyToMinor(String(booking.vatAmount)) - addonsVatAmountMinor;
    const facilityRevenueAmount = minorToMoney(moneyToMinor(String(booking.facilityAmount)) + facilityVatAmountMinor + moneyToMinor(String(booking.feeAmount)));

    await tx.insert(financeEntries).values({
      date: data.businessDate, stream: "extras", type: "revenue", amount: facilityRevenueAmount,
      description: `Facility booking — ${booking.facilityTypeName}`, referenceType: "facility_booking", referenceId: booking.id, createdBy: data.paidBy,
    } as any);
    const facilityFinanceRows = await tx.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
    await tx.insert(revenueRecords).values({
      businessDate: data.businessDate, categoryId: facilityCategory[0].id, categoryName: facilityCategory[0].name, amount: facilityRevenueAmount,
      description: `Facility booking — ${booking.facilityTypeName}`, financeEntryId: facilityFinanceRows[0]!.id, createdBy: data.paidBy,
    } as any);

    for (const addon of addons) {
      const addonCategory = await tx.select().from(addonServices).where(eq(addonServices.id, addon.addonServiceId)).limit(1);
      const addonCategoryId = addonCategory[0]?.revenueCategoryId;
      const addonCategoryRow = addonCategoryId ? await tx.select().from(revenueCategories).where(eq(revenueCategories.id, addonCategoryId)).limit(1) : [];
      if (!addonCategoryRow[0]) continue;
      const addonRevenueAmount = minorToMoney(moneyToMinor(String(addon.amount)) + moneyToMinor(String(addon.vatAmount)));
      await tx.insert(financeEntries).values({
        date: data.businessDate, stream: "extras", type: "revenue", amount: addonRevenueAmount,
        description: `Facility booking add-on — ${addon.addonServiceName}`, referenceType: "facility_booking_addon", referenceId: booking.id, createdBy: data.paidBy,
      } as any);
      const addonFinanceRows = await tx.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
      await tx.insert(revenueRecords).values({
        businessDate: data.businessDate, categoryId: addonCategoryRow[0].id, categoryName: addonCategoryRow[0].name, amount: addonRevenueAmount,
        description: `Facility booking add-on — ${addon.addonServiceName}`, financeEntryId: addonFinanceRows[0]!.id, createdBy: data.paidBy,
      } as any);
    }

    await tx.update(facilityBookings).set({
      status: "confirmed", paymentMethod: data.paymentMethod, paidAt: new Date(), paidBy: data.paidBy,
      cashAmount: data.paymentMethod === "mixed" ? data.cashAmount || "0" : null, cardAmount: data.paymentMethod === "mixed" ? data.cardAmount || "0" : null, bankAmount: data.paymentMethod === "mixed" ? data.bankAmount || "0" : null,
    } as any).where(eq(facilityBookings.id, booking.id));
    const updated = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, booking.id)).limit(1);
    return updated[0]!;
  });
}

// PRD Round 14, Section 5, Stage 3: a lazy sweep rather than a real
// scheduler — this codebase has no background-job infrastructure, so
// every list/get call self-heals any booking that's aged past the
// Admin-configured window instead, the same "no manual step" philosophy
// applyLegacyMigrations already uses for schema migrations.
// PRD Round 15, Section 6: the window is now per-facility (facility_types
// .autoCancelEnabled/autoCancelHours) rather than one shared global setting,
// so each candidate booking is checked against its own facility's values.
export async function autoCancelOverdueFacilityBookings() {
  const db = await getDb(); if (!db) return;
  const candidates = await db.select({
    id: facilityBookings.id, createdAt: facilityBookings.createdAt,
    autoCancelEnabled: facilityTypes.autoCancelEnabled, autoCancelHours: facilityTypes.autoCancelHours,
  }).from(facilityBookings)
    .innerJoin(facilityTypes, eq(facilityBookings.facilityTypeId, facilityTypes.id))
    .where(eq(facilityBookings.status, "booking"));
  const now = Date.now();
  for (const row of candidates) {
    if (!row.autoCancelEnabled) continue;
    if (new Date(row.createdAt).getTime() >= now - row.autoCancelHours * 3_600_000) continue;
    await db.update(facilityBookings).set({
      status: "cancelled", cancelledAt: new Date(), cancelKind: "auto", cancelReason: "Cancelled automatically (unpaid)",
    } as any).where(eq(facilityBookings.id, row.id));
  }
}

// PRD Round 14, Section 5: warn staff before double-booking a facility on a
// date that already has an unpaid or paid booking, rather than silently
// allowing it — cancelled bookings never block a new one.
// Client feedback (Round 14 follow-up): the conflict check was comparing
// bookings by exact bookingDate equality — but for a "daily" facility,
// bookingDate is only the reservation's start; the actual reserved period
// runs bookingDate..bookingDate+(quantity-1) days. Two bookings entered on
// different days can still reserve overlapping periods (and two bookings
// whose start dates happen to differ were never flagged even when their
// ranges overlapped), so this now computes each existing booking's real
// end date from its own quantity and does a proper range-overlap test
// against the new booking's [fromDate, toDate] — not a same-day check.
function addDays(date: string | Date, days: number) {
  const base = new Date(typeof date === "string" ? date : date.toISOString().slice(0, 10));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// Client feedback (Round 14 follow-up, item 2): the visual availability
// calendar/timeline uses this exact same list — every non-cancelled
// booking for one facility, each with its real [start, end] reservation
// range already computed — so the calendar's highlighting and the
// conflict check below it can never disagree about what's booked.
export async function listFacilityBookingsForFacility(facilityTypeId: number) {
  const db = await getDb(); if (!db) return [];
  const facility = await getFacilityType(facilityTypeId);
  const rows = await db.select({ booking: facilityBookings, customer: guests }).from(facilityBookings)
    .leftJoin(guests, eq(facilityBookings.customerId, guests.id))
    .where(and(eq(facilityBookings.facilityTypeId, facilityTypeId), sql`${facilityBookings.status} != 'cancelled'`))
    .orderBy(desc(facilityBookings.id));
  return rows.map((row) => {
    const start = typeof row.booking.bookingDate === "string" ? row.booking.bookingDate : (row.booking.bookingDate as unknown as Date).toISOString().slice(0, 10);
    const end = facility?.pricingMethod === "daily" ? addDays(start, Number(row.booking.quantity) - 1) : start;
    return { ...row, start, end };
  });
}

export async function findFacilityBookingConflict(facilityTypeId: number, fromDate: string, toDate: string) {
  const candidates = await listFacilityBookingsForFacility(facilityTypeId);
  return candidates.find((candidate) => candidate.start <= toDate && fromDate <= candidate.end);
}

const cancellers = alias(users, "cancellers");

export async function listFacilityBookings(from?: string, to?: string, query?: string, createdBy?: number) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (createdBy !== undefined) conditions.push(eq(facilityBookings.createdBy, createdBy));
  if (from) conditions.push(sql`${facilityBookings.bookingDate} >= ${from}`);
  if (to) conditions.push(sql`${facilityBookings.bookingDate} <= ${to}`);
  if (query?.trim()) {
    const pattern = `%${query.trim()}%`;
    conditions.push(or(sql`LOWER(${facilityBookings.customerName}) LIKE LOWER(${pattern})`, sql`LOWER(${facilityBookings.facilityTypeName}) LIKE LOWER(${pattern})`, sql`${guests.phone} LIKE ${pattern}`));
  }
  const base = db.select({ booking: facilityBookings, customer: guests, cancelledByName: cancellers.name }).from(facilityBookings)
    .leftJoin(guests, eq(facilityBookings.customerId, guests.id))
    .leftJoin(cancellers, eq(facilityBookings.cancelledBy, cancellers.id))
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

// Used to resolve facility_bookings.cancelledBy into a display name for
// "Cancelled manually by [staff name]" (PRD Round 14, Section 5, Stage 3) —
// a one-off lookup rather than a join everywhere getFacilityBooking is
// already called for other purposes (edit/cancel/add-addon validation).
export async function getUserDisplayName(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  return rows[0]?.name || undefined;
}

// PRD Round 4, Section 9.2: edit an existing (confirmed) booking's date and,
// for daily/hourly facilities, its duration — recalculates facilityAmount
// from the facility's current rate and re-applies the booking's own
// (unchanged) discountPercentage snapshot, then keeps the linked
// finance_entries/revenue_records rows in sync so reports reflect the edit.
export async function updateFacilityBookingDetails(id: number, data: { bookingDate: string; quantity: string; facilityAmount: string; vatAmount: string; feeAmount: string; totalAmount: string; customerName?: string | null }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const facilityRevenueAmount = minorToMoney(moneyToMinor(data.facilityAmount) + moneyToMinor(data.vatAmount) + moneyToMinor(data.feeAmount));
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, id)).limit(1);
    const booking = rows[0];
    if (!booking) throw new Error("Facility booking was not found");
    if (booking.status === "cancelled") throw new Error("This booking has been cancelled and can no longer be edited");
    await tx.update(facilityBookings).set({
      bookingDate: data.bookingDate as any, quantity: data.quantity, facilityAmount: data.facilityAmount, vatAmount: data.vatAmount, feeAmount: data.feeAmount, totalAmount: data.totalAmount,
      ...(data.customerName !== undefined ? { customerName: data.customerName } : {}),
    }).where(eq(facilityBookings.id, id));
    await tx.update(financeEntries).set({ date: data.bookingDate as any, amount: facilityRevenueAmount }).where(and(eq(financeEntries.referenceType, "facility_booking"), eq(financeEntries.referenceId, id)));
    const financeRows = await tx.select().from(financeEntries).where(and(eq(financeEntries.referenceType, "facility_booking"), eq(financeEntries.referenceId, id))).limit(1);
    if (financeRows[0]) await tx.update(revenueRecords).set({ businessDate: data.bookingDate as any, amount: facilityRevenueAmount }).where(eq(revenueRecords.financeEntryId, financeRows[0].id));
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
    await tx.update(facilityBookings).set({ status: "cancelled", cancelledAt: new Date(), cancelledBy, cancelReason: reason || null, cancelKind: "manual" } as any).where(eq(facilityBookings.id, id));
    const updated = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, id)).limit(1);
    return updated[0]!;
  });
}

// PRD Round 14 (Client feedback, 25/9/2026): a permanent, reusable "Delete"
// action that replaces "Cancel" once a booking is already cancelled — only
// ever offered on a booking already in that state. cancelFacilityBooking
// above already deletes any revenueRecords/financeEntries tied to this
// booking at cancel time, so the same cleanup here is defensive (a no-op in
// the normal case) rather than the primary mechanism.
export async function deleteFacilityBooking(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(facilityBookings).where(eq(facilityBookings.id, id)).limit(1);
  const booking = rows[0];
  if (!booking) throw new Error("Facility booking was not found");
  if (booking.status !== "cancelled") throw new Error("Only a cancelled booking can be permanently deleted");
  const referenceTypes = ["facility_booking", "facility_booking_addon"];
  const financeRows = await db.select({ id: financeEntries.id }).from(financeEntries)
    .where(and(inArray(financeEntries.referenceType, referenceTypes), eq(financeEntries.referenceId, id)));
  const financeEntryIds = financeRows.map((row) => row.id);
  if (financeEntryIds.length) await db.delete(revenueRecords).where(inArray(revenueRecords.financeEntryId, financeEntryIds));
  await db.delete(financeEntries).where(and(inArray(financeEntries.referenceType, referenceTypes), eq(financeEntries.referenceId, id)));
  await db.delete(facilityBookingAddons).where(eq(facilityBookingAddons.bookingId, id));
  await db.delete(facilityBookings).where(eq(facilityBookings.id, id));
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
  addons: Array<{ addonServiceId: number; addonServiceName: string; categoryId: number; categoryName: string; quantity: string; amount: string; vatAmount: string }>;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const bookingRows = await tx.select().from(facilityBookings).where(eq(facilityBookings.id, data.bookingId)).limit(1);
    const booking = bookingRows[0];
    if (!booking) throw new Error("Facility booking was not found");
    if (booking.status === "cancelled") throw new Error("This booking has been cancelled and can no longer be changed");
    let addonsAmountMinor = moneyToMinor(String(booking.addonsAmount));
    // PRD Round 13: each add-on now carries its own VAT, so the booking's
    // running vatAmount (facility + every add-on's VAT) has to accumulate
    // here too, not just addonsAmount.
    let vatAmountMinor = moneyToMinor(String(booking.vatAmount));
    // PRD Round 14, Section 5: a still-unpaid ("booking") booking must never
    // post revenue — an add-on logged against it just grows the amount due,
    // and gets its own revenue entry later when addFacilityBookingPayment
    // runs. An add-on logged against an already-paid ("confirmed") booking
    // is a later on-site upsell and still posts immediately, unchanged.
    const postRevenueNow = booking.status === "confirmed";
    for (const addon of data.addons) {
      if (postRevenueNow) {
        const addonRevenueAmount = minorToMoney(moneyToMinor(addon.amount) + moneyToMinor(addon.vatAmount));
        await tx.insert(financeEntries).values({
          date: data.businessDate, stream: "extras", type: "revenue", amount: addonRevenueAmount,
          description: `Facility booking add-on — ${addon.addonServiceName}`, referenceType: "facility_booking_addon", referenceId: data.bookingId, createdBy: data.createdBy,
        } as any);
        const financeRows = await tx.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
        await tx.insert(revenueRecords).values({
          businessDate: data.businessDate, categoryId: addon.categoryId, categoryName: addon.categoryName, amount: addonRevenueAmount,
          description: `Facility booking add-on — ${addon.addonServiceName}`, financeEntryId: financeRows[0]!.id, createdBy: data.createdBy,
        } as any);
      }
      await tx.insert(facilityBookingAddons).values({
        bookingId: data.bookingId, addonServiceId: addon.addonServiceId, addonServiceName: addon.addonServiceName, quantity: addon.quantity, amount: addon.amount, vatAmount: addon.vatAmount,
      } as any);
      addonsAmountMinor += moneyToMinor(addon.amount);
      vatAmountMinor += moneyToMinor(addon.vatAmount);
    }
    const addonsAmount = minorToMoney(addonsAmountMinor);
    const vatAmount = minorToMoney(vatAmountMinor);
    // Previously dropped the booking's own vatAmount/feeAmount entirely
    // when recomputing totalAmount here — fixed to include both, matching
    // how create/updateFacilityBookingDetails already compute it.
    const totalAmount = minorToMoney(moneyToMinor(String(booking.facilityAmount)) + vatAmountMinor + moneyToMinor(String(booking.feeAmount)) + addonsAmountMinor);
    await tx.update(facilityBookings).set({ addonsAmount, vatAmount, totalAmount }).where(eq(facilityBookings.id, data.bookingId));
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
  await db.delete(financeSettlements).where(and(eq(financeSettlements.recordType, "expense"), eq(financeSettlements.recordId, id)));
}

// PRD Round 5: multiple attachments per expense/revenue/asset entry,
// addable on both create and edit — a shared table across all three entry
// types rather than three near-identical ones, since the shape (a file plus
// who/when it was uploaded) never differs by entry type.
export async function listAttachmentsForEntry(entryType: "expense" | "revenue" | "asset", entryId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(attachments).where(and(eq(attachments.entryType, entryType), eq(attachments.entryId, entryId))).orderBy(attachments.createdAt);
}

export async function listAttachmentsForEntries(entryType: "expense" | "revenue" | "asset", entryIds: number[]) {
  const db = await getDb(); if (!db || !entryIds.length) return [];
  return db.select().from(attachments).where(and(eq(attachments.entryType, entryType), inArray(attachments.entryId, entryIds))).orderBy(attachments.createdAt);
}

export async function createAttachment(data: { entryType: "expense" | "revenue" | "asset"; entryId: number; path: string; originalName: string; uploadedBy: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(attachments).values(data as any);
  const rows = await db.select().from(attachments).orderBy(desc(attachments.id)).limit(1);
  return rows[0]!;
}

export async function getAttachment(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  return rows[0];
}

export async function deleteAttachment(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(attachments).where(eq(attachments.id, id));
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
  await db.delete(financeSettlements).where(and(eq(financeSettlements.recordType, "revenue"), eq(financeSettlements.recordId, id)));
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
  await db.delete(financeSettlements).where(and(eq(financeSettlements.recordType, "asset"), eq(financeSettlements.recordId, id)));
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

// PRD Round 5: every time the Admin sends/allocates money to a custodian's
// fund, this both bumps fixedAmount (the same balance-affecting effect
// updatePettyCashFundAmount has always had) AND leaves a discrete, timestamped
// record of the event — amount, when, and who sent it — which
// updatePettyCashFundAmount's raw overwrite never did.
export async function createPettyCashAllocation(data: { fundId: number; amount: string; note?: string; createdBy: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const fundRows = await tx.select().from(pettyCashFunds).where(eq(pettyCashFunds.id, data.fundId)).limit(1);
    const fund = fundRows[0];
    if (!fund) throw new Error("Petty cash fund was not found");
    const newAmount = minorToMoney(moneyToMinor(String(fund.fixedAmount)) + moneyToMinor(data.amount));
    await tx.update(pettyCashFunds).set({ fixedAmount: newAmount }).where(eq(pettyCashFunds.id, data.fundId));
    await tx.insert(pettyCashAllocations).values({ fundId: data.fundId, amount: data.amount, note: data.note || null, createdBy: data.createdBy } as any);
    const allocationRows = await tx.select().from(pettyCashAllocations).orderBy(desc(pettyCashAllocations.id)).limit(1);
    const updatedFundRows = await tx.select().from(pettyCashFunds).where(eq(pettyCashFunds.id, data.fundId)).limit(1);
    return { fund: updatedFundRows[0]!, allocation: allocationRows[0]! };
  });
}

export async function listPettyCashAllocations(fundId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ allocation: pettyCashAllocations, sender: users }).from(pettyCashAllocations)
    .leftJoin(users, eq(pettyCashAllocations.createdBy, users.id))
    .where(eq(pettyCashAllocations.fundId, fundId))
    .orderBy(desc(pettyCashAllocations.createdAt));
}

// PRD Round 16, item 11: each spend now carries the expense category the
// custodian chose — stored on its linked expense record, so it's joined in
// here rather than duplicated onto petty_cash_spends.
export async function listPettyCashSpends(fundId: number) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ spend: pettyCashSpends, categoryId: expenseRecords.categoryId, categoryName: expenseRecords.categoryName }).from(pettyCashSpends)
    .leftJoin(expenseRecords, eq(pettyCashSpends.expenseRecordId, expenseRecords.id))
    .where(eq(pettyCashSpends.fundId, fundId)).orderBy(desc(pettyCashSpends.businessDate), desc(pettyCashSpends.id));
  return rows.map((row) => ({ ...row.spend, categoryId: row.categoryId, categoryName: row.categoryName }));
}

export async function setPettyCashFundActive(fundId: number, isActive: boolean) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(pettyCashFunds).set({ isActive }).where(eq(pettyCashFunds.id, fundId));
}

// PRD Round 16, item 14: normalize (zero out) or adjust a custodian's
// balance. Logged as a signed allocation (negative = money taken back), so
// the adjustment appears in the same top-up history as every other change
// to the fund rather than silently overwriting fixedAmount.
export async function adjustPettyCashFundBalance(data: { fundId: number; deltaMinor: number; note?: string; createdBy: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const fundRows = await tx.select().from(pettyCashFunds).where(eq(pettyCashFunds.id, data.fundId)).limit(1);
    const fund = fundRows[0];
    if (!fund) throw new Error("Petty cash fund was not found");
    const currentMinor = Math.round(Number(fund.fixedAmount) * 1000);
    await tx.update(pettyCashFunds).set({ fixedAmount: minorToMoney(currentMinor + data.deltaMinor) }).where(eq(pettyCashFunds.id, data.fundId));
    await tx.insert(pettyCashAllocations).values({ fundId: data.fundId, amount: minorToMoney(data.deltaMinor), note: data.note || null, createdBy: data.createdBy } as any);
    const updatedFundRows = await tx.select().from(pettyCashFunds).where(eq(pettyCashFunds.id, data.fundId)).limit(1);
    return updatedFundRows[0]!;
  });
}

// PRD Round 16, item 11: the custodian (or a manager) can correct a spend
// already logged — the spend, its linked expense record, and that record's
// finance entry are all updated together so the ledger never disagrees with
// the petty cash history.
export async function updatePettyCashSpendWithExpense(id: number, data: {
  businessDate: string; amount: string; description: string; categoryId: number; categoryName: string;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    const spendRows = await tx.select().from(pettyCashSpends).where(eq(pettyCashSpends.id, id)).limit(1);
    const spend = spendRows[0];
    if (!spend) throw new Error("Petty cash spend was not found");
    await tx.update(pettyCashSpends).set({ businessDate: data.businessDate as any, amount: data.amount, description: data.description }).where(eq(pettyCashSpends.id, id));
    if (spend.expenseRecordId) {
      const expenseRows = await tx.select().from(expenseRecords).where(eq(expenseRecords.id, spend.expenseRecordId)).limit(1);
      const record = expenseRows[0];
      await tx.update(expenseRecords).set({
        businessDate: data.businessDate as any, amount: data.amount, paidAmount: data.amount, balanceAmount: "0.000",
        description: data.description, categoryId: data.categoryId, categoryName: data.categoryName,
      } as any).where(eq(expenseRecords.id, spend.expenseRecordId));
      if (record?.financeEntryId) await tx.update(financeEntries).set({ date: data.businessDate as any, amount: data.amount, description: `Petty cash — ${data.description}` } as any).where(eq(financeEntries.id, record.financeEntryId));
    }
    const updated = await tx.select().from(pettyCashSpends).where(eq(pettyCashSpends.id, id)).limit(1);
    return updated[0]!;
  });
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
  // PRD Round 17, item 3.3: only the account fields the screen needs — the
  // whole users row (password hash included) used to be sent to the browser.
  const rows = await db.select({
    fund: pettyCashFunds,
    custodian: { id: users.id, name: users.name, username: users.username, role: users.role, isActive: users.isActive },
  }).from(pettyCashFunds)
    .leftJoin(users, eq(pettyCashFunds.custodianUserId, users.id))
    .orderBy(desc(pettyCashFunds.createdAt));
  const spendTotals = await db.select({ fundId: pettyCashSpends.fundId, total: sql<number>`COALESCE(SUM(${pettyCashSpends.amount}),0)` })
    .from(pettyCashSpends).groupBy(pettyCashSpends.fundId);
  const totalsByFund = new Map(spendTotals.map((row) => [row.fundId, Number(row.total)]));
  // PRD Round 17, item 3.3: a fund whose account no longer resolves (deleted,
  // or created before the fund/account link existed) showed only "—". Every
  // spend posts an expense record whose payee is the custodian's name at the
  // time, so that history names the custodian even when the account is gone.
  const orphanFundIds = rows.filter((row) => !row.custodian?.name && !row.custodian?.username).map((row) => row.fund.id);
  const payeeByFund = new Map<number, string>();
  if (orphanFundIds.length) {
    const payees = await db.select({ fundId: pettyCashSpends.fundId, payee: expenseRecords.payee }).from(pettyCashSpends)
      .innerJoin(expenseRecords, eq(pettyCashSpends.expenseRecordId, expenseRecords.id))
      .where(inArray(pettyCashSpends.fundId, orphanFundIds))
      .orderBy(desc(pettyCashSpends.id));
    for (const row of payees) if (row.payee && !payeeByFund.has(row.fundId)) payeeByFund.set(row.fundId, row.payee);
  }
  return rows.map((row) => {
    const totalSpent = totalsByFund.get(row.fund.id) ?? 0;
    const custodianName = row.custodian?.name || row.custodian?.username || payeeByFund.get(row.fund.id) || null;
    return { ...row, custodianName, accountMissing: !row.custodian, totalSpent, balance: Number(row.fund.fixedAmount) - totalSpent };
  });
}

// PRD Round 17, item 3.3: a Petty Cash Custodian can also be set up from
// Users & Roles (create, or change an existing user's role), which never
// created the fund the Petty Cash screen lists — so that custodian had no
// row, no balance and could not log spending. Idempotent: an existing fund
// is reactivated rather than duplicated (custodianUserId is unique).
export async function ensurePettyCashFundForCustodian(custodianUserId: number, createdBy: number) {
  const existing = await getPettyCashFundByCustodian(custodianUserId);
  if (existing) {
    if (!existing.isActive) await setPettyCashFundActive(existing.id, true);
    return existing;
  }
  return createPettyCashFund({ custodianUserId, fixedAmount: "0.000", createdBy });
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
      paidAmount: data.amount, balanceAmount: "0.000",
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

// PRD Round 9, Section 11: the combined "Tickets" revenue figure stays the
// headline, with this as the per-ticket-type breakdown behind it. Summed
// from the purchase lines (not finance entries, which only carry one
// aqua_park total per purchase) so each ticket type's own earnings are
// visible; refunded purchases are excluded, matching the headline total.
export async function summariseTicketRevenueByType(range: { from: string; to: string }) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({
    ticketTypeId: ticketPurchaseLines.ticketTypeId,
    ticketTypeName: ticketTypes.name,
    ticketGroup: ticketTypes.ticketGroup,
    ticketCount: sql<number>`COUNT(*)`,
    baseSubtotal: sql<string>`SUM(${ticketPurchaseLines.basePrice})`,
    discountAmount: sql<string>`SUM(${ticketPurchaseLines.discountAmount})`,
    totalAmount: sql<string>`SUM(${ticketPurchaseLines.totalAmount})`,
  })
    .from(ticketPurchaseLines)
    .innerJoin(ticketPurchases, eq(ticketPurchaseLines.purchaseId, ticketPurchases.id))
    .leftJoin(ticketTypes, eq(ticketPurchaseLines.ticketTypeId, ticketTypes.id))
    .where(and(eq(ticketPurchases.status, "issued"), sql`${ticketPurchases.visitDate} >= ${range.from}`, sql`${ticketPurchases.visitDate} <= ${range.to}`))
    .groupBy(ticketPurchaseLines.ticketTypeId, ticketTypes.name, ticketTypes.ticketGroup)
    .orderBy(desc(sql`SUM(${ticketPurchaseLines.totalAmount})`));
  return rows.map((row) => ({
    ticketTypeId: row.ticketTypeId,
    // Purchases issued before Round 7 carry no ticketTypeId — they are still
    // real revenue, so they are reported rather than dropped.
    ticketTypeName: row.ticketTypeName ?? "Water Park (legacy)",
    ticketGroup: row.ticketGroup ?? "water_park",
    ticketCount: Number(row.ticketCount || 0),
    baseSubtotal: Number(row.baseSubtotal || 0).toFixed(3),
    discountAmount: Number(row.discountAmount || 0).toFixed(3),
    totalAmount: Number(row.totalAmount || 0).toFixed(3),
  }));
}

// PRD Round 15, Section 7.2: the Facility Type equivalent of the per-ticket-
// type breakdown above — grouped by the facility's own dedicated revenue
// category (facility_types.revenueCategoryId, one per facility since Section
// 2), and scoped to the facility LINE only via financeEntries.referenceType
// (never the separate "facility_booking_addon" entries), so a booking's
// add-on revenue is never double-counted into its facility's own total.
// Only ever includes bookings actually paid (Stage 2) within the range,
// dated to when the revenue was really posted, not the reservation date.
export async function summariseFacilityRevenueByType(range: { from: string; to: string }) {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({
    facilityTypeId: facilityTypes.id,
    facilityTypeName: facilityTypes.name,
    bookingCount: sql<number>`COUNT(*)`,
    totalAmount: sql<string>`SUM(${revenueRecords.amount})`,
  })
    .from(revenueRecords)
    .innerJoin(financeEntries, eq(revenueRecords.financeEntryId, financeEntries.id))
    .innerJoin(facilityTypes, eq(revenueRecords.categoryId, facilityTypes.revenueCategoryId))
    .where(and(
      eq(financeEntries.referenceType, "facility_booking"),
      sql`${revenueRecords.businessDate} >= ${range.from}`,
      sql`${revenueRecords.businessDate} <= ${range.to}`,
    ))
    .groupBy(facilityTypes.id, facilityTypes.name)
    .orderBy(desc(sql`SUM(${revenueRecords.amount})`));
  return rows.map((row) => ({
    facilityTypeId: row.facilityTypeId,
    facilityTypeName: row.facilityTypeName,
    bookingCount: Number(row.bookingCount || 0),
    totalAmount: Number(row.totalAmount || 0).toFixed(3),
  }));
}

// PRD Round 15, Section 7.1: the categories offered when recording a manual
// Revenue transaction must exactly match the live Ticket Types and Facility
// Types — never a separate, hardcoded list — and drop out automatically the
// moment one is retired. Built fresh from both live tables (not from
// revenue_categories directly, which also holds entries an Admin may have
// added independently) and lazily linked to a real ledger category the
// first time a ticket type needs one, the same "self-heal on the read that
// needs it" pattern already used for auto-cancellation and migrations.
export async function listRevenueCategoryOptionsForRecording() {
  const db = await getDb(); if (!db) return [];
  const activeTicketTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.isActive, true));
  const activeFacilityTypes = await db.select().from(facilityTypes).where(eq(facilityTypes.isActive, true));
  const options: { categoryId: number; name: string }[] = [];
  // PRD Round 17, item 3.2: a link to a revenue category that no longer
  // exists (e.g. removed by the Round 15 data reset) is treated like no link
  // at all, and one type that can't be linked is skipped (and logged) instead
  // of failing the whole list — that failure left the Finance Control
  // revenue Category dropdown with nothing to select.
  const existingCategoryIds = new Set((await db.select({ id: revenueCategories.id }).from(revenueCategories)).map((row) => row.id));
  for (const type of activeTicketTypes) {
    let categoryId = type.revenueCategoryId && existingCategoryIds.has(type.revenueCategoryId) ? type.revenueCategoryId : null;
    if (!categoryId) {
      try {
        const category = await findOrCreateRevenueCategoryForFacility(type.name, type.code, type.createdBy);
        await db.update(ticketTypes).set({ revenueCategoryId: category.id }).where(eq(ticketTypes.id, type.id));
        categoryId = category.id;
      } catch (error) {
        console.error(`Could not link ticket type ${type.id} (${type.name}) to a revenue category:`, error);
        continue;
      }
    }
    options.push({ categoryId, name: type.name });
  }
  for (const facility of activeFacilityTypes) {
    let categoryId = existingCategoryIds.has(facility.revenueCategoryId) ? facility.revenueCategoryId : null;
    if (!categoryId) {
      try {
        const category = await findOrCreateRevenueCategoryForFacility(facility.name, facility.code, facility.createdBy);
        await db.update(facilityTypes).set({ revenueCategoryId: category.id }).where(eq(facilityTypes.id, facility.id));
        categoryId = category.id;
      } catch (error) {
        console.error(`Could not link facility type ${facility.id} (${facility.name}) to a revenue category:`, error);
        continue;
      }
    }
    options.push({ categoryId, name: facility.name });
  }
  // PRD Round 16, item 2: any active sub-category the Admin has placed under
  // one of these Ticket/Facility Type categories is offered right beneath it.
  const subCategories = (await listRevenueCategories(false)).filter((category) => category.parentId);
  const withChildren: { categoryId: number; name: string; parentCategoryId: number | null }[] = [];
  for (const option of options) {
    withChildren.push({ ...option, parentCategoryId: null });
    for (const child of subCategories.filter((category) => category.parentId === option.categoryId)) withChildren.push({ categoryId: child.id, name: child.name, parentCategoryId: option.categoryId });
  }
  return withChildren;
}

// PRD Round 9, Section 10: before an Admin retires or removes a library
// entry, say exactly what else in the system is built on it ("This change
// affects pricing for: Water Park Entry, Oman Festival"), so the decision is
// an informed one rather than a silent break discovered later at the desk.
export async function describeSettingDependents(entity: "ticket_type" | "visitor_category" | "revenue_category" | "expense_category" | "asset_category" | "facility_type" | "addon_service" | "partner_entity", id: number) {
  const db = await getDb(); if (!db) return [];
  const affected: string[] = [];
  const push = (label: string, rows: Array<{ name?: string | null }> | number) => {
    if (typeof rows === "number") { if (rows > 0) affected.push(`${label} (${rows})`); return; }
    if (rows.length) affected.push(`${label}: ${rows.map((row) => row.name).filter(Boolean).join(", ")}`);
  };
  const countOf = async (query: Promise<Array<{ total: number }>>) => Number((await query)[0]?.total || 0);

  if (entity === "ticket_type") {
    push("Category pricing", await db.select({ name: visitorCategories.name }).from(ticketPrices).innerJoin(visitorCategories, eq(ticketPrices.categoryId, visitorCategories.id)).where(eq(ticketPrices.ticketTypeId, id)));
    push("Fee items", await db.select({ name: ticketFeeDefinitions.name }).from(serviceRateFees).innerJoin(ticketFeeDefinitions, eq(serviceRateFees.feeId, ticketFeeDefinitions.id)).where(and(eq(serviceRateFees.rateType, "ticket_type"), eq(serviceRateFees.rateId, id), eq(serviceRateFees.isActive, true))));
    push("Partner discount rules", await db.select({ name: partnerEntities.name }).from(partnerDiscountRules).innerJoin(partnerEntities, eq(partnerDiscountRules.partnerEntityId, partnerEntities.id)).where(and(eq(partnerDiscountRules.ticketTypeId, id), eq(partnerDiscountRules.isActive, true))));
    push("Issued tickets", await countOf(db.select({ total: sql<number>`COUNT(*)` }).from(ticketPurchaseLines).where(eq(ticketPurchaseLines.ticketTypeId, id))));
  }
  if (entity === "visitor_category") {
    push("Category pricing", await db.select({ name: ticketTypes.name }).from(ticketPrices).innerJoin(ticketTypes, eq(ticketPrices.ticketTypeId, ticketTypes.id)).where(eq(ticketPrices.categoryId, id)));
    push("Issued tickets", await countOf(db.select({ total: sql<number>`COUNT(*)` }).from(ticketPurchaseLines).where(eq(ticketPurchaseLines.categoryId, id))));
  }
  if (entity === "revenue_category") {
    push("Facility types", await db.select({ name: facilityTypes.name }).from(facilityTypes).where(eq(facilityTypes.revenueCategoryId, id)));
    push("Add-on services", await db.select({ name: addonServices.name }).from(addonServices).where(eq(addonServices.revenueCategoryId, id)));
    push("Revenue records", await countOf(db.select({ total: sql<number>`COUNT(*)` }).from(revenueRecords).where(eq(revenueRecords.categoryId, id))));
  }
  if (entity === "expense_category") push("Expense records", await countOf(db.select({ total: sql<number>`COUNT(*)` }).from(expenseRecords).where(eq(expenseRecords.categoryId, id))));
  if (entity === "asset_category") push("Asset records", await countOf(db.select({ total: sql<number>`COUNT(*)` }).from(assetRecords).where(eq(assetRecords.categoryId, id))));
  if (entity === "facility_type") {
    push("Fee items", await db.select({ name: ticketFeeDefinitions.name }).from(serviceRateFees).innerJoin(ticketFeeDefinitions, eq(serviceRateFees.feeId, ticketFeeDefinitions.id)).where(and(eq(serviceRateFees.rateType, "facility_type"), eq(serviceRateFees.rateId, id), eq(serviceRateFees.isActive, true))));
    push("Partner discount rules", await db.select({ name: partnerEntities.name }).from(partnerDiscountRules).innerJoin(partnerEntities, eq(partnerDiscountRules.partnerEntityId, partnerEntities.id)).where(and(eq(partnerDiscountRules.facilityTypeId, id), eq(partnerDiscountRules.isActive, true))));
    push("Bookings", await countOf(db.select({ total: sql<number>`COUNT(*)` }).from(facilityBookings).where(eq(facilityBookings.facilityTypeId, id))));
  }
  if (entity === "addon_service") push("Booking add-ons", await countOf(db.select({ total: sql<number>`COUNT(*)` }).from(facilityBookingAddons).where(eq(facilityBookingAddons.addonServiceId, id))));
  if (entity === "partner_entity") push("Discount rules", await countOf(db.select({ total: sql<number>`COUNT(*)` }).from(partnerDiscountRules).where(eq(partnerDiscountRules.partnerEntityId, id))));
  return affected;
}

// PRD Round 15 ("Reset All Data" feature): a one-time-use admin tool. Reads
// the singleton row, self-healing the same way facility_booking_settings
// already did before it (insert-if-missing on first read).
export async function getSystemSettings() {
  const db = await getDb(); if (!db) return { id: 1, resetAllDataToolEnabled: true, lastResetAt: null as Date | null, lastResetBy: null as number | null };
  await db.insert(systemSettings).values({ id: 1 }).onDuplicateKeyUpdate({ set: { id: 1 } });
  const rows = await db.select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);
  return rows[0]!;
}

export async function setResetAllDataToolEnabled(enabled: boolean) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await getSystemSettings();
  await db.update(systemSettings).set({ resetAllDataToolEnabled: enabled }).where(eq(systemSettings.id, 1));
  return getSystemSettings();
}

// Client feedback (Round 15): a genuinely destructive, irreversible wipe of
// every transactional/financial/customer record while leaving every
// Commercial Settings configuration table (ticket types, prices, visitor
// categories, discount tiers, facility types, add-on services, fee items,
// partner entities/rules, revenue/expense/asset CATEGORIES, petty cash
// FUNDS, users) completely untouched. Deleting a ticket or booking also
// deletes financeEntries wholesale in the same transaction, so no orphaned
// revenue entry can ever survive the reset — the same guarantee the Round 14
// Cancel -> Delete feature makes for one record at a time. Disables the
// tool afterward (a persisted flag, not a code change) per the client's
// explicit request to keep it reusable for a future season without
// rebuilding it.
export async function resetAllOperationalData(performedBy: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  return db.transaction(async (tx) => {
    await tx.delete(ticketPurchaseFees);
    await tx.delete(ticketPurchaseLines);
    await tx.delete(ticketPurchases);
    await tx.delete(facilityBookingAddons);
    await tx.delete(facilityBookings);
    await tx.delete(financeSettlements);
    await tx.delete(revenueRecords);
    await tx.delete(expenseRecords);
    await tx.delete(assetRecords);
    await tx.delete(revenueAdjustments);
    await tx.delete(expenseAdjustments);
    await tx.delete(assetAdjustments);
    await tx.delete(pettyCashAllocations);
    await tx.delete(pettyCashSpends);
    // Round 15 said Petty Cash "logs/balances" — clearing the logs alone
    // left each fund's allocated total behind, so balances survived the
    // reset. The custodian accounts themselves (configuration) stay.
    await tx.update(pettyCashFunds).set({ fixedAmount: "0.000" });
    await tx.delete(financeEntries);
    await tx.delete(guests);
    await tx.insert(systemSettings).values({ id: 1, resetAllDataToolEnabled: false, lastResetAt: new Date(), lastResetBy: performedBy })
      .onDuplicateKeyUpdate({ set: { resetAllDataToolEnabled: false, lastResetAt: new Date(), lastResetBy: performedBy } });
  });
}

// ─── PRD Round 16, item 4: Payable Account ─────────────────────────────────
// Every Operating Expense, Revenue, or Capital Expenditure transaction that
// still has a Balance Amount outstanding — one combined list, newest first.
export async function listPayables() {
  const db = await getDb(); if (!db) return [];
  const dateOf = (column: any) => sql<string>`DATE_FORMAT(${column}, '%Y-%m-%d')`;
  const [expenses, revenues, assets] = await Promise.all([
    db.select({ id: expenseRecords.id, businessDate: dateOf(expenseRecords.businessDate), categoryName: expenseRecords.categoryName, description: expenseRecords.description, counterparty: expenseRecords.payee, amount: expenseRecords.amount, paidAmount: expenseRecords.paidAmount, balanceAmount: expenseRecords.balanceAmount, lastSettlementDate: sql<string | null>`(SELECT DATE_FORMAT(MAX(fs.settlementDate), '%Y-%m-%d') FROM finance_settlements fs WHERE fs.recordType = 'expense' AND fs.recordId = ${sql.raw("`expense_records`.`id`")})` })
      .from(expenseRecords).where(sql`${expenseRecords.balanceAmount} > 0`),
    db.select({ id: revenueRecords.id, businessDate: dateOf(revenueRecords.businessDate), categoryName: revenueRecords.categoryName, description: revenueRecords.description, counterparty: revenueRecords.source, amount: revenueRecords.amount, paidAmount: revenueRecords.paidAmount, balanceAmount: revenueRecords.balanceAmount, lastSettlementDate: sql<string | null>`(SELECT DATE_FORMAT(MAX(fs.settlementDate), '%Y-%m-%d') FROM finance_settlements fs WHERE fs.recordType = 'revenue' AND fs.recordId = ${sql.raw("`revenue_records`.`id`")})` })
      .from(revenueRecords).where(sql`${revenueRecords.balanceAmount} > 0`),
    db.select({ id: assetRecords.id, businessDate: dateOf(assetRecords.businessDate), categoryName: assetRecords.categoryName, description: assetRecords.description, counterparty: assetRecords.vendor, amount: assetRecords.amount, paidAmount: assetRecords.paidAmount, balanceAmount: assetRecords.balanceAmount, lastSettlementDate: sql<string | null>`(SELECT DATE_FORMAT(MAX(fs.settlementDate), '%Y-%m-%d') FROM finance_settlements fs WHERE fs.recordType = 'asset' AND fs.recordId = ${sql.raw("`asset_records`.`id`")})` })
      .from(assetRecords).where(sql`${assetRecords.balanceAmount} > 0`),
  ]);
  return [
    ...expenses.map((row) => ({ ...row, type: "expense" as const })),
    ...revenues.map((row) => ({ ...row, type: "revenue" as const })),
    ...assets.map((row) => ({ ...row, type: "asset" as const })),
  ].sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.id - a.id);
}

// The resort's own calendar day (Oman, UTC+4) — a payment recorded just
// after midnight belongs to the new day, not to UTC's previous one.
export function businessToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const recordTableFor = (type: "expense" | "revenue" | "asset") => type === "expense" ? expenseRecords : type === "revenue" ? revenueRecords : assetRecords;

// Round 16 follow-up: settling a Balance records the payment itself, dated
// automatically to the day it is entered (the settlement date), and raises
// the transaction's Paid / lowers its Balance in the same database
// transaction. Total, category, date and the linked finance entry are never
// touched, so Financial Status (which counts Totals) doesn't move — and Cash
// Flow counts this payment on its settlement date, so an earlier, closed
// period's Cash Flow stays exactly as it was reported.
export async function recordSettlement(type: "expense" | "revenue" | "asset", id: number, amount: string, createdBy: number, paymentAccount: "cash" | "bank" = "cash") {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const table = recordTableFor(type);
  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(table).where(eq(table.id, id)).for("update");
    if (!record) throw new Error("Transaction was not found");
    const totalMinor = moneyToMinor(String(record.amount));
    const paidMinor = moneyToMinor(String(record.paidAmount ?? record.amount));
    const payMinor = moneyToMinor(amount);
    if (payMinor <= 0) throw new Error("Enter a payment amount");
    if (paidMinor + payMinor > totalMinor) throw new Error("This payment is more than the balance still owed");
    const paidAmount = minorToMoney(paidMinor + payMinor);
    const balanceAmount = minorToMoney(totalMinor - paidMinor - payMinor);
    const settlementDate = businessToday();
    await tx.update(table).set({ paidAmount, balanceAmount } as any).where(eq(table.id, id));
    await tx.insert(financeSettlements).values({ recordType: type, recordId: id, amount: minorToMoney(payMinor), settlementDate: settlementDate as any, paymentAccount, createdBy });
    return { paidAmount, balanceAmount, settlementDate };
  });
}

export async function listSettlementsFor(type: "expense" | "revenue" | "asset", id: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ id: financeSettlements.id, amount: financeSettlements.amount, paymentAccount: financeSettlements.paymentAccount, settlementDate: sql<string>`DATE_FORMAT(${financeSettlements.settlementDate}, '%Y-%m-%d')`, createdBy: financeSettlements.createdBy, createdByName: users.name, createdAt: financeSettlements.createdAt })
    .from(financeSettlements).leftJoin(users, eq(users.id, financeSettlements.createdBy))
    .where(and(eq(financeSettlements.recordType, type), eq(financeSettlements.recordId, id)))
    .orderBy(desc(financeSettlements.settlementDate), desc(financeSettlements.id));
}

/** Total already paid through later settlements — an edit may never set a
 * transaction's Paid below this, or those payments would be undone. */
export async function getSettledTotal(type: "expense" | "revenue" | "asset", id: number) {
  const db = await getDb(); if (!db) return 0;
  const [row] = await db.select({ total: sql<string>`COALESCE(SUM(${financeSettlements.amount}), 0)` }).from(financeSettlements)
    .where(and(eq(financeSettlements.recordType, type), eq(financeSettlements.recordId, id)));
  return Number(row?.total || 0);
}

// ─── PRD Round 16, items 6/7/10: Cash Flow ─────────────────────────────────
// Calculated entirely from existing records — nothing historical is changed:
//   + every Revenue finance entry (ticket sales, facility bookings, manual
//     revenue, revenue opening balances) at its PAID amount when it has a
//     linked revenue record, otherwise its full amount
//   − every Expense finance entry at its linked record's PAID amount
//   − every Capital Expenditure record's PAID amount
//   (in each case less any later payments — see below)
//   ± each later payment against a Balance, on its own settlement date
//   ± the Admin's opening balance and manual adjustments (Commercial Settings)
// Records created before Round 16 are fully paid (backfilled), so for them
// paid = amount and this matches the Financial Status totals exactly.
export async function listCashFlowAdjustments() {
  const db = await getDb(); if (!db) return [];
  return db.select({ adjustment: cashFlowAdjustments, createdByName: users.name }).from(cashFlowAdjustments)
    .leftJoin(users, eq(cashFlowAdjustments.createdBy, users.id))
    .orderBy(desc(cashFlowAdjustments.businessDate), desc(cashFlowAdjustments.id));
}

export async function createCashFlowAdjustment(data: { businessDate: string; type: "opening" | "add" | "deduct"; amount: string; note?: string; account?: "cash" | "bank"; createdBy: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(cashFlowAdjustments).values({ ...data, businessDate: data.businessDate as any, note: data.note || null } as any);
  const rows = await db.select().from(cashFlowAdjustments).orderBy(desc(cashFlowAdjustments.id)).limit(1);
  return rows[0]!;
}

export async function deleteCashFlowAdjustment(id: number) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.delete(cashFlowAdjustments).where(eq(cashFlowAdjustments.id, id));
}

// PRD Round 17, item 5.1: every movement also carries how much of it went
// through the Bank Account (card counts as bank); the rest is Cash Account.
type CashMovement = { date: string; kind: "tickets" | "facilities" | "otherRevenue" | "expense" | "capex" | "adjustment"; description: string; inAmount: number; outAmount: number; bankIn: number; bankOut: number };
type PaymentSplitSource = { paymentMethod: string | null; totalAmount: unknown; cashAmount: unknown; cardAmount: unknown; bankAmount: unknown };

// Fraction of a ticket purchase / facility booking paid through the bank:
// card and bank transfer are Bank, cash is Cash, and a mixed payment uses
// its recorded Cash/Card/Bank split.
export function bankFractionOf(source: PaymentSplitSource | undefined) {
  if (!source) return 0;
  if (source.paymentMethod === "card" || source.paymentMethod === "bank") return 1;
  if (source.paymentMethod !== "mixed") return 0;
  const total = Number(source.totalAmount || 0);
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, (Number(source.cardAmount || 0) + Number(source.bankAmount || 0)) / total));
}

async function listCashMovements(range: { before?: string; from?: string; to?: string }): Promise<CashMovement[]> {
  const db = await getDb(); if (!db) return [];
  const within = (column: any) => range.before
    ? sql`${column} < ${range.before}`
    : and(sql`${column} >= ${range.from}`, sql`${column} <= ${range.to}`);
  const dateOf = (column: any) => sql<string>`DATE_FORMAT(${column}, '%Y-%m-%d')`;
  // Pre-go-live "Opening balance" entries (Commercial Settings) describe
  // history, not cash that moved in the system — the Cash Flow opening
  // balance is the single figure for the cash position at go-live, so they
  // are left out here rather than counted twice.
  const notOpening = (column: any) => sql`(${column} IS NULL OR ${column} NOT LIKE 'Opening balance%')`;
  // Payments made later against a Balance are counted on their own
  // settlement date (below), so a transaction's own date carries only what
  // was paid when it was recorded: Paid minus everything settled since.
  // The record table is named explicitly: in a single-table select Drizzle
  // renders a bare `id`, which inside this subquery would bind to fs.id.
  const settledFor = (type: "expense" | "revenue" | "asset") =>
    sql<string>`(SELECT COALESCE(SUM(fs.amount), 0) FROM finance_settlements fs WHERE fs.recordType = ${type} AND fs.recordId = ${sql.raw(`\`${type}_records\`.\`id\``)})`;
  const settlementJoin = (type: "expense" | "revenue" | "asset") => and(eq(financeSettlements.recordType, type), within(financeSettlements.settlementDate));
  const [revenueRows, expenseRows, assetRows, adjustmentRows, revenueSettlements, expenseSettlements, assetSettlements] = await Promise.all([
    db.select({ date: dateOf(financeEntries.date), description: financeEntries.description, referenceType: financeEntries.referenceType, referenceId: financeEntries.referenceId, amount: financeEntries.amount, linkedPaid: revenueRecords.paidAmount, linkedAmount: revenueRecords.amount, linkedAccount: revenueRecords.paymentAccount, settled: settledFor("revenue") })
      .from(financeEntries).leftJoin(revenueRecords, eq(revenueRecords.financeEntryId, financeEntries.id))
      .where(and(eq(financeEntries.type, "revenue"), within(financeEntries.date), notOpening(financeEntries.description))),
    db.select({ date: dateOf(financeEntries.date), description: financeEntries.description, amount: financeEntries.amount, linkedPaid: expenseRecords.paidAmount, linkedAmount: expenseRecords.amount, linkedAccount: expenseRecords.paymentAccount, settled: settledFor("expense") })
      .from(financeEntries).leftJoin(expenseRecords, eq(expenseRecords.financeEntryId, financeEntries.id))
      .where(and(eq(financeEntries.type, "expense"), within(financeEntries.date), notOpening(financeEntries.description))),
    db.select({ date: dateOf(assetRecords.businessDate), description: assetRecords.description, amount: assetRecords.amount, paidAmount: assetRecords.paidAmount, paymentAccount: assetRecords.paymentAccount, settled: settledFor("asset") })
      .from(assetRecords).where(and(within(assetRecords.businessDate), notOpening(assetRecords.description))),
    db.select({ date: dateOf(cashFlowAdjustments.businessDate), type: cashFlowAdjustments.type, amount: cashFlowAdjustments.amount, note: cashFlowAdjustments.note, account: cashFlowAdjustments.account })
      .from(cashFlowAdjustments).where(within(cashFlowAdjustments.businessDate)),
    db.select({ date: dateOf(financeSettlements.settlementDate), amount: financeSettlements.amount, paymentAccount: financeSettlements.paymentAccount, description: revenueRecords.description, referenceType: financeEntries.referenceType })
      .from(financeSettlements).innerJoin(revenueRecords, eq(revenueRecords.id, financeSettlements.recordId))
      .leftJoin(financeEntries, eq(financeEntries.id, revenueRecords.financeEntryId))
      .where(and(settlementJoin("revenue"), notOpening(revenueRecords.description))),
    db.select({ date: dateOf(financeSettlements.settlementDate), amount: financeSettlements.amount, paymentAccount: financeSettlements.paymentAccount, description: expenseRecords.description })
      .from(financeSettlements).innerJoin(expenseRecords, eq(expenseRecords.id, financeSettlements.recordId))
      .where(and(settlementJoin("expense"), notOpening(expenseRecords.description))),
    db.select({ date: dateOf(financeSettlements.settlementDate), amount: financeSettlements.amount, paymentAccount: financeSettlements.paymentAccount, description: assetRecords.description })
      .from(financeSettlements).innerJoin(assetRecords, eq(assetRecords.id, financeSettlements.recordId))
      .where(and(settlementJoin("asset"), notOpening(assetRecords.description))),
  ]);
  const paidOf = (linkedPaid: unknown, linkedAmount: unknown, entryAmount: unknown, settled: unknown = 0) =>
    Math.round((Number(linkedPaid ?? linkedAmount ?? entryAmount ?? 0) - Number(settled || 0)) * 1000) / 1000;
  const revenueKind = (referenceType: unknown): CashMovement["kind"] => referenceType === "prd_ticket_purchase" ? "tickets" : referenceType === "facility_booking" || referenceType === "facility_booking_addon" ? "facilities" : "otherRevenue";
  // Ticket purchases and facility bookings carry their own payment method
  // and mixed split; look those up for the revenue entries that point at them.
  const purchaseIds = Array.from(new Set(revenueRows.filter((row) => row.referenceType === "prd_ticket_purchase" && row.referenceId).map((row) => row.referenceId!)));
  const bookingIds = Array.from(new Set(revenueRows.filter((row) => (row.referenceType === "facility_booking" || row.referenceType === "facility_booking_addon") && row.referenceId).map((row) => row.referenceId!)));
  const splitColumns = (table: typeof ticketPurchases | typeof facilityBookings) => ({ id: table.id, paymentMethod: table.paymentMethod, totalAmount: table.totalAmount, cashAmount: table.cashAmount, cardAmount: table.cardAmount, bankAmount: table.bankAmount });
  const [purchaseSplits, bookingSplits] = await Promise.all([
    purchaseIds.length ? db.select(splitColumns(ticketPurchases)).from(ticketPurchases).where(inArray(ticketPurchases.id, purchaseIds)) : Promise.resolve([]),
    bookingIds.length ? db.select(splitColumns(facilityBookings)).from(facilityBookings).where(inArray(facilityBookings.id, bookingIds)) : Promise.resolve([]),
  ]);
  const purchaseSplitById = new Map(purchaseSplits.map((row) => [row.id, row]));
  const bookingSplitById = new Map(bookingSplits.map((row) => [row.id, row]));
  const round3 = (value: number) => Math.round(value * 1000) / 1000;
  const bankShare = (amount: number, fraction: number) => round3(amount * fraction);
  const accountFraction = (account: unknown) => account === "bank" ? 1 : 0;
  const revenueBankFraction = (row: (typeof revenueRows)[number]) => {
    if (row.referenceType === "prd_ticket_purchase") return bankFractionOf(purchaseSplitById.get(row.referenceId!));
    if (row.referenceType === "facility_booking" || row.referenceType === "facility_booking_addon") return bankFractionOf(bookingSplitById.get(row.referenceId!));
    return accountFraction(row.linkedAccount);
  };
  const movements: CashMovement[] = [];
  for (const row of revenueRows) {
    const inAmount = paidOf(row.linkedPaid, row.linkedAmount, row.amount, row.settled);
    movements.push({ date: row.date, kind: revenueKind(row.referenceType), description: row.description || "", inAmount, outAmount: 0, bankIn: bankShare(inAmount, revenueBankFraction(row)), bankOut: 0 });
  }
  for (const row of expenseRows) {
    const outAmount = paidOf(row.linkedPaid, row.linkedAmount, row.amount, row.settled);
    movements.push({ date: row.date, kind: "expense", description: row.description || "", inAmount: 0, outAmount, bankIn: 0, bankOut: bankShare(outAmount, accountFraction(row.linkedAccount)) });
  }
  for (const row of assetRows) {
    const outAmount = paidOf(row.paidAmount, row.amount, 0, row.settled);
    movements.push({ date: row.date, kind: "capex", description: row.description || "", inAmount: 0, outAmount, bankIn: 0, bankOut: bankShare(outAmount, accountFraction(row.paymentAccount)) });
  }
  for (const row of revenueSettlements) { const amount = Number(row.amount || 0); movements.push({ date: row.date, kind: revenueKind(row.referenceType), description: `${row.description || ""} — balance received`, inAmount: amount, outAmount: 0, bankIn: bankShare(amount, accountFraction(row.paymentAccount)), bankOut: 0 }); }
  for (const row of expenseSettlements) { const amount = Number(row.amount || 0); movements.push({ date: row.date, kind: "expense", description: `${row.description || ""} — balance paid`, inAmount: 0, outAmount: amount, bankIn: 0, bankOut: bankShare(amount, accountFraction(row.paymentAccount)) }); }
  for (const row of assetSettlements) { const amount = Number(row.amount || 0); movements.push({ date: row.date, kind: "capex", description: `${row.description || ""} — balance paid`, inAmount: 0, outAmount: amount, bankIn: 0, bankOut: bankShare(amount, accountFraction(row.paymentAccount)) }); }
  for (const row of adjustmentRows) {
    const amount = Number(row.amount || 0);
    const label = row.type === "opening" ? "Opening balance" : row.type === "add" ? "Adjustment (added)" : "Adjustment (deducted)";
    const accountLabel = row.account === "bank" ? "Bank Account" : "Cash Account";
    const inAmount = row.type === "deduct" ? 0 : amount;
    const outAmount = row.type === "deduct" ? amount : 0;
    movements.push({ date: row.date, kind: "adjustment", description: `${label} (${accountLabel})${row.note ? ` — ${row.note}` : ""}`, inAmount, outAmount, bankIn: row.account === "bank" ? inAmount : 0, bankOut: row.account === "bank" ? outAmount : 0 });
  }
  return movements.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getCashFlowStatus(from: string, to: string) {
  const [before, period, receivablePayable] = await Promise.all([listCashMovements({ before: from }), listCashMovements({ from, to }), getReceivablePayableAsAt(to)]);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const sumOf = (rows: CashMovement[], pick: (row: CashMovement) => number) => round(rows.reduce((total, row) => total + pick(row), 0));
  const openingBalance = sumOf(before, (row) => row.inAmount - row.outAmount);
  const byKind = (kind: CashMovement["kind"], side: "inAmount" | "outAmount") => sumOf(period.filter((row) => row.kind === kind), (row) => row[side]);
  const inflows = { tickets: byKind("tickets", "inAmount"), facilities: byKind("facilities", "inAmount"), otherRevenue: byKind("otherRevenue", "inAmount") };
  const outflows = { expenses: byKind("expense", "outAmount"), capex: byKind("capex", "outAmount") };
  const adjustments = { added: byKind("adjustment", "inAmount"), deducted: byKind("adjustment", "outAmount") };
  const totalIn = round(inflows.tickets + inflows.facilities + inflows.otherRevenue);
  const totalOut = round(outflows.expenses + outflows.capex);
  const closingBalance = round(openingBalance + totalIn - totalOut + adjustments.added - adjustments.deducted);
  // PRD Round 17, items 5.1/5.2: the same figures per ledger — the Bank
  // Account (bank transfers and card) and the Cash Account (the rest). The
  // two always add up to the combined figures above.
  const accountSummary = (bank: boolean) => {
    const inOf = (row: CashMovement) => bank ? row.bankIn : round(row.inAmount - row.bankIn);
    const outOf = (row: CashMovement) => bank ? row.bankOut : round(row.outAmount - row.bankOut);
    const nonAdjustment = period.filter((row) => row.kind !== "adjustment");
    const adjustmentRows = period.filter((row) => row.kind === "adjustment");
    const opening = sumOf(before, (row) => inOf(row) - outOf(row));
    const moneyIn = sumOf(nonAdjustment, inOf);
    const moneyOut = sumOf(nonAdjustment, outOf);
    const added = sumOf(adjustmentRows, inOf);
    const deducted = sumOf(adjustmentRows, outOf);
    return { openingBalance: opening, moneyIn, moneyOut, added, deducted, closingBalance: round(opening + moneyIn - moneyOut + added - deducted) };
  };
  return {
    from, to, openingBalance, inflows: { ...inflows, total: totalIn }, outflows: { ...outflows, total: totalOut }, adjustments, closingBalance,
    accounts: { cash: accountSummary(false), bank: accountSummary(true) },
    receivable: receivablePayable.receivable, payable: receivablePayable.payable,
    movements: period,
  };
}

// PRD Round 17, item 5.2: Account Receivable (revenue recorded but not yet
// received) and Account Payable (expenses and capital expenditure recorded
// but not yet paid), as they stood at the end of `asAt`. A record dated on or
// before `asAt` is outstanding by its Total minus what was paid when it was
// recorded minus every settlement made on or before `asAt` — so a balance
// paid off after the period still shows as outstanding for that period.
export async function getReceivablePayableAsAt(asAt: string) {
  const db = await getDb();
  const empty = { total: 0, count: 0, rows: [] as Array<{ type: "revenue" | "expense" | "asset"; id: number; businessDate: string; categoryName: string; description: string; amount: number; outstanding: number }> };
  if (!db) return { receivable: empty, payable: empty };
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const outstandingOf = async (type: "revenue" | "expense" | "asset") => {
    const table = type === "revenue" ? revenueRecords : type === "expense" ? expenseRecords : assetRecords;
    const recordId = sql.raw(`\`${type}_records\`.\`id\``);
    const rows = await db.select({
      id: table.id, businessDate: sql<string>`DATE_FORMAT(${table.businessDate}, '%Y-%m-%d')`, categoryName: table.categoryName, description: table.description,
      amount: table.amount, paidAmount: table.paidAmount,
      settledAll: sql<string>`(SELECT COALESCE(SUM(fs.amount), 0) FROM finance_settlements fs WHERE fs.recordType = ${type} AND fs.recordId = ${recordId})`,
      settledToDate: sql<string>`(SELECT COALESCE(SUM(fs.amount), 0) FROM finance_settlements fs WHERE fs.recordType = ${type} AND fs.recordId = ${recordId} AND fs.settlementDate <= ${asAt})`,
    }).from(table).where(sql`${table.businessDate} <= ${asAt}`);
    return rows.map((row) => {
      const initiallyPaid = Number(row.paidAmount ?? row.amount) - Number(row.settledAll || 0);
      return { type, id: row.id, businessDate: row.businessDate, categoryName: row.categoryName, description: row.description || "", amount: Number(row.amount), outstanding: round(Number(row.amount) - initiallyPaid - Number(row.settledToDate || 0)) };
    }).filter((row) => row.outstanding > 0.0005);
  };
  const [revenue, expense, asset] = await Promise.all([outstandingOf("revenue"), outstandingOf("expense"), outstandingOf("asset")]);
  const summarise = (rows: typeof revenue) => ({ total: round(rows.reduce((sum, row) => sum + row.outstanding, 0)), count: rows.length, rows: rows.sort((a, b) => a.businessDate.localeCompare(b.businessDate)) });
  return { receivable: summarise(revenue), payable: summarise([...expense, ...asset]) };
}

// ─── PRD Round 16, item 2: one-level category hierarchy ─────────────────────
export async function assertValidCategoryParent(kind: "expense" | "revenue" | "asset", categoryId: number | undefined, parentId: number | null | undefined) {
  if (parentId === undefined || parentId === null) return;
  const table = kind === "expense" ? expenseCategories : kind === "revenue" ? revenueCategories : assetCategories;
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  if (categoryId !== undefined && parentId === categoryId) throw new Error("A category cannot be its own parent");
  const parentRows = await db.select().from(table).where(eq(table.id, parentId)).limit(1);
  const parent = parentRows[0];
  if (!parent) throw new Error("The chosen main category was not found");
  if (parent.parentId) throw new Error("Sub-categories can only be placed under a main category");
  if (categoryId !== undefined) {
    const children = await db.select({ id: table.id }).from(table).where(eq(table.parentId, categoryId)).limit(1);
    if (children.length) throw new Error("This category has sub-categories of its own, so it can't become a sub-category");
  }
}

// PRD Round 16, item 2: a report on one category — a main category covers
// itself and all its sub-categories; a sub-category covers only itself.
// Revenue also includes ticket sales, attributed through each ticket type's
// own revenue category (the same per-line totals as the ticket breakdown).
export async function getCategoryReport(kind: "expense" | "revenue" | "asset", categoryId: number, from?: string, to?: string) {
  const db = await getDb(); if (!db) return { categoryIds: [], rows: [] };
  const categoryTable = kind === "expense" ? expenseCategories : kind === "revenue" ? revenueCategories : assetCategories;
  const children = await db.select({ id: categoryTable.id }).from(categoryTable).where(eq(categoryTable.parentId, categoryId));
  const categoryIds = [categoryId, ...children.map((child) => child.id)];
  const recordTable = kind === "expense" ? expenseRecords : kind === "revenue" ? revenueRecords : assetRecords;
  const conditions: any[] = [inArray(recordTable.categoryId, categoryIds)];
  if (from) conditions.push(sql`${recordTable.businessDate} >= ${from}`);
  if (to) conditions.push(sql`${recordTable.businessDate} <= ${to}`);
  const records = await db.select().from(recordTable).where(and(...conditions)).orderBy(desc(recordTable.businessDate), desc(recordTable.id));
  const rows = records.map((record: any) => ({
    date: String(record.businessDate instanceof Date ? record.businessDate.toISOString() : record.businessDate).slice(0, 10),
    categoryName: record.categoryName,
    description: record.description || record.payee || record.source || record.vendor || "",
    amount: String(record.amount),
    paidAmount: String(record.paidAmount ?? record.amount),
    balanceAmount: String(record.balanceAmount ?? "0.000"),
  }));
  if (kind === "revenue") {
    const ticketConditions: any[] = [eq(ticketPurchases.status, "issued"), inArray(ticketTypes.revenueCategoryId, categoryIds)];
    if (from) ticketConditions.push(sql`${ticketPurchases.visitDate} >= ${from}`);
    if (to) ticketConditions.push(sql`${ticketPurchases.visitDate} <= ${to}`);
    const ticketRows = await db.select({
      purchaseId: ticketPurchases.id,
      date: sql<string>`DATE_FORMAT(${ticketPurchases.visitDate}, '%Y-%m-%d')`,
      ticketTypeName: ticketTypes.name,
      ticketCount: sql<number>`COUNT(*)`,
      totalAmount: sql<string>`SUM(${ticketPurchaseLines.totalAmount})`,
    })
      .from(ticketPurchaseLines)
      .innerJoin(ticketPurchases, eq(ticketPurchaseLines.purchaseId, ticketPurchases.id))
      .innerJoin(ticketTypes, eq(ticketPurchaseLines.ticketTypeId, ticketTypes.id))
      .where(and(...ticketConditions))
      .groupBy(ticketPurchases.id, ticketPurchases.visitDate, ticketTypes.name);
    for (const row of ticketRows) {
      const amount = Number(row.totalAmount || 0).toFixed(3);
      rows.push({ date: row.date, categoryName: row.ticketTypeName, description: `Ticket sale #${row.purchaseId} — ${row.ticketCount} × ${row.ticketTypeName}`, amount, paidAmount: amount, balanceAmount: "0.000" });
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
  }
  return { categoryIds, rows };
}
