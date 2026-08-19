# Marasi Alsawadi ERP Handover Notes

## Current recoverable baseline

The latest expanded-demo checkpoint is **`8e1c0e6f`**. It preserves the calendar reservation safeguards, simplified Aqua Park day-pass desk, room-first housekeeping, HR & Workforce, finance-control additions, public demo mode, phone-width navigation refinement, and new browser-local modal workflows.

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

## Next operational checks

1. For production, replace the browser-local presentation records with secure role-based accounts, persistent data, and a database-backed audit trail. Final authenticated browser evidence is complete: with 144 places remaining and six admitted visitors visible, the 145-person “QA Direct Capacity Evidence” submission displayed the exact toast “Only 144 places remain” and did not alter the gate register. The Housekeeping board visibly showed QA-101 / QA Garden Room, QA Housekeeping Lead, Inspected, the QA-only turnover task, and Done. HR & Workforce surfaced “Select a staff member before continuing” for both empty attendance and leave requests. Reservations visibly showed the confirmed QA-C01 stay and two stays on 19 August, then surfaced the server toast “Selected dates overlap an active booking” for the deliberate QA-101 conflict.
2. For production, replace the browser-local presentation records with secure role-based accounts, persistent data, and a database-backed audit trail.
