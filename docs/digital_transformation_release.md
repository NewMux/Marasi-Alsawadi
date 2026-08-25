# Marasi Alsawadi PRD Phase 1 Release

**Branch:** `feat/quoted-scope-rbac-pricing`
**Scope authority:** `MarasiAlsawadiPRD.pdf`, confirmed option 3
**Date:** 25 August 2026

## Executive summary

This release implements Phase 1 of the client PRD for Marasi Alsawadi Resort & Aqua Park. The product is intentionally focused on three modules: **Ticketing, Customer Database, and Expense Management**. It replaces the quoted daily spreadsheet workflow with a database-backed web application, while retaining a clean Apple-inspired interface across desktop, tablet, and mobile.

WhatsApp delivery, QR/NFC entry validation, public ticket links, and the gate scanner are preserved as isolated future-phase source work but are **not exposed in the Phase 1 client application**. Reservations, availability, maintenance, workbook migration, inventory, housekeeping, HR, and unrelated resort modules are excluded.

## Delivered capability map

| Area | Phase 1 behavior | Access boundary |
|---|---|---|
| Authentication | Local username/password sign-in, hashed passwords, revocable sessions, logout, throttling, and mandatory first-password change | Authenticated operating users |
| Waterpark ticket | Configurable base price; visitor is charged when using the pool or water attractions | Staff/Cashier can issue; Super Admin configures |
| Companion ticket | Configurable base price; visitor enters but does not personally use the pool, regardless of relationship | Staff/Cashier can issue; Super Admin configures |
| Free entry | Under 2, person of determination, and senior/retiree can be selected per visitor line; ticket remains issued for tracking and is priced at OMR 0.00 | Staff/Cashier can select |
| Group discount | 25–29: 15%; 50–99: 25%; 100+: 50%; free lines are excluded from the count | Super Admin configures tiers |
| VAT | Fixed 5% is calculated after discount on the chargeable discounted amount | Server-owned rule |
| Ticket numbering | Continuous backend sequence with no daily/yearly reset and no date embedded in the number; visit date is stored separately | Server-owned rule |
| Ticket pricing | Server reloads active prices, fees, and discount tiers at issue time; receipt lines are snapshotted immutably | Configuration mutations: Super Admin only |
| Receipt printing | Normal browser/system receipt printing with compact receipt output; exact printer width can be finalized with the client | Ticket Desk |
| Customer database | Name, phone, automatic visit date/time, ticket number(s), and purchase history; searchable by name, phone, and ticket number | Staff/Cashier and management |
| Expense management | Record category, date, amount, description, and optional payee; categories are editable without code changes | Staff can record; management can review/correct |
| Financial summary | Revenue from issued PRD purchases versus recorded expenses with net result and date-range controls | Manager/Admin/Super Admin |
| Super Admin settings | Waterpark/Companion prices, configurable fee items, discount tiers, expense categories, users, roles, activation, password reset, and audit trail | `super_admin` only; enforced server-side |

## Roles and controls

> **Security rule:** frontend visibility is only a convenience. The backend rejects every price, fee, discount-tier, expense-category, and account mutation unless the authenticated user has the `super_admin` role.

| Capability | Super Admin | Manager/Admin | Staff/Cashier |
|---|---:|---:|---:|
| Issue Waterpark/Companion tickets | Yes | Yes | Yes |
| Select free-entry category per line | Yes | Yes | Yes |
| Print normal receipt | Yes | Yes | Yes |
| Capture customer name and phone | Yes | Yes | Yes |
| Search customer and purchase history | Yes | Yes | Yes |
| Record expense | Yes | Yes | Yes |
| Edit/delete expense records | Yes | Yes | No |
| View revenue-versus-expenses report | Yes | Yes | No |
| Manage base prices and fee items | Yes | No | No |
| Manage discount tiers | Yes | No | No |
| Manage expense categories | Yes | No | No |
| Manage users and roles | Yes | No | No |

## Ticket and receipt workflow

The cashier signs in, searches for an existing customer or enters a new customer name and phone, and adds one visitor line per person. Each line requires a ticket type: **Waterpark** when the visitor will use the pool or water attractions, or **Companion** when the visitor will not use the pool. The rule is based on pool use, not age or family relationship.

The cashier can mark a line as **Under 2**, **Person of determination**, or **Retiree/Senior**. The ticket is still issued for tracking and headcount, but its price is OMR 0.00 and it is excluded from the group-discount count.

The server resolves the active base price and fees, chooses the applicable discount tier based on chargeable ticket count, applies the discount before VAT, adds 5% VAT after discount, allocates the continuous ticket number, and stores immutable purchase, fee, VAT, discount, and line snapshots. The ticket number does not reset daily or yearly and does not contain the date.

The receipt is printed through the normal browser/system print dialog. The compact receipt includes resort identity, ticket number(s), customer name, phone, visit date, visitor type, free-entry status where applicable, base lines, discount, VAT, additional fees, final total, and the fixed terms disclaimer:

> By entering, you acknowledge and agree to the park's terms and conditions displayed at the entrance.

## Configuration workflow

A Super Admin opens **Commercial Settings** to add or edit the Waterpark and Companion base prices, configure fixed or percentage fee line items, define the ticket-count discount ranges and percentages, and add/edit/delete expense categories. Changes take effect for future tickets without a code deployment. Past receipts retain their original immutable snapshots.

The same protected workspace manages local operating accounts and records configuration activity. Staff/Cashier users can operate the Ticket Desk and record expenses but cannot mutate commercial settings or expense categories.

## Database migration

Migration `0008_add_prd_ticketing_model.sql` adds the PRD ticket type, continuous sequence, discount tiers, multi-line purchases, purchase fees, immutable ticket lines, and purchase-level totals. It is intended for the dedicated Marasi database after backup and rehearsal. It must not be run against the two existing Hetzner projects or their databases.

No rows from the client workbook are imported by this release. The previous workbook-migration control room and parser are excluded from the Phase 1 product surface. The client can provide an approved starting ticket number before production bootstrap; the migration currently initializes the sequence at zero for a fresh deployment.

## Future phase boundary

The following items are explicitly deferred and are not reachable from the Phase 1 client router: WhatsApp ticket delivery, public ticket links, QR-code generation, QR/NFC gate validation, and guard scanning. They may be reactivated in a separately approved future phase without changing the Phase 1 pricing and receipt model.

## Isolated deployment contract

The production target remains a new Coolify Project/Application and a new dedicated MySQL/MariaDB resource on the existing Hetzner server. The other two projects must remain untouched: no restart, redeploy, rename, deletion, pruning, domain change, network change, volume change, environment-variable change, or database operation.

| Deployment item | Marasi decision |
|---|---|
| Source | `NewMux/Marasi-Alsawadi`, reviewed feature branch merged only after approval |
| Build | `pnpm install --frozen-lockfile` then `pnpm build` |
| Start | `pnpm start` |
| Internal port | `3000` |
| Health | `GET /healthz` |
| Database | New dedicated Marasi database and persistent volume |
| Domain | New Marasi HTTPS hostname with Force HTTPS |
| Secrets | Marasi-only Coolify environment variables; never committed |
| Bootstrap | Run the one-time Super Admin bootstrap inside the new application only |

No Coolify or Hetzner deployment has been performed from this release. Coolify access, final hostname, dedicated database resource, approved starting ticket number, and initial Super Admin inputs are still required for production deployment.

## Verification evidence

The current branch passes **11 test files and 36 tests**, TypeScript checking, the production build, and `git diff --check`. Coverage includes authentication, session behavior, Super Admin RBAC, decimal fee arithmetic, PRD Waterpark/Companion pricing, free-entry exclusion, group discount thresholds, 5% VAT ordering, customer purchase history, legacy compatibility, demo workflows, and health checks.

The browser preview was checked for the PRD-only Command Center, Ticket Desk, Customer Directory, Finance Control, Revenue Report, and Super Admin settings. It confirmed the reduced navigation, Waterpark/Companion selector, free-entry categories, OMR 3.00/2.00 demo prices, 5% VAT preview, continuous non-date ticket examples, group-discount tier display, expense category controls, bilingual shell toggle, and the absence of deferred gate/WhatsApp/workbook/reservation/maintenance routes.

## Required production acceptance tests

| Test | Expected result |
|---|---|
| Super Admin changes Waterpark price | Future tickets use it; historical receipts remain unchanged |
| Super Admin changes Companion price | Future Companion lines use it; historical receipts remain unchanged |
| Super Admin adds fee item | Cashier preview and printed receipt show a separate fee line |
| Super Admin edits discount tiers | Applicable future purchases use the updated threshold and percentage |
| Cashier selects Waterpark | Price is based on pool-use ticket configuration |
| Cashier selects Companion | Price is based on non-pool-use configuration |
| Cashier selects a free category | Ticket remains tracked but line total, discount base, and VAT contribution are zero |
| 25/50/100 chargeable tickets | Discount is 15%/25%/50% respectively, before VAT |
| Ticket numbering across midnight/year boundary | Sequence remains continuous and contains no date |
| Staff directly calls a settings mutation | API returns `FORBIDDEN`; no configuration changes |
| Staff records an expense | Active category, date, and amount save successfully |
| Manager opens report | Revenue, expenses, and net result reconcile for the selected range |
| Cashier prints a ticket | Normal browser receipt output is legible and contains the disclaimer |
| Session logout or expiry | Protected pages and APIs require sign-in again |
| Coolify health check | New Marasi application returns `{"status":"ok"}` at `/healthz` |

## UX/UI release checkpoint

The release uses one shared Apple-inspired system across the quoted product. Page headers, surfaces, metric cards, buttons, inputs, select controls, status pills, tables, loading states, empty states, focus states, and mobile navigation use shared primitives. The navigation has only the PRD modules and direct Super Admin settings.

The Ticket Desk is organized as **Customer → Visitor Lines → Price Preview → Receipt**. The Customer Directory uses a searchable table with grouped purchase history. Finance Control separates staff expense entry from management-only reporting and correction actions. Revenue Report uses the same date-range language and export pattern. Commercial Settings groups base prices, fees, discount tiers, expense categories, users, and audit activity. The shell includes a persistent English/Arabic toggle with RTL direction support.
