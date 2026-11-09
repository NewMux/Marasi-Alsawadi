# Round 19 — Printer management (Xprinter XP-251B + future printers)

**No ERP code, database, route or permission key was changed.** Ticket printing is untouched. This note is the report requested in PRD section 8, plus the client guide (section 4, step 2).

Nothing in this task could be run from development: there is no access to the live system, the cashier computers or the printers. Every "to do on site" item below is still open and needs a staging / spare computer first.

## 1. Case A or Case B (PRD section 3)

**Neither is stored in the ERP: it is Case A, with one extra thing to know.** The ERP has no printer setting at all (no table, no column, no screen). Printing works in two ways, tried in this order (`client/src/lib/printAgent.ts`, `TicketDeskPage.printReceipt`, `FacilityBookingsPage`, `LocalTicketDeskPage`):

| # | Path | How it picks the printer |
|---|------|--------------------------|
| 1 | **Local print agent** (`/print-agent`, `http://127.0.0.1:7777`), if it is installed and running on that PC | ONE printer per PC, set in that PC's `print-agent/.env` (`PRINTER_HOST`, raw TCP port 9100). **Network (Ethernet) ESC/POS printers only.** It cannot use a USB / Windows-installed printer. |
| 2 | **Browser `window.print()`** — automatic fallback when the agent is not running (the connection is refused instantly) | The Windows **default printer** of that PC. Receipt CSS already exists: `@page { size: 80mm auto; margin: 0 }` and a 58 mm variant (`client/src/index.css`). Reports use a separate `@page report` (A4). |

Consequences:

- The "each computer prints on its own printer" requirement is **already true** (agent `.env` per PC, or Windows default printer per PC). So **Step 3 (printer list in Settings) is not needed**, and a database list would not help: the agent cannot use it, and Windows printers need no list. Not built, to keep it simple and avoid touching live printing.
- A PC with the agent running prints on **its configured network printer, always**, whatever Windows has as default. So a PC meant to use a **USB / Windows** printer (the XP-251B) must **not** have the agent running for it. A PC that has the agent keeps working exactly as today.
- **To confirm with the client (we could not see the live PCs):** is the ECO250 on each cashier PC reached through the agent (network IP) or as a Windows printer? The answer decides how to add the next printer (section 3).

## 2. Things the PRD did not know — please read before touching any PC

1. **The XP-251B is already the Windows default on the client's computer** (PRD, 9 Nov). If that PC prints tickets through the browser path, its tickets are going to the XP-251B right now. If it uses the agent, they go to the ECO250. We must ask which, and **must not change the default back or forth** without the client's say-so.
2. **`--kiosk-printing` prints EVERYTHING silently on the default printer, reports included.** The Daily / Monthly / Command Centre / cashier-own reports use the same `window.print()`. From a kiosk shortcut they would print on the receipt printer (on an 80 mm roll) with no dialog. So: kiosk shortcut = cashier work only. Print the A4 reports from the normal browser shortcut (dialog visible, choose the reporting printer). This is what keeps PRD test #5 ("reports unchanged") true.
3. **The flag only works if the browser is started fresh.** If Chrome/Edge is already open, the shortcut just opens a tab in the running browser and the flag is ignored (the dialog still appears). Fix, still no code: give the new shortcut its own profile — `--user-data-dir=C:\MarasiKiosk` (the cashier logs in to the ERP once in that profile). This also keeps it completely separate from the existing shortcut and profile.
4. **XP-251B may be a label printer** (PRD section 5). Not asserted either way; judge only from the test print. No label printing is built.

## 3. Client guide — add a receipt printer on a cashier PC (one page)

*Screenshots to be taken on the spare computer and pasted in at each step (not possible from development).*

**Before you start:** do this on the spare/test PC first. On a PC that is currently selling tickets, do it only outside opening hours, and leave the old shortcut as it is.

1. **Install the printer in Windows.** Plug in the printer (USB) → Settings → Bluetooth & devices → Printers & scanners → *Add device*. If it is not found, install the maker's driver (Xprinter / E-POS website), then add it. Print Windows' own *test page* once.
2. **Set it as the default printer — only on the PC that will use it.** Same screen → click the printer → *Set as default*. (Turn off "Let Windows manage my default printer" first, or Windows changes it back.) **Do not do this on a PC whose current printer is working.**
3. **Make the paper size right.** Printer → *Printing preferences* → paper size = the roll width (80 mm or 58 mm), margins 0. Skip if the test page already looks right.
4. **Open the ERP from the special shortcut.** Copy the Chrome (or Edge) shortcut → rename it `Marasi ERP – Cashier` → right-click → Properties → in *Target* add at the end (after the closing quote):
   `--kiosk-printing --user-data-dir=C:\MarasiKiosk`
   Close all Chrome windows, open the new shortcut, log in once.
5. **Print a test ticket.** Issue a test ticket on the ERP and press Print. It must print at once with no print window, show Arabic connected right to left, English left to right, a clear QR code and logo, and not be cut off.

**If the PC runs the Marasi print agent** (a black window / startup item named "marasi-print"): it prints to the network printer set in its `.env` and ignores steps 2–5. To add a *network* printer there, change `PRINTER_HOST` in that PC's `print-agent/.env` and restart the agent. To use a USB/Windows printer on that PC instead, stop the agent first (this is a change to a working PC — outside opening hours only).

**Go back to how it was:** close the browser and open the old shortcut. Nothing else was changed (the new shortcut and `C:\MarasiKiosk` can simply be deleted).

For the Events season (4–6 receipt printers + the reporting printer): repeat steps 1–5 once per cashier PC. There is no limit in the ERP.

## 4. Rollback plan

- Dev: no code or data change was made, so nothing to roll back.
- Per PC: delete the new shortcut and `C:\MarasiKiosk`; the old shortcut was never edited. If anyone changed the default printer, set it back to the name noted **before** starting (write it down at step 0 — takes seconds). If the agent was stopped, start it again (`npm start` / pm2 / Startup `.bat`).
- Always: tell the client before and after; print a test ticket on each current cashier PC before and after and compare to the earlier one.

## 5. Test checklist (PRD section 6) — status

| # | Test | Status |
|---|------|--------|
| 1 | Ticket on each current cashier PC (ECO250), before/after | To do on site, outside opening hours |
| 2 | Ticket on XP-251B: nothing cut off, Arabic/English correct | To do. If it cuts off or margins appear: add a **separate** print profile for that printer only (paper size = roll width, zero margins in the Windows driver first; CSS only if the driver cannot do it). Never edit the existing receipt layout. |
| 3 | Two PCs at once, each on its own printer | To do |
| 4 | Kiosk shortcut: prints with no window | To do (spare PC first) |
| 5 | Daily/Monthly reports on the reporting printer, unchanged | To do — from the **normal** shortcut (see 2.2) |
| 6 | Command Centre / Finance Control / Cash Flow totals before/after | Nothing in this task touches them (no data or server change); still compare on the day |
| — | Photo of the two receipts side by side | Needs the physical printers |

## 6. Simpler or more reliable option (PRD asks us to say)

The kiosk flag works but depends on the browser starting fresh and on the Windows default printer. A more reliable alternative would be to extend the print agent to print to a **Windows printer by name** (so USB printers and several printers per PC work silently, without kiosk flags or default-printer changes, and reports stay on the dialog path). That is a small but real code change to live printing, so **not done**; say if you want it estimated.

## 7. Time estimate

No development. Roughly half a day of setup and testing on the spare PC and the XP-251B, plus a short on-site session per cashier PC — under the 2-working-day limit.
