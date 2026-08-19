import { createApp } from "../server/_core/index";

// Vercel invokes this catch-all serverless function for the existing API paths.
// The Express app keeps the same OAuth, storage proxy, and tRPC routes used locally.
const app = createApp();

export default app;
