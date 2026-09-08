import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createAquaTicket, createDailyTask, createFinanceEntry, createGuest, createLocalUser, createPettyCashRequest, deleteFinanceEntry, deleteFinanceEntryByReference,
  createHousekeepingTask, createInventoryItem, createMaintenanceRequest,
  createLeaveRequest, createReservation, createShift, createStaffProfile, createUnit,
  createWorkbookImport, getActivityLog, getAquaAttendance, getAquaCapacity, getFinanceEntry,
  getOccupancyStats, getRevenueSummary, getUserByUsername, linkStaffToUser,
  isValidDateRange, listAquaTickets, listAttendance, listDailyTasks, listFinanceEntries, listGuests,
  listHousekeepingTasks, listInventory, listMaintenanceRequests,
  listDailySettlements, listLeaveRequests, listPettyCashRequests, listReservations, listShifts, listStaff, listUnits, listUsers,
  hasReservationOverlap, isQaReservationRecord, listWorkbookImports, logActivity, recordAttendance, recordEntry, reviewDailySettlement, reviewLeaveRequest, reviewPettyCashRequest, saveDailySettlement, setAquaCapacity,
  updateDailyTask, updateFinanceEntry, updateHousekeepingTask, updateInventoryItem,
  revokeAllUserSessions, updateLocalUser, updateMaintenanceRequest, updateReservationStatus, updateUnitStatus,
  updateUserRole,
} from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { hashPassword } from "../auth";
import { canIssueAquaTickets, remainingAquaCapacity } from "../operationRules";
import {
  createExpenseCategory, createExpenseRecord, createSalesTransaction, createServiceRate, createTicketFee, deleteExpenseCategory,
  deleteExpenseRecord, deleteTicketFee, getExpenseCategory, getExpenseRecord, getOperationalFinancialSummary, getSalesTransactionByToken,
  getServiceRate, listApplicableTicketFees, listExpenseCategories, listExpenseRecords, listFeeAssignments, listRecentTicketScans,
  listSalesTransactionLines, listSalesTransactions, listServiceRates, listTicketFees, recordTicketScan, replaceFeeAssignments,
  searchCustomers, getCustomerByPhone, updateExpenseCategory, updateExpenseRecord, updateServiceRate, updateTicketFee, deleteServiceRate,
  createPrdTicketPurchase, listPrdRates, findConflictingActivePrdRate, listTicketDiscountTiers, createTicketDiscountTier, updateTicketDiscountTier, deleteTicketDiscountTier,
  listPartnerEntities, getPartnerEntity, createPartnerEntity, updatePartnerEntity, deletePartnerEntity,
  listPartnerDiscountRules, createPartnerDiscountRule, updatePartnerDiscountRule, deletePartnerDiscountRule, resolveActivePartnerDiscountRule,
  listFacilityTypes, getFacilityType, createFacilityType, updateFacilityType, deleteFacilityType,
  listAddonServices, getAddonService, createAddonService, updateAddonService, deleteAddonService,
  findOrCreateRevenueCategoryForFacility, createFacilityBooking, listFacilityBookings, listFacilityBookingAddons, getFacilityBooking, addFacilityBookingAddons, updateFacilityBookingDetails, cancelFacilityBooking,
  listPrdTicketPurchases, listPrdTicketLines, getCustomerById, refundPrdTicketPurchase,
  listExpenseAdjustments, createExpenseAdjustment, createExpenseTransfer, getExpenseCategoryBalances,
  listRevenueCategories, createRevenueCategory, updateRevenueCategory, deleteRevenueCategory, getRevenueCategory,
  listRevenueRecords, createRevenueRecord, getRevenueRecord, updateRevenueRecord, deleteRevenueRecord,
  listRevenueAdjustments, createRevenueAdjustment, createRevenueTransfer, getRevenueCategoryBalances,
  listAssetCategories, createAssetCategory, updateAssetCategory, deleteAssetCategory, getAssetCategory,
  listAssetRecords, createAssetRecord, getAssetRecord, updateAssetRecord, deleteAssetRecord,
  listAssetAdjustments, createAssetAdjustment, createAssetTransfer, getAssetCategoryBalances,
  getExpenseCategoryByCode, createPettyCashFund, getPettyCashFund, getPettyCashFundByCustodian, updatePettyCashFundAmount,
  listPettyCashFundsWithBalances, listPettyCashSpends, createPettyCashSpendWithExpense, getPettyCashSpend, deletePettyCashSpendWithExpense, getPettyCashFundBalance,
  createPettyCashAllocation, listPettyCashAllocations,
  listAttachmentsForEntry, listAttachmentsForEntries, createAttachment, getAttachment, deleteAttachment,
} from "../ticketingDb";
import { applyFacilityDiscount, calculateFacilityLineAmount, calculatePrdPurchasePricing, calculateTicketPricing, extractTicketToken, isPositiveMoney, MAX_TICKETS_PER_PURCHASE } from "../ticketingRules";
import { normalizeRateCode } from "../rateCatalogRules";
import { publicTicketUrl, requestOrigin } from "../ticketUrl";
import { deleteAttachmentFile, isAllowedAttachmentMimeType, saveExpenseAttachment } from "../attachments";

const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!['manager', 'admin', 'super_admin'].includes(ctx.user.role))
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager or admin required" });
  return next({ ctx });
});

const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "super_admin")
    throw new TRPCError({ code: "FORBIDDEN", message: "Super Admin required" });
  return next({ ctx });
});

const gateProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["guard", "manager", "admin", "super_admin"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Gate access required" });
  }
  return next({ ctx });
});

export function recordFromJoin<T>(entry: T | { r?: T; t?: T; s?: T }) {
  const joined = entry as { r?: T; t?: T; s?: T };
  return joined.r ?? joined.t ?? joined.s ?? entry as T;
}

const prdLineInput = z.object({
  rateId: z.number().int().positive(),
  ticketType: z.enum(["waterpark", "companion"]),
  freeEntryCategory: z.enum(["under_two", "person_of_determination", "senior"]).nullable().optional(),
});

async function resolvePrdPricing(linesInput: Array<z.infer<typeof prdLineInput>>, partnerEntityId?: number | null) {
  const rateCatalog = await listPrdRates();
  const rateById = new Map(rateCatalog.map((rate) => [rate.id, rate]));
  const lines = linesInput.map((line) => {
    const rate = rateById.get(line.rateId);
    if (!rate || !rate.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "One of the selected ticket prices is no longer active" });
    if (rate.ticketType && rate.ticketType !== line.ticketType) throw new TRPCError({ code: "BAD_REQUEST", message: "Ticket type does not match the selected price" });
    return { rate: { id: rate.id, name: rate.name, code: rate.code, ticketType: (rate.ticketType || line.ticketType) as "waterpark" | "companion", unitPrice: String(rate.unitPrice) }, ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory || null };
  });
  const tiers = await listTicketDiscountTiers();
  const feeMap = new Map<number, any>();
  for (const line of lines) for (const fee of await listApplicableTicketFees(line.rate.id)) feeMap.set(fee.id, { ...fee, value: String(fee.value) });
  const fees = Array.from(feeMap.values());
  let partnerEntity: { id: number; name: string } | null = null;
  let overrideDiscountByTicketType: Partial<Record<"waterpark" | "companion", string>> | undefined;
  if (partnerEntityId) {
    const entity = await getPartnerEntity(partnerEntityId);
    if (!entity || !entity.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected partner entity is no longer active" });
    partnerEntity = { id: entity.id, name: entity.name };
    overrideDiscountByTicketType = {};
    for (const ticketType of Array.from(new Set(lines.map((line) => line.ticketType)))) {
      const rule = await resolveActivePartnerDiscountRule(entity.id, "ticket_type", { ticketType });
      if (rule) overrideDiscountByTicketType[ticketType as "waterpark" | "companion"] = String(rule.discountPercentage);
    }
  }
  const pricing = calculatePrdPurchasePricing({
    lines, discountTiers: tiers.map((tier) => ({ ...tier, percentage: String(tier.percentage), maxTickets: tier.maxTickets === null ? null : Number(tier.maxTickets) })), fees,
    overrideDiscountByTicketType,
  });
  return { lines, tiers, fees, pricing, partnerEntity, overrideDiscountByTicketType };
}

async function resolveFacilityBookingPricing(input: { facilityTypeId: number; quantity: number; addons: Array<{ addonServiceId: number; quantity: number }>; partnerEntityId?: number }) {
  const facility = await getFacilityType(input.facilityTypeId);
  if (!facility || !facility.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected facility is no longer active" });
  const facilityQuantity = facility.pricingMethod === "fixed" ? 1 : input.quantity;
  const fullFacilityAmount = calculateFacilityLineAmount(String(facility.rate), facilityQuantity);
  const facilityCategory = await getRevenueCategory(facility.revenueCategoryId);
  if (!facilityCategory) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "This facility's revenue category is missing" });
  // PRD Round 4, Section 5: a partner entity's discount applies only to the
  // facility line, never to add-ons — "Applies To" only ever offers
  // "Ticket Type" or "Facility".
  let partnerEntity: { id: number; name: string } | null = null;
  let discountPercentage: string | null = null;
  if (input.partnerEntityId) {
    const entity = await getPartnerEntity(input.partnerEntityId);
    if (!entity || !entity.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected partner entity is no longer active" });
    partnerEntity = { id: entity.id, name: entity.name };
    const rule = await resolveActivePartnerDiscountRule(entity.id, "facility", { facilityTypeId: facility.id });
    if (rule) discountPercentage = String(rule.discountPercentage);
  }
  const { discountedAmount: facilityAmount, discountAmount } = applyFacilityDiscount(fullFacilityAmount, discountPercentage);
  const addons = await Promise.all(input.addons.map(async (line) => {
    const addon = await getAddonService(line.addonServiceId);
    if (!addon || !addon.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "One of the selected add-on services is no longer active" });
    const addonQuantity = addon.pricingMethod === "fixed" ? 1 : line.quantity;
    const category = await getRevenueCategory(addon.revenueCategoryId);
    if (!category) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "This add-on's revenue category is missing" });
    return { addonServiceId: addon.id, addonServiceName: addon.name, categoryId: category.id, categoryName: category.name, quantity: String(addonQuantity), amount: calculateFacilityLineAmount(String(addon.rate), addonQuantity) };
  }));
  const addonsAmount = addons.reduce((sum, addon) => sum + Number(addon.amount), 0);
  return {
    facility, facilityCategory, facilityQuantity, facilityAmount, discountAmount, discountPercentage, partnerEntity, addons,
    addonsAmount: addonsAmount.toFixed(3), totalAmount: (Number(facilityAmount) + addonsAmount).toFixed(3),
  };
}

const attachmentInputSchema = z.object({ dataBase64: z.string(), mimeType: z.string(), fileName: z.string().max(256) });

// PRD Round 5, Section 1/2: any number of attachments, addable on both
// create and edit — shared across expense/revenue/asset entries since the
// upload/validate/store steps never differ by entry type.
async function saveEntryAttachments(entryType: "expense" | "revenue" | "asset", entryId: number, files: Array<{ dataBase64: string; mimeType: string; fileName: string }> | undefined, uploadedBy: number) {
  if (!files?.length) return;
  for (const file of files) {
    if (!isAllowedAttachmentMimeType(file.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachments must be JPEG, PNG, WEBP images, or PDFs" });
  }
  for (const file of files) {
    const saved = await saveExpenseAttachment(file);
    await createAttachment({ entryType, entryId, path: saved.attachmentPath, originalName: saved.attachmentOriginalName, uploadedBy });
  }
}

// Batch-embeds each row's attachments (fetched in one query, grouped in JS)
// so ledger tables can render "View attachment" links with no per-row query.
async function withAttachments<T extends { id: number }>(entryType: "expense" | "revenue" | "asset", rows: T[]) {
  const rowAttachments = await listAttachmentsForEntries(entryType, rows.map((row) => row.id));
  const byEntry = new Map<number, typeof rowAttachments>();
  for (const attachment of rowAttachments) byEntry.set(attachment.entryId, [...(byEntry.get(attachment.entryId) ?? []), attachment]);
  return rows.map((row) => ({ ...row, attachments: byEntry.get(row.id) ?? [] }));
}

export const platformRouter = router({
  units: router({
    list: protectedProcedure.query(() => listUnits()),
    create: superAdminProcedure.input(z.object({
      code: z.string().min(1), name: z.string().min(1),
      type: z.enum(["room", "chalet"]).default("room"),
      capacity: z.number().int().min(1).default(2),
      ratePerNight: z.string().default("0"),
      floor: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const unit = await createUnit(input as any);
      await logActivity(ctx.user.id, "unit.create", "property_unit", undefined, input.code);
      return unit;
    }),
    updateStatus: managerProcedure.input(z.object({
      id: z.number(), status: z.enum(["available", "occupied", "maintenance", "out_of_order"]),
    })).mutation(async ({ input, ctx }) => {
      await updateUnitStatus(input.id, input.status);
      await logActivity(ctx.user.id, "unit.status", "property_unit", input.id, input.status);
    }),
  }),

  guests: router({
    list: protectedProcedure.query(() => listGuests()),
    create: protectedProcedure.input(z.object({
      fullName: z.string().min(1), phone: z.string().optional(),
      email: z.string().optional(), nationality: z.string().optional(),
      idNumber: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const guest = await createGuest(input);
      await logActivity(ctx.user.id, "guest.create", "guest", guest?.id);
      return guest;
    }),
  }),

  customers: router({
    search: protectedProcedure.input(z.object({ query: z.string().optional(), country: z.string().optional() }).optional())
      .query(({ input }) => searchCustomers(input?.query, input?.country)),
    findByPhone: protectedProcedure.input(z.object({ phone: z.string() })).query(({ input }) => getCustomerByPhone(input.phone)),
    create: protectedProcedure.input(z.object({
      fullName: z.string().min(1), phone: z.string().min(3), email: z.string().email().optional().or(z.literal("")),
      nationality: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const customer = await createGuest({ ...input, email: input.email || undefined });
      await logActivity(ctx.user.id, "customer.create", "guest", customer?.id, `${input.fullName}:${input.phone}`);
      return customer;
    }),
  }),

  rates: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => listServiceRates(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
    create: superAdminProcedure.input(z.object({
      name: z.string().min(2).max(128), code: z.string().min(2).max(48),
      department: z.enum(["aqua_park", "rooms", "fnb", "general"]),
      ticketType: z.enum(["waterpark", "companion"]).optional(),
      unitPrice: z.string().refine(isPositiveMoney, "Enter a positive OMR rate with up to three decimals"),
      description: z.string().max(1000).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (input.department === "aqua_park" && input.ticketType) {
        const conflict = await findConflictingActivePrdRate(input.ticketType);
        if (conflict) throw new TRPCError({ code: "BAD_REQUEST", message: `"${conflict.name}" is already the active ${input.ticketType} price — retire it first before adding another, so Ticket Desk never has two prices to choose between` });
      }
      const rate = await createServiceRate({ ...input, code: normalizeRateCode(input.code), name: input.name.trim(), currency: "OMR", description: input.description?.trim() || null });
      await logActivity(ctx.user.id, "service_rate.create", "service_rate", rate.id, rate.code);
      return rate;
    }),
    update: superAdminProcedure.input(z.object({
      id: z.number(), name: z.string().min(2).max(128).optional(), code: z.string().min(2).max(48).optional(),
      department: z.enum(["aqua_park", "rooms", "fnb", "general"]).optional(),
      ticketType: z.enum(["waterpark", "companion"]).nullable().optional(),
      unitPrice: z.string().refine(isPositiveMoney, "Enter a positive OMR rate with up to three decimals").optional(),
      description: z.string().max(1000).nullable().optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, code, name, description, ...rest } = input;
      const existing = await getServiceRate(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Base price was not found" });
      const effectiveDepartment = rest.department ?? existing.department;
      const effectiveTicketType = rest.ticketType !== undefined ? rest.ticketType : existing.ticketType;
      const effectiveActive = rest.isActive ?? existing.isActive;
      if (effectiveDepartment === "aqua_park" && effectiveTicketType && effectiveActive) {
        const conflict = await findConflictingActivePrdRate(effectiveTicketType, id);
        if (conflict) throw new TRPCError({ code: "BAD_REQUEST", message: `"${conflict.name}" is already the active ${effectiveTicketType} price — retire it first, so Ticket Desk never has two prices to choose between` });
      }
      const rate = await updateServiceRate(id, { ...rest, code: code ? normalizeRateCode(code) : undefined, name: name?.trim(), description: description === null ? null : description?.trim() });
      await logActivity(ctx.user.id, "service_rate.update", "service_rate", id, rate?.code);
      return rate;
    }),
    delete: superAdminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteServiceRate(input.id);
      await logActivity(ctx.user.id, "service_rate.delete", "service_rate", input.id);
      return result;
    }),
  }),

  fees: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => listTicketFees(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
    assignments: superAdminProcedure.query(() => listFeeAssignments()),
    preview: protectedProcedure.input(z.object({ rateId: z.number(), quantity: z.number().int().min(1) })).query(async ({ input }) => {
      const rate = await getServiceRate(input.rateId);
      if (!rate?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active price" });
      const fees = await listApplicableTicketFees(rate.id);
      return calculateTicketPricing({ unitPrice: String(rate.unitPrice), quantity: input.quantity, rateName: rate.name, rateCode: rate.code, fees: fees.map((fee) => ({ ...fee, value: String(fee.value) })) });
    }),
    create: superAdminProcedure.input(z.object({
      name: z.string().min(2).max(128), code: z.string().min(2).max(48), calculationType: z.enum(["fixed", "percentage"]),
      value: z.string().regex(/^\d+(\.\d{1,4})?$/), applicationBasis: z.enum(["per_ticket", "per_transaction"]),
      appliesGlobally: z.boolean().default(false), displayOrder: z.number().int().min(0).max(999).default(0), rateIds: z.array(z.number()).default([]),
    }).refine((input) => input.appliesGlobally || input.rateIds.length > 0, { path: ["rateIds"], message: "Apply the fee globally or select at least one base price" })).mutation(async ({ input, ctx }) => {
      if (Number(input.value) <= 0 || (input.calculationType === "percentage" && Number(input.value) > 100)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid positive fee value" });
      const { rateIds, ...data } = input;
      const fee = await createTicketFee({ ...data, name: data.name.trim(), code: normalizeRateCode(data.code), createdBy: ctx.user.id });
      if (!fee.appliesGlobally) await replaceFeeAssignments(fee.id, rateIds);
      await logActivity(ctx.user.id, "ticket_fee.create", "ticket_fee", fee.id, JSON.stringify(data));
      return fee;
    }),
    update: superAdminProcedure.input(z.object({
      id: z.number(), name: z.string().min(2).max(128).optional(), code: z.string().min(2).max(48).optional(),
      calculationType: z.enum(["fixed", "percentage"]).optional(), value: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
      applicationBasis: z.enum(["per_ticket", "per_transaction"]).optional(), appliesGlobally: z.boolean().optional(),
      displayOrder: z.number().int().min(0).max(999).optional(), isActive: z.boolean().optional(), rateIds: z.array(z.number()).optional(),
    })).mutation(async ({ input, ctx }) => {
      if (input.value && Number(input.value) <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Fee value must be positive" });
      if (input.calculationType === "percentage" && input.value && Number(input.value) > 100) throw new TRPCError({ code: "BAD_REQUEST", message: "Percentage cannot exceed 100" });
      if (input.appliesGlobally === false && input.rateIds && input.rateIds.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Apply the fee globally or select at least one base price" });
      const { id, rateIds, code, name, ...rest } = input;
      const fee = await updateTicketFee(id, { ...rest, code: code ? normalizeRateCode(code) : undefined, name: name?.trim() });
      if (!fee) throw new TRPCError({ code: "NOT_FOUND", message: "Fee item was not found" });
      if (rateIds) await replaceFeeAssignments(id, fee.appliesGlobally ? [] : rateIds);
      await logActivity(ctx.user.id, "ticket_fee.update", "ticket_fee", id, JSON.stringify(input));
      return fee;
    }),
    delete: superAdminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteTicketFee(input.id);
      await logActivity(ctx.user.id, "ticket_fee.delete", "ticket_fee", input.id);
      return result;
    }),
  }),

  facilityTypes: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional()).query(({ input, ctx }) => listFacilityTypes(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
    create: superAdminProcedure.input(z.object({
      name: z.string().trim().min(1).max(160), code: z.string().min(2).max(32),
      pricingMethod: z.enum(["hourly", "daily", "fixed"]), rate: z.string().refine(isPositiveMoney, "Enter a positive OMR rate with up to three decimals"),
    })).mutation(async ({ input, ctx }) => {
      const category = await findOrCreateRevenueCategoryForFacility(input.name, normalizeRateCode(input.code), ctx.user.id);
      const facility = await createFacilityType({ name: input.name, code: normalizeRateCode(input.code), pricingMethod: input.pricingMethod, rate: input.rate, revenueCategoryId: category.id, createdBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "facility_type.create", "facility_type", facility.id, JSON.stringify(input));
      return facility;
    }),
    update: superAdminProcedure.input(z.object({
      id: z.number().int().positive(), name: z.string().trim().min(1).max(160).optional(), code: z.string().min(2).max(32).optional(),
      pricingMethod: z.enum(["hourly", "daily", "fixed"]).optional(), rate: z.string().refine(isPositiveMoney, "Enter a positive OMR rate with up to three decimals").optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, code, ...rest } = input;
      const facility = await updateFacilityType(id, { ...rest, code: code ? normalizeRateCode(code) : undefined });
      if (!facility) throw new TRPCError({ code: "NOT_FOUND", message: "Facility type was not found" });
      await logActivity(ctx.user.id, "facility_type.update", "facility_type", id, JSON.stringify(input));
      return facility;
    }),
    delete: superAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const result = await deleteFacilityType(input.id);
      await logActivity(ctx.user.id, "facility_type.delete", "facility_type", input.id, result.deactivated ? "retired" : "deleted");
      return result;
    }),
  }),

  addonServices: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional()).query(({ input, ctx }) => listAddonServices(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
    create: superAdminProcedure.input(z.object({
      name: z.string().trim().min(1).max(160), code: z.string().min(2).max(32),
      pricingMethod: z.enum(["per_person", "fixed", "hourly"]), rate: z.string().refine(isPositiveMoney, "Enter a positive OMR rate with up to three decimals"),
    })).mutation(async ({ input, ctx }) => {
      const category = await findOrCreateRevenueCategoryForFacility(input.name, normalizeRateCode(input.code), ctx.user.id);
      const addon = await createAddonService({ name: input.name, code: normalizeRateCode(input.code), pricingMethod: input.pricingMethod, rate: input.rate, revenueCategoryId: category.id, createdBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "addon_service.create", "addon_service", addon.id, JSON.stringify(input));
      return addon;
    }),
    update: superAdminProcedure.input(z.object({
      id: z.number().int().positive(), name: z.string().trim().min(1).max(160).optional(), code: z.string().min(2).max(32).optional(),
      pricingMethod: z.enum(["per_person", "fixed", "hourly"]).optional(), rate: z.string().refine(isPositiveMoney, "Enter a positive OMR rate with up to three decimals").optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, code, ...rest } = input;
      const addon = await updateAddonService(id, { ...rest, code: code ? normalizeRateCode(code) : undefined });
      if (!addon) throw new TRPCError({ code: "NOT_FOUND", message: "Add-on service was not found" });
      await logActivity(ctx.user.id, "addon_service.update", "addon_service", id, JSON.stringify(input));
      return addon;
    }),
    delete: superAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const result = await deleteAddonService(input.id);
      await logActivity(ctx.user.id, "addon_service.delete", "addon_service", input.id, result.deactivated ? "retired" : "deleted");
      return result;
    }),
  }),

  facilityBookings: router({
    catalog: protectedProcedure.query(async () => ({ facilityTypes: await listFacilityTypes(false), addonServices: await listAddonServices(false), partnerEntities: await listPartnerEntities(false) })),
    list: protectedProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional(), query: z.string().optional() }).optional()).query(async ({ input }) => {
      const rows = await listFacilityBookings(input?.from, input?.to, input?.query);
      return Promise.all((rows as any[]).map(async (row) => ({ booking: row.booking, customer: row.customer, addons: await listFacilityBookingAddons(row.booking.id) })));
    }),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const booking = await getFacilityBooking(input.id);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Facility booking was not found" });
      const customer = booking.customerId ? await getCustomerById(booking.customerId) : null;
      return { booking, customer, addons: await listFacilityBookingAddons(booking.id) };
    }),
    preview: protectedProcedure.input(z.object({
      facilityTypeId: z.number().int().positive(), quantity: z.number().positive(),
      addons: z.array(z.object({ addonServiceId: z.number().int().positive(), quantity: z.number().positive() })).default([]),
      partnerEntityId: z.number().int().positive().optional(),
    })).query(async ({ input }) => {
      const resolved = await resolveFacilityBookingPricing(input);
      return { facilityAmount: resolved.facilityAmount, discountAmount: resolved.discountAmount, discountPercentage: resolved.discountPercentage, partnerEntity: resolved.partnerEntity, addonsAmount: resolved.addonsAmount, totalAmount: resolved.totalAmount, addons: resolved.addons };
    }),
    create: protectedProcedure.input(z.object({
      facilityTypeId: z.number().int().positive(), bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      quantity: z.number().positive(),
      addons: z.array(z.object({ addonServiceId: z.number().int().positive(), quantity: z.number().positive() })).default([]),
      customerId: z.number().int().positive().optional(), customerName: z.string().max(160).optional(),
      customerPhone: z.string().max(32).optional(), customerEmail: z.string().email().optional(), customerCountry: z.string().max(64).optional(),
      paymentMethod: z.enum(["cash", "card", "bank", "mixed"]).default("cash"),
      notes: z.string().max(1000).optional(),
      partnerEntityId: z.number().int().positive().optional(),
    })).mutation(async ({ input, ctx }) => {
      const resolved = await resolveFacilityBookingPricing(input);
      // PRD Round 4, Section 9.3: same phone-first pattern as Ticket Desk —
      // an existing customerId is used as-is, a name+phone with no id
      // creates a new guest record, and neither leaves the booking with no
      // linked customer (still allowed, e.g. an internal/no-customer hold).
      const customer = input.customerId ? await getCustomerById(input.customerId)
        : (input.customerName?.trim() && input.customerPhone?.trim()) ? await createGuest({ fullName: input.customerName.trim(), phone: input.customerPhone.trim(), email: input.customerEmail, nationality: input.customerCountry } as any)
        : null;
      const booking = await createFacilityBooking({
        facilityTypeId: resolved.facility.id, facilityTypeName: resolved.facility.name, facilityCategoryId: resolved.facilityCategory.id, facilityCategoryName: resolved.facilityCategory.name,
        bookingDate: input.bookingDate, quantity: String(resolved.facilityQuantity), facilityAmount: resolved.facilityAmount, addons: resolved.addons,
        customerId: customer?.id ?? null, customerName: customer?.fullName || input.customerName?.trim(), paymentMethod: input.paymentMethod, notes: input.notes?.trim(), createdBy: ctx.user.id,
        partnerEntity: resolved.partnerEntity && resolved.discountPercentage ? { ...resolved.partnerEntity, discountPercentage: resolved.discountPercentage } : null,
      });
      await logActivity(ctx.user.id, "facility_booking.create", "facility_booking", booking.id, `${resolved.facility.code}:${booking.totalAmount}`);
      return { booking, customer, addons: await listFacilityBookingAddons(booking.id) };
    }),
    // PRD Round 4, Section 9.2: edit an existing confirmed booking's date
    // and, for daily/hourly facilities, its duration — the facility, partner
    // entity and add-ons are untouched; only the facility line's amount and
    // date are recalculated and kept in sync with its linked revenue entry.
    update: protectedProcedure.input(z.object({
      id: z.number().int().positive(), bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), quantity: z.number().positive().optional(),
    })).mutation(async ({ input, ctx }) => {
      const booking = await getFacilityBooking(input.id);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Facility booking was not found" });
      if (booking.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "This booking has been cancelled and can no longer be edited" });
      const facility = await getFacilityType(booking.facilityTypeId);
      if (!facility) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "This booking's facility is missing" });
      const quantity = facility.pricingMethod === "fixed" ? 1 : (input.quantity ?? Number(booking.quantity));
      if (facility.pricingMethod !== "fixed" && !(quantity > 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid duration" });
      const fullFacilityAmount = calculateFacilityLineAmount(String(facility.rate), quantity);
      const { discountedAmount: facilityAmount } = applyFacilityDiscount(fullFacilityAmount, booking.discountPercentage as any);
      const totalAmount = (Number(facilityAmount) + Number(booking.addonsAmount)).toFixed(3);
      const updated = await updateFacilityBookingDetails(input.id, { bookingDate: input.bookingDate, quantity: String(quantity), facilityAmount, totalAmount });
      await logActivity(ctx.user.id, "facility_booking.update", "facility_booking", input.id, `${input.bookingDate}:${totalAmount}`);
      return { booking: updated, addons: await listFacilityBookingAddons(updated.id) };
    }),
    // PRD Round 4, Section 9.1/9.4: cancel a booking — its status flips to
    // "cancelled" (kept for record-keeping) and its revenue is reversed out
    // of finance_entries/revenue_records so it stops counting in reports.
    cancel: protectedProcedure.input(z.object({ id: z.number().int().positive(), reason: z.string().max(500).optional() })).mutation(async ({ input, ctx }) => {
      const updated = await cancelFacilityBooking(input.id, ctx.user.id, input.reason?.trim() || undefined).catch((error: Error) => {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      });
      await logActivity(ctx.user.id, "facility_booking.cancel", "facility_booking", input.id, input.reason?.trim() || "");
      return { booking: updated, addons: await listFacilityBookingAddons(updated.id) };
    }),
    // PRD Round 3, Section 5.2/5.3: log an add-on against a booking created
    // earlier — from the "Add-ons Only" flow (no facility re-selected) or a
    // booking's own details screen — without touching its original amount.
    addAddon: protectedProcedure.input(z.object({
      bookingId: z.number().int().positive(), businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      addons: z.array(z.object({ addonServiceId: z.number().int().positive(), quantity: z.number().positive() })).min(1),
    })).mutation(async ({ input, ctx }) => {
      const booking = await getFacilityBooking(input.bookingId);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Facility booking was not found" });
      if (booking.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "This booking has been cancelled and can no longer be changed" });
      const addons = await Promise.all(input.addons.map(async (line) => {
        const addon = await getAddonService(line.addonServiceId);
        if (!addon || !addon.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "One of the selected add-on services is no longer active" });
        const quantity = addon.pricingMethod === "fixed" ? 1 : line.quantity;
        const category = await getRevenueCategory(addon.revenueCategoryId);
        if (!category) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "This add-on's revenue category is missing" });
        return { addonServiceId: addon.id, addonServiceName: addon.name, categoryId: category.id, categoryName: category.name, quantity: String(quantity), amount: calculateFacilityLineAmount(String(addon.rate), quantity) };
      }));
      const updated = await addFacilityBookingAddons({ bookingId: booking.id, businessDate: input.businessDate, addons, createdBy: ctx.user.id });
      await logActivity(ctx.user.id, "facility_booking.add_addon", "facility_booking", booking.id, addons.map((a) => a.addonServiceId).join(","));
      return { booking: updated, addons: await listFacilityBookingAddons(booking.id) };
    }),
  }),

  tickets: router({
    prdCatalog: protectedProcedure.query(async ({ ctx }) => ({
      rates: await listPrdRates(Boolean(ctx.user.role === "super_admin")),
      discountTiers: await listTicketDiscountTiers(Boolean(ctx.user.role === "super_admin")),
      fees: await listTicketFees(Boolean(ctx.user.role === "super_admin")),
      partnerEntities: await listPartnerEntities(false),
      vatPercent: 5,
      maxTicketsPerPurchase: MAX_TICKETS_PER_PURCHASE,
    })),
    partnerEntities: router({
      list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional()).query(({ input, ctx }) => listPartnerEntities(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
      create: superAdminProcedure.input(z.object({ name: z.string().trim().min(1).max(160) })).mutation(async ({ input, ctx }) => {
        const entity = await createPartnerEntity({ name: input.name, createdBy: ctx.user.id } as any);
        await logActivity(ctx.user.id, "partner_entity.create", "partner_entity", entity.id, JSON.stringify(input));
        return entity;
      }),
      update: superAdminProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(160).optional(), isActive: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const entity = await updatePartnerEntity(id, data);
        await logActivity(ctx.user.id, "partner_entity.update", "partner_entity", id, JSON.stringify(data));
        return entity;
      }),
      delete: superAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
        const result = await deletePartnerEntity(input.id);
        await logActivity(ctx.user.id, "partner_entity.delete", "partner_entity", input.id, result.deactivated ? "retired" : "deleted");
        return result;
      }),
      discountRules: router({
        list: protectedProcedure.input(z.object({ partnerEntityId: z.number().int().positive().optional() }).optional()).query(({ input }) => listPartnerDiscountRules(input?.partnerEntityId)),
        create: superAdminProcedure.input(z.object({
          partnerEntityId: z.number().int().positive(),
          appliesTo: z.enum(["ticket_type", "facility"]),
          ticketType: z.enum(["waterpark", "companion"]).optional(),
          facilityTypeId: z.number().int().positive().optional(),
          discountPercentage: z.string().regex(/^\d+(\.\d{1,2})?$/),
          validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })).mutation(async ({ input, ctx }) => {
          if (Number(input.discountPercentage) <= 0 || Number(input.discountPercentage) > 100) throw new TRPCError({ code: "BAD_REQUEST", message: "Discount percentage must be between 0 and 100" });
          if (input.validUntil < input.validFrom) throw new TRPCError({ code: "BAD_REQUEST", message: "Valid Until must be on or after Valid From" });
          if (input.appliesTo === "ticket_type" && !input.ticketType) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a ticket type" });
          if (input.appliesTo === "facility" && !input.facilityTypeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a facility" });
          let facilityTypeName: string | null = null;
          if (input.appliesTo === "facility") {
            const facility = await getFacilityType(input.facilityTypeId!);
            if (!facility) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected facility was not found" });
            facilityTypeName = facility.name;
          }
          const rule = await createPartnerDiscountRule({
            partnerEntityId: input.partnerEntityId, appliesTo: input.appliesTo,
            ticketType: input.appliesTo === "ticket_type" ? input.ticketType : null, facilityTypeId: input.appliesTo === "facility" ? input.facilityTypeId : null, facilityTypeName,
            discountPercentage: input.discountPercentage, validFrom: input.validFrom as any, validUntil: input.validUntil as any, createdBy: ctx.user.id,
          } as any);
          await logActivity(ctx.user.id, "partner_discount_rule.create", "partner_discount_rule", rule.id, JSON.stringify(input));
          return rule;
        }),
        update: superAdminProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
          const rule = await updatePartnerDiscountRule(input.id, { isActive: input.isActive });
          await logActivity(ctx.user.id, "partner_discount_rule.update", "partner_discount_rule", input.id, JSON.stringify(input));
          return rule;
        }),
        delete: superAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
          const result = await deletePartnerDiscountRule(input.id);
          await logActivity(ctx.user.id, "partner_discount_rule.delete", "partner_discount_rule", input.id);
          return result;
        }),
      }),
    }),
    discountTiers: router({
      list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional()).query(({ input, ctx }) => listTicketDiscountTiers(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
      create: superAdminProcedure.input(z.object({ minTickets: z.number().int().min(1), maxTickets: z.number().int().min(1).nullable().optional(), percentage: z.string().regex(/^\d+(\.\d{1,2})?$/) })).mutation(async ({ input, ctx }) => {
        if (input.maxTickets !== null && input.maxTickets !== undefined && input.maxTickets < input.minTickets) throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum tickets must be greater than or equal to the minimum" });
        if (Number(input.percentage) < 0 || Number(input.percentage) > 100) throw new TRPCError({ code: "BAD_REQUEST", message: "Discount percentage must be between 0 and 100" });
        const tier = await createTicketDiscountTier({ minTickets: input.minTickets, maxTickets: input.maxTickets ?? null, percentage: input.percentage, createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "ticket_discount.create", "ticket_discount_tier", tier.id, JSON.stringify(input)); return tier;
      }),
      update: superAdminProcedure.input(z.object({ id: z.number().int().positive(), minTickets: z.number().int().min(1).optional(), maxTickets: z.number().int().min(1).nullable().optional(), percentage: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), isActive: z.boolean().optional() })).mutation(async ({ input, ctx }) => {
        if (input.percentage !== undefined && (Number(input.percentage) < 0 || Number(input.percentage) > 100)) throw new TRPCError({ code: "BAD_REQUEST", message: "Discount percentage must be between 0 and 100" });
        const tier = await updateTicketDiscountTier(input.id, input as any); if (!tier) throw new TRPCError({ code: "NOT_FOUND", message: "Discount tier not found" });
        await logActivity(ctx.user.id, "ticket_discount.update", "ticket_discount_tier", input.id, JSON.stringify(input)); return tier;
      }),
      delete: superAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const result = await deleteTicketDiscountTier(input.id); await logActivity(ctx.user.id, "ticket_discount.delete", "ticket_discount_tier", input.id); return result; }),
    }),
    purchasePreview: protectedProcedure.input(z.object({ lines: z.array(prdLineInput).min(1).max(MAX_TICKETS_PER_PURCHASE), partnerEntityId: z.number().int().positive().optional() })).query(async ({ input }) => (await resolvePrdPricing(input.lines, input.partnerEntityId)).pricing),
    purchaseList: protectedProcedure.input(z.object({ query: z.string().optional(), from: z.string().optional(), to: z.string().optional() }).optional()).query(({ input }) => listPrdTicketPurchases(input?.query, input?.from, input?.to)),
    purchaseLines: protectedProcedure.input(z.object({ purchaseId: z.number().int().positive() })).query(({ input }) => listPrdTicketLines(input.purchaseId)),
    purchaseCreate: protectedProcedure.input(z.object({
      customerId: z.number().int().positive().optional(), customerName: z.string().min(1).optional(), customerPhone: z.string().min(3).optional(),
      customerEmail: z.string().email().optional(), customerNationality: z.string().max(64).optional(), visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      lines: z.array(prdLineInput).min(1).max(MAX_TICKETS_PER_PURCHASE), paymentMethod: z.enum(["cash", "card", "bank", "mixed"]).default("cash"), notes: z.string().max(1000).optional(),
      partnerEntityId: z.number().int().positive().optional(),
    }).refine((input) => Boolean(input.customerId || (input.customerName && input.customerPhone)), { message: "Select an existing customer or provide name and phone" })).mutation(async ({ input, ctx }) => {
      const customer = input.customerId ? await getCustomerById(input.customerId) : await createGuest({ fullName: input.customerName!, phone: input.customerPhone!, email: input.customerEmail, nationality: input.customerNationality });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer record was not found" });
      const resolved = await resolvePrdPricing(input.lines, input.partnerEntityId);
      const result = await createPrdTicketPurchase({
        customerId: customer.id, visitDate: input.visitDate, lines: resolved.lines, discountTiers: resolved.tiers.map((tier) => ({ ...tier, percentage: String(tier.percentage), maxTickets: tier.maxTickets === null ? null : Number(tier.maxTickets) })), fees: resolved.fees, paymentMethod: input.paymentMethod, notes: input.notes?.trim(), issuedBy: ctx.user.id,
        overrideDiscountByTicketType: resolved.overrideDiscountByTicketType, partnerEntity: resolved.partnerEntity,
      });
      await createFinanceEntry({ date: input.visitDate, stream: "aqua_park", type: "revenue", amount: result.purchase.totalAmount, description: `Ticket purchase – ${customer.fullName}`, referenceId: result.purchase.id, referenceType: "prd_ticket_purchase", createdBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "prd_ticket_purchase.issue", "ticket_purchase", result.purchase.id, `${result.lines.map((line) => line.ticketNumber).join(",")}:${result.purchase.totalAmount}`);
      return { ...result, customer };
    }),
    purchaseRefund: protectedProcedure.input(z.object({ purchaseId: z.number().int().positive(), reason: z.string().max(500).optional() })).mutation(async ({ input, ctx }) => {
      const purchase = await refundPrdTicketPurchase(input.purchaseId, ctx.user.id, input.reason?.trim() || undefined);
      await deleteFinanceEntryByReference("prd_ticket_purchase", input.purchaseId);
      await logActivity(ctx.user.id, "prd_ticket_purchase.refund", "ticket_purchase", input.purchaseId, String(purchase?.totalAmount ?? ""));
      return purchase;
    }),
    list: protectedProcedure.input(z.object({
      from: z.string().optional(), to: z.string().optional(), customerQuery: z.string().optional(),
    }).optional()).query(({ input }) => listSalesTransactions(input?.from, input?.to, input?.customerQuery)),
    public: publicProcedure.input(z.object({ token: z.string().min(16).max(96) })).query(async ({ input, ctx }) => {
      const entry = await getSalesTransactionByToken(input.token);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "This ticket could not be found" });
      const lines = await listSalesTransactionLines(entry.t.id);
      return {
        ticket: {
          ticketNumber: entry.t.ticketNumber, publicToken: entry.t.publicToken, status: entry.t.status,
          visitDate: entry.t.visitDate, department: entry.t.department, quantity: entry.t.quantity,
          unitPrice: entry.t.unitPrice, baseSubtotal: entry.t.baseSubtotal, feeTotal: entry.t.feeTotal, totalAmount: entry.t.totalAmount,
        },
        lines,
        customer: { fullName: entry.c?.fullName || "Guest" },
        rate: entry.r ? { name: entry.r.name, code: entry.r.code } : null,
        publicUrl: publicTicketUrl(entry.t.publicToken, requestOrigin(ctx.req)),
      };
    }),
    create: protectedProcedure.input(z.object({
      customerId: z.number().optional(), customerName: z.string().min(1).optional(), customerPhone: z.string().min(3).optional(),
      rateId: z.number(), visitDate: z.string(), quantity: z.number().int().min(1),
      paymentMethod: z.enum(["cash", "card", "bank", "mixed"]).default("cash"), notes: z.string().optional(),
    }).refine((value) => Boolean(value.customerId || (value.customerName && value.customerPhone)), {
      message: "Select an existing customer or provide a customer name and phone number",
    })).mutation(async ({ input, ctx }) => {
      const customer = input.customerId
        ? (await searchCustomers()).find((entry: any) => entry.id === input.customerId)
        : await createGuest({ fullName: input.customerName!, phone: input.customerPhone! });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer record was not found" });
      const selectedRate = await getServiceRate(input.rateId);
      if (!selectedRate?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected OMR price is no longer active" });
      const fees = await listApplicableTicketFees(selectedRate.id);
      const pricing = calculateTicketPricing({
        unitPrice: String(selectedRate.unitPrice), quantity: input.quantity, rateName: selectedRate.name, rateCode: selectedRate.code,
        fees: fees.map((fee) => ({ ...fee, value: String(fee.value) })),
      });
      const ticket = await createSalesTransaction({
        customerId: customer.id, rateId: selectedRate.id, visitDate: input.visitDate, department: selectedRate.department,
        quantity: input.quantity, unitPrice: String(selectedRate.unitPrice), baseSubtotal: pricing.baseSubtotal,
        feeTotal: pricing.feeTotal, totalAmount: pricing.totalAmount, lines: pricing.lines as any,
        paymentMethod: input.paymentMethod, notes: input.notes, issuedBy: ctx.user.id,
      });
      const stream = selectedRate.department === "general" ? "extras" : selectedRate.department;
      await createFinanceEntry({
        date: input.visitDate, stream, type: "revenue", amount: pricing.totalAmount,
        description: `Ticket ${ticket.ticketNumber} – ${customer.fullName}`,
        referenceId: ticket.id, referenceType: "sales_ticket", createdBy: ctx.user.id,
      } as any);
      await logActivity(ctx.user.id, "ticket.issue", "sales_transaction", ticket.id, `${ticket.ticketNumber}:${pricing.totalAmount}`);
      return { ticket, lines: pricing.lines, pricing, customer, publicUrl: publicTicketUrl(ticket.publicToken, requestOrigin(ctx.req)) };
    }),
  }),

  gate: router({
    scan: gateProcedure.input(z.object({
      scannedValue: z.string().min(1).max(512),
      requestKey: z.string().min(8).max(96).optional(),
    })).mutation(async ({ input, ctx }) => {
      const publicToken = extractTicketToken(input.scannedValue);
      if (!publicToken) throw new TRPCError({ code: "BAD_REQUEST", message: "Scan a ticket QR code or enter its ticket link" });
      const result = await recordTicketScan({
        scannedValue: input.scannedValue,
        publicToken,
        scannedBy: ctx.user.id,
        requestKey: input.requestKey || randomUUID(),
        today: new Date().toISOString().slice(0, 10),
      });
      if (!("ticket" in result)) {
        await logActivity(ctx.user.id, "gate.scan", "sales_transaction", undefined, result.reason);
        return { allowed: false, reason: result.reason, ticket: null, customer: null };
      }
      await logActivity(ctx.user.id, "gate.scan", "sales_transaction", result.ticket.id, result.allowed ? "allowed" : result.reason);
      return {
        allowed: result.allowed,
        reason: result.reason || null,
        ticket: {
          ticketNumber: result.ticket.ticketNumber,
          visitDate: result.ticket.visitDate,
          status: result.ticket.status,
        },
        customer: result.customer ? { fullName: result.customer.fullName } : null,
      };
    }),
    recentScans: gateProcedure.query(() => listRecentTicketScans(20)),
  }),

  reservations: router({
    list: protectedProcedure.query(() => listReservations()),
    create: protectedProcedure.input(z.object({
      guestId: z.number(), unitId: z.number(),
      checkIn: z.string(), checkOut: z.string(),
      adults: z.number().int().min(1).default(1),
      children: z.number().int().min(0).default(0),
      ratePerNight: z.string(), totalAmount: z.string(),
      source: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const existingReservations = await listReservations();
      if (hasReservationOverlap(existingReservations, input.unitId, input.checkIn, input.checkOut)) {
        throw new TRPCError({ code: "CONFLICT", message: "This room already has an active booking on the selected dates" });
      }
      const res = await createReservation({ ...input, createdBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "reservation.create", "reservation", res.id);
      await createFinanceEntry({
        date: input.checkIn, stream: "rooms", type: "revenue",
        amount: input.totalAmount, description: `Reservation #${res.id}`,
        referenceId: res.id, referenceType: "reservation", createdBy: ctx.user.id,
      } as any);
      return res;
    }),
    updateStatus: protectedProcedure.input(z.object({
      id: z.number(), status: z.enum(["pending", "confirmed", "checked_in", "checked_out", "cancelled"]),
    })).mutation(async ({ input, ctx }) => {
      await updateReservationStatus(input.id, input.status);
      await logActivity(ctx.user.id, "reservation.status", "reservation", input.id, input.status);
    }),
  }),

  aquaPark: router({
    getCapacity: protectedProcedure.input(z.object({ date: z.string() })).query(({ input }) => getAquaCapacity(input.date)),
    setCapacity: managerProcedure.input(z.object({ date: z.string(), maxCapacity: z.number().int().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await setAquaCapacity(input.date, input.maxCapacity, ctx.user.id);
        await logActivity(ctx.user.id, "aqua.capacity.set", "aqua_capacity", undefined, `${input.date}:${input.maxCapacity}`);
      }),
    listTickets: protectedProcedure.input(z.object({ date: z.string() })).query(({ input }) => listAquaTickets(input.date)),
    issueTicket: protectedProcedure.input(z.object({
      date: z.string(), guestName: z.string().min(1),
      quantity: z.number().int().min(1),
      pricePerTicket: z.string(), totalAmount: z.string(),
      ticketType: z.enum(["adult", "child", "group"]).default("adult"),
    })).mutation(async ({ input, ctx }) => {
      const capacity = await getAquaCapacity(input.date);
      const issued = await listAquaTickets(input.date);
      const bookedQuantity = issued.reduce((sum: number, ticket: any) => sum + Number(ticket.quantity), 0);
      const maxCapacity = Number(capacity?.maxCapacity ?? 150);
      if (!canIssueAquaTickets(maxCapacity, bookedQuantity, input.quantity)) {
        throw new TRPCError({ code: "CONFLICT", message: `Only ${remainingAquaCapacity(maxCapacity, bookedQuantity)} aqua-park places remain for this date` });
      }
      const ticket = await createAquaTicket({ ...input, issuedBy: ctx.user.id } as any);
      await createFinanceEntry({
        date: input.date, stream: "aqua_park", type: "revenue",
        amount: input.totalAmount, description: `Ticket #${ticket.id} – ${input.guestName}`,
        referenceId: ticket.id, referenceType: "aqua_ticket", createdBy: ctx.user.id,
      } as any);
      await logActivity(ctx.user.id, "aqua.ticket.issue", "aqua_ticket", ticket.id);
      return ticket;
    }),
    recordEntry: protectedProcedure.input(z.object({ ticketId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await recordEntry(input.ticketId);
        await logActivity(ctx.user.id, "aqua.entry", "aqua_ticket", input.ticketId);
      }),
  }),

  housekeeping: router({
    list: protectedProcedure.query(() => listHousekeepingTasks()),
    create: protectedProcedure.input(z.object({
      unitId: z.number(), assignedTo: z.number().optional(),
      taskType: z.enum(["turnover", "daily", "deep_clean", "inspection"]).default("turnover"),
      roomStatus: z.enum(["clean", "dirty", "inspected", "out_of_order"]).default("dirty"),
      notes: z.string().optional(), scheduledFor: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const task = await createHousekeepingTask({ ...input, createdBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "housekeeping.create", "housekeeping_task", task.id);
      return task;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["pending", "in_progress", "done"]).optional(),
      roomStatus: z.enum(["clean", "dirty", "inspected", "out_of_order"]).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.status === "done") updateData.completedAt = new Date();
      await updateHousekeepingTask(id, updateData);
      await logActivity(ctx.user.id, "housekeeping.update", "housekeeping_task", id, JSON.stringify(data));
    }),
  }),

  maintenance: router({
    list: protectedProcedure.query(() => listMaintenanceRequests()),
    create: protectedProcedure.input(z.object({
      title: z.string().min(1), description: z.string().optional(),
      location: z.string().optional(), unitId: z.number().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    })).mutation(async ({ input, ctx }) => {
      const req = await createMaintenanceRequest({ ...input, reportedBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "maintenance.create", "maintenance_request", req.id, input.title);
      return req;
    }),
    update: managerProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["open", "assigned", "in_progress", "resolved", "closed"]).optional(),
      assignedTo: z.number().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.status === "resolved") updateData.resolvedAt = new Date();
      await updateMaintenanceRequest(id, updateData);
      await logActivity(ctx.user.id, "maintenance.update", "maintenance_request", id, JSON.stringify(data));
    }),
  }),

  inventory: router({
    list: protectedProcedure.query(() => listInventory()),
    create: managerProcedure.input(z.object({
      sku: z.string().min(1), name: z.string().min(1),
      category: z.enum(["fnb", "housekeeping", "aqua_park", "maintenance", "general"]).default("general"),
      quantityOnHand: z.string().default("0"),
      lowStockThreshold: z.string().default("10"),
      unit: z.string().default("unit"), supplier: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const item = await createInventoryItem(input as any);
      await logActivity(ctx.user.id, "inventory.create", "inventory_item", item.id, input.sku);
      return item;
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(), quantityOnHand: z.string().optional(),
      lowStockThreshold: z.string().optional(), supplier: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      await updateInventoryItem(id, data as any);
      await logActivity(ctx.user.id, "inventory.update", "inventory_item", id);
    }),
  }),

  staff: router({
    list: protectedProcedure.query(() => listStaff()),
    create: managerProcedure.input(z.object({
      fullName: z.string().min(1), position: z.string().optional(),
      department: z.enum(["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management"]).default("front_office"),
      phone: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const profile = await createStaffProfile(input as any);
      await logActivity(ctx.user.id, "staff.create", "staff_profile", profile.id, input.fullName);
      return profile;
    }),
    listShifts: protectedProcedure.query(() => listShifts()),
    createShift: managerProcedure.input(z.object({
      staffId: z.number(), department: z.string().optional(),
      startTime: z.string(), endTime: z.string(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const shift = await createShift({
        ...input,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
      } as any);
      await logActivity(ctx.user.id, "shift.create", "staff_shift", shift.id);
      return shift;
    }),
    listAttendance: managerProcedure.input(z.object({ workDate: z.string().optional() }).optional())
      .query(({ input }) => listAttendance(input?.workDate)),
    recordAttendance: managerProcedure.input(z.object({
      staffId: z.number(), workDate: z.string(),
      status: z.enum(["present", "late", "absent", "leave"]).default("present"),
      clockInAt: z.string().optional(), clockOutAt: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const record = await recordAttendance({
        ...input,
        workDate: input.workDate as any,
        clockInAt: input.clockInAt ? new Date(input.clockInAt) : undefined,
        clockOutAt: input.clockOutAt ? new Date(input.clockOutAt) : undefined,
        recordedBy: ctx.user.id,
      } as any);
      await logActivity(ctx.user.id, "attendance.record", "staff_attendance", record.id, `${input.staffId}:${input.workDate}:${input.status}`);
      return record;
    }),
    listLeaveRequests: managerProcedure.query(() => listLeaveRequests()),
    createLeaveRequest: managerProcedure.input(z.object({
      staffId: z.number(), leaveType: z.enum(["annual", "sick", "unpaid", "other"]).default("annual"),
      startDate: z.string(), endDate: z.string(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (!isValidDateRange(input.startDate, input.endDate)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Leave end date must be on or after the start date" });
      }
      const request = await createLeaveRequest({ ...input, startDate: input.startDate as any, endDate: input.endDate as any } as any);
      await logActivity(ctx.user.id, "leave.request", "staff_leave_request", request.id, `${input.staffId}:${input.startDate}-${input.endDate}`);
      return request;
    }),
    reviewLeaveRequest: managerProcedure.input(z.object({
      id: z.number(), status: z.enum(["approved", "rejected", "cancelled"]),
    })).mutation(async ({ input, ctx }) => {
      await reviewLeaveRequest(input.id, input.status, ctx.user.id);
      await logActivity(ctx.user.id, "leave.review", "staff_leave_request", input.id, input.status);
    }),
    listTasks: protectedProcedure.query(() => listDailyTasks()),
    createTask: managerProcedure.input(z.object({
      title: z.string().min(1), description: z.string().optional(),
      assignedTo: z.number().optional(), department: z.string().optional(),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      dueDate: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const task = await createDailyTask({ ...input, createdBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "task.create", "daily_task", task.id, input.title);
      return task;
    }),
    updateTask: protectedProcedure.input(z.object({
      id: z.number(), status: z.enum(["pending", "in_progress", "done"]).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.status === "done") updateData.completedAt = new Date();
      await updateDailyTask(id, updateData);
      await logActivity(ctx.user.id, "task.update", "daily_task", id, JSON.stringify(data));
    }),
  }),

  finance: router({
    list: managerProcedure.input(z.object({
      from: z.string().optional(), to: z.string().optional(), stream: z.string().optional(), descriptionPrefix: z.string().optional(),
    })).query(({ input }) => listFinanceEntries(input.from, input.to, input.stream, input.descriptionPrefix)),
    create: managerProcedure.input(z.object({
      date: z.string(), stream: z.enum(["rooms", "aqua_park", "fnb", "extras"]),
      type: z.enum(["revenue", "expense"]).default("revenue"),
      amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"),
      description: z.string().max(512).optional(),
    })).mutation(async ({ input, ctx }) => {
      const entry = await createFinanceEntry({ ...input, createdBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "finance.create", "finance_entry", entry.id, `${input.stream}:${input.amount}`);
      return entry;
    }),
    // Only for manually created entries (no referenceType) — ticket- and
    // reservation-derived finance entries must stay in sync with their
    // source record, so they're never deletable through this endpoint.
    delete: superAdminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const entry = await getFinanceEntry(input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Finance entry was not found" });
      if (entry.referenceType) throw new TRPCError({ code: "BAD_REQUEST", message: "This entry is linked to a ticket or reservation and cannot be removed here" });
      await deleteFinanceEntry(input.id);
      await logActivity(ctx.user.id, "finance.delete", "finance_entry", input.id);
    }),
    summary: managerProcedure.input(z.object({ from: z.string(), to: z.string() }))
      .query(({ input }) => getRevenueSummary(input.from, input.to)),
    occupancy: managerProcedure.input(z.object({ from: z.string(), to: z.string() }))
      .query(({ input }) => getOccupancyStats(input.from, input.to)),
    aquaAttendance: managerProcedure.input(z.object({ from: z.string(), to: z.string() }))
      .query(({ input }) => getAquaAttendance(input.from, input.to)),
    workbookImports: managerProcedure.query(() => listWorkbookImports()),
    createImport: managerProcedure.input(z.object({
      fileName: z.string(), rowsImported: z.number().int().min(0),
      mapping: z.string().optional(), fileKey: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      return createWorkbookImport({ ...input, importedBy: ctx.user.id });
    }),
    settlements: router({
      list: managerProcedure.query(() => listDailySettlements()),
      save: managerProcedure.input(z.object({
        businessDate: z.string(), department: z.enum(["aqua_park", "rooms", "fnb", "events", "general"]),
        expectedAmount: z.string(), cashAmount: z.string(), bankAmount: z.string(), cardAmount: z.string(), bankCharges: z.string(), notes: z.string().optional(),
      })).mutation(async ({ input, ctx }) => {
        const settlement = await saveDailySettlement({ ...input, businessDate: input.businessDate as any, submittedBy: ctx.user.id, status: "submitted" } as any);
        await logActivity(ctx.user.id, "settlement.submit", "daily_settlement", settlement.id, `${input.businessDate}:${input.department}`);
        return settlement;
      }),
      approve: managerProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        await reviewDailySettlement(input.id, ctx.user.id);
        await logActivity(ctx.user.id, "settlement.approve", "daily_settlement", input.id);
      }),
    }),
    expenseCategories: router({
      list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional())
        .query(({ input, ctx }) => listExpenseCategories(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
      create: superAdminProcedure.input(z.object({ name: z.string().min(1), code: z.string().min(2).max(32) }))
        .mutation(async ({ input, ctx }) => {
          const category = await createExpenseCategory({ ...input, createdBy: ctx.user.id });
          await logActivity(ctx.user.id, "expense_category.create", "expense_category", category.id, input.code);
          return category;
        }),
      update: superAdminProcedure.input(z.object({
        id: z.number(), name: z.string().min(1).optional(), code: z.string().min(2).max(32).optional(), isActive: z.boolean().optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const category = await updateExpenseCategory(id, data);
        await logActivity(ctx.user.id, "expense_category.update", "expense_category", id, JSON.stringify(data));
        return category;
      }),
      delete: superAdminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        const result = await deleteExpenseCategory(input.id);
        await logActivity(ctx.user.id, "expense_category.delete", "expense_category", input.id, result.deactivated ? "retired" : "deleted");
        return result;
      }),
    }),
    expenses: router({
      list: protectedProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional(), descriptionPrefix: z.string().optional() }).optional())
        .query(async ({ input }) => withAttachments("expense", await listExpenseRecords(input?.from, input?.to, input?.descriptionPrefix))),
      create: protectedProcedure.input(z.object({
        businessDate: z.string(), categoryId: z.number(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"),
        payee: z.string().optional(), description: z.string().min(1),
        receiptNumber: z.string().max(64).optional(),
        attachments: z.array(attachmentInputSchema).max(10).optional(),
        department: z.enum(["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management", "general"]).default("general"),
      })).mutation(async ({ input, ctx }) => {
        const category = await getExpenseCategory(input.categoryId);
        if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active expense category" });
        const stream = input.department === "aqua_park" || input.department === "fnb" ? input.department : "extras";
        const financeEntry = await createFinanceEntry({
          date: input.businessDate, stream, type: "expense", amount: input.amount,
          description: input.description, referenceType: "expense_record", createdBy: ctx.user.id,
        } as any);
        const { attachments: attachmentFiles, ...expenseInput } = input;
        const expense = await createExpenseRecord({
          ...expenseInput, businessDate: input.businessDate as any, categoryName: category.name,
          financeEntryId: financeEntry.id, createdBy: ctx.user.id,
        } as any);
        await saveEntryAttachments("expense", expense.id, attachmentFiles, ctx.user.id);
        await logActivity(ctx.user.id, "expense.create", "expense_record", expense.id, `${category.code}:${input.amount}`);
        return { ...expense, attachments: await listAttachmentsForEntry("expense", expense.id) };
      }),
      update: managerProcedure.input(z.object({
        id: z.number(), businessDate: z.string().optional(), categoryId: z.number().optional(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals").optional(),
        payee: z.string().optional(), description: z.string().min(1).optional(), receiptNumber: z.string().max(64).optional(),
        department: z.enum(["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management", "general"]).optional(),
        attachments: z.array(attachmentInputSchema).max(10).optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, categoryId, attachments: attachmentFiles, ...data } = input;
        const existing = await getExpenseRecord(id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Expense record was not found" });
        const category = categoryId ? await getExpenseCategory(categoryId) : undefined;
        if (categoryId && !category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active expense category" });
        await updateExpenseRecord(id, { ...data, ...(category ? { categoryId, categoryName: category.name } : {}) } as any);
        if (existing.financeEntryId) {
          const department = data.department ?? existing.department;
          const stream = department === "aqua_park" || department === "fnb" ? department : "extras";
          await updateFinanceEntry(existing.financeEntryId, {
            date: (data.businessDate ?? existing.businessDate) as any, amount: data.amount ?? existing.amount,
            description: data.description ?? existing.description, stream,
          } as any);
        }
        await saveEntryAttachments("expense", id, attachmentFiles, ctx.user.id);
        await logActivity(ctx.user.id, "expense.update", "expense_record", id, JSON.stringify(data));
      }),
      delete: managerProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        const existing = await getExpenseRecord(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Expense record was not found" });
        await deleteExpenseRecord(input.id);
        if (existing.financeEntryId) await deleteFinanceEntry(existing.financeEntryId);
        await logActivity(ctx.user.id, "expense.delete", "expense_record", input.id);
      }),
    }),
    revenueCategories: router({
      list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional())
        .query(({ input, ctx }) => listRevenueCategories(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
      create: superAdminProcedure.input(z.object({ name: z.string().min(1), code: z.string().min(2).max(32) }))
        .mutation(async ({ input, ctx }) => {
          const category = await createRevenueCategory({ ...input, createdBy: ctx.user.id });
          await logActivity(ctx.user.id, "revenue_category.create", "revenue_category", category.id, input.code);
          return category;
        }),
      update: superAdminProcedure.input(z.object({
        id: z.number(), name: z.string().min(1).optional(), code: z.string().min(2).max(32).optional(), isActive: z.boolean().optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const category = await updateRevenueCategory(id, data);
        await logActivity(ctx.user.id, "revenue_category.update", "revenue_category", id, JSON.stringify(data));
        return category;
      }),
      delete: superAdminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        const result = await deleteRevenueCategory(input.id);
        await logActivity(ctx.user.id, "revenue_category.delete", "revenue_category", input.id, result.deactivated ? "retired" : "deleted");
        return result;
      }),
    }),
    revenues: router({
      list: protectedProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(async ({ input }) => withAttachments("revenue", await listRevenueRecords(input?.from, input?.to))),
      create: protectedProcedure.input(z.object({
        businessDate: z.string(), categoryId: z.number(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"),
        source: z.string().max(128).optional(), description: z.string().min(1),
        receiptNumber: z.string().max(64).optional(),
        attachments: z.array(attachmentInputSchema).max(10).optional(),
      })).mutation(async ({ input, ctx }) => {
        const category = await getRevenueCategory(input.categoryId);
        if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active revenue category" });
        const financeEntry = await createFinanceEntry({
          date: input.businessDate, stream: "extras", type: "revenue", amount: input.amount,
          description: input.description, referenceType: "revenue_record", createdBy: ctx.user.id,
        } as any);
        const { attachments: attachmentFiles, ...revenueInput } = input;
        const revenue = await createRevenueRecord({
          ...revenueInput, businessDate: input.businessDate as any, categoryName: category.name,
          financeEntryId: financeEntry.id, createdBy: ctx.user.id,
        } as any);
        await saveEntryAttachments("revenue", revenue.id, attachmentFiles, ctx.user.id);
        await logActivity(ctx.user.id, "revenue.create", "revenue_record", revenue.id, `${category.code}:${input.amount}`);
        return { ...revenue, attachments: await listAttachmentsForEntry("revenue", revenue.id) };
      }),
      update: managerProcedure.input(z.object({
        id: z.number(), businessDate: z.string().optional(), categoryId: z.number().optional(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals").optional(),
        source: z.string().max(128).optional(), description: z.string().min(1).optional(), receiptNumber: z.string().max(64).optional(),
        attachments: z.array(attachmentInputSchema).max(10).optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, categoryId, attachments: attachmentFiles, ...data } = input;
        const existing = await getRevenueRecord(id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Revenue record was not found" });
        const category = categoryId ? await getRevenueCategory(categoryId) : undefined;
        if (categoryId && !category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active revenue category" });
        await updateRevenueRecord(id, { ...data, ...(category ? { categoryId, categoryName: category.name } : {}) } as any);
        if (existing.financeEntryId) {
          await updateFinanceEntry(existing.financeEntryId, {
            date: (data.businessDate ?? existing.businessDate) as any, amount: data.amount ?? existing.amount,
            description: data.description ?? existing.description,
          } as any);
        }
        await saveEntryAttachments("revenue", id, attachmentFiles, ctx.user.id);
        await logActivity(ctx.user.id, "revenue.update", "revenue_record", id, JSON.stringify(data));
      }),
      delete: managerProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        const existing = await getRevenueRecord(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Revenue record was not found" });
        await deleteRevenueRecord(input.id);
        if (existing.financeEntryId) await deleteFinanceEntry(existing.financeEntryId);
        await logActivity(ctx.user.id, "revenue.delete", "revenue_record", input.id);
      }),
    }),
    assetCategories: router({
      list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional())
        .query(({ input, ctx }) => listAssetCategories(Boolean(input?.includeInactive && ctx.user.role === "super_admin"))),
      create: superAdminProcedure.input(z.object({ name: z.string().min(1), code: z.string().min(2).max(32) }))
        .mutation(async ({ input, ctx }) => {
          const category = await createAssetCategory({ ...input, createdBy: ctx.user.id });
          await logActivity(ctx.user.id, "asset_category.create", "asset_category", category.id, input.code);
          return category;
        }),
      update: superAdminProcedure.input(z.object({
        id: z.number(), name: z.string().min(1).optional(), code: z.string().min(2).max(32).optional(), isActive: z.boolean().optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const category = await updateAssetCategory(id, data);
        await logActivity(ctx.user.id, "asset_category.update", "asset_category", id, JSON.stringify(data));
        return category;
      }),
      delete: superAdminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        const result = await deleteAssetCategory(input.id);
        await logActivity(ctx.user.id, "asset_category.delete", "asset_category", input.id, result.deactivated ? "retired" : "deleted");
        return result;
      }),
    }),
    assets: router({
      list: protectedProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(async ({ input }) => withAttachments("asset", await listAssetRecords(input?.from, input?.to))),
      create: protectedProcedure.input(z.object({
        businessDate: z.string(), categoryId: z.number(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"),
        vendor: z.string().max(128).optional(), description: z.string().min(1),
        receiptNumber: z.string().max(64).optional(),
        location: z.string().max(160).optional(),
        status: z.enum(["active", "under_maintenance", "disposed"]).default("active"),
        usefulLifeYears: z.number().int().min(1).max(100).optional(),
        attachments: z.array(attachmentInputSchema).max(10).optional(),
      })).mutation(async ({ input, ctx }) => {
        const category = await getAssetCategory(input.categoryId);
        if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active asset category" });
        const { attachments: attachmentFiles, ...assetInput } = input;
        const asset = await createAssetRecord({
          ...assetInput, businessDate: input.businessDate as any, categoryName: category.name, createdBy: ctx.user.id,
        } as any);
        await saveEntryAttachments("asset", asset.id, attachmentFiles, ctx.user.id);
        await logActivity(ctx.user.id, "asset.create", "asset_record", asset.id, `${category.code}:${input.amount}`);
        return { ...asset, attachments: await listAttachmentsForEntry("asset", asset.id) };
      }),
      update: managerProcedure.input(z.object({
        id: z.number(), businessDate: z.string().optional(), categoryId: z.number().optional(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals").optional(),
        vendor: z.string().max(128).optional(), description: z.string().min(1).optional(), receiptNumber: z.string().max(64).optional(),
        location: z.string().max(160).optional(),
        status: z.enum(["active", "under_maintenance", "disposed"]).optional(),
        usefulLifeYears: z.number().int().min(1).max(100).nullable().optional(),
        attachments: z.array(attachmentInputSchema).max(10).optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, categoryId, attachments: attachmentFiles, ...data } = input;
        const existing = await getAssetRecord(id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Asset record was not found" });
        const category = categoryId ? await getAssetCategory(categoryId) : undefined;
        if (categoryId && !category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active asset category" });
        await updateAssetRecord(id, { ...data, ...(category ? { categoryId, categoryName: category.name } : {}) } as any);
        await saveEntryAttachments("asset", id, attachmentFiles, ctx.user.id);
        await logActivity(ctx.user.id, "asset.update", "asset_record", id, JSON.stringify(data));
      }),
      delete: managerProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        const existing = await getAssetRecord(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Asset record was not found" });
        await deleteAssetRecord(input.id);
        await logActivity(ctx.user.id, "asset.delete", "asset_record", input.id);
      }),
    }),
    attachments: router({
      delete: managerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
        const attachment = await getAttachment(input.id);
        if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment was not found" });
        await deleteAttachment(input.id);
        await deleteAttachmentFile(attachment.path);
        await logActivity(ctx.user.id, "attachment.delete", "attachment", input.id, attachment.originalName);
      }),
    }),
    assetAdjustments: router({
      list: managerProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(({ input }) => listAssetAdjustments(input?.from, input?.to)),
      balances: managerProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(({ input }) => getAssetCategoryBalances(input?.from, input?.to)),
      adjust: managerProcedure.input(z.object({
        businessDate: z.string(), categoryId: z.number().int().positive(), type: z.enum(["add", "deduct"]),
        amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"), note: z.string().max(512).optional(),
      })).mutation(async ({ input, ctx }) => {
        const category = await getAssetCategory(input.categoryId);
        if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active asset category" });
        const adjustment = await createAssetAdjustment({ businessDate: input.businessDate, categoryId: category.id, categoryName: category.name, type: input.type, amount: input.amount, note: input.note?.trim(), createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "asset_adjustment.create", "asset_adjustment", adjustment.id, `${input.type}:${category.code}:${input.amount}`);
        return adjustment;
      }),
      transfer: managerProcedure.input(z.object({
        businessDate: z.string(), fromCategoryId: z.number().int().positive(), toCategoryId: z.number().int().positive(),
        amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"), note: z.string().max(512).optional(),
      }).refine((input) => input.fromCategoryId !== input.toCategoryId, { message: "Choose two different categories" })).mutation(async ({ input, ctx }) => {
        const [fromCategory, toCategory] = await Promise.all([getAssetCategory(input.fromCategoryId), getAssetCategory(input.toCategoryId)]);
        if (!fromCategory?.isActive || !toCategory?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose two active asset categories" });
        const rows = await createAssetTransfer({ businessDate: input.businessDate, fromCategoryId: fromCategory.id, fromCategoryName: fromCategory.name, toCategoryId: toCategory.id, toCategoryName: toCategory.name, amount: input.amount, note: input.note?.trim(), createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "asset_adjustment.transfer", "asset_adjustment", rows[0]?.id, `${fromCategory.code}->${toCategory.code}:${input.amount}`);
        return rows;
      }),
    }),
    expenseAdjustments: router({
      list: managerProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(({ input }) => listExpenseAdjustments(input?.from, input?.to)),
      balances: managerProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(({ input }) => getExpenseCategoryBalances(input?.from, input?.to)),
      adjust: managerProcedure.input(z.object({
        businessDate: z.string(), categoryId: z.number().int().positive(), type: z.enum(["add", "deduct"]),
        amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"), note: z.string().max(512).optional(),
      })).mutation(async ({ input, ctx }) => {
        const category = await getExpenseCategory(input.categoryId);
        if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active expense category" });
        const adjustment = await createExpenseAdjustment({ businessDate: input.businessDate, categoryId: category.id, categoryName: category.name, type: input.type, amount: input.amount, note: input.note?.trim(), createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "expense_adjustment.create", "expense_adjustment", adjustment.id, `${input.type}:${category.code}:${input.amount}`);
        return adjustment;
      }),
      transfer: managerProcedure.input(z.object({
        businessDate: z.string(), fromCategoryId: z.number().int().positive(), toCategoryId: z.number().int().positive(),
        amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"), note: z.string().max(512).optional(),
      }).refine((input) => input.fromCategoryId !== input.toCategoryId, { message: "Choose two different categories" })).mutation(async ({ input, ctx }) => {
        const [fromCategory, toCategory] = await Promise.all([getExpenseCategory(input.fromCategoryId), getExpenseCategory(input.toCategoryId)]);
        if (!fromCategory?.isActive || !toCategory?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose two active expense categories" });
        const rows = await createExpenseTransfer({ businessDate: input.businessDate, fromCategoryId: fromCategory.id, fromCategoryName: fromCategory.name, toCategoryId: toCategory.id, toCategoryName: toCategory.name, amount: input.amount, note: input.note?.trim(), createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "expense_adjustment.transfer", "expense_adjustment", rows[0]?.id, `${fromCategory.code}->${toCategory.code}:${input.amount}`);
        return rows;
      }),
    }),
    revenueAdjustments: router({
      list: managerProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(({ input }) => listRevenueAdjustments(input?.from, input?.to)),
      balances: managerProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(({ input }) => getRevenueCategoryBalances(input?.from, input?.to)),
      adjust: managerProcedure.input(z.object({
        businessDate: z.string(), categoryId: z.number().int().positive(), type: z.enum(["add", "deduct"]),
        amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"), note: z.string().max(512).optional(),
      })).mutation(async ({ input, ctx }) => {
        const category = await getRevenueCategory(input.categoryId);
        if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active revenue category" });
        const adjustment = await createRevenueAdjustment({ businessDate: input.businessDate, categoryId: category.id, categoryName: category.name, type: input.type, amount: input.amount, note: input.note?.trim(), createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "revenue_adjustment.create", "revenue_adjustment", adjustment.id, `${input.type}:${category.code}:${input.amount}`);
        return adjustment;
      }),
      transfer: managerProcedure.input(z.object({
        businessDate: z.string(), fromCategoryId: z.number().int().positive(), toCategoryId: z.number().int().positive(),
        amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"), note: z.string().max(512).optional(),
      }).refine((input) => input.fromCategoryId !== input.toCategoryId, { message: "Choose two different categories" })).mutation(async ({ input, ctx }) => {
        const [fromCategory, toCategory] = await Promise.all([getRevenueCategory(input.fromCategoryId), getRevenueCategory(input.toCategoryId)]);
        if (!fromCategory?.isActive || !toCategory?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose two active revenue categories" });
        const rows = await createRevenueTransfer({ businessDate: input.businessDate, fromCategoryId: fromCategory.id, fromCategoryName: fromCategory.name, toCategoryId: toCategory.id, toCategoryName: toCategory.name, amount: input.amount, note: input.note?.trim(), createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "revenue_adjustment.transfer", "revenue_adjustment", rows[0]?.id, `${fromCategory.code}->${toCategory.code}:${input.amount}`);
        return rows;
      }),
    }),
    operationalSummary: managerProcedure.input(z.object({ from: z.string(), to: z.string() }))
      .query(({ input }) => getOperationalFinancialSummary(input.from, input.to)),
    pettyCash: router({
      list: managerProcedure.query(() => listPettyCashRequests()),
      request: protectedProcedure.input(z.object({
        requestDate: z.string(), department: z.enum(["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management", "general"]),
        category: z.enum(["petty_cash", "expense", "reimbursement"]), amount: z.string().min(1), payee: z.string().min(1), purpose: z.string().min(1), sourceReference: z.string().optional(),
      })).mutation(async ({ input, ctx }) => {
        const request = await createPettyCashRequest({ ...input, requestDate: input.requestDate as any, requestedBy: ctx.user.id } as any);
        await logActivity(ctx.user.id, "petty_cash.request", "petty_cash_request", request.id, `${input.department}:${input.amount}`);
        return request;
      }),
      review: managerProcedure.input(z.object({ id: z.number(), status: z.enum(["approved", "paid", "rejected"]) })).mutation(async ({ input, ctx }) => {
        await reviewPettyCashRequest(input.id, input.status, ctx.user.id);
        await logActivity(ctx.user.id, "petty_cash.review", "petty_cash_request", input.id, input.status);
      }),
    }),
    // A manager hands a fixed cash float to a dedicated `petty_cash`-role
    // account (created here, not through admin.createUser). That account can
    // only ever see its own fund and log spending against it — it can never
    // change the fixed amount. Each spend also posts a real expense record
    // under the "Petty Cash" expense category, so it reduces the
    // Revenue-vs-Expense Net Result like any other real expense.
    pettyCashFunds: router({
      list: managerProcedure.query(() => listPettyCashFundsWithBalances()),
      createCustodian: superAdminProcedure.input(z.object({
        username: z.string().trim().min(3).max(64), name: z.string().trim().min(2).max(128),
        temporaryPassword: z.string().min(12).max(256),
        fixedAmount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"),
      })).mutation(async ({ input, ctx }) => {
        const username = input.username.toLowerCase();
        if (await getUserByUsername(username)) throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
        const user = await createLocalUser({ username, name: input.name, role: "petty_cash", passwordHash: await hashPassword(input.temporaryPassword), mustChangePassword: true });
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account could not be created" });
        const fund = await createPettyCashFund({ custodianUserId: user.id, fixedAmount: input.fixedAmount, createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "petty_cash_fund.create", "petty_cash_fund", fund.id, `${username}:${input.fixedAmount}`);
        return { fund, custodian: { id: user.id, name: user.name, username: user.username } };
      }),
      updateAmount: superAdminProcedure.input(z.object({
        id: z.number().int().positive(), fixedAmount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"),
      })).mutation(async ({ input, ctx }) => {
        const fund = await getPettyCashFund(input.id);
        if (!fund) throw new TRPCError({ code: "NOT_FOUND", message: "Petty cash fund was not found" });
        const updated = await updatePettyCashFundAmount(input.id, input.fixedAmount);
        await logActivity(ctx.user.id, "petty_cash_fund.update_amount", "petty_cash_fund", input.id, input.fixedAmount);
        return updated;
      }),
      // PRD Round 5: a discrete, timestamped log of every top-up the Admin
      // sends to a custodian's fund — alongside updateAmount's raw (unlogged)
      // overwrite, which stays available for correcting a mistake.
      allocate: superAdminProcedure.input(z.object({
        id: z.number().int().positive(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"), note: z.string().max(256).optional(),
      })).mutation(async ({ input, ctx }) => {
        const fund = await getPettyCashFund(input.id);
        if (!fund) throw new TRPCError({ code: "NOT_FOUND", message: "Petty cash fund was not found" });
        const result = await createPettyCashAllocation({ fundId: input.id, amount: input.amount, note: input.note?.trim(), createdBy: ctx.user.id });
        await logActivity(ctx.user.id, "petty_cash_fund.allocate", "petty_cash_fund", input.id, input.amount);
        return result;
      }),
      allocationsFor: managerProcedure.input(z.object({ fundId: z.number().int().positive() })).query(({ input }) => listPettyCashAllocations(input.fundId)),
      mineAllocations: protectedProcedure.query(async ({ ctx }) => {
        if (ctx.user.role !== "petty_cash") return [];
        const fund = await getPettyCashFundByCustodian(ctx.user.id);
        if (!fund) return [];
        return listPettyCashAllocations(fund.id);
      }),
      spendsFor: managerProcedure.input(z.object({ fundId: z.number().int().positive() })).query(({ input }) => listPettyCashSpends(input.fundId)),
      mine: protectedProcedure.query(async ({ ctx }) => {
        if (ctx.user.role !== "petty_cash") return null;
        const fund = await getPettyCashFundByCustodian(ctx.user.id);
        if (!fund) return null;
        const balance = await getPettyCashFundBalance(fund.id);
        return { fund, balance };
      }),
      mineSpends: protectedProcedure.query(async ({ ctx }) => {
        if (ctx.user.role !== "petty_cash") return [];
        const fund = await getPettyCashFundByCustodian(ctx.user.id);
        if (!fund) return [];
        return listPettyCashSpends(fund.id);
      }),
      spend: protectedProcedure.input(z.object({
        businessDate: z.string(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to three decimals"),
        description: z.string().min(1).max(256),
        attachment: z.object({ dataBase64: z.string(), mimeType: z.string(), fileName: z.string().max(256) }).optional(),
      })).mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "petty_cash") throw new TRPCError({ code: "FORBIDDEN", message: "Only a petty cash custodian can log spending" });
        const fund = await getPettyCashFundByCustodian(ctx.user.id);
        if (!fund || !fund.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "No active petty cash fund for this account" });
        const balance = await getPettyCashFundBalance(fund.id);
        if (Number(input.amount) > balance) throw new TRPCError({ code: "BAD_REQUEST", message: "This would exceed the remaining petty cash balance" });
        if (input.attachment && !isAllowedAttachmentMimeType(input.attachment.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment must be a JPEG, PNG, WEBP image, or a PDF" });
        const category = await getExpenseCategoryByCode("PETTY_CASH");
        if (!category) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Petty Cash expense category is missing" });
        const saved = input.attachment ? await saveExpenseAttachment(input.attachment) : null;
        const spend = await createPettyCashSpendWithExpense({
          fundId: fund.id, businessDate: input.businessDate, amount: input.amount, description: input.description,
          categoryId: category.id, categoryName: category.name, payee: ctx.user.name || ctx.user.username || "Petty cash custodian", createdBy: ctx.user.id,
          attachmentPath: saved?.attachmentPath ?? null, attachmentOriginalName: saved?.attachmentOriginalName ?? null,
        });
        await logActivity(ctx.user.id, "petty_cash_spend.create", "petty_cash_spend", spend.id, input.amount);
        return spend;
      }),
      deleteSpend: managerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
        const spend = await deletePettyCashSpendWithExpense(input.id);
        if (!spend) throw new TRPCError({ code: "NOT_FOUND", message: "Petty cash spend was not found" });
        await logActivity(ctx.user.id, "petty_cash_spend.delete", "petty_cash_spend", input.id);
      }),
    }),
  }),

  admin: router({
    listUsers: superAdminProcedure.query(async () => (await listUsers()).map(({ passwordHash: _passwordHash, ...user }) => user)),
    createUser: superAdminProcedure.input(z.object({
      username: z.string().trim().min(3).max(64), name: z.string().trim().min(2).max(128), email: z.string().email().nullable().optional(),
      role: z.enum(["staff", "manager", "admin", "guard", "super_admin", "petty_cash"]), temporaryPassword: z.string().min(12).max(256),
    })).mutation(async ({ input, ctx }) => {
      const username = input.username.toLowerCase();
      if (await getUserByUsername(username)) throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
      const user = await createLocalUser({ username, name: input.name, email: input.email, role: input.role, passwordHash: await hashPassword(input.temporaryPassword), mustChangePassword: true });
      await logActivity(ctx.user.id, "admin.user.create", "user", user?.id, `${username}:${input.role}`);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Account could not be created" });
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return safeUser;
    }),
    updateUser: superAdminProcedure.input(z.object({
      id: z.number(), name: z.string().trim().min(2).max(128).optional(), email: z.string().email().nullable().optional(),
      role: z.enum(["staff", "manager", "admin", "guard", "super_admin", "petty_cash"]).optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id && (input.isActive === false || (input.role && input.role !== "super_admin"))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate or demote your own Super Admin account" });
      }
      const { id, ...data } = input;
      const user = await updateLocalUser(id, data);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User account was not found" });
      if (data.isActive === false) await revokeAllUserSessions(id);
      await logActivity(ctx.user.id, "admin.user.update", "user", id, JSON.stringify(data));
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return safeUser;
    }),
    resetUserPassword: superAdminProcedure.input(z.object({ id: z.number(), temporaryPassword: z.string().min(12).max(256) }))
      .mutation(async ({ input, ctx }) => {
        await updateLocalUser(input.id, { passwordHash: await hashPassword(input.temporaryPassword), mustChangePassword: true });
        await revokeAllUserSessions(input.id);
        await logActivity(ctx.user.id, "admin.user.password_reset", "user", input.id);
        return { success: true } as const;
      }),
    updateUserRole: superAdminProcedure.input(z.object({
      id: z.number(), role: z.enum(["staff", "manager", "admin", "guard", "super_admin", "petty_cash"]),
    })).mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id && input.role !== "super_admin") throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot demote your own Super Admin account" });
      await updateUserRole(input.id, input.role);
      await logActivity(ctx.user.id, "admin.role.update", "user", input.id, input.role);
    }),
    linkStaff: superAdminProcedure.input(z.object({ staffId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await linkStaffToUser(input.staffId, input.userId);
        await logActivity(ctx.user.id, "admin.staff.link", "staff_profile", input.staffId);
      }),
    activityLog: superAdminProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
      .query(({ input }) => getActivityLog(input.limit)),
    populateQa: superAdminProcedure.mutation(async ({ ctx }) => {
      const today = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

      const existingUnits = await listUnits();
      const room = existingUnits.find((unit: any) => unit.code === "QA-101") ?? await createUnit({
        code: "QA-101", name: "QA Garden Room", type: "room", capacity: 2,
        ratePerNight: "425", status: "available", notes: "QA-only accommodation record",
      } as any);
      const chalet = existingUnits.find((unit: any) => unit.code === "QA-C01") ?? await createUnit({
        code: "QA-C01", name: "QA Lagoon Chalet", type: "chalet", capacity: 6,
        ratePerNight: "800", status: "available", notes: "QA-only accommodation record",
      } as any);

      const existingGuests = await listGuests();
      const guest = existingGuests.find((entry: any) => entry.fullName === "QA Guest Alpha") ?? await createGuest({
        fullName: "QA Guest Alpha", phone: "QA-GUEST-001", notes: "QA-only guest profile",
      } as any);

      const existingStaff = await listStaff();
      const housekeeper = existingStaff.find((entry: any) => entry.fullName === "QA Housekeeping Lead") ?? await createStaffProfile({
        fullName: "QA Housekeeping Lead", position: "Housekeeping Supervisor", department: "housekeeping", phone: "QA-HK-001",
      } as any);
      const technician = existingStaff.find((entry: any) => entry.fullName === "QA Maintenance Technician") ?? await createStaffProfile({
        fullName: "QA Maintenance Technician", position: "Facilities Technician", department: "maintenance", phone: "QA-MNT-001",
      } as any);

      const existingReservations = await listReservations();
      const hasReservation = existingReservations.some((entry: any) => {
        const reservation = recordFromJoin<any>(entry);
        return reservation.guestId === (guest as any).id
          && reservation.unitId === (room as any).id
          && isQaReservationRecord(reservation);
      });
      if (!hasReservation) {
        const reservation = await createReservation({
          guestId: (guest as any).id, unitId: (room as any).id, checkIn: today, checkOut: tomorrow,
          adults: 2, children: 0, ratePerNight: "425", totalAmount: "425",
          status: "confirmed", source: "QA seed", notes: "QA-only reservation", createdBy: ctx.user.id,
        } as any);
        await createFinanceEntry({ date: today, stream: "rooms", type: "revenue", amount: "425", description: "QA room reservation", referenceId: reservation.id, referenceType: "reservation", createdBy: ctx.user.id } as any);
      }

      const housekeepingTasks = await listHousekeepingTasks();
      if (!housekeepingTasks.some((entry: any) => recordFromJoin<any>(entry).notes === "QA-only turnover task")) {
        await createHousekeepingTask({ unitId: (room as any).id, assignedTo: (housekeeper as any).id, taskType: "turnover", roomStatus: "dirty", status: "pending", notes: "QA-only turnover task", scheduledFor: today, createdBy: ctx.user.id } as any);
      }

      const maintenanceRequests = await listMaintenanceRequests();
      if (!maintenanceRequests.some((entry: any) => recordFromJoin<any>(entry).title === "QA pool-deck lighting inspection")) {
        await createMaintenanceRequest({ title: "QA pool-deck lighting inspection", description: "QA-only maintenance inspection", location: "QA Lagoon Chalet", unitId: (chalet as any).id, priority: "medium", status: "assigned", assignedTo: (technician as any).id, reportedBy: ctx.user.id } as any);
      }

      const inventory = await listInventory();
      const inventorySeeds = [
        { sku: "QA-FNB-001", name: "QA Beverage Cups", category: "fnb", quantityOnHand: "8", lowStockThreshold: "15", unit: "sleeves" },
        { sku: "QA-HK-001", name: "QA Linen Set", category: "housekeeping", quantityOnHand: "4", lowStockThreshold: "10", unit: "sets" },
        { sku: "QA-AQUA-001", name: "QA Wristbands", category: "aqua_park", quantityOnHand: "12", lowStockThreshold: "25", unit: "rolls" },
      ];
      for (const item of inventorySeeds) {
        if (!inventory.some((entry: any) => entry.sku === item.sku)) await createInventoryItem(item as any);
      }

      await setAquaCapacity(today, 150, ctx.user.id);
      const tickets = await listAquaTickets(today);
      if (!tickets.some((entry: any) => entry.guestName === "QA Day Pass Group")) {
        const ticket = await createAquaTicket({ date: today, guestName: "QA Day Pass Group", quantity: 6, pricePerTicket: "18", totalAmount: "108", ticketType: "group", issuedBy: ctx.user.id } as any);
        await createFinanceEntry({ date: today, stream: "aqua_park", type: "revenue", amount: "108", description: "QA aqua park day pass", referenceId: ticket.id, referenceType: "aqua_ticket", createdBy: ctx.user.id } as any);
        await recordEntry(ticket.id);
      }

      const tasks = await listDailyTasks();
      if (!tasks.some((entry: any) => recordFromJoin<any>(entry).title === "QA opening readiness walk")) {
        await createDailyTask({ title: "QA opening readiness walk", description: "QA-only task", assignedTo: housekeeper.id, department: "housekeeping", priority: "high", dueDate: today, createdBy: ctx.user.id } as any);
      }
      const shifts = await listShifts();
      if (!shifts.some((entry: any) => recordFromJoin<any>(entry).staffId === housekeeper.id)) {
        const start = new Date(`${today}T08:00:00Z`); const end = new Date(`${today}T16:00:00Z`);
        await createShift({ staffId: housekeeper.id, department: "housekeeping", startTime: start, endTime: end, notes: "QA-only shift" } as any);
      }

      const financeEntries = await listFinanceEntries();
      const financeSeeds = [
        { stream: "fnb", type: "revenue", amount: "62", description: "QA F&B counter revenue" },
        { stream: "extras", type: "revenue", amount: "85", description: "QA cabana extra revenue" },
        { stream: "fnb", type: "expense", amount: "24", description: "QA F&B supply expense" },
      ];
      for (const entry of financeSeeds) {
        if (!financeEntries.some((existing: any) => existing.description === entry.description)) {
          await createFinanceEntry({ ...entry, date: today, createdBy: ctx.user.id } as any);
        }
      }

      await logActivity(ctx.user.id, "admin.qa.populate", "qa_seed", undefined, "QA-only operating records populated");
      return { roomId: (room as any).id, chaletId: (chalet as any).id, guestId: (guest as any).id, staffCount: 2, date: today };
    }),
  }),
});
