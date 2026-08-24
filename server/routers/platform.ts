import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createAquaTicket, createDailyTask, createFinanceEntry, createGuest, createPettyCashRequest, deleteFinanceEntry,
  createHousekeepingTask, createInventoryItem, createMaintenanceRequest,
  createLeaveRequest, createReservation, createShift, createStaffProfile, createUnit,
  createWorkbookImport, getActivityLog, getAquaAttendance, getAquaCapacity,
  getOccupancyStats, getRevenueSummary, linkStaffToUser,
  isValidDateRange, listAquaTickets, listAttendance, listDailyTasks, listFinanceEntries, listGuests,
  listHousekeepingTasks, listInventory, listMaintenanceRequests,
  listDailySettlements, listLeaveRequests, listPettyCashRequests, listReservations, listShifts, listStaff, listUnits, listUsers,
  hasReservationOverlap, isQaReservationRecord, listWorkbookImports, logActivity, recordAttendance, recordEntry, reviewDailySettlement, reviewLeaveRequest, reviewPettyCashRequest, saveDailySettlement, setAquaCapacity,
  updateDailyTask, updateFinanceEntry, updateHousekeepingTask, updateInventoryItem,
  updateMaintenanceRequest, updateReservationStatus, updateUnitStatus,
  updateUserRole,
} from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { canIssueAquaTickets, remainingAquaCapacity } from "../operationRules";
import {
  createExpenseCategory, createExpenseRecord, createSalesTransaction, createServiceRate, deleteExpenseCategory,
  deleteExpenseRecord, getExpenseCategory, getExpenseRecord, getOperationalFinancialSummary, listExpenseCategories,
  listExpenseRecords, listSalesTransactions, listServiceRates, getServiceRate, searchCustomers, updateExpenseCategory, updateExpenseRecord, updateServiceRate, deleteServiceRate,
  getSalesTransactionByToken, listRecentTicketScans, recordTicketScan,
} from "../ticketingDb";
import { calculateTicketTotal, extractTicketToken, isPositiveMoney } from "../ticketingRules";
import { normalizeRateCode } from "../rateCatalogRules";
import { publicTicketUrl, requestOrigin } from "../ticketUrl";

const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "manager" && ctx.user.role !== "admin")
    throw new TRPCError({ code: "FORBIDDEN", message: "Manager or admin required" });
  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin")
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin required" });
  return next({ ctx });
});

const gateProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["guard", "manager", "admin"].includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Gate access required" });
  }
  return next({ ctx });
});

export function recordFromJoin<T>(entry: T | { r?: T; t?: T; s?: T }) {
  const joined = entry as { r?: T; t?: T; s?: T };
  return joined.r ?? joined.t ?? joined.s ?? entry as T;
}

export const platformRouter = router({
  units: router({
    list: protectedProcedure.query(() => listUnits()),
    create: managerProcedure.input(z.object({
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
    search: protectedProcedure.input(z.object({ query: z.string().optional() }).optional())
      .query(({ input }) => searchCustomers(input?.query)),
    create: protectedProcedure.input(z.object({
      fullName: z.string().min(1), phone: z.string().min(3), email: z.string().optional(),
      nationality: z.string().optional(), notes: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const customer = await createGuest(input);
      await logActivity(ctx.user.id, "customer.create", "guest", customer?.id, `${input.fullName}:${input.phone}`);
      return customer;
    }),
  }),

  rates: router({
    list: protectedProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional())
      .query(({ input, ctx }) => listServiceRates(Boolean(input?.includeInactive && ctx.user.role === "admin"))),
    create: adminProcedure.input(z.object({
      name: z.string().min(2).max(128), code: z.string().min(2).max(48),
      department: z.enum(["aqua_park", "rooms", "fnb", "general"]),
      unitPrice: z.string().refine(isPositiveMoney, "Enter a positive OMR rate with up to two decimals"),
      description: z.string().max(1000).optional(),
    })).mutation(async ({ input, ctx }) => {
      const rate = await createServiceRate({ ...input, code: normalizeRateCode(input.code), name: input.name.trim(), currency: "OMR", description: input.description?.trim() || null });
      await logActivity(ctx.user.id, "service_rate.create", "service_rate", rate.id, rate.code);
      return rate;
    }),
    update: adminProcedure.input(z.object({
      id: z.number(), name: z.string().min(2).max(128).optional(), code: z.string().min(2).max(48).optional(),
      department: z.enum(["aqua_park", "rooms", "fnb", "general"]).optional(),
      unitPrice: z.string().refine(isPositiveMoney, "Enter a positive OMR rate with up to two decimals").optional(),
      description: z.string().max(1000).nullable().optional(), isActive: z.boolean().optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, code, name, description, ...rest } = input;
      const rate = await updateServiceRate(id, { ...rest, code: code ? normalizeRateCode(code) : undefined, name: name?.trim(), description: description === null ? null : description?.trim() });
      await logActivity(ctx.user.id, "service_rate.update", "service_rate", id, rate?.code);
      return rate;
    }),
    delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteServiceRate(input.id);
      await logActivity(ctx.user.id, "service_rate.delete", "service_rate", input.id);
      return result;
    }),
  }),

  tickets: router({
    list: protectedProcedure.input(z.object({
      from: z.string().optional(), to: z.string().optional(), customerQuery: z.string().optional(),
    }).optional()).query(({ input }) => listSalesTransactions(input?.from, input?.to, input?.customerQuery)),
    public: publicProcedure.input(z.object({ token: z.string().min(16).max(96) })).query(async ({ input, ctx }) => {
      const entry = await getSalesTransactionByToken(input.token);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "This ticket could not be found" });
      return {
        ticket: {
          ticketNumber: entry.t.ticketNumber,
          publicToken: entry.t.publicToken,
          status: entry.t.status,
          visitDate: entry.t.visitDate,
          department: entry.t.department,
          quantity: entry.t.quantity,
          unitPrice: entry.t.unitPrice,
          totalAmount: entry.t.totalAmount,
        },
        customer: { fullName: entry.c?.fullName || "Guest" },
        rate: entry.r ? { name: entry.r.name, code: entry.r.code } : null,
        publicUrl: publicTicketUrl(entry.t.publicToken, requestOrigin(ctx.req)),
      };
    }),
    create: protectedProcedure.input(z.object({
      customerId: z.number().optional(), customerName: z.string().min(1).optional(), customerPhone: z.string().min(3).optional(), rateId: z.number().optional(),
      visitDate: z.string(), department: z.enum(["aqua_park", "rooms", "fnb", "general"]).default("aqua_park"),
      quantity: z.number().int().min(1), unitPrice: z.string().refine(isPositiveMoney, "Enter a positive amount with up to two decimals"),
      paymentMethod: z.enum(["cash", "card", "bank", "mixed"]).default("cash"), notes: z.string().optional(),
    }).refine((value) => Boolean(value.customerId || (value.customerName && value.customerPhone)), {
      message: "Select an existing customer or provide a customer name and phone number",
    })).mutation(async ({ input, ctx }) => {
      const customer = input.customerId
        ? (await searchCustomers()).find((entry: any) => entry.id === input.customerId)
        : await createGuest({ fullName: input.customerName!, phone: input.customerPhone! });
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer record was not found" });
      const selectedRate = input.rateId ? await getServiceRate(input.rateId) : undefined;
      if (input.rateId && (!selectedRate || !selectedRate.isActive)) throw new TRPCError({ code: "BAD_REQUEST", message: "Selected OMR rate is no longer active" });
      if (!input.rateId && ctx.user.role === "staff") throw new TRPCError({ code: "FORBIDDEN", message: "Staff must select an active rate. A manager or administrator can approve a manual price." });
      const unitPrice = selectedRate ? String(selectedRate.unitPrice) : input.unitPrice;
      const department = selectedRate ? selectedRate.department : input.department;
      const totalAmount = calculateTicketTotal(unitPrice, input.quantity);
      const ticket = await createSalesTransaction({
        customerId: customer.id, rateId: selectedRate?.id, visitDate: input.visitDate, department,
        quantity: input.quantity, unitPrice, totalAmount: String(totalAmount),
        paymentMethod: input.paymentMethod, notes: input.notes, issuedBy: ctx.user.id,
      });
      const stream = department === "general" ? "extras" : department;
      await createFinanceEntry({
        date: input.visitDate, stream, type: "revenue", amount: String(totalAmount),
        description: `Ticket ${ticket.ticketNumber} – ${customer.fullName}`,
        referenceId: ticket.id, referenceType: "sales_ticket", createdBy: ctx.user.id,
      } as any);
      await logActivity(ctx.user.id, "ticket.issue", "sales_transaction", ticket.id, ticket.ticketNumber);
      return { ticket, customer, publicUrl: publicTicketUrl(ticket.publicToken, requestOrigin(ctx.req)) };
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
      from: z.string().optional(), to: z.string().optional(), stream: z.string().optional(),
    })).query(({ input }) => listFinanceEntries(input.from, input.to, input.stream)),
    create: managerProcedure.input(z.object({
      date: z.string(), stream: z.enum(["rooms", "aqua_park", "fnb", "extras"]),
      type: z.enum(["revenue", "expense"]).default("revenue"),
      amount: z.string(), description: z.string().optional(),
    })).mutation(async ({ input, ctx }) => {
      const entry = await createFinanceEntry({ ...input, createdBy: ctx.user.id } as any);
      await logActivity(ctx.user.id, "finance.create", "finance_entry", entry.id, `${input.stream}:${input.amount}`);
      return entry;
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
      list: managerProcedure.input(z.object({ includeInactive: z.boolean().optional() }).optional())
        .query(({ input }) => listExpenseCategories(Boolean(input?.includeInactive))),
      create: adminProcedure.input(z.object({ name: z.string().min(1), code: z.string().min(2).max(32) }))
        .mutation(async ({ input, ctx }) => {
          const category = await createExpenseCategory({ ...input, createdBy: ctx.user.id });
          await logActivity(ctx.user.id, "expense_category.create", "expense_category", category.id, input.code);
          return category;
        }),
      update: adminProcedure.input(z.object({
        id: z.number(), name: z.string().min(1).optional(), code: z.string().min(2).max(32).optional(), isActive: z.boolean().optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, ...data } = input;
        const category = await updateExpenseCategory(id, data);
        await logActivity(ctx.user.id, "expense_category.update", "expense_category", id, JSON.stringify(data));
        return category;
      }),
      delete: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
        await deleteExpenseCategory(input.id);
        await logActivity(ctx.user.id, "expense_category.delete", "expense_category", input.id);
      }),
    }),
    expenses: router({
      list: managerProcedure.input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
        .query(({ input }) => listExpenseRecords(input?.from, input?.to)),
      create: managerProcedure.input(z.object({
        businessDate: z.string(), categoryId: z.number(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to two decimals"),
        payee: z.string().optional(), description: z.string().min(1),
        department: z.enum(["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management", "general"]).default("general"),
      })).mutation(async ({ input, ctx }) => {
        const category = await getExpenseCategory(input.categoryId);
        if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active expense category" });
        const stream = input.department === "aqua_park" || input.department === "fnb" ? input.department : "extras";
        const financeEntry = await createFinanceEntry({
          date: input.businessDate, stream, type: "expense", amount: input.amount,
          description: input.description, referenceType: "expense_record", createdBy: ctx.user.id,
        } as any);
        const expense = await createExpenseRecord({
          ...input, businessDate: input.businessDate as any, categoryName: category.name,
          financeEntryId: financeEntry.id, createdBy: ctx.user.id,
        } as any);
        await logActivity(ctx.user.id, "expense.create", "expense_record", expense.id, `${category.code}:${input.amount}`);
        return expense;
      }),
      update: managerProcedure.input(z.object({
        id: z.number(), businessDate: z.string().optional(), categoryId: z.number().optional(), amount: z.string().refine(isPositiveMoney, "Enter a positive amount with up to two decimals").optional(),
        payee: z.string().optional(), description: z.string().min(1).optional(),
        department: z.enum(["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management", "general"]).optional(),
      })).mutation(async ({ input, ctx }) => {
        const { id, categoryId, ...data } = input;
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
  }),

  admin: router({
    listUsers: adminProcedure.query(() => listUsers()),
    updateUserRole: adminProcedure.input(z.object({
      id: z.number(), role: z.enum(["staff", "manager", "admin", "guard"]),
    })).mutation(async ({ input, ctx }) => {
      await updateUserRole(input.id, input.role);
      await logActivity(ctx.user.id, "admin.role.update", "user", input.id, input.role);
    }),
    linkStaff: adminProcedure.input(z.object({ staffId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await linkStaffToUser(input.staffId, input.userId);
        await logActivity(ctx.user.id, "admin.staff.link", "staff_profile", input.staffId);
      }),
    activityLog: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
      .query(({ input }) => getActivityLog(input.limit)),
    populateQa: adminProcedure.mutation(async ({ ctx }) => {
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
