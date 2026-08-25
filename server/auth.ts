import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { createUserSession, getUserBySessionHash, revokeUserSession } from "./db";

export const SESSION_COOKIE = "marasi_session";
const SESSION_TTL_MS = Math.max(60, Number(process.env.SESSION_TTL_MINUTES || 720)) * 60_000;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, SCRYPT_KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined) {
  if (!encoded) return false;
  const [algorithm, n, r, p, saltValue, keyValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !keyValue) return false;
  if (Number(n) !== SCRYPT_N || Number(r) !== SCRYPT_R || Number(p) !== SCRYPT_P) return false;
  const expected = Buffer.from(keyValue, "base64");
  const actual = await scrypt(password, Buffer.from(saltValue, "base64"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookieHeader(header: string | undefined) {
  const cookies = new Map<string, string>();
  for (const part of (header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try { cookies.set(name, decodeURIComponent(value)); } catch { cookies.set(name, value); }
  }
  return cookies;
}

export function sessionTokenFromRequest(req: Request) {
  return parseCookieHeader(req.headers.cookie).get(SESSION_COOKIE);
}

function cookieOptions(req: Request) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0]?.trim();
  const secure = process.env.NODE_ENV === "production" || req.secure || forwardedProto === "https";
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_MS };
}

export async function createAuthenticatedSession(userId: number, req: Request, res: Response) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await createUserSession(userId, hashSessionToken(token), expiresAt);
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
  return expiresAt;
}

export async function revokeAuthenticatedSession(req: Request, res: Response) {
  const token = sessionTokenFromRequest(req);
  if (token) await revokeUserSession(hashSessionToken(token));
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(req), maxAge: 0 });
}

export async function authenticateRequest(req: Request) {
  const token = sessionTokenFromRequest(req);
  if (!token) return null;
  return (await getUserBySessionHash(hashSessionToken(token))) ?? null;
}

export function publicUser(user: Awaited<ReturnType<typeof authenticateRequest>>) {
  if (!user) return null;
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
