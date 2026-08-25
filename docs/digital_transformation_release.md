# Marasi Alsawadi Quotation-Aligned Release

**Branch:** `feat/quoted-scope-rbac-pricing`
**Base:** [`35ea360`](https://github.com/NewMux/Marasi-Alsawadi/commit/35ea360)
**Prepared by:** Manus AI  
**Date:** 25 August 2026

## Executive summary

This release aligns the application with the quoted operating scope and the partner’s clarification. The Apple-HIG redesign from the current `main` branch is retained, while the former open-access system user is replaced with local username/password authentication and real server-side role enforcement.

Ticket prices and fee items are now intended to be maintained through the application by the **Super Admin only**. Cashiers select approved prices and cannot submit arbitrary unit prices. Tickets are calculated on the server, store immutable base/fee line snapshots, and print through a compact receipt layout rather than an A4 document. Expense categories follow the same Super Admin-only governance rule.

The branch now extends this foundation into a mini ERP. It adds a connected Operations Workspace for reservations, aqua admissions, housekeeping, maintenance, inventory, and guest flow; a Master Data Hub for units, stock, and staff records; a first-class Management Reports workspace; petty-cash requests and approvals; an onboarding checklist; and a workbook control room that can profile an uploaded workbook’s sheets, headers, row counts, and duplicate tabs before approval.

## Delivered capability map

| Area | Current release behavior | Access boundary |
|---|---|---|
| Authentication | Local username/password sign-in, hashed passwords, expiring hashed sessions, logout, login throttling, and mandatory first-password change | All operating users |
| Super Admin settings | Manage base prices, fixed/percentage fee items, fee applicability, expense categories, staff accounts, roles, activation, password resets, and audit activity | `super_admin` only; enforced server-side |
| Ticket number | Server-side yearly sequential number in `MAS-YYYY-######` format | Authenticated ticket staff, managers, Super Admin |
| Ticket pricing | Active database price and applicable fee definitions are reloaded on the server at issue time; no manual cashier price override | Price mutations: Super Admin only |
| Ticket history | Immutable base and fee line snapshots preserve the exact total charged at issue time | Authenticated operational roles |
| Customer database | Customer name and phone are stored with every purchase and visit date; searchable by name, phone, or ticket | Authenticated ticket staff, managers, Super Admin |
| Receipt printing | Browser/system print dialog with compact receipt styles for 80 mm and 58 mm receipt widths | Cashier/ticket desk and public ticket page |
| Expenses | Dated expenses with amount, department, description, payee, and active category | Managers and Super Admin; category changes: Super Admin only |
| Report | Revenue—including final ticket totals and fees—versus categorized expenses and net result | Managers and Super Admin |
| Public ticket | Opaque no-login ticket link with customer-safe details, itemized price/fee breakdown, status, and QR code | Anyone with the link |
| Gate entry | Camera/manual scanner with server-side date, payment, lifecycle, and single-use validation | Guard, managers, Super Admin |
| Resort operations | Reservations, aqua admissions, housekeeping, maintenance, inventory, guest flow, master data, and management reports are connected through first-class workspaces | Role-based operational access |
| Finance controls | Daily settlements, petty-cash/reimbursement requests, approvals, categorized expenses, and controlled CSV export | Staff can request; managers review; Super Admin governs categories |
| Workbook migration | Upload and profile real workbooks in-browser, inspect headers/row counts/duplicate tabs, select candidate sheets, and mark a mapping approval checkpoint without silently importing rows | Super Admin/manager migration workflow |
| Existing resort workspaces | HR, daily settlements, migration control room, and command center remain available alongside the new operations and finance workspaces | Role-based operational access |

## Roles and controls

> **Security rule:** frontend visibility is only a convenience. The backend rejects every price, fee, expense-category, and account mutation unless the authenticated user has the `super_admin` role.

| Capability | Super Admin | Manager/Admin | Cashier/Staff | Guard |
|---|---:|---:|---:|---:|
| Manage prices and fee items | Yes | No | No | No |
| Manage expense categories | Yes | No | No | No |
| Create and manage users | Yes | No | No | No |
| Issue and print tickets | Yes | Yes | Yes | No |
| Search customers and ticket history | Yes | Yes | Yes | No |
| Record/edit/delete expenses | Yes | Yes | No | No |
| View operating reports | Yes | Yes | No | No |
| Validate gate tickets | Yes | Yes | No | Yes |

## Ticket and receipt workflow

The cashier signs in, searches for an existing customer or creates a new name-and-phone profile, selects an active approved price, enters quantity and payment method, and reviews a read-only breakdown of the base subtotal and every applicable fee. The server reloads the active configuration, recalculates the total using decimal-safe OMR arithmetic, allocates the next sequential ticket number, and saves the immutable line snapshot.

The resulting receipt can be printed through the normal browser/system print dialog. The print target is a compact POS receipt, defaulting to **80 mm** with a **58 mm** option, and includes the resort name, ticket number, visit date, customer, payment method, base line, fee lines, and final total. It is not an A4 layout and does not require a proprietary printer SDK.

The customer-facing ticket page presents the same breakdown and a QR code for gate entry. Later price or fee changes affect future tickets only; historical receipts remain unchanged.

## Configuration workflow

A Super Admin opens **Commercial Settings** to add or edit a base price, create a fixed or percentage fee, decide whether it applies globally or to selected prices, set whether a fixed fee applies per ticket or once per transaction, and control display order. Used prices, fees, and expense categories are retired rather than hard-deleted so past records remain readable.

The same workspace creates cashier, manager, admin, guard, and additional Super Admin accounts. Newly created or reset accounts receive a temporary password and must change it at first sign-in. The activity log records account, price, fee, category, and role changes.

## Database migration

Migration `0006_add_super_admin_auth_and_ticket_fee_lines.sql` is included for the new dedicated Marasi database. It extends the role enum, adds username/password/session fields, creates `user_sessions`, creates fee definitions and price assignments, adds ticket subtotal/fee columns, creates immutable sales transaction lines, and backfills one base line for each legacy ticket without inventing historical fees.

Migration `0007_fix_reservation_omr_precision.sql` converts reservation nightly-rate and total fields to two-decimal OMR values so accommodation revenue is not rounded to whole rials. The migration is intentionally separate and must be rehearsed after 0006 against the dedicated Marasi database.

The migration is intended for the new isolated production database after a backup and rehearsal. It must not be run destructively against either of the two existing Hetzner projects or their databases.

## Isolated Coolify deployment

The deployment target is a **new Coolify Project/Application and a new MySQL/MariaDB resource** on the existing Hetzner server. The other two projects remain strictly read-only and must not be restarted, redeployed, renamed, deleted, pruned, or have their domains, networks, volumes, environment variables, or databases modified.

| Deployment item | Marasi decision |
|---|---|
| Source | `NewMux/Marasi-Alsawadi`, validated feature branch merged to `main` |
| Build pack | Coolify Nixpacks |
| Install | `corepack enable && pnpm install --frozen-lockfile` |
| Build | `pnpm build` |
| Start | `pnpm start` |
| Internal port | `3000` inside the Marasi container |
| Health | `GET /healthz` |
| Database | New dedicated database such as `marasi_erp` with separate persistent storage and backups |
| Domain | New Marasi-specific HTTPS hostname with Force HTTPS |
| Secrets | Marasi-only runtime values in Coolify; never committed to GitHub |
| Bootstrap | `pnpm auth:bootstrap` once, then remove bootstrap variables |

No deployment has been made to Hetzner from this release because Coolify URL/access, final domain, database resource, and first Super Admin inputs have not been supplied in this session. The code and deployment contract are ready for that isolated operation.

## Verification evidence

The latest mini-ERP checkpoint passes TypeScript checking, the complete suite with **11 test files and 34 tests**, and the production build. Coverage includes authentication, session/password behavior, Super Admin RBAC, fee arithmetic, ticket rules, reservation decimal compatibility, operation rules, HR validation, demo workflows, and health checks. The browser preview was also checked for the populated Command Center, Operations Workspace, Finance Control, Management Reports, Master Data Hub, Ticket Desk, Customer Directory, Gate Scanner, and migration transition screens. The local workbook profiler uses the real uploaded file only when a Super Admin explicitly selects it; no client workbook rows have been imported into the repository or database.

A disposable local MariaDB rehearsal was completed for the authentication and fee schema: the baseline schema was created, migration 0006 was applied, and a disposable Super Admin was bootstrapped. Migration 0007 still requires a dedicated-database rehearsal before production. No migration has been applied to either of the user’s existing Hetzner projects. This remains an explicit deployment gate, not an indication that the migration should be applied to an existing project.

## Required production acceptance tests

| Test | Expected result |
|---|---|
| Super Admin changes a base price | Future tickets use it; existing tickets remain unchanged |
| Super Admin adds a fixed and percentage fee | Cashier sees separate fee lines and the server total matches the receipt |
| Manager/staff/guard calls a settings mutation directly | API returns `FORBIDDEN`; no record changes |
| Cashier submits a forged price | Server ignores/rejects it and uses the active database price |
| Cashier prints a ticket | 80 mm and 58 mm receipt previews are legible and unclipped |
| Manager records an expense | Active category is required and the operating report updates |
| Guard scans a valid ticket once | Entry allowed and ticket changes to `checked_in` |
| Guard scans the same ticket again | Entry denied as already used |
| Session logout or expiry | Protected pages and APIs require sign-in again |
| Coolify health check | New Marasi application returns `{"status":"ok"}` at `/healthz` |

## References

[1]: https://coolify.io/docs/applications "Coolify Applications"

[2]: https://coolify.io/docs/knowledge-base/environment-variables "Coolify Environment Variables"
