# Marasi Alsawadi Mini-ERP Scope and Acceptance Criteria

**Status:** Working product definition for the next implementation cycle  
**Source of truth:** The current GitHub branch plus the client quotation and partner clarifications  
**Primary outcome:** Replace the daily Excel operating habit with one connected resort system that staff can use from opening shift through cash close.

## Product promise

Marasi should feel like a small, focused ERP rather than a collection of forms. Every important object must have a clear home, a responsible role, a lifecycle, a searchable history, and a visible relationship to the next operational decision. A cashier should not need a spreadsheet to issue a ticket; a manager should not need to reconcile multiple files to understand the day; and a Super Admin should not need a developer to change a commercial price, fee, or expense category.

The product will use one authenticated operational shell with role-aware navigation. Public customer tickets and the gate scanner remain separate experiences because they have different security and speed requirements.

## Role model

| Role | Primary responsibility | Must not do |
|---|---|---|
| Super Admin | Configure prices, fees, expense categories, users, roles, activation, and system governance | Share credentials or use a cashier account for administration |
| Manager | Run the shift, review revenue and expenses, approve cash close, supervise operations, and review records | Change commercial prices, fee definitions, expense categories, or user roles |
| Admin Operations | Maintain operational records and review system activity where granted | Change commercial prices, fees, categories, or accounts unless explicitly assigned Super Admin |
| Cashier / Staff | Search customers, issue tickets, capture payments, print receipts, and view permitted records | Edit prices, fees, categories, users, or management controls |
| Guard | Scan the customer QR/ticket and receive a fast allow/deny decision | View finance, customer directories, configuration, or administrative data |

## ERP information architecture

| Workspace | Core records | Required daily outcome |
|---|---|---|
| Command Center | Revenue, expenses, net result, tickets, arrivals, gate admissions, open tasks, stock alerts, cash-close status | One decision-ready view for the shift lead |
| Ticket Desk | Customers, visits, active prices, fee lines, ticket lifecycle, payments, receipts, public links | Issue one correct, sequential ticket without Excel |
| Customer Directory | Customer master, phone, visit history, tickets, dates, amounts, consent flags | Retrieve a guest’s history in seconds |
| Reservations & Stays | Guest, booking, unit/room, arrival, departure, status, notes | Know who is arriving, in-house, and departing |
| Gate Scanner | Public token, ticket status, visit date, scan audit, guard station | Allow valid entry once and deny exceptions clearly |
| Finance Control | Revenue, expenses, categories, daily settlement, variances, approvals, exports | Close the day from one ledger |
| Inventory | Item master, unit, on-hand quantity, reorder threshold, receipts, issues, adjustments | Know what is available and what needs replenishment |
| Housekeeping | Room/unit, task, assignee, status, inspection, due date | Move rooms from dirty to ready with accountability |
| Maintenance | Request, asset/area, priority, assignee, status, resolution, cost | Keep service issues visible until closed |
| Team & HR | Staff, roles, shifts, attendance, leave, manager review | Know who is working and who owns each task |
| Reports | Revenue, expenses, cash, admissions, occupancy, inventory, operations, exportable date ranges | Replace recurring spreadsheet summaries with trusted views |
| Commercial Settings | Prices, fees, assignments, categories, users, audit log | Let Super Admin maintain rules without code changes |
| Workbook Migration | Source profile, mapping, duplicate review, dry run, import approval, reconciliation | Move approved historical data safely and visibly |

## Canonical data principles

The system must have one master record for each business concept. Customers cannot be duplicated simply because they bought on a different day. A service price and its fee definitions are configuration records; a ticket stores immutable copies of the exact lines used at issue time. Expense categories are governed master data; an expense stores the category and amount at the time of entry. Rooms, inventory items, staff, suppliers, and payment methods should be selected from controlled records rather than typed inconsistently in every form.

The financial rule is that ticket revenue uses the final stored ticket total, including fee lines, while expenses use approved categorized expense records. Cash settlement compares expected and counted amounts and produces an explicit variance. Historical records remain readable after a master record is retired.

## End-to-end workflows

### Opening shift

A manager signs in and sees the Command Center. The page shows the operating date, current revenue, expenses, net result, arrivals, occupied units, gate activity, open maintenance, room readiness, low stock, and whether the previous cash close was approved. Quick actions open the ticket desk, customer directory, gate scanner, finance control, and exceptions requiring attention.

### Ticket sale

The cashier searches for a customer or creates one with name and phone, selects an active database price, enters quantity and payment method, reviews base and fee lines, confirms the sale, receives the next server-generated ticket number, and prints a compact 80 mm or 58 mm receipt. The public link and QR code are available for customer entry. The cashier never supplies or edits the price used by the server.

### Customer service

A staff member can search by name, phone, or ticket number and see a customer’s visits, tickets, dates, amounts, and current ticket status. The directory provides a clear next action: open the ticket, reprint the receipt, review the visit, or escalate a correction to a manager.

### Gate entry

A guard opens a dedicated station, scans the QR code using camera or USB/manual fallback, and receives a large allow/deny result. The server checks token validity, payment state, visit date, lifecycle, and prior use. An allowed scan changes the ticket to checked-in atomically. Every denied or allowed decision is audited with time, station, user, reason, and ticket reference where available.

### Expense and cash close

A manager selects the date and active category, records the amount, payee, department, and description, and sees the expense in the ledger and report. At close, the manager records expected, cash, card, bank, charges, counted total, notes, and variance. A submitted close is reviewable, and any variance is visible rather than hidden in a spreadsheet.

### Workbook migration

The administrator uploads or reviews the approved workbook profile, maps authoritative tabs to canonical records, previews a dry run with validation errors and duplicate candidates, approves the import, and reconciles imported totals to the source. The original workbook is retained as an archive. No salary, asset, budget, journal, opening-balance, or formula-heavy tab is imported without explicit scope approval.

## UX/UI quality gates

The product is not ready for deployment until each workspace passes the following quality gates. The primary action is visually obvious, the page states who may use it, loading/empty/error/success states are explicit, validation appears beside the field that needs attention, destructive actions require confirmation, tables remain usable at laptop and mobile widths, and keyboard focus is visible. Every workflow must have a clear completion state and a safe way to recover from an error.

The design system will preserve the current Apple-HIG-inspired visual language but use it consistently across the ERP: persistent sidebar on desktop, compact mobile navigation, clear group labels, calm surfaces, restrained shadows, strong typography hierarchy, generous whitespace, meaningful status colors, and consistent OMR formatting. The Command Center will prioritize decisions over decoration, while the guard station will prioritize speed, contrast, and glanceable results.

## Deployment acceptance criteria

The isolated Coolify deployment is acceptable only when a new Marasi application and new dedicated database are used on the Hetzner server. The other two projects must remain unchanged. The final domain must use HTTPS, `/healthz` must return a successful response, database backups must be enabled, bootstrap credentials must be removed after the first Super Admin is created, and the exact deployed commit must be recorded.

The release is not considered production-ready if it relies on browser-local demo data, a global system-user shim, hardcoded prices, unassigned fees, manual cashier overrides, unprotected settings procedures, A4-only print assumptions, or a migration that has not been rehearsed against a disposable MySQL/MariaDB database.

## Definition of done

| Area | Acceptance test |
|---|---|
| Authentication | Sign-in, logout, expiry, first-password change, inactive user rejection, and session revocation work |
| Commercial settings | Super Admin can create/edit/retire a base price, create/edit/retire a fixed or percentage fee, assign it globally or to selected prices, and manage categories |
| Authorization | Staff, manager, admin, guard, and unauthenticated direct API callers receive `FORBIDDEN` or `UNAUTHORIZED` for configuration mutations |
| Ticketing | The server calculates totals from the database, stores immutable lines, increments a unique sequence, links a customer, and writes an audit entry |
| Receipt | 80 mm and 58 mm receipts show ticket number, date, customer, payment, base line, fee lines, and final OMR total without A4 layout assumptions |
| Customer directory | Search by name, phone, and ticket returns visit history without exposing unnecessary secrets |
| Finance | Expenses, categories, cash settlement, variance, revenue, expenses, net result, and CSV/report views reconcile to the same source records |
| Gate | Valid paid ticket allows once; repeat, unknown, unpaid, voided, expired, and future tickets deny and audit |
| Migration | Dry run, duplicate review, approval, import, and reconciliation are visible and repeatable |
| UX/UI | Command Center and every daily workspace pass desktop, tablet, and mobile task-flow review with no dead-end navigation |
| Deployment | New isolated Coolify app/database, HTTPS, health check, backup, bootstrap removal, and rollback evidence are complete |
