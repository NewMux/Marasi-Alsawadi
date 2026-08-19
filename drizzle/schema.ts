import {
  int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, date, unique
} from "drizzle-orm/mysql-core";

// ─── Users & Auth ────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["staff", "manager", "admin"]).default("staff").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Property Units ───────────────────────────────────────────────────────────
export const propertyUnits = mysqlTable("property_units", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  type: mysqlEnum("type", ["room", "chalet"]).default("room").notNull(),
  capacity: int("capacity").default(2).notNull(),
  ratePerNight: decimal("ratePerNight", { precision: 10, scale: 2 }).default("0").notNull(),
  status: mysqlEnum("status", ["available", "occupied", "maintenance", "out_of_order"]).default("available").notNull(),
  floor: varchar("floor", { length: 16 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PropertyUnit = typeof propertyUnits.$inferSelect;

// ─── Guests ───────────────────────────────────────────────────────────────────
export const guests = mysqlTable("guests", {
  id: int("id").autoincrement().primaryKey(),
  fullName: varchar("fullName", { length: 128 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  nationality: varchar("nationality", { length: 64 }),
  idReference: varchar("idReference", { length: 96 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Guest = typeof guests.$inferSelect;

// ─── Reservations ─────────────────────────────────────────────────────────────
export const reservations = mysqlTable("reservations", {
  id: int("id").autoincrement().primaryKey(),
  reference: varchar("reference", { length: 40 }).notNull().unique(),
  kind: mysqlEnum("kind", ["room", "chalet", "aqua_day_pass"]).notNull(),
  guestId: int("guestId").notNull(),
  unitId: int("unitId"),
  checkInAt: timestamp("checkInAt"),
  checkOutAt: timestamp("checkOutAt"),
  visitDate: timestamp("visitDate"),
  adults: int("adults").default(1).notNull(),
  children: int("children").default(0).notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitRate: int("unitRate").default(0).notNull(),
  totalAmount: int("totalAmount").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "confirmed", "checked_in", "checked_out", "cancelled"]).default("pending").notNull(),
  source: mysqlEnum("source", ["walk_in", "phone", "online", "agent"]).default("walk_in").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Reservation = typeof reservations.$inferSelect;

// ─── Aqua Park ────────────────────────────────────────────────────────────────
export const aquaParkCapacity = mysqlTable("aqua_park_capacity", {
  id: int("id").autoincrement().primaryKey(),
  date: date("date").notNull().unique(),
  maxCapacity: int("maxCapacity").default(200).notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const aquaParkTickets = mysqlTable("aqua_park_tickets", {
  id: int("id").autoincrement().primaryKey(),
  date: date("date").notNull(),
  guestName: varchar("guestName", { length: 128 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  pricePerTicket: decimal("pricePerTicket", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  ticketType: mysqlEnum("ticketType", ["adult", "child", "group"]).default("adult").notNull(),
  entered: boolean("entered").default(false).notNull(),
  enteredAt: timestamp("enteredAt"),
  issuedBy: int("issuedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AquaParkTicket = typeof aquaParkTickets.$inferSelect;

// ─── Housekeeping ─────────────────────────────────────────────────────────────
export const housekeepingTasks = mysqlTable("housekeeping_tasks", {
  id: int("id").autoincrement().primaryKey(),
  unitId: int("unitId").notNull(),
  assignedTo: int("assignedTo"),
  taskType: mysqlEnum("taskType", ["turnover", "daily", "deep_clean", "inspection"]).default("turnover").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "done"]).default("pending").notNull(),
  roomStatus: mysqlEnum("roomStatus", ["clean", "dirty", "inspected", "out_of_order"]).default("dirty").notNull(),
  notes: text("notes"),
  scheduledFor: date("scheduledFor"),
  completedAt: timestamp("completedAt"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type HousekeepingTask = typeof housekeepingTasks.$inferSelect;

// ─── Maintenance ──────────────────────────────────────────────────────────────
export const maintenanceRequests = mysqlTable("maintenance_requests", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 128 }),
  unitId: int("unitId"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "assigned", "in_progress", "resolved", "closed"]).default("open").notNull(),
  assignedTo: int("assignedTo"),
  reportedBy: int("reportedBy"),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  sku: varchar("sku", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  category: mysqlEnum("category", ["fnb", "housekeeping", "aqua_park", "maintenance", "general"]).default("general").notNull(),
  quantityOnHand: decimal("quantityOnHand", { precision: 10, scale: 2 }).default("0").notNull(),
  lowStockThreshold: decimal("lowStockThreshold", { precision: 10, scale: 2 }).default("10").notNull(),
  unit: varchar("unit", { length: 32 }).default("unit").notNull(),
  supplier: varchar("supplier", { length: 128 }),
  lastRestockedAt: timestamp("lastRestockedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InventoryItem = typeof inventoryItems.$inferSelect;

// ─── Staff ────────────────────────────────────────────────────────────────────
export const staffProfiles = mysqlTable("staff_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").unique(),
  fullName: varchar("fullName", { length: 128 }).notNull(),
  position: varchar("position", { length: 128 }),
  department: mysqlEnum("department", ["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management"]).default("front_office").notNull(),
  phone: varchar("phone", { length: 32 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type StaffProfile = typeof staffProfiles.$inferSelect;

export const staffShifts = mysqlTable("staff_shifts", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staffId").notNull(),
  department: varchar("department", { length: 64 }),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const staffAttendance = mysqlTable("staff_attendance", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staffId").notNull(),
  workDate: date("workDate").notNull(),
  status: mysqlEnum("status", ["present", "late", "absent", "leave"]).default("present").notNull(),
  clockInAt: timestamp("clockInAt"),
  clockOutAt: timestamp("clockOutAt"),
  notes: text("notes"),
  recordedBy: int("recordedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const staffLeaveRequests = mysqlTable("staff_leave_requests", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staffId").notNull(),
  leaveType: mysqlEnum("leaveType", ["annual", "sick", "unpaid", "other"]).default("annual").notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  notes: text("notes"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Daily Tasks ──────────────────────────────────────────────────────────────
export const dailyTasks = mysqlTable("daily_tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  assignedTo: int("assignedTo"),
  department: varchar("department", { length: 64 }),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  status: mysqlEnum("status", ["pending", "in_progress", "done"]).default("pending").notNull(),
  dueDate: date("dueDate"),
  completedAt: timestamp("completedAt"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// ─── Finance / Revenue ────────────────────────────────────────────────────────
export const financeEntries = mysqlTable("finance_entries", {
  id: int("id").autoincrement().primaryKey(),
  date: date("date").notNull(),
  stream: mysqlEnum("stream", ["rooms", "aqua_park", "fnb", "extras"]).notNull(),
  type: mysqlEnum("type", ["revenue", "expense"]).default("revenue").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: varchar("description", { length: 256 }),
  referenceId: int("referenceId"),
  referenceType: varchar("referenceType", { length: 64 }),
  sourceFile: varchar("sourceFile", { length: 512 }),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FinanceEntry = typeof financeEntries.$inferSelect;

// ─── Daily Settlement / Cash Control ──────────────────────────────────────────
export const dailySettlements = mysqlTable("daily_settlements", {
  id: int("id").autoincrement().primaryKey(),
  businessDate: date("businessDate").notNull(),
  department: mysqlEnum("department", ["aqua_park", "rooms", "fnb", "events", "general"]).default("general").notNull(),
  expectedAmount: decimal("expectedAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  cashAmount: decimal("cashAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  bankAmount: decimal("bankAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  cardAmount: decimal("cardAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  bankCharges: decimal("bankCharges", { precision: 12, scale: 2 }).default("0").notNull(),
  status: mysqlEnum("status", ["draft", "submitted", "approved", "variance"]).default("draft").notNull(),
  notes: text("notes"),
  submittedBy: int("submittedBy"),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  businessDepartmentUnique: unique("daily_settlement_business_department").on(table.businessDate, table.department),
}));
export type DailySettlement = typeof dailySettlements.$inferSelect;

// ─── Expense / Petty Cash ─────────────────────────────────────────────────────
export const pettyCashRequests = mysqlTable("petty_cash_requests", {
  id: int("id").autoincrement().primaryKey(),
  requestDate: date("requestDate").notNull(),
  department: mysqlEnum("department", ["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management", "general"]).default("general").notNull(),
  category: mysqlEnum("category", ["petty_cash", "expense", "reimbursement"]).default("expense").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  payee: varchar("payee", { length: 128 }).notNull(),
  purpose: varchar("purpose", { length: 256 }).notNull(),
  sourceReference: varchar("sourceReference", { length: 96 }),
  status: mysqlEnum("status", ["pending", "approved", "paid", "rejected"]).default("pending").notNull(),
  requestedBy: int("requestedBy").notNull(),
  approvedBy: int("approvedBy"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PettyCashRequest = typeof pettyCashRequests.$inferSelect;

// ─── Activity Log ─────────────────────────────────────────────────────────────
export const activityLog = mysqlTable("activity_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entityType", { length: 64 }),
  entityId: int("entityId"),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Workbook Imports ─────────────────────────────────────────────────────────
export const workbookImports = mysqlTable("workbook_imports", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("fileName", { length: 256 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  rowsImported: int("rowsImported").default(0).notNull(),
  mapping: text("mapping"),
  importedBy: int("importedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
