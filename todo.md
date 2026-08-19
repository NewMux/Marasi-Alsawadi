# Project TODO

- [x] Restore the full-stack resort operations schema, strict staff/manager/admin role model, and all ten operational modules after the sandbox reset.
- [x] Rebuild the premium role-aware application shell and operational module interface.
- [x] Restore the verified QA room and guest records through the live administrator workflow.
- [x] Add an administrator-only one-click action that safely populates and reuses clearly labelled QA records across reservations, aqua park, housekeeping, maintenance, inventory, staffing, revenue, and expenses.
- [x] Verify the populated QA records appear correctly in the command center, operational registers, revenue dashboard, and management reports.
- [x] Run automated tests, visual verification, and save a recoverable project checkpoint.
- [x] Reconcile the existing reservations table with the restored platform schema so reservation queries and QA population execute successfully.
- [x] Ensure QA population identifies its own reservation record instead of reusing a separate manual booking for the same guest and unit.
- [x] Ensure all QA task, maintenance, and shift reuse checks operate on joined records so repeat population remains idempotent.
- [x] Verify the QA reservation in Reservations or Guest Stays, the low-stock inventory alerts, and the QA staff shift and daily task in their operator-facing workspaces.
- [x] Verify the confirmed QA reservation is shown correctly in the Guest Stays workspace.
- [x] Save a recoverable project checkpoint after the successful final test and production build.
- [x] Review production deployment requirements and repository configuration for GitHub and Vercel.
- [ ] Add a Vercel-compatible serverless entry point and routing configuration for the full-stack application.
- [x] Add a Vercel-compatible serverless entry point and routing configuration for the full-stack application.
- [x] Create and push the verified platform source to a GitHub repository.
- [ ] Create a Vercel project, configure required production environment variables, and deploy the platform.
- [ ] Verify the Vercel-hosted application and document deployment access.
