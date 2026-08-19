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

The complete automated suite passed: **4 test files / 10 tests**, followed by a clean production build. Phone-width visual checks confirmed the refined Reservations, Aqua Park, Housekeeping, Simple HR, and Finance Control screens render correctly. The Vercel dashboard showed production deployment **`96cae9b`** as **Ready** after the GitHub push, and the active alias above was verified to open the public interactive demo directly. Interactive form submissions and user-facing server-error states remain to be exercised when the connected browser is available; its extension timed out during the final pass.

## Next operational checks

1. Synchronize the local checkpoint changes to GitHub `main`.
2. Exercise reservation, Aqua Park, housekeeping, HR, settlement, and expense workflows through actual form submissions, including their validation and approval paths.
