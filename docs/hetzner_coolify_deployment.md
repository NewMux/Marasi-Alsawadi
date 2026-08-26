# Marasi Alsawadi — Isolated Hetzner and Coolify Deployment

## Purpose

Deploy Marasi as a new, self-contained Coolify application on the existing Hetzner server. The two existing projects on that server are strictly out of scope and must remain untouched. This runbook is for the quotation-aligned mini-ERP release with local authentication, Super Admin-only commercial settings, server-priced receipt tickets, customer records, expenses, petty-cash approvals, connected reservations/aqua/housekeeping/maintenance/inventory workspaces, management reporting, workbook profiling, and retained gate-entry workflows.

The app currently defaults to running with **no login and no database** — everything saved to the browser's local storage — because no backend was deployed yet during initial testing. Deploying via this runbook switches it to the real, database-backed, login-protected app. That switch is one build-time flag (see below); nothing else about the app changes.

## Isolation rule

Create a new Coolify Project/Application for Marasi and a new dedicated MySQL/MariaDB resource. Do not reuse either existing project’s application, database, persistent volume, network, domain, environment variables, or deployment hooks. Do not restart, redeploy, rename, delete, prune, or change the existing resources.

The application uses port `3000` inside its own container. The Coolify proxy routes by hostname, so Marasi does not require a host-level port change. If the server lacks capacity, stop and report the capacity issue; do not modify the existing projects to make space.

## Coolify application settings

| Setting | Value |
|---|---|
| Project | New project, for example `Marasi Alsawadi` |
| Source | `NewMux/Marasi-Alsawadi` |
| Branch | `main` after the validated release is merged |
| Build pack | Nixpacks |
| Install command | `corepack enable && pnpm install --frozen-lockfile` |
| Build command | `pnpm build` |
| Start command | `pnpm start` |
| Container port | `3000` |
| Health path | `/healthz` |
| Domain | New Marasi-specific HTTPS hostname |
| TLS | Coolify-managed certificate and Force HTTPS |
| Auto-deploy | Enable only after the controlled first deployment passes |

**Critical**: `VITE_ENABLE_BACKEND_LOGIN=true` must be set as a **build-time** variable (see the Runtime environment table below), not just a runtime one. Vite bakes `VITE_*` variables into the compiled JavaScript at `pnpm build` — if this value isn't present during the build step specifically, the deployed app will silently boot into the no-login/no-database mode regardless of what the database or `DATABASE_URL` are configured to. In Coolify, confirm the "Build Variables" (not only "Environment Variables") include it — some Coolify versions separate the two; if in doubt, set it in both places. After deploying, confirm the switch actually took by loading the site and checking that it shows a login screen, not the Command Center directly.

## Dedicated database

Create a new database such as `marasi_erp` with a unique least-privileged application user and separate persistent storage. Enable backups before importing or creating production records. Apply the repository migrations in order and rehearse `0006_add_super_admin_auth_and_ticket_fee_lines.sql` on a disposable database first.

The migration extends users with local credentials and the `super_admin` role, creates hashed sessions, creates fee definitions and rate assignments, adds ticket subtotal/fee totals, creates immutable ticket lines, and backfills one base line for existing tickets without inventing historical fees. Apply `0007_fix_reservation_omr_precision.sql` after 0006 to preserve two-decimal OMR reservation rates and totals. Apply `0008_add_prd_ticketing_model.sql` after 0007 — it adds the Waterpark/Companion ticket-type model, the continuous non-date ticket-number sequence, group-discount tiers, and seeds the PRD default prices (3 OMR Waterpark, 2 OMR Companion) and discount tiers (25–29→15%, 50–99→25%, 100+→50%); a Super Admin can edit all of these afterward from Commercial Settings. Apply `0009_add_expense_receipt_attachment_and_categories.sql` after 0008 — it adds `receiptNumber`/`attachmentPath`/`attachmentOriginalName` to expense records and seeds the client’s actual accounting-sheet expense categories (Salaries, Utilities, Maintenance, COGS, Advertising & Marketing, Office Supplies, Fixture & Furniture, Tax & VAT, Petty Cash, Other Expenses); a Super Admin can still add/remove categories afterward. Apply `0010_fix_guests_id_reference_column.sql` after 0009 — it renames the `guests` table's legacy `idNumber` column to `idReference` to match `drizzle/schema.ts`; without it, every guest/customer creation (walk-in ticket purchases, the standalone "New customer" form) fails outright, since drizzle's MySQL insert always lists every schema-declared column. Apply `0011_add_expense_adjustments.sql` after 0010 — it creates the `expense_adjustments` table backing the Finance page's category +/- adjustments and category-to-category transfers. Do not apply any of these migrations to an existing project’s database.

`pnpm db:migrate:legacy` tracks applied files in a `_schema_migrations` table, so re-running it after adding a new migration (0010, 0011, …) only applies the new file — it is safe to re-run on a database that already has 0001–0009 applied; it does not require `pnpm db:reset:dangerous` first.

**Expense attachments need persistent storage.** Uploaded receipt scans/photos are written to `./uploads/expenses` inside the app container (see `server/attachments.ts`), which is wiped on every redeploy unless mounted as a Coolify persistent volume. In the application’s **Persistent Storage** settings, add a volume mounted at `/app/uploads` (or wherever the container’s working directory resolves to) before real expense attachments are recorded — otherwise every redeploy silently deletes them while the database rows referencing them remain.

## Runtime environment

Set Marasi-only values in Coolify’s runtime environment screen. Never commit the real values to GitHub, and never copy another project’s credentials.

| Variable | Required value |
|---|---|
| `VITE_ENABLE_BACKEND_LOGIN` | `true` — **must be set at build time**, see the callout above |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DATABASE_URL` | Connection string for the new Marasi database only |
| `PUBLIC_APP_URL` | Final HTTPS Marasi URL without a trailing slash |
| `SESSION_SECRET` | Unique high-entropy session secret for Marasi |
| `SESSION_TTL_MINUTES` | Optional; default is 720 minutes |
| `BOOTSTRAP_SUPER_ADMIN_USERNAME` | One-time initial account username |
| `BOOTSTRAP_SUPER_ADMIN_PASSWORD` | One-time temporary password of at least 12 characters |
| `BOOTSTRAP_SUPER_ADMIN_NAME` | Initial Super Admin display name |
| `BOOTSTRAP_SUPER_ADMIN_EMAIL` | Optional initial account email |

Run `pnpm auth:bootstrap` once inside the new Marasi application after the migration is applied. Confirm the account can sign in, then remove all `BOOTSTRAP_SUPER_ADMIN_*` variables from Coolify.

## First-launch procedure

1. Confirm the two existing Coolify projects and their resources are visible and unchanged. Record their names only; do not open their edit or redeploy actions.
2. Create the new Marasi project/application and the new dedicated database resource.
3. Configure the source, branch, Nixpacks commands, port, domain, HTTPS, health path, and Marasi-only variables — including `VITE_ENABLE_BACKEND_LOGIN=true` as a **build** variable, not only a runtime one.
4. Deploy the application, verify `/healthz`, and confirm the site shows a login screen (not the Command Center directly) — that's the sign the build-time flag actually took effect.
5. Apply the reviewed migrations (0006, 0007, 0008 in order) to the new database after taking a backup.
6. Run `pnpm auth:bootstrap` in the new application terminal and remove the bootstrap variables.
7. Sign in as Super Admin, change the temporary password, and create cashier, manager, admin, and guard accounts.
8. Add the resort’s approved base prices, fee items, fee applicability, and expense categories through Commercial Settings (the 0008 migration seeds PRD defaults, which can be edited or replaced here).
9. Run the production acceptance tests for settings permissions, ticket issue, fee calculations, receipt printing, expenses, reporting, gate scanning, logout, and session expiry.
10. Validate the workbook profiler and approve the canonical import boundary; do not load client rows without written approval.
11. Separately from this Coolify deployment, set up the local print agent at the counter following `/print-agent/README.md` (fixed printer IP, install, `DRY_RUN` test, then go live) and confirm a real ticket prints and cuts correctly.
12. Enable auto-deploy from `main` only after the controlled release is accepted.

## Receipt printing

The ticket receipt is a fixed bilingual (Arabic + English, always both) 80mm thermal layout matching the client's own mockup — bearing the resort's real contact details, per-line Base/VAT/total breakdown, and continuous plain ticket numbers (no date-derived or resettable numbering, no `MAS-` prefix). `server/ticketingRules.ts`'s `formatPrdTicketNumber`/`STARTING_TICKET_NUMBER` is the single source of truth for this format — both `server/ticketingDb.ts` (the real backend) and `client/src/localApp/pricing.ts` (the local-only app) import from it, so the two paths issue identically formatted ticket numbers. The database sequence is seeded to start at ticket `17843` in `drizzle/migrations/0008_add_prd_ticketing_model.sql`, matching the local app's own starting point — keep both in sync if that starting number ever changes.

This ticket-number format applies only to the PRD Waterpark/Companion purchase flow (`tickets.purchaseCreate`, used by `TicketDeskPage.tsx`). The older, separate `tickets.create`/`salesTransactions` path (year-based `MAS-YYYY-NNNNNN` numbers, QR-code gate scanning, public ticket lookup) is a distinct legacy ticketing system and was intentionally left untouched.

Two ways a receipt actually reaches paper, tried in this order by the app itself — no server-side configuration needed:

1. **The local print agent** (`/print-agent` in this repo) — a small Node service that runs on the counter PC (not on Hetzner; it needs LAN access to the physical printer), renders the receipt through a real browser engine to preserve correct Arabic shaping, and streams it as an ESC/POS image directly to the confirmed counter hardware (E-POS ECO250, 80mm, Ethernet, ESC/POS). Silent, no dialog, and can trigger the cash drawer. See `/print-agent/README.md` for on-site setup — that setup is independent of this Coolify deployment and happens once at the counter.
2. **Browser print dialog fallback** — if the agent isn't running or isn't reachable, the app automatically falls back to the ordinary browser/system print dialog (80mm default, 58mm option), exactly as before. This needs the counter PC's default printer/driver configured to match the paper width.

Nothing about receipt printing requires any Coolify/server-side setup — both paths are entirely client-side/on-site.

## Security acceptance

Every settings mutation must be rejected server-side unless the authenticated role is `super_admin`. Cashier, manager, admin, and guard accounts must not be able to add/edit/retire prices, fee items, or expense categories, even by calling the API directly. Sessions must be `HttpOnly`, `Secure` in HTTPS production, `SameSite=Lax`, expiring, and revocable. Public ticket pages expose only customer-safe ticket information.

## Rollback and incident boundaries

Before a production migration or release, back up the new Marasi database and record the deployed commit. Roll back only the Marasi application image and Marasi database if required. Do not use a rollback command that prunes global Docker resources or affects another Coolify project. If the deployment fails because of server capacity, domain, or database issues, leave the two existing projects unchanged and report the blocker.

## Handover checklist

| Step | Owner | Status |
|---|---|---|
| Confirm final Marasi domain | Resort owner | Pending |
| Confirm Coolify access | Deployment operator / resort owner | Pending |
| Create new isolated Coolify project | Deployment operator | Pending |
| Set `VITE_ENABLE_BACKEND_LOGIN=true` as a build variable | Deployment operator | Pending |
| Create dedicated Marasi database and backups | Deployment operator | Pending |
| Apply migration 0006 after rehearsal | Deployment operator | Pending |
| Apply migration 0007 after 0006 rehearsal | Deployment operator | Pending |
| Apply migration 0008 after 0007 rehearsal | Deployment operator | Pending |
| Apply migration 0009 after 0008 rehearsal | Deployment operator | Pending |
| Apply migration 0010 (fixes guest/customer creation) | Deployment operator | Pending |
| Apply migration 0011 (expense category adjustments table) | Deployment operator | Pending |
| Mount persistent storage for `/uploads` (expense attachments) | Deployment operator | Pending |
| Bootstrap and change the first Super Admin password | Deployment operator / resort owner | Pending |
| Add approved prices, fee items, and expense categories | Super Admin | Pending |
| Create cashier, manager, and guard accounts | Super Admin | Pending |
| Set up the counter's local print agent (`/print-agent`) | Resort owner / deployment operator | Pending |
| Complete receipt-printer and role acceptance tests | Resort owner / deployment operator | Pending |
| Enable auto-deploy from validated `main` | Deployment operator | Pending |

## References

[1]: https://coolify.io/docs/applications "Coolify Applications"

[2]: https://coolify.io/docs/knowledge-base/environment-variables "Coolify Environment Variables"
