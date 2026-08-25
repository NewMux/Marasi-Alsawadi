# Operational Extension Design

## Purpose

This extension adds the first persistent point-of-sale and expense-control layer to the authenticated Marasi Alsawadi ERP. It is deliberately separate from the public Vercel demo: authenticated users write to the database, while public-demo users continue to work only with browser-local presentation data.

| Capability | Persistent model | Primary workflow | Access boundary |
|---|---|---|---|
| Transaction tickets | `sales_transactions` | Create one transaction, receive one sequential ticket number, and print a compact 80 mm/58 mm receipt through the browser’s standard print dialog | Staff may issue; managers and admins may review |
| Customer and visits | Existing `guests` table plus `sales_transactions.customerId` | Search by name or phone; each ticket creates a dated, linked purchase visit | Staff may create and search; managers and admins may review all records |
| Expense categories | `expense_categories` | Maintain a controlled list of expense classifications | Super Admin only for create, edit, and deactivate/delete |
| Expense records | `expense_records` | Record amount, business date, category, payee, and description | Managers and admins may create and manage; managers and admins may review |
| Financial summary | Aggregated sales and expense records | Compare ticket revenue with recorded expenses and net operating result by date range | Manager and admin only |

## Ticket numbering and printing

Every completed sales transaction receives a database-generated number in the form **`MAS-YYYY-000001`**. The numeric portion advances sequentially inside the selected year, while a unique database constraint prevents duplicate ticket numbers. A standard receipt print view opens using the browser print dialog, allowing the operating system’s configured receipt printer to be selected. The layout supports 80 mm by default and a 58 mm fallback without a proprietary printer SDK.

## Customer and visit logic

The existing guest profile becomes the customer master for this scope: its name and phone attributes meet the requested searchable customer record. A sales transaction links to that profile and stores the transaction’s visit date, gross amount, and ticket reference. Ticket creation can either select an existing customer by phone/name or create a new customer in the same workflow. Accommodation reservations remain linked to the same customer profile through `guestId`.

## Financial-reporting logic

The simple report uses sales transaction totals as revenue and expense-record totals as expenses. The displayed net operating result is **revenue minus expenses** for the selected inclusive business-date range. Existing finance entries, settlements, and petty-cash approvals remain intact; this report is a clearly scoped operational view rather than a replacement for a future general ledger.

## Security and audit rules

All mutations are server-side tRPC procedures. Price, fee, and category maintenance is restricted to Super Admins. Financial reporting and expense records require manager or administrator roles. Ticket/customer actions require an authenticated user, and every create/update/delete action writes an activity-log entry. Server-side validation controls amount positivity, required business dates, category validity, and ticket-number uniqueness.
