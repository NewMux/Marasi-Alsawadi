# Marasi Alsawadi Mini-ERP Onboarding

## Purpose

The product is ready for a controlled resort rollout when the Super Admin has configured the commercial catalog, master data, staff access, and approved workbook migration boundary. The rollout should replace one recurring spreadsheet process at a time while keeping the original workbook archived and read-only.

## First-login sequence

1. The Super Admin runs `pnpm db:push` against the dedicated Marasi database and runs `pnpm auth:bootstrap` once with a temporary password.
2. The Super Admin signs in, completes the mandatory password change, and opens **Commercial Settings**.
3. The Super Admin adds the approved base ticket prices, fee line items, fee assignments, and expense categories. Every fee must be global or assigned to at least one base price.
4. The Super Admin opens **Master Data Hub** and adds the property units, opening inventory balances, and active staff profiles. Unit nightly rates remain within the Super Admin-controlled configuration boundary.
5. The Super Admin creates cashier, manager, and guard accounts. Cashiers issue tickets; managers review finance and operations; guards use the gate scanner; only the Super Admin can change prices, fees, expense categories, and roles.
6. The Super Admin opens **Workbook Migration**, uploads the source workbook, reviews detected sheet names, row counts, headers, and duplicate tabs, and approves only the canonical operational sheets.
7. The team runs a dry-run reconciliation and verifies customer counts, revenue, expenses, and dates against the archived workbook before importing any production rows.
8. The manager runs one pilot shift: create a reservation, issue an aqua ticket, print a standard receipt, submit a petty-cash request, complete a room task, open a maintenance request, close a cash settlement, and validate one ticket at the gate.

## Role operating model

| Role | Primary work | Configuration rights |
|---|---|---|
| Super Admin | Setup, governance, commercial catalog, users, migration approval | Can change prices, fee lines, expense categories, units, and roles |
| Manager | Reservations, finance, cash close, reports, inventory, staff operations | Cannot change prices, fees, expense categories, or user roles |
| Cashier / Staff | Customer lookup, ticket issuance, receipt printing, operational capture | No configuration mutations |
| Guard | QR/manual ticket validation and entry decisions | No financial or configuration access |

## Daily replacement rhythm

The cashier starts at **Ticket Desk**, selecting an approved rate and printing the compact 80 mm or 58 mm receipt. The manager checks **Command Center**, then works from **Operations Workspace** for reservations, aqua admissions, housekeeping, and maintenance. The finance lead records categorized expenses, approves petty cash, and submits the daily settlement. At close, the manager opens **Management Reports** and exports a controlled CSV only when an external handoff is required.

## Release acceptance

The mini ERP is not considered production-ready until the client has supplied approved commercial prices and fees, the dedicated Coolify database has been migrated, the Super Admin has created real role accounts, the workbook mapping has been approved, the receipt printer has produced a legible test receipt, and the live gate pilot has passed valid, repeat, expired, future-date, voided, and unknown-ticket cases.
