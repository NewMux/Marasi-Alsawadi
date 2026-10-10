import type { Request, Response } from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { dataRestoreRequests, users } from "../drizzle/schema";
import { authenticateRequest } from "./auth";
import { getDb, logActivity } from "./db";

// PRD Round 17, item 5.4: client-facing Backup & Restore.
//
// Backup is self-service: a Super Admin downloads every business table as
// one JSON file at any time. Restore is deliberately NOT self-service — the
// client files a "Request Data Restore" naming the point in time they want,
// and NewMux reviews it and performs the restore on the server. Nothing in
// this module ever writes business data back.

// Never exported: live login sessions, and each account's password hash
// (stripped column-wise below). Everything else is the client's own data.
const EXCLUDED_TABLES = new Set(["user_sessions"]);
const STRIPPED_COLUMNS: Record<string, string[]> = { users: ["passwordHash"] };

export async function buildBackup() {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  const [tableRows] = await db.execute(sql.raw("SHOW TABLES")) as unknown as [Array<Record<string, string>>];
  const tableNames = tableRows.map((row) => Object.values(row)[0]).filter((name) => name && !EXCLUDED_TABLES.has(name)).sort();
  const tables: Record<string, unknown[]> = {};
  for (const name of tableNames) {
    const [rows] = await db.execute(sql.raw(`SELECT * FROM \`${name.replace(/`/g, "")}\``)) as unknown as [Array<Record<string, unknown>>];
    const stripped = STRIPPED_COLUMNS[name] ?? [];
    tables[name] = stripped.length ? rows.map((row) => Object.fromEntries(Object.entries(row).filter(([column]) => !stripped.includes(column)))) : rows;
  }
  return {
    format: "marasi-erp-backup", version: 1, generatedAt: new Date().toISOString(),
    note: "Data export of every table except login sessions and password hashes. Uploaded attachment files (receipts) are stored separately on the server and are not inside this file. Restores are performed by NewMux on request.",
    rowCounts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    tables,
  };
}

// GET /api/backup — a plain download (not tRPC) so the browser saves the
// file directly. Super Admin only, same session cookie as the app.
export async function handleBackupDownload(req: Request, res: Response) {
  let user: Awaited<ReturnType<typeof authenticateRequest>> = null;
  try { user = await authenticateRequest(req); } catch { user = null; }
  if (!user) return res.status(401).json({ message: "Sign in first" });
  if (user.role !== "super_admin") return res.status(403).json({ message: "Only a Super Admin can download a backup" });
  try {
    const backup = await buildBackup();
    const stamp = backup.generatedAt.slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2");
    await logActivity(user.id, "backup.download", "system", undefined, JSON.stringify(backup.rowCounts));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="marasi-backup-${stamp}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(JSON.stringify(backup, (_key, value) => typeof value === "bigint" ? value.toString() : value));
  } catch (error) {
    console.error("[Backup] export failed:", error);
    res.status(500).json({ message: "The backup could not be generated" });
  }
}

// NewMux staff accounts allowed to work the restore queue (change a
// request's status and leave a note). Set on the server only, e.g.
// NEWMUX_SUPPORT_USERNAMES=newmux,newmux-ops — never editable in the app, so
// the client's own Super Admin can file requests but not mark them done.
export function isRestoreSupportUser(user: { username?: string | null } | null | undefined) {
  const allowed = (process.env.NEWMUX_SUPPORT_USERNAMES || "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  return Boolean(user?.username && allowed.includes(user.username.toLowerCase()));
}

export async function listRestoreRequests() {
  const db = await getDb(); if (!db) return [];
  const rows = await db.select({ request: dataRestoreRequests, requestedByName: users.name }).from(dataRestoreRequests)
    .leftJoin(users, eq(dataRestoreRequests.requestedBy, users.id))
    .orderBy(desc(dataRestoreRequests.createdAt), desc(dataRestoreRequests.id));
  const handlerIds = Array.from(new Set(rows.map((row) => row.request.handledBy).filter((id): id is number => Boolean(id))));
  const handlers = handlerIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, handlerIds)) : [];
  const handlerName = new Map(handlers.map((row) => [row.id, row.name]));
  return rows.map((row) => ({ ...row.request, requestedByName: row.requestedByName, handledByName: row.request.handledBy ? handlerName.get(row.request.handledBy) ?? null : null }));
}

export async function getRestoreRequest(id: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(dataRestoreRequests).where(eq(dataRestoreRequests.id, id)).limit(1);
  return rows[0];
}

export async function createRestoreRequest(data: { restorePoint: Date; reason: string; requestedBy: number }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.insert(dataRestoreRequests).values({ restorePoint: data.restorePoint, reason: data.reason, requestedBy: data.requestedBy });
  const rows = await db.select().from(dataRestoreRequests).orderBy(desc(dataRestoreRequests.id)).limit(1);
  return rows[0]!;
}

export async function updateRestoreRequest(id: number, data: { status: "pending" | "in_progress" | "completed" | "rejected" | "cancelled"; handledBy?: number; handledNote?: string | null }) {
  const db = await getDb(); if (!db) throw new Error("Database is unavailable");
  await db.update(dataRestoreRequests).set({
    status: data.status,
    ...(data.handledBy !== undefined ? { handledBy: data.handledBy, handledAt: new Date() } : {}),
    ...(data.handledNote !== undefined ? { handledNote: data.handledNote } : {}),
  }).where(eq(dataRestoreRequests.id, id));
  return getRestoreRequest(id);
}
