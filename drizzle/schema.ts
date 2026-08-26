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
  role: mysqlEnum("role", ["staff", "manager", "admin", "guard", "super_admin"]).default("staff").notNull(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: text("passwordHash"),
  mustChangePassword: boolean("mustChangePassword").default(true).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const userSessions = mysqlTable("user_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UserSession = typeof userSessions.$inferSelect;

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
  unitRate: decimal("unitRate", { precision: 12, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).default("0").notNull(),
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

// ─── Sales Tickets / Customer Visits ──────────────────────────────────────────
export const salesTicketSequences = mysqlTable("sales_ticket_sequences", {
  ticketYear: int("ticketYear").primaryKey(),
  lastSequence: int("lastSequence").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const serviceRates = mysqlTable("service_rates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  code: varchar("code", { length: 48 }).notNull().unique(),
  department: mysqlEnum("department", ["aqua_park", "rooms", "fnb", "general"]).default("aqua_park").notNull(),
  ticketType: mysqlEnum("ticketType", ["waterpark", "companion"]),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("OMR").notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ServiceRate = typeof serviceRates.$inferSelect;

// ─── PRD Phase 1 Ticketing ─────────────────────────────────────────────────────
// These tables are intentionally separate from the future WhatsApp/QR ticket
// entities above. Ticket numbers are continuous and never include a date.
export const ticketNumberSequences = mysqlTable("ticket_number_sequences", {
  id: int("id").primaryKey().default(1),
  lastNumber: int("lastNumber").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ticketDiscountTiers = mysqlTable("ticket_discount_tiers", {
  id: int("id").autoincrement().primaryKey(),
  minTickets: int("minTickets").notNull(),
  maxTickets: int("maxTickets"),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TicketDiscountTier = typeof ticketDiscountTiers.$inferSelect;

export const ticketPurchases = mysqlTable("ticket_purchases", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  visitDate: date("visitDate").notNull(),
  chargeableTicketCount: int("chargeableTicketCount").default(0).notNull(),
  discountPercentage: decimal("discountPercentage", { precision: 5, scale: 2 }).default("0").notNull(),
  baseSubtotal: decimal("baseSubtotal", { precision: 12, scale: 2 }).default("0").notNull(),
  discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  vatAmount: decimal("vatAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  feeTotal: decimal("feeTotal", { precision: 12, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "bank", "mixed"]).default("cash").notNull(),
  notes: text("notes"),
  issuedBy: int("issuedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TicketPurchase = typeof ticketPurchases.$inferSelect;

export const ticketPurchaseLines = mysqlTable("ticket_purchase_lines", {
  id: int("id").autoincrement().primaryKey(),
  purchaseId: int("purchaseId").notNull(),
  ticketNumber: varchar("ticketNumber", { length: 40 }).notNull().unique(),
  ticketType: mysqlEnum("ticketType", ["waterpark", "companion"]).notNull(),
  freeEntryCategory: mysqlEnum("freeEntryCategory", ["under_two", "person_of_determination", "senior"]),
  rateId: int("rateId"),
  label: varchar("label", { length: 128 }).notNull(),
  basePrice: decimal("basePrice", { precision: 12, scale: 2 }).notNull(),
  discountPercentage: decimal("discountPercentage", { precision: 5, scale: 2 }).default("0").notNull(),
  discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  vatAmount: decimal("vatAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  feeAmount: decimal("feeAmount", { precision: 12, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TicketPurchaseLine = typeof ticketPurchaseLines.$inferSelect;

export const ticketPurchaseFees = mysqlTable("ticket_purchase_fees", {
  id: int("id").autoincrement().primaryKey(),
  purchaseId: int("purchaseId").notNull(),
  feeId: int("feeId"),
  label: varchar("label", { length: 128 }).notNull(),
  code: varchar("code", { length: 48 }),
  calculationType: mysqlEnum("calculationType", ["fixed", "percentage"]).notNull(),
  applicationBasis: mysqlEnum("applicationBasis", ["per_ticket", "per_transaction"]).notNull(),
  value: decimal("value", { precision: 12, scale: 4 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TicketPurchaseFee = typeof ticketPurchaseFees.$inferSelect;

export const ticketFeeDefinitions = mysqlTable("ticket_fee_definitions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  code: varchar("code", { length: 48 }).notNull().unique(),
  calculationType: mysqlEnum("calculationType", ["fixed", "percentage"]).default("fixed").notNull(),
  value: decimal("value", { precision: 12, scale: 4 }).notNull(),
  applicationBasis: mysqlEnum("applicationBasis", ["per_ticket", "per_transaction"]).default("per_transaction").notNull(),
  appliesGlobally: boolean("appliesGlobally").default(false).notNull(),
  displayOrder: int("displayOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TicketFeeDefinition = typeof ticketFeeDefinitions.$inferSelect;

export const serviceRateFees = mysqlTable("service_rate_fees", {
  id: int("id").autoincrement().primaryKey(),
  rateId: int("rateId").notNull(),
  feeId: int("feeId").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  rateFeeUnique: unique("service_rate_fee_unique").on(table.rateId, table.feeId),
}));

export const salesTransactions = mysqlTable("sales_transactions", {
  id: int("id").autoincrement().primaryKey(),
  ticketNumber: varchar("ticketNumber", { length: 40 }).notNull().unique(),
  publicToken: varchar("publicToken", { length: 96 }).notNull().unique(),
  status: mysqlEnum("status", ["paid", "voided", "checked_in", "expired"]).default("paid").notNull(),
  ticketYear: int("ticketYear").notNull(),
  sequenceNumber: int("sequenceNumber").notNull(),
  customerId: int("customerId").notNull(),
  rateId: int("rateId"),
  visitDate: date("visitDate").notNull(),
  department: mysqlEnum("department", ["aqua_park", "rooms", "fnb", "general"]).default("aqua_park").notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  baseSubtotal: decimal("baseSubtotal", { precision: 12, scale: 2 }).default("0").notNull(),
  feeTotal: decimal("feeTotal", { precision: 12, scale: 2 }).default("0").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: mysqlEnum("paymentMethod", ["cash", "card", "bank", "mixed"]).default("cash").notNull(),
  notes: text("notes"),
  issuedBy: int("issuedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ticketYearSequenceUnique: unique("sales_ticket_year_sequence").on(table.ticketYear, table.sequenceNumber),
}));
export type SalesTransaction = typeof salesTransactions.$inferSelect;

export const salesTransactionLines = mysqlTable("sales_transaction_lines", {
  id: int("id").autoincrement().primaryKey(),
  transactionId: int("transactionId").notNull(),
  lineType: mysqlEnum("lineType", ["base", "fee"]).notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  code: varchar("code", { length: 48 }),
  quantity: int("quantity").default(1).notNull(),
  unitAmount: decimal("unitAmount", { precision: 12, scale: 4 }).notNull(),
  lineAmount: decimal("lineAmount", { precision: 12, scale: 2 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SalesTransactionLine = typeof salesTransactionLines.$inferSelect;

export const ticketCheckIns = mysqlTable("ticket_check_ins", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId"),
  scannedBy: int("scannedBy"),
  scannedAt: timestamp("scannedAt").defaultNow().notNull(),
  result: mysqlEnum("result", ["allowed", "denied"]).notNull(),
  denialReason: varchar("denialReason", { length: 160 }),
  scannedValue: varchar("scannedValue", { length: 512 }).notNull(),
  requestKey: varchar("requestKey", { length: 96 }).notNull().unique(),
});
export type TicketCheckIn = typeof ticketCheckIns.$inferSelect;

export const whatsappMessages = mysqlTable("whatsapp_messages", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  provider: varchar("provider", { length: 48 }).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 160 }),
  templateName: varchar("templateName", { length: 128 }).notNull(),
  status: mysqlEnum("status", ["queued", "sent", "delivered", "read", "failed"]).default("queued").notNull(),
  attempts: int("attempts").default(0).notNull(),
  errorMessage: text("errorMessage"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;

export const whatsappWebhookEvents = mysqlTable("whatsapp_webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  eventKey: varchar("eventKey", { length: 160 }).notNull().unique(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WhatsappWebhookEvent = typeof whatsappWebhookEvents.$inferSelect;

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

// ─── Expense Category and Expense Ledger ───────────────────────────────────────
export const expenseCategories = mysqlTable("expense_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ExpenseCategory = typeof expenseCategories.$inferSelect;

export const expenseRecords = mysqlTable("expense_records", {
  id: int("id").autoincrement().primaryKey(),
  businessDate: date("businessDate").notNull(),
  categoryId: int("categoryId"),
  categoryName: varchar("categoryName", { length: 96 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  payee: varchar("payee", { length: 128 }),
  description: varchar("description", { length: 256 }).notNull(),
  receiptNumber: varchar("receiptNumber", { length: 64 }),
  attachmentPath: varchar("attachmentPath", { length: 512 }),
  attachmentOriginalName: varchar("attachmentOriginalName", { length: 256 }),
  department: mysqlEnum("department", ["front_office", "housekeeping", "maintenance", "aqua_park", "fnb", "management", "general"]).default("general").notNull(),
  financeEntryId: int("financeEntryId"),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ExpenseRecord = typeof expenseRecords.$inferSelect;

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
