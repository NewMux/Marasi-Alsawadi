import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAuthenticatedSession, hashPassword, publicUser, revokeAuthenticatedSession, verifyPassword } from "./auth";
import { getUserByUsername, logActivity, revokeAllUserSessions, updateLocalUser } from "./db";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { platformRouter } from "./routers/platform";

const loginAttempts = new Map<string, { failures: number; blockedUntil: number }>();
const MAX_LOGIN_FAILURES = 5;
const LOGIN_BLOCK_MS = 15 * 60_000;
const dummyHash = hashPassword("marasi-invalid-account-password");

function requestAddress(req: { ip?: string; headers: Record<string, unknown> }) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwarded || req.ip || "unknown";
}

const authRouter = router({
  me: publicProcedure.query(({ ctx }) => publicUser(ctx.user)),
  login: publicProcedure.input(z.object({
    username: z.string().trim().min(3).max(64),
    password: z.string().min(8).max(256),
  })).mutation(async ({ input, ctx }) => {
    const username = input.username.toLowerCase();
    const key = `${requestAddress(ctx.req)}:${username}`;
    const attempt = loginAttempts.get(key);
    if (attempt && attempt.blockedUntil > Date.now()) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed sign-in attempts. Try again later." });
    }
    const user = await getUserByUsername(username);
    const validPassword = await verifyPassword(input.password, user?.passwordHash || await dummyHash);
    if (!user?.isActive || !validPassword) {
      const failures = (attempt?.failures || 0) + 1;
      loginAttempts.set(key, { failures, blockedUntil: failures >= MAX_LOGIN_FAILURES ? Date.now() + LOGIN_BLOCK_MS : 0 });
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password" });
    }
    loginAttempts.delete(key);
    await updateLocalUser(user.id, { lastSignedIn: new Date() });
    await createAuthenticatedSession(user.id, ctx.req, ctx.res);
    await logActivity(user.id, "auth.login", "user", user.id);
    return { user: publicUser(user) };
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.user) await logActivity(ctx.user.id, "auth.logout", "user", ctx.user.id);
    await revokeAuthenticatedSession(ctx.req, ctx.res);
    return { success: true } as const;
  }),
  changePassword: protectedProcedure.input(z.object({
    currentPassword: z.string().min(8).max(256),
    newPassword: z.string().min(12).max(256),
  })).mutation(async ({ input, ctx }) => {
    if (!await verifyPassword(input.currentPassword, ctx.user.passwordHash)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
    }
    if (input.currentPassword === input.newPassword) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a different password" });
    }
    await updateLocalUser(ctx.user.id, { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false });
    await revokeAllUserSessions(ctx.user.id);
    await logActivity(ctx.user.id, "auth.password_change", "user", ctx.user.id);
    await revokeAuthenticatedSession(ctx.req, ctx.res);
    return { success: true, requiresLogin: true } as const;
  }),
});

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  platform: platformRouter,
});

export type AppRouter = typeof appRouter;
