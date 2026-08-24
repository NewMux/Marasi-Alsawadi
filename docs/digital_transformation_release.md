# Marasi Alsawadi Digital Transformation Release

**Release:** `77d4431`
**Repository:** [NewMux/Marasi-Alsawadi](https://github.com/NewMux/Marasi-Alsawadi)  
**Prepared by:** Manus AI  
**Date:** 24 August 2026

## Executive summary

The existing Marasi Alsawadi repository has been extended rather than replaced. This iteration turns the application from a thin feature shell into a populated resort operating system: the first screen is now a command center, the navigation exposes the daily workflows, customer history is searchable, finance includes daily cash settlement, and the workbook transition has a visible control room. The original ticketing, customer, expense, reporting, WhatsApp, QR, and gate foundations remain in place. The result is designed to help the client stop opening Excel for every operational decision while keeping the workbook available as a controlled migration reference.

The release is production-ready from a code and build perspective, but it is not a claim that the client’s real WhatsApp account or production database has already been configured. Applying the new database migration, entering Meta credentials, creating the approved message template, provisioning guard accounts, and running the live pilot remain required operational steps.

## Delivered capability map

| Area | Delivered behavior | Access boundary |
|---|---|---|
| Ticket number | A server transaction allocates a yearly sequential number in the format `MAS-YYYY-######`. | Authenticated ticket staff, managers, administrators |
| Customer database | Stores customer name and phone, links each purchase and visit date, and supports name, phone, or ticket search. | Authenticated ticket staff, managers, administrators |
| Ordinary printer | The cashier and customer ticket pages use browser A4 print styles and the normal print dialog; no thermal printer is required. | Ticket desk and public ticket page |
| Public ticket | Every ticket receives an opaque public token and a no-login `/ticket/{token}` page. Only customer-facing ticket details are exposed. | Anyone with the ticket link |
| QR entry code | The public ticket page renders a QR code locally from the public URL. | Customer ticket page |
| WhatsApp delivery | The cashier must confirm customer consent, then the server sends an approved positional-parameter template through Meta’s WhatsApp Cloud API. | Authenticated ticket staff, managers, administrators; server-side secrets only |
| Delivery status | The server stores `queued`, `sent`, `delivered`, `read`, or `failed` states and consumes signed Meta webhook callbacks. | Staff-facing data only; public page exposes a minimal status projection |
| Gate scanner | Guard accounts can scan with a camera, or use a USB/manual scanner fallback. The server checks token, payment state, visit date, and previous use. | `guard`, `manager`, and `admin` roles |
| Gate audit | Successful scans transition a paid ticket to `checked_in`; repeat, voided, expired, future-date, and unknown scans are denied and logged. | Restricted gate route and server audit log |
| Expenses | Existing administrator-managed category CRUD and manager/administrator expense CRUD are retained. | Managers and administrators; category administration is admin-only |
| Report | Existing operational summary aggregates ticket revenue and categorized expenses into revenue, expenses, and net result. | Managers and administrators |
| Command center | Populated first-login view with revenue, operating result, guest/admission counts, ticket activity, attention queue, readiness states, and role-aware actions. | All authenticated roles; guard sees a reduced gate station view |
| Customer directory | Searchable customer profiles grouped across visits, phone numbers, ticket numbers, dates, and amounts. | Staff, managers, administrators |
| Daily cash close | Department settlement capture for expected amount, cash, bank, card, charges, notes, submission, manager review, variance status, and CSV expense export. | Managers and administrators |
| Workbook migration | A read-only migration profile and in-product migration control room identify 38 worksheets, duplicate `(2)` tabs, formula-heavy tabs, approval gates, and the MVP import boundary. | Administrators; no unapproved rows were imported |
| UX/UI system | Grouped navigation, responsive cards and tables, role-specific actions, guard-first scan state, clear empty states, visible system readiness, focus states, and demo-data disclosure. | All workspaces |

## Operating workflow

### Cashier workflow

The cashier opens `/tickets`, searches for an existing customer, or enters a new customer name and phone number. The cashier selects an approved Oman OMR rate, or a manager or administrator uses the existing controlled manual-price override. Confirming the sale allocates the next sequential ticket number on the server and records the purchase in the customer visit history.

The result card immediately provides four useful actions: print the A4 ticket, open the customer ticket page, copy the public link, and send the link through WhatsApp after the cashier confirms that the customer agreed to receive it. If the WhatsApp provider is not configured, the send action fails safely with a configuration message and does not fabricate a delivery success.

### Customer workflow

The customer opens the link from WhatsApp or another channel. The page does not require a login and displays the ticket number, customer name, visit date, service, quantity, amount paid, current ticket status, and a QR code. The phone screen is the entry credential; a printed A4 ticket remains available as a regular-printer fallback.

### Guard workflow

A guard signs in with a user assigned the `guard` role and opens `/gate`. The page starts a camera QR scanner when the device supports it. At a fixed gate kiosk or with a USB scanner, the guard can instead focus the manual field and scan or paste the public ticket link.

The browser sends the scanned value to the server. The server extracts the opaque token, looks up the ticket, requires a paid ticket whose visit date is today, and atomically changes its status from `paid` to `checked_in`. A successful first scan shows **Entry allowed**. A second scan shows **Entry denied — Ticket has already been used**. Unknown, expired, future-date, voided, and unpaid states are denied without admitting the visitor.

## WhatsApp configuration contract

The implementation uses Meta’s approved-template flow. Meta documents that templates are WhatsApp Business Account assets and are the only message type available outside a customer-service window; template language and parameters must match the approved template definition [1]. The application expects a positional body template with four parameters in this order: customer name, ticket number, visit date, and public ticket URL.

The following server-side variables must be configured in Coolify or the final production environment. They must not be exposed as `VITE_` browser variables.

| Variable | Purpose |
|---|---|
| `PUBLIC_APP_URL` | Final HTTPS base URL used in the ticket link and QR code |
| `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp sender phone-number ID |
| `WHATSAPP_APP_SECRET` | Used to verify `X-Hub-Signature-256` webhook signatures |
| `WHATSAPP_VERIFY_TOKEN` | Used during Meta webhook subscription verification |
| `WHATSAPP_TEMPLATE_NAME` | Approved template name; default is `marasi_ticket` |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Approved template language code; default is `en` |
| `WHATSAPP_GRAPH_VERSION` | Graph API version; default is `v23.0` |

The callback URL is `https://{production-domain}/api/whatsapp/webhook`. The GET verification endpoint checks Meta’s verify token and returns the challenge. The POST endpoint rejects unsigned requests and updates message delivery state using the provider message ID. Meta’s status reference documents `sent`, `delivered`, `read`, and `failed` values and explains that a read status implies delivery in some cases [2].

## Database and deployment sequence

Apply the existing migrations in the repository’s established order, then apply `drizzle/migrations/0005_add_public_tickets_gate_scans_whatsapp.sql`. The new migration adds the public token and lifecycle columns to `sales_transactions`, extends the user role enum with `guard`, creates `ticket_check_ins`, `whatsapp_messages`, and `whatsapp_webhook_events`, and backfills deterministic public tokens for legacy sales tickets.

After the migration, deploy the latest UX/UI expansion commit through the selected Coolify/Hetzner production environment. The prior foundation commit is `12de582`; the UX/UI and spreadsheet-replacement expansion is `77d4431`. Set `PUBLIC_APP_URL` to the final HTTPS domain, configure staff authentication, and assign the `guard` role to the entrance account. Do not treat the existing Vercel alias as the production ticketing deployment; it still serves the older browser-local demo and has no configured live database or WhatsApp provider.

## Workbook migration boundary

The attached workbook `AR-Revenue-2026-15082026.xlsx` contains 38 worksheets, including ticket sales, total revenue, operating expenses, cash-flow, journal, petty-cash, salary, asset, budget, and project tabs. A second duplicate set of tabs carries the suffix `(2)`. The repository now contains `docs/workbook_migration_profile.md`, which records this structure without altering the source file.

No workbook rows were imported automatically. Before importing anything, the client must identify whether the `(2)` worksheets are backups or revised versions, confirm which ticket rows represent individual purchases rather than totals or formulas, map expense dates/categories/amounts, and approve a duplicate-detection policy. Salaries, assets, budgets, journal controls, opening balances, totals, and formulas remain outside the MVP migration unless the client explicitly expands scope.

## Verification evidence

The foundation release was validated locally with **10 test files and 27 tests passed**. The UX/UI expansion has additionally passed TypeScript checking and the production Vite/server build after reconnecting the full operational navigation, adding the command center, customer directory, workbook migration control room, daily cash settlement, and seeded demo walkthrough data. The local `/healthz` endpoint returned `{"status":"ok"}`. The public ticket route rendered a safe not-found state without authentication, the gate route remained behind the sign-in shell, and the WhatsApp webhook rejected an invalid verification token with HTTP 403 and an unsigned POST with HTTP 401.

The build still prints the repository’s pre-existing warnings about unset analytics placeholders and a large client bundle. These warnings do not prevent the build, but the analytics placeholders should be removed or configured before a polished production deployment.

## Live pilot acceptance checklist

| Test | Expected result |
|---|---|
| Issue one ticket for today with a real customer phone | Sequential number, public URL, QR page, and customer visit record are created |
| Confirm customer consent and send WhatsApp | Message is accepted by Meta and local status becomes `sent`, then later `delivered` or `read` through the webhook |
| Scan the QR code at the gate once | Green **Entry allowed** result and ticket status `checked_in` |
| Scan the same QR code again | Red **Entry denied** result with `already_checked_in`; no second admission |
| Scan an unknown token | Red **Entry denied** result with `not_found`; audit record is created |
| Scan a previous or future visit ticket | Red **Entry denied** result with `expired`; audit record is created |
| Open `/finance` as manager/admin | Revenue, expenses, net result, category controls, and expense ledger are available |
| Open `/finance` as guard | Access is denied; guard can only use `/gate` |

## References

[1]: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview "Meta — Template fundamentals"

[2]: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status "Meta — Status messages webhook reference"
