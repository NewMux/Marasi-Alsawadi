# Marasi Alsawadi ERP Handover Notes

## Current recoverable baseline

The current operational-extension delivery adds persistent ticketing, customer visits, categorized expenses, and a simple operating financial summary to the earlier role-aware ERP baseline. The next saved project checkpoint records this release state.

## Delivery references

| Resource | Link or identifier | Status |
|---|---|---|
| Managed project version | `manus-webdev://8e1c0e6f` | Recoverable expanded-demo baseline |
| Source repository | https://github.com/NewMux/Marasi-Alsawadi | Expanded-demo source is pushed to `main` as commit `8e1c0e6` |
| Active public demo | https://marasi-alsawadi-platform.vercel.app | Verified after deployment: opens directly to the interactive, browser-local Command Center without authentication |
| Historical fixed deployment URL | https://marasi-alsawadi-platform-7o2gk6odl-new-mux.vercel.app | Still served an older sign-in shell when checked; do not use it for presentations |
| Vercel deployments | https://vercel.com/new-mux/marasi-alsawadi-platform/deployments | Use to confirm the current branch is deployed |

## Validation record

The expanded browser-local demo is live at the active alias above on GitHub commit **`8e1c0e6`**. The full automated suite passes: **7 test files / 19 tests**, followed by a clean production build. Public-browser validation confirmed the upgraded **HR & Workforce** workspace can create a local employee record and submit a local leave request into its manager-review queue. It also created a local maintenance work order (“Demo pump pressure check”) and placed it in the engineering queue, then received 20 Aqua wristband rolls in the local inventory ledger (moving the item above par). In Revenue, a local OMR 45 pool-chemical expense was submitted and approved, updating the pending-cost and net-position indicators. In Reservations, a local “Demo Al-Kindi Family” booking was created, and its assigned room and booked calendar days appeared in the browser-local register. In Guest Stays, the Oman Family Group was progressed from Confirmed to Checked In. In Management Reports, a generated Daily Operations Summary card was added to the local report library. In Access & Property, a local “Demo Operations Supervisor” staff-role assignment was added. In Aqua Park, a local “Demo Guest Group” standard day pass was issued to the gate register. In Housekeeping, a local `DEMO-07` turnover-clean task was added to the room board. These changes never leave the client browser. All ten public-demo workspaces have now passed browser-local desktop workflow checks and 375 px phone-width visual review. Live finance-browser checks created and approved a clearly labelled QA settlement (OMR 100) and QA petty-cash request (OMR 25), and confirmed the empty-request validation message. A live housekeeping QA task was also completed, and HR & Workforce explicitly tells the operator to select a staff member before attendance or leave submission; both actions are guarded by focused regression tests. Authenticated reservation validation now also confirms that selecting QA Guest Alpha, QA-101, and the already booked 19–20 August range presents the operator warning and returns the server error “Selected dates overlap an active booking” without adding a stay. The complementary QA-C01 booking for the same dates was then confirmed successfully, appeared in Upcoming stays, and updated the booking calendar to show two stays on 19 August.

The client-facing **HR & Workforce** rename was committed and pushed to GitHub `main` as **`b12c6ac`**. The active public alias was subsequently verified to have refreshed: it opens the interactive demo without authentication and displays **HR & Workforce** in both navigation and the workspace heading.

## Operational extension — August 2026

The database now includes additive `sales_ticket_sequences`, `sales_transactions`, `expense_categories`, and `expense_records` tables. The migration was deliberately applied without altering the known nonstandard live reservation fields. Table-existence verification returned all four tables.

Authenticated staff can issue a server-allocated yearly sequential transaction ticket in the format `MAS-YYYY-######`. A ticket is linked to an existing or newly created customer profile, saves the customer visit date and purchase details, and appears in a searchable customer/visit history. The ticket detail has an A4 `@media print` layout and uses the ordinary browser print dialog, which is compatible with regular printers rather than thermal-only hardware.

Only administrators can create, rename, activate/deactivate, or delete expense categories. Managers and administrators can create, correct, and delete dated categorized expenses. New expense records are also reflected in the existing finance ledger; changing or deleting a categorized expense synchronizes its linked finance entry. The revenue-versus-expenses summary intentionally aggregates the new ticket and expense ledgers directly, avoiding duplicate counting from legacy finance entries.

The public no-login demo now has local-only equivalents of the ticket/customer workflow and expense category/expense/report workflow. Desktop and 375 px screenshots verified the new demo screens render and retain the browser-local, no-server-data notice. The current automated verification is **8 test files / 22 tests**, including ticket formatting, positive-money validation, ticket total calculation, and operating-net calculation; the production build completed successfully.

The focused interface checkpoint is **`1dd94908`** (`manus-webdev://1dd94908`). It retains all existing workspace source and secure backend procedures, but exposes only two routes and navigation entries: **`/tickets`** for ticket issuance, customer search, and visit history; and **`/finance`** for expense category administration, categorized expenses, and the revenue-versus-expenses result. Non-requested public-demo routes redirect safely to `/tickets?demo=1` rather than exposing live data.

The premium redesign checkpoint is **`0e208104`** (`manus-webdev://0e208104`). The focused interface now uses a distinctive midnight, sea-glass, and pearl visual system with editorial hospitality typography, refined content surfaces, and phone-ready navigation. Authenticated desktop validation was completed for both focused workspaces, while the browser-local public demo was verified at 375 px. This is purely a presentation upgrade: ticket sequencing, customer records, expense role controls, financial summary logic, and A4 browser printing remain unchanged.

## Next operational checks

1. For production, replace the browser-local presentation records with secure role-based accounts, persistent data, and a database-backed audit trail. Final authenticated browser evidence is complete: with 144 places remaining and six admitted visitors visible, the 145-person “QA Direct Capacity Evidence” submission displayed the exact toast “Only 144 places remain” and did not alter the gate register. The Housekeeping board visibly showed QA-101 / QA Garden Room, QA Housekeeping Lead, Inspected, the QA-only turnover task, and Done. HR & Workforce surfaced “Select a staff member before continuing” for both empty attendance and leave requests. Reservations visibly showed the confirmed QA-C01 stay and two stays on 19 August, then surfaced the server toast “Selected dates overlap an active booking” for the deliberate QA-101 conflict.
2. For production, replace the browser-local presentation records with secure role-based accounts, persistent data, and a database-backed audit trail.
3. The Vercel public alias continues to be suitable for the browser-local demo, but exact alias-to-commit evidence remains unavailable until the correct NewMux Vercel team session can be used. Do not claim an exact production commit for the newly pushed extension without that evidence.
