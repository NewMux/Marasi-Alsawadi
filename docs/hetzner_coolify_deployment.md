# Marasi Alsawadi — Isolated Hetzner and Coolify Deployment

## Purpose

Deploy Marasi as a new, self-contained Coolify application on the existing Hetzner server. The two existing projects on that server are strictly out of scope and must remain untouched. This runbook is for the quotation-aligned mini-ERP release with local authentication, Super Admin-only commercial settings, server-priced receipt tickets, customer records, expenses, petty-cash approvals, connected reservations/aqua/housekeeping/maintenance/inventory workspaces, management reporting, workbook profiling, and retained gate-entry workflows.

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

## Dedicated database

Create a new database such as `marasi_erp` with a unique least-privileged application user and separate persistent storage. Enable backups before importing or creating production records. Apply the repository migrations in order and rehearse `0006_add_super_admin_auth_and_ticket_fee_lines.sql` on a disposable database first.

The migration extends users with local credentials and the `super_admin` role, creates hashed sessions, creates fee definitions and rate assignments, adds ticket subtotal/fee totals, creates immutable ticket lines, and backfills one base line for existing tickets without inventing historical fees. Apply `0007_fix_reservation_omr_precision.sql` after 0006 to preserve two-decimal OMR reservation rates and totals. Do not apply either migration to an existing project’s database.

## Runtime environment

Set Marasi-only values in Coolify’s runtime environment screen. Never commit the real values to GitHub, and never copy another project’s credentials.

| Variable | Required value |
|---|---|
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
3. Configure the source, branch, Nixpacks commands, port, domain, HTTPS, health path, and Marasi-only variables.
4. Deploy the application and verify `/healthz`.
5. Apply the reviewed migration to the new database after taking a backup.
6. Run `pnpm auth:bootstrap` in the new application terminal and remove the bootstrap variables.
7. Sign in as Super Admin, change the temporary password, and create cashier, manager, admin, and guard accounts.
8. Add the resort’s approved base prices, fee items, fee applicability, and expense categories through Commercial Settings.
9. Run the production acceptance tests for settings permissions, ticket issue, fee calculations, receipt printing, expenses, reporting, gate scanning, logout, and session expiry.
10. Validate the workbook profiler and approve the canonical import boundary; do not load client rows without written approval.
11. Enable auto-deploy from `main` only after the controlled release is accepted.

## Receipt printing

The cashier and customer ticket pages use the browser/system print dialog. The print target is a compact POS receipt with an 80 mm default and a 58 mm option. It shows the sequential ticket number, visit date, customer, payment method, base line, named fee lines, and total. Confirm the browser printer setup matches the receipt paper width; no proprietary printer SDK is required.

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
| Create dedicated Marasi database and backups | Deployment operator | Pending |
| Apply migration 0006 after rehearsal | Deployment operator | Pending |
| Apply migration 0007 after 0006 rehearsal | Deployment operator | Pending |
| Bootstrap and change the first Super Admin password | Deployment operator / resort owner | Pending |
| Add approved prices, fee items, and expense categories | Super Admin | Pending |
| Create cashier, manager, and guard accounts | Super Admin | Pending |
| Complete receipt-printer and role acceptance tests | Resort owner / deployment operator | Pending |
| Enable auto-deploy from validated `main` | Deployment operator | Pending |

## References

[1]: https://coolify.io/docs/applications "Coolify Applications"

[2]: https://coolify.io/docs/knowledge-base/environment-variables "Coolify Environment Variables"
