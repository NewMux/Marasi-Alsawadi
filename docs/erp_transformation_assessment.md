# Marasi Alsawadi Digital Transformation Assessment

**Assessment date:** 19 August 2026  
**Scope:** Marasi Alsawadi Resort & Aqua Park’s current platform, public demo, and supplied manual operating workbook.  
**Assessment basis:** The workbook is operating evidence rather than audited financial reporting. [1]

## Executive conclusion

> **The current platform is a strong Phase 1 resort-operations platform, but it is not yet a full ERP and does not by itself complete Marasi Alsawadi’s digital transformation.**

It already replaces several high-friction frontline processes: reservations, guest-stay progression, aqua-park ticketing and capacity control, housekeeping, maintenance, inventory alerts, staff scheduling, operational tasks, separate revenue streams, management reporting, and role-controlled administration. These capabilities establish a sound **property operations layer**.

The spreadsheet evidence shows that Marasi’s real manual workflow is materially broader. The workbook is also used for daily ticket collection and settlement, cash versus bank allocation, bank charges, total revenue by venue, salary records, cash flow, operating expenses, journal entries, petty cash, fixed assets, budgets, and projects. [1] Those financial-control and back-office processes are either absent or represented only at a high-level dashboard-entry layer in the present platform. Consequently, the correct positioning is **“digital operations foundation / hospitality ERP Phase 1,” not “complete ERP.”**

The public Vercel experience also intentionally operates as a browser-only, read-only client demonstration. It makes the workflow tangible but does not connect to production users, a database, payment collection, accounting systems, or external channels. That design is appropriate for a proposal demonstration, not for live resort control.

## What the manual workbook proves about the current process

The supplied workbook contains separate, recurring registers for water-park ticket planning, daily June–August ticket sales, total revenue, yearly and monthly salaries, monthly cash flow, operating expenses, journal entries, petty cash, data verification, assets, budgets, and projects. It also contains duplicate copies of these sheets, which is a practical signal of file-based versioning and handover risk. [1]

The total-revenue register is structured by **Water Park, Main Hall, Events Hall, Others, and Total**. It records OMR 140,104 of total 2026 revenue through the populated period, against OMR 100,000 of expenses and OMR 40,104 of reported profit. [1] The June ticket-sales register records **ticket count, rate, total sales amount, bank, cash, total, bank charges, and net amount**. [1] That is a complete daily settlement control—not merely an attendance counter.

## Coverage matrix

| Business capability | Evidence in the manual process | Current platform position | Transformation assessment |
| --- | --- | --- | --- |
| Reservations and guest stays | Resort accommodation activity is implied by the operating model. | **Covered operationally.** Property units, guests, reservations, confirmation, check-in, and check-out are present. | A meaningful replacement for manual front-office tracking, but still lacks folios, deposits, cancellation terms, rate plans, night audit, and channel management. |
| Aqua-park ticketing and access | Daily sales records ticket quantity, rate, total amount, bank, cash, bank charges, and net receipts. [1] | **Partially covered.** Capacity, ticket issuance, and gate entry are present. | Must add ticket types, payment capture, cash/bank settlement, refunds, receipt numbers, promotions, and daily close. |
| Housekeeping and maintenance | These are essential resort operating workflows. | **Covered operationally.** Required housekeeping states, task board, requests, assignment, and status tracking exist. | Add SLA timers, photo evidence, maintenance cost capture, parts consumption, preventive maintenance, and mobile/offline work orders. |
| Inventory and purchasing | Operating expenses and the need to support F&B, housekeeping, and aqua park are evidenced by the workbook. [1] | **Partially covered.** Item balances and low-stock alerts exist. | Add requisitions, purchase orders, supplier records, goods-received notes, stock movements, counts, wastage, unit cost, and approval controls. |
| Workforce, attendance, and payroll | Salary registers contain employee name, salary, job type, allowances, and monthly payroll values. [1] | **Partially covered.** Staff profiles, shifts, and daily tasks exist. | Add time attendance, leave, overtime approval, payroll calculation, payroll posting, employee documents, and payslips. |
| Revenue management | The workbook aggregates revenue by Water Park, Main Hall, Events Hall, and Others. [1] | **Partially covered.** Rooms, aqua park, F&B, and extras are separated in the dashboard. | Map the actual venue taxonomy, build daily revenue closure, compare actual to budget, and support source-document drill-down. |
| General ledger, journals, and expenses | The workbook maintains operating expenses plus July and August journal-entry registers. [1] | **Not covered as ERP accounting.** Finance entries are a management-data capture layer. | Build chart of accounts, double-entry journals, accounts payable, expense claims, approval rules, period close, audit trail, and financial statements. |
| Cash, banks, and petty cash | Cash flow, bank allocation, bank charges, and multiple petty-cash registers are maintained in the workbook. [1] | **Not covered.** | Add cash drawer, daily collection, cash/bank reconciliation, petty-cash float, vouchers, variance investigation, and bank import/reconciliation. |
| Budgeting, assets, and projects | Dedicated budget, asset, and project worksheets are present. [1] | **Not covered.** | Add budget by department/account, commitment tracking, capex/projects, asset register, depreciation, transfer/disposal, and maintenance linkage. |
| F&B point of sale | F&B is a revenue stream but no transaction source is shown in the present platform. | **Not covered.** | Add menu/items, order taking, kitchen/bar workflow, cashier close, void/refund control, recipe costing, and stock consumption. |
| Governance and access | Spreadsheet workflows create limited workflow enforcement and auditability. | **Partially covered.** Staff, manager, and admin access are enforced in the platform. | Add approval matrices, segregation of duties, immutable financial audit logs, maker-checker workflow, period locks, and document retention. |

## Why it does not yet feel like a full ERP

An ERP is not simply a set of dashboards. It is a **system of record** that connects each operational event to the relevant financial, inventory, people, approval, and audit consequences. In a mature hospitality ERP flow, a ticket sale or room booking produces a receipt or invoice, a payment-method allocation, a tax/charge treatment, a revenue posting, cash or bank settlement, stock consumption where applicable, and a traceable audit event. The present platform demonstrates the operational event but does not yet complete that closed loop.

The strongest signal is the manual workbook itself. Its ticket-sales sheet contains commercial settlement logic; its journal, petty-cash, asset, budget, project, salary, and cash-flow sheets show that the business still relies on Excel for its financial system of record. [1] Removing only the daily operating queues would improve visibility, but the team would still have to re-key, reconcile, and control the most important commercial records outside the system.

## Recommended transformation roadmap

| Priority | Workstream | Outcome and minimum scope |
| --- | --- | --- |
| **P0 — make daily money controlled** | Daily sales, cash, bank, and settlement | Create ticket and room receipts; record tender type; split cash, bank, card, and transfer; record bank charges; reconcile shift/day close; enforce approvals for voids/refunds; provide cash variance reporting. This directly replaces the highest-risk manual ticket-sales workflow. |
| **P0 — establish accounting control** | General ledger and expenses | Add a chart of accounts, double-entry journals, expense submission/approval, vendor bills, petty-cash vouchers, financial period close, and drill-down from management report to source transaction. |
| **P1 — connect service delivery to commercial control** | Room folios, F&B POS, and aqua park commercial rules | Add deposits, folio charges, rate plans, discounts, package bundles, F&B order-to-cash, ticket price rules, refunds, guest balances, and end-of-day/night-audit workflows. |
| **P1 — control purchasing and labour cost** | Procurement, stock movement, attendance, and payroll | Add suppliers, requisitions, POs, receiving, count adjustments, purchase cost; integrate attendance/leave/overtime with payroll items, allowances, and approval. |
| **P2 — plan and protect capital** | Budget, projects, and assets | Build department/account budgets, budget-versus-actual reporting, capital-project stages, fixed assets, depreciation, disposal, and maintenance cost history. |
| **P2 — automate resort growth** | CRM, online sales, and channel integration | Add guest profiles/consent, offers, online booking, payment gateway, OTA/channel manager integration, corporate/group bookings, event/mains-hall sales, and campaign attribution. |
| **P3 — optimize and govern** | Business intelligence and controls | Add role-specific KPI packs, forecast and cash planning, anomaly alerts, approval delegations, document attachments, data-retention policies, backup, and mobile/offline operational workflows. |

## Recommended target scope for the next build

The next implementation should not attempt all ERP domains at once. It should first turn the platform into the single daily commercial-control system by delivering **ticket/room/F&B transaction capture, payment settlement, petty cash, expenses, and accounting posting**. This removes the daily Excel re-keying loop and creates trustworthy revenue and cash figures.

Once the daily close is stable, purchasing/inventory cost, staff attendance/payroll, and budget-versus-actual should follow. Assets, projects, CRM, online booking, and advanced analytics can then be added in connected releases. This sequence is less risky than a wide “big-bang ERP” build because each release replaces a specific workbook dependency and has a measurable operational owner.

## Practical client-facing positioning

For a proposal, position the existing application as:

> **“Marasi Operations Hub — Phase 1: a role-secured digital command center for resort and aqua-park operations, designed to become the operational core of Marasi’s future hospitality ERP.”**

Do **not** position it as a completed ERP until the financial-control, settlement, procurement, payroll, asset, budget, and integration workstreams are delivered and adopted by the resort.

## References

[1]: file:///home/ubuntu/upload/AR-Revenue-2026-15082026.xlsx "AR-Revenue-2026-15082026.xlsx — user-supplied manual operating workbook"
[2]: https://github.com/NewMux/Marasi-Alsawadi "Marasi Alsawadi platform source repository"
