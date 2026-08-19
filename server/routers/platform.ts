import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createAquaTicket, createDailyTask, createFinanceEntry, createGuest,
  createHousekeepingTask, createInventoryItem, createMaintenanceRequest,
  createReservation, createShift, createStaffProfile, createUnit,
  createWorkbookImport, getActivityLog, getAquaAttendance, getAquaCapacity,
  getOccupancyStats, getRevenueSummary, linkStaffToUser,
  listAquaTickets, listDailyTasks, listFinanceEntries, listGuests,
  listHousekeepingTasks, listInventory, listMaintenanceRequests,
  listReservations, listShifts, listStaff, listUnits, listUsers,
  isQaReservationRecord, listWorkbookImports, logActivity, recordEntry, setAquaCapacity,
  updateDailyTask, updateHousekeepingTask, updateInventoryItem,
  updateMaintenanceRequest, updateReservationStatus, updateUnitStatus,
  updateUserRole,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

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
  }),

  admin: router({
    listUsers: adminProcedure.query(() => listUsers()),
    updateUserRole: adminProcedure.input(z.object({
      id: z.number(), role: z.enum(["staff", "manager", "admin"]),
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
