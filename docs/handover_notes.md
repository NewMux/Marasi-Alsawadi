# Marasi Alsawadi ERP Handover Notes

## Current recoverable baseline

The finalized ERP-refinement checkpoint is **`6ef5f79b`**. It preserves the calendar reservation safeguards, simplified Aqua Park day-pass desk, room-first housekeeping, Simple HR, finance-control additions, public demo mode, and phone-width navigation refinement.

## Delivery references

| Resource | Link or identifier | Status |
|---|---|---|
| Managed project version | `manus-webdev://6ef5f79b` | Current recoverable baseline |
| Source repository | https://github.com/NewMux/Marasi-Alsawadi | The latest local refinements still need to be synchronized to `main` |
| Active public demo | https://marasi-alsawadi-platform.vercel.app | Verified after deployment: opens directly to the interactive, browser-local Command Center without authentication |
| Historical fixed deployment URL | https://marasi-alsawadi-platform-7o2gk6odl-new-mux.vercel.app | Still served an older sign-in shell when checked; do not use it for presentations |
| Vercel deployments | https://vercel.com/new-mux/marasi-alsawadi-platform/deployments | Use to confirm the current branch is deployed |

## Validation record

The full automated suite now passes: **6 test files / 15 tests**, followed by a clean production build. Phone-width visual checks confirmed the refined Reservations, Aqua Park, Housekeeping, Simple HR, and Finance Control screens render correctly. The Vercel dashboard showed production deployment **`96cae9b`** as **Ready** after the GitHub push, and the active alias above was verified to open the public interactive demo directly. Live finance-browser checks created and approved a clearly labelled QA settlement (OMR 100) and QA petty-cash request (OMR 25), and confirmed the empty-request validation message. A live housekeeping QA task was also completed, and Simple HR now explicitly tells the operator to select a staff member before attendance or leave submission; both actions are guarded by focused regression tests. The only remaining interactive browser item is a reservation-form conflict submission using the native selector.

## Next operational checks

1. Synchronize the local checkpoint changes to GitHub `main`.
2. Exercise reservation, Aqua Park, housekeeping, HR, settlement, and expense workflows through actual form submissions, including their validation and approval paths.
