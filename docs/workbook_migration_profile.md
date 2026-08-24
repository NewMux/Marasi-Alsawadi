# Workbook migration profile

This profile is a read-only structural scan of the attached workbook. It is not an import and does not alter the source file.

## Workbook overview

- Worksheets: **38**
- Sheet names: WP Tickets-2026, Tickets Sales-June-26, Tickets Sales-Jul-26, Tickets Sales-Aug-26, Tot.Revenue-2026, Yearly Salaries-2026, Monthly Salaries, Monthly Cash Flow, Op.Expenses-2026, Journal Entry-July, Journal Entry-Aug, Petty Cash-July, Petty Cash-Aug, Petty Cash-Hasan, Petty Cash-Basheer, Data Ver-Sheet, Assets, Budget-2026, Projects-2026, WP Tickets-2026 (2), Tickets Sales-June-26 (2), Tickets Sales-Jul-26 (2), Tickets Sales-Aug-26 (2), Tot.Revenue-2026 (2), Yearly Salaries-2026 (2), Monthly Salaries (2), Monthly Cash Flow (2), Op.Expenses-2026 (2), Journal Entry-July (2), Journal Entry-Aug (2), Petty Cash-July (2), Petty Cash-Aug (2), Petty Cash-Hasan (2), Petty Cash-Basheer (2), Data Ver-Sheet (2), Assets (2), Budget-2026 (2), Projects-2026 (2)

## Candidate transaction sheets

| Worksheet | Rows | Columns | Non-empty rows | Formula cells | First non-empty row |
|---|---:|---:|---:|---:|---|
| WP Tickets-2026 | 39 | 27 | 37 | 58 |  ·  ·  ·  ·  · Marasi Alsawadi Resort ·  ·  |
| Tickets Sales-June-26 | 39 | 10 | 36 | 230 |  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  ·  |
| Tickets Sales-Jul-26 | 40 | 11 | 37 | 222 |  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  ·  |
| Tickets Sales-Aug-26 | 40 | 12 | 37 | 219 |  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  ·  |
| Tot.Revenue-2026 | 22 | 6 | 19 | 17 |  ·  · Marasi Alsawadi Resort ·  ·  ·  |
| Monthly Cash Flow | 21 | 19 | 18 | 40 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  |
| Op.Expenses-2026 | 20 | 14 | 15 | 29 | Date · Salaries · COGS · Uitilities · Maintenance · Fixture & Furniture · Adv & Marketing · Office Supplies |
| Journal Entry-July | 68 | 7 | 65 | 60 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  |
| Journal Entry-Aug | 68 | 7 | 65 | 60 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  |
| Petty Cash-July | 68 | 8 | 65 | 62 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  |
| Petty Cash-Aug | 68 | 8 | 65 | 61 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  |
| Petty Cash-Hasan | 68 | 10 | 65 | 61 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  |
| Petty Cash-Basheer | 68 | 7 | 65 | 120 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  |
| WP Tickets-2026 (2) | 39 | 27 | 37 | 58 |  ·  ·  ·  ·  · Marasi Alsawadi Resort ·  ·  |
| Tickets Sales-June-26 (2) | 39 | 10 | 36 | 230 |  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  ·  |
| Tickets Sales-Jul-26 (2) | 40 | 11 | 37 | 222 |  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  ·  |
| Tickets Sales-Aug-26 (2) | 40 | 10 | 37 | 222 |  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  ·  |
| Tot.Revenue-2026 (2) | 22 | 6 | 19 | 17 |  ·  · Marasi Alsawadi Resort ·  ·  ·  |
| Monthly Cash Flow (2) | 21 | 19 | 18 | 40 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  |
| Op.Expenses-2026 (2) | 20 | 14 | 15 | 29 | Date · Salaries · COGS · Uitilities · Maintenance · Fixture & Furniture · Adv & Marketing · Office Supplies |
| Journal Entry-July (2) | 68 | 7 | 65 | 60 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  |
| Journal Entry-Aug (2) | 68 | 7 | 65 | 60 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  |
| Petty Cash-July (2) | 68 | 8 | 65 | 62 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  |
| Petty Cash-Aug (2) | 68 | 8 | 65 | 61 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  |
| Petty Cash-Hasan (2) | 68 | 10 | 65 | 61 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  ·  |
| Petty Cash-Basheer (2) | 68 | 7 | 65 | 120 |  ·  · Marasi Alsawadi Resort ·  ·  ·  ·  |

## Duplicate-sheet review

The workbook contains a second set of worksheets with the suffix `(2)`. These must not be imported automatically. The client should confirm whether they are backups, revised versions, or accidental duplicates before any row-level migration.

## Recommended MVP import boundary

Import only verified purchase rows from the ticket/revenue worksheets and verified expense rows from the expense or petty-cash worksheets. Do not import totals, subtotals, formulas, opening balances, salaries, assets, budgets, or journal-control rows into the MVP ticket and expense ledgers unless the client explicitly approves those mappings.

