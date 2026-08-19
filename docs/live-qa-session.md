# Live QA Session

- Authenticated as the project owner with **admin** access.
- The rebuilt administration workspace is available at the current secure preview URL.
- The accommodation register is empty and ready for clearly labelled QA-only property units.
- QA data will be created through the platform interface, not as hidden database seed records.

The first live QA property unit is being configured as **QA-101 — QA Garden Room**, a two-guest room that will support reservations, guest stays, housekeeping, maintenance, and room-revenue testing.

The administration workflow returned a successful **Property unit created** confirmation for QA-101. The browser register will be refreshed before the unit is selected in downstream workflows.

The reservations workspace confirms QA-101 is available. A non-personal **QA Guest Alpha** profile is being used for all live reservation, stay, entry, and revenue tests.

The guest submission action returned to an idle state without refreshing the guest selector, so the underlying mutation result will be verified before a reservation is created.

## Restored reservation state

- The active administrator session remains available in the phone browser.
- The `QA-101` / `QA Garden Room` property unit is visible and available in Reservations.
- The `QA Guest Alpha` profile is visible in the live Guest selector after aligning the application schema with the existing `idReference` database column.

## QA population confirmation

- The initial administrator population attempt created the reusable QA chalet before encountering the legacy reservation-table mismatch.
- The reservation data helper has now been aligned with the live `reference`, `kind`, `checkInAt`, `checkOutAt`, `unitRate`, and `totalAmount` fields.
- The repeated administrator action completed successfully and displayed the confirmation: **“QA operating records are ready for testing.”**
- The Administration register now shows both clearly labelled QA units: `QA-101` / QA Garden Room and `QA-C01` / QA Lagoon Chalet.

## Reservation idempotence regression

- A pre-existing manual booking used the same QA guest and room, so the first successful QA action incorrectly treated it as the labelled QA reservation and did not add the confirmed QA stay.
- The idempotence check now reuses only records whose notes equal `QA-only reservation`; focused compatibility tests and a TypeScript check pass after the correction.
- The administrator workspace has been reloaded and is ready for a final idempotent population run, followed by module-level verification.
- The final population run completed successfully and again displayed **“QA operating records are ready for testing.”**
- Verification-only duplicate QA task, maintenance, and shift rows were reduced to one record per QA label before the final idempotence run; the refreshed administrator workspace is ready.
- A final repeat population action retained one QA reservation, one housekeeping task, one maintenance request, three inventory alerts, two staff profiles, one aqua ticket, one daily task, one shift, and five QA finance records; module pages are now being refreshed to await their live query results.
- The Command Center loaded successfully after its live queries completed: **0/2 occupied units, 2 active reservations, 1 room needing attention, 1 open maintenance request, and 1 active housekeeping task**. Its arrival board shows the confirmed QA reservation alongside the pre-existing pending manual QA test booking.
- The Aqua Park workspace shows a **150-person capacity**, **6 / 150 admitted**, and the **QA Day Pass Group** as a six-person OMR 18 group with entry recorded.
- The Housekeeping board shows the QA Garden Room’s **dirty**, pending turnover task assigned to **QA Housekeeping Lead**, using the required status vocabulary.
- The Maintenance register shows the **QA pool-deck lighting inspection** as a medium-priority, assigned request for the QA Lagoon Chalet, assigned to **QA Maintenance Technician**.
- The Revenue dashboard visibly separates the required streams: rooms **OMR 425**, aqua park **OMR 108**, F&B **OMR 62**, and extras **OMR 85**, with the QA F&B expense of **OMR 24** recorded separately.
- Management Reports displays **0% occupancy**, **OMR 1 RevPAR**, **6** aqua attendance, and **OMR 24** expenses, alongside the four-stream revenue-and-expense breakdown.
- The Reservations workspace shows the confirmed **QA Guest Alpha** booking in **QA-101 / QA Garden Room** for 19–20 August 2026, alongside the earlier pending manual QA test booking.
- Inventory visibly shows all three QA items with purchasing alerts: **QA Beverage Cups** (8 / 15 sleeves), **QA Linen Set** (4 / 10 sets), and **QA Wristbands** (12 / 25 rolls).
- The Team & Shifts workspace shows both QA staff profiles, the high-priority **QA opening readiness walk** assigned to QA Housekeeping Lead, and its scheduled 08:00–16:00 QA shift.
- The Guest Stays register shows QA Guest Alpha’s confirmed 19–20 August QA Garden Room stay with its **check in** action available, proving the stay lifecycle handoff is visible to front office staff.

## External hosting handover — 19 August 2026

- Source was published to **https://github.com/NewMux/Marasi-Alsawadi** on the `main` branch.
- The linked NewMux Vercel project `prj_Q5o6yhVkHDYJ99Mto1WcucHfQ6e5` completed production deployment `02a99cd` successfully.
- The public Vercel URL **https://marasi-alsawadi-platform-7o2gk6odl-new-mux.vercel.app** renders the application’s secure sign-in shell. Production database and OAuth environment values remain to be configured in Vercel before authenticated operational workflows can be used there.
