import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // PRD Round 14, Section 1: when a procedure's own zod .input() schema
  // rejects a request (a required field left blank, a bad email/phone
  // format, a percentage out of range, etc.), tRPC's default BAD_REQUEST
  // message is the raw ZodError — a JSON-stringified array of internal
  // issue objects (fields like "origin", "code", "too_small") — which
  // every one of the ~70 client call sites that do toast.error(error.message)
  // then shows verbatim to whoever's at the till. Reformatting it here, at
  // the one place every such error passes through, turns it into the
  // Zod issues' own human-readable .message text instead, for every
  // procedure at once rather than patching each call site individually.
  errorFormatter(opts) {
    const { shape, error } = opts;
    const cause = error.cause as { name?: string; message?: string; issues?: Array<{ message: string; path: (string | number)[] }> } | undefined;
    if (error.code === "BAD_REQUEST" && cause?.name === "ZodError" && Array.isArray(cause.issues)) {
      const messages = cause.issues.map((issue) => issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message);
      return { ...shape, message: messages.join("; ") || "Please check the form and try again" };
    }
    // drizzle wraps DB errors in a generic "Failed query: ... params: ..."
    // message and puts the actual driver error (e.g. mysql2's ER_BAD_FIELD_ERROR)
    // on `.cause` — without this, that real reason never reaches the client,
    // only the unhelpful "Failed query" wrapper the toast ends up showing.
    if (cause?.message && cause.message !== error.message) {
      return { ...shape, message: `${shape.message} — ${cause.message}` };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const adminProcedure = superAdminProcedure;
