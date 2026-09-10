import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { applyLegacyMigrations } from "../scripts/applyLegacyMigrations";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export function createApp() {
  const app = express();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({
    limit: "50mb",
    verify: (req, _res, buffer) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  // Expense attachments (receipt scans/photos) — see server/attachments.ts.
  // Persisted under ./uploads, which needs a Coolify persistent-storage mount
  // to survive a redeploy.
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}

// PRD Round 8: applying a new migration to the live database was a manual,
// easy-to-forget deployment-checklist step — the direct cause of repeated
// "insert fails" bug reports (guests, revenue_categories, expense/asset/
// revenue_records, and now ticket_types) whenever a round shipped a schema
// change the operator hadn't separately applied yet. Running it here, before
// the app accepts any request, makes every deploy self-migrating; it's a
// safe no-op once `_schema_migrations` shows a database is already current.
async function runStartupMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  try {
    const { appliedCount, totalCount } = await applyLegacyMigrations(connectionString);
    console.log(appliedCount ? `Applied ${appliedCount} pending database migration(s) (${totalCount} total).` : `Database schema is up to date (${totalCount} migrations).`);
  } catch (error) {
    console.error("Startup database migration failed — the app will still start, but some features may not work until this is resolved:", error);
  }
}

export async function startServer() {
  await runStartupMigrations();
  const app = createApp();
  const server = createServer(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (!process.env.VERCEL && !process.env.VITEST) {
  startServer().catch(console.error);
}
