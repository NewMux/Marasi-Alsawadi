import { and, desc, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activityLog, aquaParkCapacity, aquaParkTickets, dailyTasks,
  dailySettlements, financeEntries, guests, housekeepingTasks, inventoryItems,
  maintenanceRequests, propertyUnits, reservations, staffProfiles,
  pettyCashRequests, staffAttendance, staffLeaveRequests, staffShifts, users, userSessions, workbookImports,
  type InsertUser
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); }
    catch (e) { console.warn("[DB] connect failed", e); }
  }
  return _db;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("openId required");
  const db = await getDb(); if (!db) return;
  const role = user.role ?? "staff";
  await db.insert(users).values({ ...user, role, lastSignedIn: new Date() })
    .onDuplicateKeyUpdate({ set: { name: user.name, email: user.email, loginMethod: user.loginMethod, lastSignedIn: new Date() } });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb(); if (!db) return undefined;
  const r = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return r[0];
}

export async function getUserByUsername(username: string) {
  const db = await getDb(); if (!db) return undefined;
  const r = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase())).limit(1);
  return r[0];
}

export async function createLocalUser(data: {
  username: string; passwordHash: string; name: string; email?: string | null;
  role: "staff" | "manager" | "admin" | "guard" | "super_admin" | "petty_cash";
  mustChangePassword?: boolean; isActive?: boolean;
}) {
  const db = await getDb(); if (!db) throw new Error("Database is not configured");
  const username = data.username.trim().toLowerCase();
  await db.insert(users).values({
    openId: `local:${username}`, username, passwordHash: data.passwordHash,
    name: data.name.trim(), email: data.email ?? null, loginMethod: "local",
    role: data.role, mustChangePassword: data.mustChangePassword ?? true,
    isActive: data.isActive ?? true, lastSignedIn: new Date(),
  });
  return getUserByUsername(username);
}

export async function updateLocalUser(id: number, data: Partial<{
  name: string; email: string | null; role: "staff" | "manager" | "admin" | "guard" | "super_admin" | "petty_cash";
  passwordHash: string; mustChangePassword: boolean; isActive: boolean; lastSignedIn: Date;
}>) {
  const db = await getDb(); if (!db) throw new Error("Database is not configured");
  await db.update(users).set(data).where(eq(users.id, id));
  const r = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return r[0];
}

export async function createUserSession(userId: number, tokenHash: string, expiresAt: Date) {
  const db = await getDb(); if (!db) throw new Error("Database is not configured");
  await db.insert(userSessions).values({ userId, tokenHash, expiresAt });
}

export async function getUserBySessionHash(tokenHash: string) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select({ user: users }).from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(and(eq(userSessions.tokenHash, tokenHash), gt(userSessions.expiresAt, new Date()), isNull(userSessions.revokedAt), eq(users.isActive, true)))
    .limit(1);
  if (!rows[0]?.user) return undefined;
  await db.update(userSessions).set({ lastUsedAt: new Date() }).where(eq(userSessions.tokenHash, tokenHash));
  return rows[0].user;
}

export async function revokeUserSession(tokenHash: string) {
  const db = await getDb(); if (!db) return;
  await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.tokenHash, tokenHash));
}

export async function revokeAllUserSessions(userId: number) {
  const db = await getDb(); if (!db) return;
  await db.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
}

// ─── Activity log ─────────────────────────────────────────────────────────────
export async function logActivity(userId: number | undefined, action: string, entityType?: string, entityId?: number, details?: string) {
  const db = await getDb(); if (!db) return;
  await db.insert(activityLog).values({ userId, action, entityType, entityId, details });
}

// ─── Property units ───────────────────────────────────────────────────────────
export async function listUnits() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(propertyUnits).orderBy(propertyUnits.code);
}
export async function createUnit(data: typeof propertyUnits.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  const r = await db.insert(propertyUnits).values(data);
  return r[0];
}
export async function updateUnitStatus(id: number, status: typeof propertyUnits.$inferSelect["status"]) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(propertyUnits).set({ status }).where(eq(propertyUnits.id, id));
}

// ─── Guests ───────────────────────────────────────────────────────────────────
export async function listGuests() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(guests).orderBy(desc(guests.createdAt));
}
export async function createGuest(data: typeof guests.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(guests).values(data);
  const r = await db.select().from(guests).orderBy(desc(guests.id)).limit(1);
  return r[0];
}

// ─── Reservations ─────────────────────────────────────────────────────────────
export async function listReservations(filters?: { status?: string; unitId?: number }) {
  const db = await getDb(); if (!db) return [];
  let q = db.select({ r: reservations, g: guests, u: propertyUnits })
    .from(reservations)
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .leftJoin(propertyUnits, eq(reservations.unitId, propertyUnits.id))
    .orderBy(desc(reservations.createdAt));
  return q;
}
export type ReservationDraft = {
  guestId: number; unitId: number; checkIn: string; checkOut: string;
  adults: number; children: number; ratePerNight: string; totalAmount: string;
  status?: "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
  source?: string; notes?: string; createdBy: number;
};

export function isQaReservationRecord(reservation: { notes?: string | null }) {
  return reservation.notes === "QA-only reservation";
}

export function hasReservationOverlap(records: unknown[], unitId: number, checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut || checkIn >= checkOut) return true;
  return records.some((entry: any) => {
    const reservation = entry?.r ?? entry;
    if (reservation?.unitId !== unitId || ["cancelled", "checked_out"].includes(reservation?.status)) return false;
    if (!reservation?.checkInAt || !reservation?.checkOutAt) return false;
    const existingCheckIn = new Date(reservation.checkInAt).toISOString().slice(0, 10);
    const existingCheckOut = new Date(reservation.checkOutAt).toISOString().slice(0, 10);
    return checkIn < existingCheckOut && checkOut > existingCheckIn;
  });
}

export function buildReservationValues(data: ReservationDraft, kind: "room" | "chalet") {
  const bookingSources = new Set(["walk_in", "phone", "online", "agent"]);
  const source = bookingSources.has(data.source ?? "") ? data.source as "walk_in" | "phone" | "online" | "agent" : "walk_in";
  return {
    reference: `MAS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    kind,
    guestId: data.guestId,
    unitId: data.unitId,
    checkInAt: new Date(`${data.checkIn}T12:00:00.000Z`),
    checkOutAt: new Date(`${data.checkOut}T12:00:00.000Z`),
    adults: data.adults,
    children: data.children,
    quantity: 1,
    unitRate: Number(data.ratePerNight).toFixed(2),
    totalAmount: Number(data.totalAmount).toFixed(2),
    status: data.status ?? "pending",
    source,
    notes: data.notes,
    createdBy: data.createdBy,
  };
}

export async function createReservation(data: ReservationDraft) {
  const db = await getDb(); if (!db) throw new Error("no db");
  const unit = await db.select({ type: propertyUnits.type }).from(propertyUnits).where(eq(propertyUnits.id, data.unitId)).limit(1);
  const kind = unit[0]?.type === "chalet" ? "chalet" : "room";
  await db.insert(reservations).values(buildReservationValues(data, kind));
  const r = await db.select().from(reservations).orderBy(desc(reservations.id)).limit(1);
  return r[0]!;
}
export async function updateReservationStatus(id: number, status: typeof reservations.$inferSelect["status"]) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(reservations).set({ status }).where(eq(reservations.id, id));
}
export async function getOccupiedDates(unitId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select({ checkIn: reservations.checkInAt, checkOut: reservations.checkOutAt, status: reservations.status })
    .from(reservations)
    .where(and(eq(reservations.unitId, unitId), or(eq(reservations.status, "confirmed"), eq(reservations.status, "checked_in"))));
}

// ─── Aqua park ────────────────────────────────────────────────────────────────
export async function getAquaCapacity(date: string) {
  const db = await getDb(); if (!db) return null;
  const r = await db.select().from(aquaParkCapacity).where(sql`${aquaParkCapacity.date} = ${date}`).limit(1);
  return r[0] ?? null;
}
export async function setAquaCapacity(date: string, maxCapacity: number, updatedBy?: number) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(aquaParkCapacity).values({ date: date as any, maxCapacity, updatedBy })
    .onDuplicateKeyUpdate({ set: { maxCapacity, updatedBy } });
}
export async function listAquaTickets(date: string) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(aquaParkTickets).where(sql`${aquaParkTickets.date} = ${date}`).orderBy(desc(aquaParkTickets.createdAt));
}
export async function createAquaTicket(data: typeof aquaParkTickets.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(aquaParkTickets).values(data);
  const r = await db.select().from(aquaParkTickets).orderBy(desc(aquaParkTickets.id)).limit(1);
  return r[0]!;
}
export async function recordEntry(ticketId: number) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(aquaParkTickets).set({ entered: true, enteredAt: new Date() }).where(eq(aquaParkTickets.id, ticketId));
}

// ─── Housekeeping ─────────────────────────────────────────────────────────────
export async function listHousekeepingTasks(date?: string) {
  const db = await getDb(); if (!db) return [];
  const base = db.select({ t: housekeepingTasks, u: propertyUnits, s: staffProfiles })
    .from(housekeepingTasks)
    .leftJoin(propertyUnits, eq(housekeepingTasks.unitId, propertyUnits.id))
    .leftJoin(staffProfiles, eq(housekeepingTasks.assignedTo, staffProfiles.id))
    .orderBy(desc(housekeepingTasks.createdAt));
  return base;
}
export async function createHousekeepingTask(data: typeof housekeepingTasks.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(housekeepingTasks).values(data);
  const r = await db.select().from(housekeepingTasks).orderBy(desc(housekeepingTasks.id)).limit(1);
  return r[0]!;
}
export async function updateHousekeepingTask(id: number, data: Partial<typeof housekeepingTasks.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(housekeepingTasks).set(data).where(eq(housekeepingTasks.id, id));
}

// ─── Maintenance ──────────────────────────────────────────────────────────────
export async function listMaintenanceRequests() {
  const db = await getDb(); if (!db) return [];
  return db.select({ r: maintenanceRequests, u: propertyUnits, s: staffProfiles })
    .from(maintenanceRequests)
    .leftJoin(propertyUnits, eq(maintenanceRequests.unitId, propertyUnits.id))
    .leftJoin(staffProfiles, eq(maintenanceRequests.assignedTo, staffProfiles.id))
    .orderBy(desc(maintenanceRequests.createdAt));
}
export async function createMaintenanceRequest(data: typeof maintenanceRequests.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(maintenanceRequests).values(data);
  const r = await db.select().from(maintenanceRequests).orderBy(desc(maintenanceRequests.id)).limit(1);
  return r[0]!;
}
export async function updateMaintenanceRequest(id: number, data: Partial<typeof maintenanceRequests.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(maintenanceRequests).set(data).where(eq(maintenanceRequests.id, id));
}

// ─── Inventory ────────────────────────────────────────────────────────────────
export async function listInventory() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(inventoryItems).orderBy(inventoryItems.category, inventoryItems.name);
}
export async function createInventoryItem(data: typeof inventoryItems.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(inventoryItems).values(data);
  const r = await db.select().from(inventoryItems).orderBy(desc(inventoryItems.id)).limit(1);
  return r[0]!;
}
export async function updateInventoryItem(id: number, data: Partial<typeof inventoryItems.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(inventoryItems).set(data).where(eq(inventoryItems.id, id));
}

// ─── Staff ────────────────────────────────────────────────────────────────────
export async function listStaff() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(staffProfiles).where(eq(staffProfiles.isActive, true)).orderBy(staffProfiles.department, staffProfiles.fullName);
}
export async function createStaffProfile(data: typeof staffProfiles.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(staffProfiles).values(data);
  const r = await db.select().from(staffProfiles).orderBy(desc(staffProfiles.id)).limit(1);
  return r[0]!;
}
export async function listShifts(from?: string, to?: string) {
  const db = await getDb(); if (!db) return [];
  return db.select({ s: staffShifts, p: staffProfiles })
    .from(staffShifts)
    .leftJoin(staffProfiles, eq(staffShifts.staffId, staffProfiles.id))
    .orderBy(staffShifts.startTime);
}
export async function createShift(data: typeof staffShifts.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(staffShifts).values(data);
  const r = await db.select().from(staffShifts).orderBy(desc(staffShifts.id)).limit(1);
  return r[0]!;
}
export function isValidDateRange(startDate: string, endDate: string) {
  return Boolean(startDate && endDate && startDate <= endDate);
}
export async function listAttendance(workDate?: string) {
  const db = await getDb(); if (!db) return [];
  const query = db.select({ a: staffAttendance, s: staffProfiles })
    .from(staffAttendance)
    .leftJoin(staffProfiles, eq(staffAttendance.staffId, staffProfiles.id))
    .orderBy(desc(staffAttendance.workDate), staffProfiles.fullName);
  return workDate ? query.where(sql`${staffAttendance.workDate} = ${workDate}`) : query;
}
export async function recordAttendance(data: typeof staffAttendance.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  const existing = await db.select().from(staffAttendance).where(and(
    eq(staffAttendance.staffId, data.staffId),
    sql`${staffAttendance.workDate} = ${data.workDate}`,
  )).limit(1);
  if (existing[0]) {
    await db.update(staffAttendance).set({
      status: data.status, clockInAt: data.clockInAt, clockOutAt: data.clockOutAt,
      notes: data.notes, recordedBy: data.recordedBy,
    }).where(eq(staffAttendance.id, existing[0].id));
    return existing[0];
  }
  await db.insert(staffAttendance).values(data);
  const record = await db.select().from(staffAttendance).orderBy(desc(staffAttendance.id)).limit(1);
  return record[0]!;
}
export async function listLeaveRequests() {
  const db = await getDb(); if (!db) return [];
  return db.select({ l: staffLeaveRequests, s: staffProfiles })
    .from(staffLeaveRequests)
    .leftJoin(staffProfiles, eq(staffLeaveRequests.staffId, staffProfiles.id))
    .orderBy(desc(staffLeaveRequests.createdAt));
}
export async function createLeaveRequest(data: typeof staffLeaveRequests.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(staffLeaveRequests).values(data);
  const request = await db.select().from(staffLeaveRequests).orderBy(desc(staffLeaveRequests.id)).limit(1);
  return request[0]!;
}
export async function reviewLeaveRequest(id: number, status: "approved" | "rejected" | "cancelled", reviewedBy: number) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(staffLeaveRequests).set({ status, reviewedBy, reviewedAt: new Date() }).where(eq(staffLeaveRequests.id, id));
}
export async function listDailyTasks(staffId?: number) {
  const db = await getDb(); if (!db) return [];
  const q = db.select({ t: dailyTasks, s: staffProfiles })
    .from(dailyTasks)
    .leftJoin(staffProfiles, eq(dailyTasks.assignedTo, staffProfiles.id))
    .orderBy(desc(dailyTasks.createdAt));
  return q;
}
export async function createDailyTask(data: typeof dailyTasks.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(dailyTasks).values(data);
  const r = await db.select().from(dailyTasks).orderBy(desc(dailyTasks.id)).limit(1);
  return r[0]!;
}
export async function updateDailyTask(id: number, data: Partial<typeof dailyTasks.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(dailyTasks).set(data).where(eq(dailyTasks.id, id));
}

// ─── Finance ──────────────────────────────────────────────────────────────────
export async function listFinanceEntries(from?: string, to?: string, stream?: string, descriptionPrefix?: string) {
  const db = await getDb(); if (!db) return [];
  const conditions: any[] = [];
  if (from) conditions.push(sql`${financeEntries.date} >= ${from}`);
  if (to) conditions.push(sql`${financeEntries.date} <= ${to}`);
  if (stream) conditions.push(eq(financeEntries.stream, stream as any));
  if (descriptionPrefix) conditions.push(sql`${financeEntries.description} LIKE ${`${descriptionPrefix}%`}`);
  const q = db.select().from(financeEntries).orderBy(desc(financeEntries.date));
  return conditions.length ? q.where(and(...conditions)) : q;
}
export async function getFinanceEntry(id: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(financeEntries).where(eq(financeEntries.id, id)).limit(1);
  return rows[0] ?? null;
}
export async function createFinanceEntry(data: typeof financeEntries.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(financeEntries).values(data);
  const r = await db.select().from(financeEntries).orderBy(desc(financeEntries.id)).limit(1);
  return r[0]!;
}
export async function updateFinanceEntry(id: number, data: Partial<typeof financeEntries.$inferInsert>) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(financeEntries).set(data).where(eq(financeEntries.id, id));
}
export async function deleteFinanceEntryByReference(referenceType: string, referenceId: number) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.delete(financeEntries).where(and(eq(financeEntries.referenceType, referenceType), eq(financeEntries.referenceId, referenceId)));
}
export async function deleteFinanceEntry(id: number) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.delete(financeEntries).where(eq(financeEntries.id, id));
}
export function settlementVariance(values: { expectedAmount?: unknown; cashAmount?: unknown; bankAmount?: unknown; cardAmount?: unknown; bankCharges?: unknown }) {
  const expected = Number(values.expectedAmount ?? 0);
  const actualNet = Number(values.cashAmount ?? 0) + Number(values.bankAmount ?? 0) + Number(values.cardAmount ?? 0) - Number(values.bankCharges ?? 0);
  return Math.round((actualNet - expected) * 100) / 100;
}
export async function listDailySettlements() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(dailySettlements).orderBy(desc(dailySettlements.businessDate));
}
export async function saveDailySettlement(data: typeof dailySettlements.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  const variance = settlementVariance(data);
  const department = data.department ?? "general";
  const status = Math.abs(variance) > 0.009 ? "variance" : (data.status ?? "submitted");
  await db.insert(dailySettlements).values({ ...data, department, status }).onDuplicateKeyUpdate({ set: { ...data, department, status } });
  const result = await db.select().from(dailySettlements).where(and(eq(dailySettlements.businessDate, data.businessDate), eq(dailySettlements.department, department))).limit(1);
  return result[0]!;
}
export async function reviewDailySettlement(id: number, reviewerId: number) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(dailySettlements).set({ status: "approved", reviewedBy: reviewerId, reviewedAt: new Date() }).where(eq(dailySettlements.id, id));
}
export async function listPettyCashRequests() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(pettyCashRequests).orderBy(desc(pettyCashRequests.requestDate), desc(pettyCashRequests.createdAt));
}
export async function createPettyCashRequest(data: typeof pettyCashRequests.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(pettyCashRequests).values(data);
  const result = await db.select().from(pettyCashRequests).orderBy(desc(pettyCashRequests.id)).limit(1);
  return result[0]!;
}
export async function reviewPettyCashRequest(id: number, status: "approved" | "paid" | "rejected", reviewerId: number) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(pettyCashRequests).set({ status, approvedBy: reviewerId, approvedAt: new Date() }).where(eq(pettyCashRequests.id, id));
}
export async function getRevenueSummary(from: string, to: string) {
  const db = await getDb(); if (!db) return [];
  return db.select({
    stream: financeEntries.stream,
    type: financeEntries.type,
    total: sql<number>`COALESCE(SUM(${financeEntries.amount}),0)`,
  }).from(financeEntries)
    .where(sql`${financeEntries.date} >= ${from} AND ${financeEntries.date} <= ${to}`)
    .groupBy(financeEntries.stream, financeEntries.type);
}
export async function getOccupancyStats(from: string, to: string) {
  const db = await getDb(); if (!db) return { totalUnits: 0, occupiedNights: 0 };
  const [unitCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(propertyUnits);
  const stays = await db.select({ checkIn: reservations.checkInAt, checkOut: reservations.checkOutAt })
    .from(reservations)
    .where(and(
      or(eq(reservations.status, "checked_in"), eq(reservations.status, "checked_out"), eq(reservations.status, "confirmed")),
      sql`DATE(${reservations.checkInAt}) < DATE_ADD(${to}, INTERVAL 1 DAY)`,
      sql`DATE(${reservations.checkOutAt}) > ${from}`
    ));
  const windowStart = new Date(`${from}T00:00:00Z`).getTime();
  const windowEnd = new Date(`${to}T00:00:00Z`).getTime() + 86400000;
  const occupiedNights = stays.reduce((total, stay) => {
    if (!stay.checkIn || !stay.checkOut) return total;
    const start = Math.max(new Date(stay.checkIn).getTime(), windowStart);
    const end = Math.min(new Date(stay.checkOut).getTime(), windowEnd);
    return total + Math.max(0, Math.ceil((end - start) / 86400000));
  }, 0);
  return { totalUnits: Number(unitCount?.c ?? 0), occupiedNights };
}
export async function getAquaAttendance(from: string, to: string) {
  const db = await getDb(); if (!db) return 0;
  const [r] = await db.select({ total: sql<number>`COALESCE(SUM(${aquaParkTickets.quantity}),0)` })
    .from(aquaParkTickets)
    .where(sql`${aquaParkTickets.date} >= ${from} AND ${aquaParkTickets.date} <= ${to}`);
  return Number(r?.total ?? 0);
}

// ─── Workbook imports ─────────────────────────────────────────────────────────
export async function listWorkbookImports() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(workbookImports).orderBy(desc(workbookImports.createdAt));
}
export async function createWorkbookImport(data: typeof workbookImports.$inferInsert) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.insert(workbookImports).values(data);
  const r = await db.select().from(workbookImports).orderBy(desc(workbookImports.id)).limit(1);
  return r[0]!;
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export async function listUsers() {
  const db = await getDb(); if (!db) return [];
  return db.select().from(users).orderBy(users.name);
}
export async function updateUserRole(id: number, role: "staff" | "manager" | "admin" | "guard" | "super_admin" | "petty_cash") {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(users).set({ role }).where(eq(users.id, id));
}
export async function linkStaffToUser(staffId: number, userId: number) {
  const db = await getDb(); if (!db) throw new Error("no db");
  await db.update(staffProfiles).set({ userId }).where(eq(staffProfiles.id, staffId));
}
export async function getActivityLog(limit = 50) {
  const db = await getDb(); if (!db) return [];
  return db.select({ l: activityLog, u: users })
    .from(activityLog)
    .leftJoin(users, eq(activityLog.userId, users.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}
