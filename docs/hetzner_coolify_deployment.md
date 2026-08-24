# Hetzner and Coolify Deployment Preparation

## Purpose and current status

The Marasi application is a Node.js service that builds the React client into `dist/public` and serves it through the Express server in `dist/index.js`. It is suitable for a Coolify application deployment with port **3000**, a persistent MySQL-compatible database, HTTPS, and a single public domain.

The Manus-platform-only login and the WhatsApp ticket-delivery integration have been **removed** for this deployment — both depended on credentials (Manus OAuth, Meta WhatsApp Cloud API) that only exist inside the Manus platform or were never configured. The application currently runs **without a login wall**: every request is treated as a single auto-provisioned system user with full access. This is a deliberate, temporary state for an internal-network deployment, not a placeholder waiting on config — re-adding real staff authentication or WhatsApp delivery is a future project, not something blocking this deploy.

| Area | Production decision |
|---|---|
| Application source | `NewMux/Marasi-Alsawadi`, branch `main` |
| Build pack | Coolify **Nixpacks** for this plain Node.js application |
| Install command | `corepack enable && pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Start command | `pnpm start` |
| Exposed container port | `3000` |
| Health path | `GET /healthz` |
| Database | Dedicated MySQL or MariaDB service with persistent storage and backups |
| Domain and TLS | A single HTTPS ERP hostname, terminated by Coolify's proxy |
| Authentication | None — open access, deliberately deferred (see below) |

## Coolify application setup

Create a **new Application** in the production Coolify environment and connect the GitHub repository. Select `main`, use Nixpacks, set the install, build, and start commands above, and expose port `3000`. Assign the final HTTPS ERP domain and turn on Force HTTPS. Configure `/healthz` as the health-check path after the first successful build.

Coolify runs applications as Docker containers and supports Nixpacks for ordinary Node.js applications. Its automatic deployment requires a GitHub App-based repository connection or a correctly configured webhook. [1] [2]

> Do not use a static-site build: the React client and the tRPC/Express API must be served by the same persistent Node.js application.

> Because there is no login wall, treat network access as the access control: restrict the deployment to an internal network, VPN, or IP allowlist at the infrastructure layer if it should not be reachable by the general public.

## Environment variables

Copy the variable names in [`.env.coolify.example`](../.env.coolify.example) into Coolify's environment-variable screen, but replace every placeholder directly in Coolify. Do not commit a `.env` file or secrets to GitHub.

| Variable | Required | Purpose |
|---|---:|---|
| `NODE_ENV=production` | Yes | Runs Express in production mode. |
| `PORT=3000` | Yes | Matches the exposed Coolify port. |
| `DATABASE_URL` | Yes | Connection string for the dedicated MySQL/MariaDB database. |
| `PUBLIC_APP_URL` | Yes | Final HTTPS ERP URL, without a trailing slash — used to build public ticket links and QR codes. |

Mark server-only credentials as **runtime variables**. Build variables are not needed for these secrets. Coolify supports separate build-time and runtime variable settings; runtime-only secrets avoid appearing in build metadata. [3]

## Database preparation

Create a dedicated database, for example `marasi_erp`, and a least-privileged application user with access only to that database. Enable automated backups before importing any data. The existing sandbox migrations cannot be assumed to represent an empty Hetzner database baseline, so the production schema must be initialized and reviewed against `drizzle/schema.ts` during the Coolify deployment. Do not run an unreviewed destructive migration against a database containing resort records.

Before the first production launch, apply the reviewed schema to the fresh database in a controlled one-off job and verify the tables. No initial user record is required — the app provisions its own system user automatically on first request.

Note: `drizzle/schema.ts` still defines `whatsappMessages` and `whatsappWebhookEvents` tables (created by migration `0005`, alongside the still-used public-ticket and gate-scan tables). They are unused by the application now that WhatsApp delivery is removed; leaving them in place is harmless.

## Re-adding authentication later

If staff-specific sign-in is needed later, replace the system-user provisioning in `server/_core/systemUser.ts` / `server/_core/context.ts` with a real identity provider (e.g. self-hosted Google/Microsoft OIDC) and reintroduce a login gate in `client/src/components/DashboardLayout.tsx`. This is a deliberate future change, not a gap left by this deployment.

## Handover checklist

| Step | Owner | Status |
|---|---|---|
| Confirm final production domain | Resort owner | Pending |
| Create/confirm Hetzner server and Coolify project | Resort owner | Pending |
| Add MySQL/MariaDB resource, backup policy, and restricted app user | Resort owner / deployment operator | Pending |
| Restrict network access to the deployment (VPN/IP allowlist) given there is no login wall | Resort owner / deployment operator | Pending |
| Apply reviewed schema to the fresh production database | Deployment operator | Pending |
| Deploy `main`, add domain, and verify `/healthz` | Deployment operator | Pending |

## References

[1] [Coolify Applications](https://coolify.io/docs/applications)

[2] [Coolify GitHub Auto Deploy](https://coolify.io/docs/applications/ci-cd/github/auto-deploy)

[3] [Coolify Environment Variables](https://coolify.io/docs/knowledge-base/environment-variables)
