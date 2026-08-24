import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { platformRouter } from "./routers/platform";

export const appRouter = router({
  system: systemRouter,
  platform: platformRouter,
});

export type AppRouter = typeof appRouter;
