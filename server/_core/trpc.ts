import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // drizzle wraps DB errors in a generic "Failed query: ... params: ..."
  // message and puts the actual driver error (e.g. mysql2's ER_BAD_FIELD_ERROR)
  // on `.cause` — without this, that real reason never reaches the client,
  // only the unhelpful "Failed query" wrapper the toast ends up showing.
  errorFormatter(opts) {
    const { shape, error } = opts;
    const cause = error.cause as { message?: string } | undefined;
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
