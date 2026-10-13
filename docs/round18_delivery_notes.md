# Round 18 — Delivery notes

Branch `claude/new-session-x2ahvj`. Every database change is additive: new tables, new nullable columns and new settings columns only (migrations `0049_round18_finance.sql` and `0050_round18_vat_activation.sql`, applied automatically on start). No field, route or permission key was renamed or deleted. No existing amount is ever overwritten.

## Must be done by the operator on the live system

None of this could be run from development. There is no access to the live database, so the steps below are still open:

1. **Backup before deploying.** Take a full backup (Commercial Settings → Backup & restore → Download, or a database dump).
2. **Section 9 verification.** Run it after deploying, before the VAT migration: `pnpm verify:data`, or Finance Control → Tax Account → *Data verification* (Super Admin). It is read-only. It reports:
   - for 8, 9 and 10 Oct: the number of transactions, gross, revenue and VAT, broken down by type;
   - whether the same totals agree across Command Centre, Finance Reports, the General Ledger and Cash/Bank;
   - any orphaned records (14 checks).

   Expected for 8 Oct: **9 transactions, gross OMR 91.575**. If anything fails, stop and report it.
3. **Backup again**, right before the VAT migration.
4. **Test copy.** Restore that backup into a test database. Point `DATABASE_URL` at it and run `pnpm vat:migrate` (dry run, changes nothing). It prints:
   - the per-day before/after table;
   - how many transactions fall into each case (VAT stored / derived / none);
   - the protected totals;
   - every category named like VAT or tax;
   - which items carry VAT.

   Then run `pnpm vat:migrate --apply --i-have-a-backup --user <super admin>` on the copy. Every check must print PASS.
5. **Live.** Run the same on live: CLI, or Tax Account → *VAT migration* (Super Admin). Tick the backup confirmation and click *Apply*.
   - The apply step writes only the new VAT columns. It then re-reads every protected total through the same functions the screens use:
     - Cash Account, Bank Account, Cash Flow, Petty Cash, Receivable and Payable must be unchanged;
     - total gross and the transaction count must be unchanged;
     - NET + VAT must equal GROSS on every transaction;
     - revenue must equal the previous revenue minus the VAT.
   - **If any check fails, the change is rolled back automatically and nothing stays applied.**
   - The before/after table and the checks are stored in the audit report (*VAT migration applied*). Use `--out report.json` to get the file to send.
6. **Rollback** is available at any time: Tax Account → *Roll back VAT migration*, or `pnpm vat:migrate --rollback --reason "…" --user <name>`. The original amounts were never changed, so rolling back simply returns every report to the gross figures.

### Until the migration is applied, nothing changes

Revenue is split into net + VAT only once the migration has been applied (`system_settings.vatActivatedAt`). Before that, new sales stay gross just like the old ones, so reports never mix gross and net. Sales made between deploying and running the migration are converted by the migration too.

## Section 8 — Tax Account (VAT)

### The rule

One rule applies to every revenue transaction, new or migrated:

1. If VAT is stored on the sale, that VAT is used. This covers:
   - ticket purchases;
   - the facility line of a booking (the booking's VAT minus its add-ons' VAT);
   - each add-on line.
2. Otherwise, if the item carries VAT (its own *Apply VAT* setting), VAT is calculated per line as `round(gross − gross / (1 + rate), 3)`. NET is `gross − VAT`, worked in baisa.
3. Otherwise VAT is 0 and NET equals GROSS.

There are fixed exceptions:

- **No VAT ever:** opening balances, security deposits and deposit deductions, and anything dated before the VAT start date (8 Oct 2026).
- **Manual revenue:** the form has an *Amount includes VAT* choice. By default it is ticked when the category is linked to a ticket type, facility or add-on that carries VAT. The migration treats existing manual revenue the same way, as "derived". Each one is listed in the dry run so it can be checked.

### Which items carry VAT

The live configuration is shown in the dry run under "Items carrying VAT now" and in the Tax Account panel; please send it with the table. In development, all ticket types (Water Park Entry, Kids Area) and all facility types (Grand Hall, BBQ Area, Meeting Room) carry 5%. Add-ons each have their own setting. Ticket fees carry no VAT, which is how pricing already worked.

### About the reference figure

Ticket and facility VAT is the VAT already printed on each receipt (stored), not recalculated. It was calculated per line on the price before VAT, so a day's total can differ from `91.575 − 91.575/1.05` by a baisa. If all nine transactions on 8 Oct carry 5%, expect about 87.214 / 4.361. The dry run shows the exact figures before anything is applied.

### Categories named like VAT

The check lists every expense or revenue category whose name contains VAT, tax or ضريبة. It leaves them untouched: the migration only touches revenue entries, so VAT is never deducted twice. The development seed has an expense category named "Tax & VAT (Municipality 3% / Tourism 4% / VAT 5%)" with no records. If it exists live, the dry run shows how many records it has.

### What changed in the application

- **Revenue is NET everywhere.** This covers:
  - Command Centre;
  - Finance Control metrics and the General Ledger (each row also shows gross and VAT);
  - Finance Reports: summary, by stream, ticket/facility by type, category reports, the transaction lists, PDF and Excel.

  Cash Account, Bank Account, Cash Flow movements, Petty Cash, Payable and Receivable stay **GROSS**.
- **Tax Account** (Finance Control → Tax Account): VAT collected, VAT paid and the balance owed. The Tax Account line also appears in Cash Flow Status next to Payable.
- **VAT report** per quarterly period:
  - net sales, VAT collected, VAT paid and balance due;
  - every transaction behind the figures;
  - PDF, and a generic Excel file (date, reference, type, net, VAT, gross).

  The authority's own format is left for the round after the client brings it.
- **Periods.** Each period is 3 months from a configurable start month (default January, i.e. calendar quarters). The first period starts on 8 Oct 2026. The VAT rate and the start month are settings (Admin / Super Admin).
- **VAT payment.** It is paid from the Cash or Bank Account and reduces the Tax Account and that account. It is not an expense and does not change profit. It is refused if it would make the account negative, the same as a transfer.
- **Closing a period (8.7).** A Finance role marks periods as settled up to a date. After that, amending, deleting, voiding or changing the payment method of a transaction inside a settled period asks for an explicit confirmation. Only Admin / Super Admin can reopen settled periods, and they must give a reason. Every action is audited.
- **Reversals.**
  - Voiding a ticket sale, or cancelling or voiding a booking, removes its revenue entries and their VAT.
  - Amending a manual revenue, or editing a booking's price, re-splits its VAT.
  - A payment-method change does not touch VAT.
- **Bug fixed along the way.** Editing an already-paid booking that has add-ons used to add the add-ons' VAT into the facility revenue entry a second time.

## 7.1 Security Deposit

- **Recording.** A deposit is added on a facility booking (any amount, Cash or Card, Card default). Only one deposit can be held per booking at a time.
- **Settling.** A deposit can be returned in full, returned with a deduction (amount and reason), or forfeited. The refund method (Cash or Card) is chosen at return time.
- **Who can do what.**
  - Recording and a full return: anyone who handles bookings.
  - Deduction and forfeit: Manager, Admin, Super Admin and Accountant only. This is enforced on the server.
  - Every action is in the audit report.
- **Accounting.**
  - A deposit is never revenue or VAT.
  - Receiving one raises the Cash or Bank Account (Card = Bank); a refund lowers the account it is paid back through.
  - Only the amount kept becomes income, as "Deposit deductions" with no VAT. It appears read-only in the General Ledger.
  - Cash Flow Status shows a "Deposits held" line.
- **Receipts and lists.** There is a deposit receipt and a settlement receipt. Each booking shows "Deposit held". The bookings list has a filter for deposits not yet settled.
- **Open question for you.** VAT on deductions is not applied, as instructed. Tell us if it should be.

## Earlier stages (already pushed)

- **4.1 / 4.3**
  - The General Ledger's Revenue lists every ticket sale, facility booking and add-on once. It is built from the same entries the reports total, so there is no double counting; the ledger total equals Command Centre.
  - Ticket and facility rows are read-only and linked to their sale, with the ticket number range or booking reference.
- **4.2** Renamed to Finance Control / General Ledger (English and Arabic).
- **4.4**
  - Amend and delete are available to Manager, Admin, Super Admin and Accountant. The full original record is stored in the audit report before a delete.
  - Ticket and facility rows are voided through their sale, with an audit entry.
  - A delete of a petty-cash spend also restores the custodian's balance.
- **4.5**
  - An unpaid booking's date, duration, start time, partner (re-priced), notes and customer can be edited.
  - Conflicts are checked against other bookings.
  - The auto-cancel timer is not restarted.
  - A partner change is refused once the booking is paid.
- **4.6**
  - Payment method change: the amount moves between Cash and Bank and nothing else changes.
  - Cash ↔ Bank transfer: not revenue, expense or VAT. It is blocked if it would make the source account negative.
  - Balance adjustment: needs a reason and a category (counting difference, bank charges, bank interest, other).
  - Audit report: filters, PDF, and adjustments of OMR 100 or more highlighted.
  - The Cashier has no access.
- **5.1 Timezone.** The commercial day everywhere is Asia/Muscat. This includes:
  - the client date pickers' "today";
  - the cashier's Command Centre (today only);
  - the gate scan's business date;
  - the settlement date.

  Previously the browser used UTC, so between 00:00 and 04:00 Muscat time it showed the previous day.
- **5.2** Removed the "Staff confirm availability manually" message.
- **5.3** Card is the default payment method everywhere. A manual transaction paid by Card posts to the **Bank Account**.
- **6.1** Staff / Accountant can open and print the Daily / Monthly report (Command Centre → Print report). Finance Reports were already available to them.
- **7.2 Receipts.**
  - On every receipt type (ticket, other tickets, facility, deposit), the footer and terms are solid black, bold and larger.
  - The phone number prints in full as `Tel: +968-98044556`.
  - The emoji icons were replaced with plain text labels, because on thermal paper they printed as smudges and blurred the "+".
  - Layout, totals and fields are unchanged.

## Section 11 — Regression checklist (development database)

| Area | Result |
|---|---|
| Ticket Desk | Price, group and partner discount, Card default and receipt all checked; VAT stored per line. |
| Facility booking | Create, edit before payment (re-price with partner), pay, cancel, add-ons, conflicts all checked. |
| General Ledger | Totals equal Command Centre and reports; no double counting; amend and delete limited to the allowed roles (automated RBAC tests). |
| Command Centre | The cashier sees today (Muscat) only; other roles are unchanged. |
| Finance Reports | Daily / Monthly PDF and Excel work; Staff can print. |
| Cash and Bank | Unchanged by the VAT migration (all 10 checks PASS on the development copy); mixed payments still split. |
| Corrections | Method change, transfer and adjustment verified; Cashier gets 403; every action is in the audit report. |
| Cash Flow Status | Payable, Receivable, Tax Account and Deposits held lines are consistent; a VAT payment and deposits move Cash/Bank only. |
| Petty Cash | Balances unchanged (verified by the migration checks). |
| Roles | 81 automated tests pass, including new Tax Account and VAT migration permission tests. Page sweep for owner, cashier, staff and custodian: no errors. |
| VAT | NET + VAT = GROSS on every line; void, cancel and edit reverse or re-split the VAT; deposits carry no VAT. |
| Receipts | Footer is readable and the phone shows the "+"; checked at 80 mm (58 mm uses the same classes). |

Also still to confirm on your side: that the `superadmin` support account (`NEWMUX_SUPPORT_USERNAMES`) is NewMux's own account and not the client's.
