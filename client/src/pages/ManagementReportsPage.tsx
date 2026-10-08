import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Banknote, CalendarDays, Download, FileSearch, FileText, Landmark, Printer, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { DateField, EmptyState, Field, LoadingState, MetricCard, PageHeader, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";
import { csvReportHeaderRows, printReport, ReportDocument, ReportSection, ReportStat, ReportStatGrid, ReportTable } from "@/components/PrintableReport";
import { useT, type TranslationKey } from "@/lib/i18n";
import { exportSpreadsheet } from "@/lib/spreadsheetExport";
import { categoryOptionLabel, orderCategoriesAsTree } from "@/lib/categoryTree";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const REVENUE_STREAM_KEYS: Record<string, TranslationKey> = { rooms: "reports.streamRooms", aqua_park: "reports.streamAquaPark", fnb: "reports.streamFnb", extras: "reports.streamExtras" };
const assetStatusReportKeys: Record<string, TranslationKey> = { active: "finance.assetStatusActive", under_maintenance: "finance.assetStatusUnderMaintenance", disposed: "finance.assetStatusDisposed" };
const isoDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const today = new Date().toISOString().slice(0, 10);
const money = (value: unknown) => `OMR ${Number(value ?? 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
// PRD Round 16, item 15: real Excel workbooks, one value per column.
const exportCsv = exportSpreadsheet;
const amountCell = (value: unknown) => Number(value ?? 0).toFixed(3);
// PRD Round 16, item 8: which report the printable document (the PDF, via
// the browser's Save as PDF) currently holds.
type PrintMode = "summary" | "revenue" | "expense" | "cashflow" | "assets" | "category" | "facilities";
const CASH_KIND_KEYS: Record<string, TranslationKey> = { tickets: "reports.cashInTickets", facilities: "reports.cashInFacilities", otherRevenue: "reports.cashInOther", expense: "reports.cashOutExpenses", capex: "reports.cashOutCapex", adjustment: "reports.cashAdjustment" };
function Stream({ title, description, tone, revenueLabel, expenseLabel, children }: { title: string; description: string; tone: "success" | "warning"; revenueLabel: string; expenseLabel: string; children: ReactNode }) { return <Surface><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{title}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{description}</p></div><StatusPill tone={tone}>{tone === "success" ? revenueLabel : expenseLabel}</StatusPill></div><div className="mt-5 divide-y divide-divider">{children}</div></Surface>; }

export default function ManagementReportsPage() {
  const t = useT();
  const { user } = useAuth();
  const [from, setFrom] = useState(today); const [to, setTo] = useState(today); const input = { from, to };
  const [categoryReportKey, setCategoryReportKey] = useState("");
  // The single-category report gets its own date range, independent of the
  // summary cards above — a manager reviewing one category over a longer
  // window shouldn't have to widen (and skew) the whole page's totals.
  const [categoryFrom, setCategoryFrom] = useState(today);
  const [categoryTo, setCategoryTo] = useState(today);
  // PRD Round 4, Section 6: Fixed Assets Overview & Report — its own date
  // range too, same reasoning as the single-category report above.
  const [assetFrom, setAssetFrom] = useState(today);
  const [assetTo, setAssetTo] = useState(today);
  const [showAllAssets, setShowAllAssets] = useState(false);
  const setAssetFromNarrow = (value: string) => { setAssetFrom(value); setShowAllAssets(false); };
  const setAssetToNarrow = (value: string) => { setAssetTo(value); setShowAllAssets(false); };
  const { data: assetRecords = [] } = trpc.platform.finance.assets.list.useQuery(showAllAssets ? {} : { from: assetFrom, to: assetTo });
  const assetRunningTotal = (assetRecords as any[]).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const { data: summary = [], isLoading } = trpc.platform.finance.summary.useQuery(input);
  // PRD Round 9, Section 11: the combined ticket figure stays the headline;
  // this is the per-ticket-type detail behind it, expandable alongside.
  const [showTicketBreakdown, setShowTicketBreakdown] = useState(false);
  const [ticketTypeFilter, setTicketTypeFilter] = useState("");
  const { data: ticketRevenue = [] } = trpc.platform.finance.ticketRevenueByType.useQuery(input);
  const ticketRevenueTotal = (ticketRevenue as any[]).reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
  const filteredTicketRevenue = (ticketRevenue as any[]).filter((row) => row.ticketTypeName?.toLowerCase().includes(ticketTypeFilter.trim().toLowerCase()));
  // PRD Round 15, Section 7.2: the Facility Type equivalent — its own
  // breakdown, own combined total (always the full unfiltered list, so the
  // filter below only narrows which rows the table shows), own filter.
  const [showFacilityBreakdown, setShowFacilityBreakdown] = useState(false);
  const [facilityTypeFilter, setFacilityTypeFilter] = useState("");
  const { data: facilityRevenue = [] } = trpc.platform.finance.facilityRevenueByType.useQuery(input);
  const facilityRevenueTotal = (facilityRevenue as any[]).reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
  const filteredFacilityRevenue = (facilityRevenue as any[]).filter((row) => row.facilityTypeName?.toLowerCase().includes(facilityTypeFilter.trim().toLowerCase()));
  const { data: finance = [] } = trpc.platform.finance.list.useQuery(input);
  const { data: expenseCategories = [] } = trpc.platform.finance.expenseCategories.list.useQuery({ includeInactive: false });
  const { data: expenses = [] } = trpc.platform.finance.expenses.list.useQuery(input);
  const revenueRows = (summary as any[]).filter((row) => row.type === "revenue"); const expenseRows = (summary as any[]).filter((row) => row.type === "expense");
  const totals = useMemo(() => { const revenue = revenueRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0); const expenses = expenseRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0); return { revenue, expenses, net: revenue - expenses }; }, [revenueRows, expenseRows]);
  const { data: revenueRecordsInPeriod = [] } = trpc.platform.finance.revenues.list.useQuery(input);
  const { data: revenueCategories = [] } = trpc.platform.finance.revenueCategories.list.useQuery({ includeInactive: false });
  const { data: assetCategories = [] } = trpc.platform.finance.assetCategories.list.useQuery({ includeInactive: false });
  // PRD Round 16, item 6: Cash Flow Status for the same selected period.
  const { data: cashFlow, isLoading: cashFlowLoading } = trpc.platform.finance.cashFlow.status.useQuery(input);
  // PRD Round 17, item 5.3: facility bookings filterable by facility
  // category (a main category includes its sub-categories).
  const [facilityCategoryFilter, setFacilityCategoryFilter] = useState("");
  const { data: facilityCategoryOptions = [] } = trpc.platform.facilityCategories.list.useQuery();
  const { data: facilityReport } = trpc.platform.facilityCategories.report.useQuery({ ...input, facilityCategoryId: facilityCategoryFilter ? Number(facilityCategoryFilter) : undefined });
  const facilityFilterName = (facilityCategoryOptions as any[]).find((entry: any) => String(entry.id) === facilityCategoryFilter)?.name;
  const [showCashMovements, setShowCashMovements] = useState(false);
  // PRD Round 16, item 8: every report section prints (Save as PDF) on its
  // own. The document is re-rendered for the chosen report first, then
  // printed two frames later once the portal has painted.
  const [printMode, setPrintMode] = useState<PrintMode>("summary");
  const [pendingPrint, setPendingPrint] = useState(0);
  useEffect(() => {
    if (!pendingPrint) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => printReport()); });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
  }, [pendingPrint]);
  const printAs = (mode: PrintMode) => { setPrintMode(mode); setPendingPrint((count) => count + 1); };
  // PRD Round 16, item 9: clicking the Revenue or Expenses total lists
  // every transaction behind it.
  const [transactionsView, setTransactionsView] = useState<"revenue" | "expense" | null>(null);
  const streamLabel = (stream: unknown) => stream && REVENUE_STREAM_KEYS[String(stream)] ? t(REVENUE_STREAM_KEYS[String(stream)]) : String(stream || "—").replaceAll("_", " ");
  // The full transaction lists: every Financial Status ledger entry, with
  // the Paid / Balance of the transaction it came from where there is one
  // (ticket sales and older entries are always fully paid).
  const detailRows = useMemo(() => {
    const revenueByEntry = new Map((revenueRecordsInPeriod as any[]).filter((record) => record.financeEntryId).map((record) => [record.financeEntryId, record]));
    const expenseByEntry = new Map((expenses as any[]).filter((record) => record.financeEntryId).map((record) => [record.financeEntryId, record]));
    const build = (type: "revenue" | "expense") => (finance as any[]).filter((entry) => entry.type === type).map((entry) => {
      const linked: any = (type === "revenue" ? revenueByEntry : expenseByEntry).get(entry.id);
      return { id: entry.id, date: isoDate(entry.date), stream: streamLabel(entry.stream), category: linked?.categoryName || streamLabel(entry.stream), description: entry.description || linked?.description || "—", amount: Number(entry.amount || 0), paid: linked ? Number(linked.paidAmount ?? linked.amount) : Number(entry.amount || 0), balance: linked ? Number(linked.balanceAmount || 0) : 0 };
    }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    return { revenue: build("revenue"), expense: build("expense") };
  }, [finance, revenueRecordsInPeriod, expenses, t]);
  const categoryRangeInput = { from: categoryFrom, to: categoryTo };
  // PRD Round 16, item 2: report on a revenue stream, or on any Revenue,
  // Expense or Capital Expenditure category — a main category includes all
  // of its sub-categories, a sub-category is reported on its own.
  const [reportKind, reportKeyValue] = categoryReportKey ? categoryReportKey.split(":") : ["", ""];
  const isCategoryKind = reportKind === "revenue" || reportKind === "expense" || reportKind === "asset";
  const { data: categoryFinance = [] } = trpc.platform.finance.list.useQuery(categoryRangeInput, { enabled: reportKind === "stream" });
  const { data: categoryData } = trpc.platform.finance.categoryReport.useQuery({ kind: (isCategoryKind ? reportKind : "expense") as "expense" | "revenue" | "asset", categoryId: Number(reportKeyValue) || 1, ...categoryRangeInput }, { enabled: isCategoryKind && Number(reportKeyValue) > 0 });
  const categoryReport = useMemo(() => {
    if (!categoryReportKey) return null;
    if (reportKind === "stream") {
      const rows = (categoryFinance as any[]).filter((entry) => entry.type === "revenue" && entry.stream === reportKeyValue);
      return { title: `${streamLabel(reportKeyValue)} — ${t("reports.revenueReportSuffix")}`, includesSubs: false, total: rows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), paid: rows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), balance: 0, rows: rows.map((entry) => ({ date: isoDate(entry.date), categoryName: streamLabel(entry.stream), description: entry.description || t("reports.revenueFallback"), amount: entry.amount, paidAmount: entry.amount, balanceAmount: "0.000" })) };
    }
    const list = (reportKind === "revenue" ? revenueCategories : reportKind === "expense" ? expenseCategories : assetCategories) as any[];
    const category = list.find((entry) => entry.id === Number(reportKeyValue));
    const suffix = reportKind === "revenue" ? t("reports.revenueReportSuffix") : reportKind === "expense" ? t("reports.expenseReportSuffix") : t("reports.capexReportSuffix");
    const rows = (categoryData?.rows ?? []) as any[];
    return { title: `${category?.name || t("reports.categoryFallback")} — ${suffix}`, includesSubs: (categoryData?.categoryIds?.length ?? 0) > 1, total: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0), paid: rows.reduce((sum, row) => sum + Number(row.paidAmount || 0), 0), balance: rows.reduce((sum, row) => sum + Number(row.balanceAmount || 0), 0), rows };
  }, [categoryReportKey, reportKind, reportKeyValue, categoryFinance, categoryData, revenueCategories, expenseCategories, assetCategories, t]);
  const assetPaidTotal = (assetRecords as any[]).reduce((sum, entry) => sum + Number(entry.paidAmount ?? entry.amount ?? 0), 0);
  const assetBalanceTotal = (assetRecords as any[]).reduce((sum, entry) => sum + Number(entry.balanceAmount || 0), 0);
  const generatedRows = () => csvReportHeaderRows(t("cc.reportGenerated"), t("cc.reportGeneratedBy"), user?.name || "—");
  const exportDetail = (type: "revenue" | "expense") => exportCsv(`marasi-${type}-transactions-${from}-to-${to}.xlsx`, [...generatedRows(), ["Date", "Stream", "Category", "Description", "Total (OMR)", "Paid (OMR)", "Balance (OMR)"], ...detailRows[type].map((row) => [row.date, row.stream, row.category, row.description, amountCell(row.amount), amountCell(row.paid), amountCell(row.balance)]), [], ["Total", "", "", "", amountCell(detailRows[type].reduce((sum, row) => sum + row.amount, 0)), amountCell(detailRows[type].reduce((sum, row) => sum + row.paid, 0)), amountCell(detailRows[type].reduce((sum, row) => sum + row.balance, 0))]]);
  const accountRows = (status: any) => [
    { label: t("reports.bankAccount"), ...status.accounts.bank },
    { label: t("reports.cashAccount"), ...status.accounts.cash },
  ] as Array<{ label: string; openingBalance: number; moneyIn: number; moneyOut: number; added: number; deducted: number; closingBalance: number }>;
  const movementAccount = (row: any) => {
    const total = Number(row.inAmount || 0) + Number(row.outAmount || 0);
    const bank = Number(row.bankIn || 0) + Number(row.bankOut || 0);
    if (total <= 0) return "";
    if (bank <= 0.0005) return t("reports.cashShort");
    if (total - bank <= 0.0005) return t("reports.bankShort");
    return t("reports.mixedShort", { bank: money(bank), cash: money(total - bank) });
  };
  const exportCashFlow = () => cashFlow && exportCsv(`marasi-cash-flow-${from}-to-${to}.xlsx`, [...generatedRows(), ["Cash Flow Status", `${from} to ${to}`], [], ["Opening balance", amountCell(cashFlow.openingBalance)], ["Cash in — Tickets", amountCell(cashFlow.inflows.tickets)], ["Cash in — Facilities", amountCell(cashFlow.inflows.facilities)], ["Cash in — Other revenue", amountCell(cashFlow.inflows.otherRevenue)], ["Cash out — Operating expenses (paid)", amountCell(cashFlow.outflows.expenses)], ["Cash out — Capital expenditure (paid)", amountCell(cashFlow.outflows.capex)], ["Adjustments added", amountCell(cashFlow.adjustments.added)], ["Adjustments deducted", amountCell(cashFlow.adjustments.deducted)], ["Closing balance", amountCell(cashFlow.closingBalance)], [],
    ["Account", "Opening balance", "In", "Out", "Adjustments", "Closing balance"], ...accountRows(cashFlow).map((row) => [row.label, amountCell(row.openingBalance), amountCell(row.moneyIn), amountCell(-row.moneyOut), amountCell(row.added - row.deducted), amountCell(row.closingBalance)]),
    ["Account Receivable", amountCell(cashFlow.receivable.total)], ["Account Payable", amountCell(cashFlow.payable.total)], [], ["Date", "Type", "Description", "Account", "In (OMR)", "Out (OMR)"], ...cashFlow.movements.map((row: any) => [row.date, t(CASH_KIND_KEYS[row.kind]), row.description, movementAccount(row), row.inAmount ? amountCell(row.inAmount) : "", row.outAmount ? amountCell(row.outAmount) : ""])]);
  return <><PageHeader eyebrow={t("reports.eyebrow")} title={t("finance.revenueVsExpenses")} description={t("reports.description")} actions={<><StatusPill tone="info">{t("reports.selectedPeriod")}</StatusPill><SecondaryButton onClick={() => printAs("summary")}><Printer size={14} className="mr-2"/>{t("reports.print")}</SecondaryButton><SecondaryButton onClick={() => printAs("revenue")}><FileText size={14} className="mr-2"/>{t("reports.fullRevenuePdf")}</SecondaryButton><SecondaryButton onClick={() => printAs("expense")}><FileText size={14} className="mr-2"/>{t("reports.fullExpensePdf")}</SecondaryButton><SecondaryButton onClick={() => exportCsv(`marasi-financial-status-${from}-to-${to}.xlsx`, [...generatedRows(), ["Type", "Stream", "Amount (OMR)"], ...revenueRows.map((row: any) => ["Revenue", streamLabel(row.stream), amountCell(row.total)]), ...expenseRows.map((row: any) => ["Expense", streamLabel(row.stream), amountCell(row.total)]), [], ["Revenue", "", amountCell(totals.revenue)], ["Expenses", "", amountCell(totals.expenses)], ["Net", "", amountCell(totals.net)]])}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></>}/><Surface tone="tinted"><div className="flex flex-wrap items-end gap-4"><Field label={t("common.from")}><DateField value={from} onChange={setFrom}/></Field><Field label={t("common.to")}><DateField value={to} openToMonthOf={from} onChange={setTo}/></Field><div className="flex items-center gap-2 pb-2 text-xs text-body"><CalendarDays size={15} className="text-accent"/>{t("reports.summaryUsesSelectedPeriod")}</div></div></Surface>{isLoading ? <div className="mt-6"><LoadingState label={t("reports.loadingSummary")}/></div> : <><div className="mt-6 grid gap-4 md:grid-cols-3"><button type="button" title={t("reports.clickForTransactions")} onClick={() => setTransactionsView("revenue")} className="rounded-[22px] text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"><MetricCard icon={TrendingUp} label={t("finance.revenue")} value={money(totals.revenue)} detail={`${revenueRows.length} ${revenueRows.length === 1 ? t("reports.revenueStream") : t("reports.revenueStreams")}`} tone="green"/></button><button type="button" title={t("reports.clickForTransactions")} onClick={() => setTransactionsView("expense")} className="rounded-[22px] text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"><MetricCard icon={TrendingDown} label={t("finance.expenses")} value={money(totals.expenses)} detail={`${expenseRows.length} ${expenseRows.length === 1 ? t("reports.expenseStream") : t("reports.expenseStreams")}`} tone="amber"/></button><MetricCard icon={totals.net >= 0 ? TrendingUp : TrendingDown} label={t("overview.net")} value={money(totals.net)} detail={totals.net >= 0 ? t("reports.positiveResult") : t("finance.reviewSpending")} tone={totals.net >= 0 ? "blue" : "red"}/></div><div className="mt-6 grid gap-6 xl:grid-cols-2"><Stream title={t("reports.revenueActivity")} description={t("reports.revenueActivityHint")} tone="success" revenueLabel={t("finance.revenue")} expenseLabel={t("finance.expenses")}>{revenueRows.length ? revenueRows.map((row: any) => <div key={`${row.stream}-${row.type}`} className="flex items-center justify-between gap-3 py-3"><span className="text-sm capitalize">{row.stream && REVENUE_STREAM_KEYS[row.stream] ? t(REVENUE_STREAM_KEYS[row.stream]) : (row.stream || t("reports.ticketWord")).replaceAll("_", " ")}</span><b>{money(row.total)}</b></div>) : <EmptyState title={t("reports.noRevenueRecords")} description={t("reports.noRevenueRecordsHint")}/>}</Stream><Stream title={t("reports.expenseActivity")} description={t("reports.expenseActivityHint")} tone="warning" revenueLabel={t("finance.revenue")} expenseLabel={t("finance.expenses")}>{expenseRows.length ? expenseRows.map((row: any) => <div key={`${row.stream}-${row.type}`} className="flex items-center justify-between gap-3 py-3"><span className="text-sm capitalize">{row.stream && REVENUE_STREAM_KEYS[row.stream] ? t(REVENUE_STREAM_KEYS[row.stream]) : (row.stream || t("reports.expenseWord")).replaceAll("_", " ")}</span><b className="text-danger">−{money(row.total)}</b></div>) : <EmptyState title={t("reports.noExpenseRecords")} description={t("reports.noExpenseRecordsHint")}/>}</Stream></div>
      <p className="mt-3 text-xs text-subtle">{t("reports.clickForTransactions")}</p>
      <Surface className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("reports.cashFlowTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("reports.cashFlowHint")}</p></div>
          <div className="flex flex-wrap items-center gap-2"><SecondaryButton onClick={() => setShowCashMovements((current) => !current)}>{showCashMovements ? t("reports.hideMovements") : t("reports.showMovements")}</SecondaryButton><SecondaryButton onClick={() => printAs("cashflow")}><FileText size={14} className="mr-2"/>PDF</SecondaryButton><SecondaryButton onClick={exportCashFlow}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></div>
        </div>
        {cashFlowLoading || !cashFlow ? <div className="mt-4"><LoadingState label={t("reports.loadingSummary")}/></div> : <>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <MetricCard icon={Wallet} label={t("reports.openingBalance")} value={money(cashFlow.openingBalance)} detail={t("reports.openingBalanceHint")} tone="blue"/>
            <MetricCard icon={TrendingUp} label={t("reports.cashIn")} value={money(cashFlow.inflows.total)} detail={t("reports.cashInHint")} tone="green"/>
            <MetricCard icon={TrendingDown} label={t("reports.cashOut")} value={money(cashFlow.outflows.total)} detail={t("reports.cashOutHint")} tone="amber"/>
            <MetricCard icon={Wallet} label={t("reports.closingBalance")} value={money(cashFlow.closingBalance)} detail={t("reports.closingBalanceHint")} tone={cashFlow.closingBalance >= 0 ? "blue" : "red"}/>
          </div>
          {/* PRD Round 17, items 5.1/5.2: where the money sits at the end of the
              period — the Bank and Cash ledgers, plus what is still owed to
              the resort (Receivable) and by it (Payable). */}
          <div className="mt-6 text-[10px] font-semibold uppercase tracking-[.16em] text-subtle">{t("reports.positionAt", { date: dateLabel(to) })}</div>
          <div className="mt-3 grid gap-4 md:grid-cols-4">
            <MetricCard icon={Landmark} label={t("reports.bankAccount")} value={money(cashFlow.accounts.bank.closingBalance)} detail={t("reports.bankAccountHint")} tone="blue"/>
            <MetricCard icon={Banknote} label={t("reports.cashAccount")} value={money(cashFlow.accounts.cash.closingBalance)} detail={t("reports.cashAccountHint")} tone="green"/>
            <MetricCard icon={TrendingUp} label={t("reports.accountReceivable")} value={money(cashFlow.receivable.total)} detail={t("reports.accountReceivableHint", { count: cashFlow.receivable.count })} tone="amber"/>
            <MetricCard icon={TrendingDown} label={t("reports.accountPayable")} value={money(cashFlow.payable.total)} detail={t("reports.accountPayableHint", { count: cashFlow.payable.count })} tone="red"/>
          </div>
          <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[1fr_.7fr_.7fr_.7fr_.7fr_.8fr] gap-3"><span>{t("reports.accountCol")}</span><span className="text-right">{t("reports.openingBalance")}</span><span className="text-right">{t("reports.inCol")}</span><span className="text-right">{t("reports.outCol")}</span><span className="text-right">{t("reports.adjustmentsCol")}</span><span className="text-right">{t("reports.closingBalance")}</span></div></TableHeader>{accountRows(cashFlow).map((row) => <TableRow key={row.label} className="grid-cols-[1fr_.7fr_.7fr_.7fr_.7fr_.8fr]"><b className="text-sm">{row.label}</b><span className="text-right text-xs">{money(row.openingBalance)}</span><span className="text-right text-xs text-success">{money(row.moneyIn)}</span><span className="text-right text-xs text-danger">−{money(row.moneyOut)}</span><span className="text-right text-xs">{money(row.added - row.deducted)}</span><b className="text-right text-sm">{money(row.closingBalance)}</b></TableRow>)}</TableFrame>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div className="divide-y divide-divider text-sm">
              <div className="flex justify-between py-2.5"><span>{t("reports.cashInTickets")}</span><b className="text-success">{money(cashFlow.inflows.tickets)}</b></div>
              <div className="flex justify-between py-2.5"><span>{t("reports.cashInFacilities")}</span><b className="text-success">{money(cashFlow.inflows.facilities)}</b></div>
              <div className="flex justify-between py-2.5"><span>{t("reports.cashInOther")}</span><b className="text-success">{money(cashFlow.inflows.otherRevenue)}</b></div>
              {cashFlow.adjustments.added > 0 && <div className="flex justify-between py-2.5"><span>{t("reports.cashAdjAdded")}</span><b className="text-success">{money(cashFlow.adjustments.added)}</b></div>}
            </div>
            <div className="divide-y divide-divider text-sm">
              <div className="flex justify-between py-2.5"><span>{t("reports.cashOutExpenses")}</span><b className="text-danger">−{money(cashFlow.outflows.expenses)}</b></div>
              <div className="flex justify-between py-2.5"><span>{t("reports.cashOutCapex")}</span><b className="text-danger">−{money(cashFlow.outflows.capex)}</b></div>
              {cashFlow.adjustments.deducted > 0 && <div className="flex justify-between py-2.5"><span>{t("reports.cashAdjDeducted")}</span><b className="text-danger">−{money(cashFlow.adjustments.deducted)}</b></div>}
            </div>
          </div>
          {showCashMovements && (cashFlow.movements.length ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[.7fr_.9fr_1.6fr_.6fr_.6fr_.6fr] gap-3"><span>{t("common.date")}</span><span>{t("reports.typeCol")}</span><span>{t("common.description")}</span><span>{t("reports.accountCol")}</span><span className="text-right">{t("reports.inCol")}</span><span className="text-right">{t("reports.outCol")}</span></div></TableHeader>{cashFlow.movements.map((row: any, index: number) => <TableRow key={index} className="grid-cols-[.7fr_.9fr_1.6fr_.6fr_.6fr_.6fr]"><span className="text-xs text-muted">{dateLabel(row.date)}</span><span className="truncate text-xs">{t(CASH_KIND_KEYS[row.kind])}</span><span className="truncate text-sm">{row.description || "—"}</span><span className="truncate text-xs text-muted">{movementAccount(row)}</span><span className="text-right text-xs text-success">{row.inAmount ? money(row.inAmount) : ""}</span><span className="text-right text-xs text-danger">{row.outAmount ? money(row.outAmount) : ""}</span></TableRow>)}</TableFrame> : <EmptyState title={t("reports.noRecordsInPeriod")} description={t("reports.noCashMovements")}/>)}
        </>}
      </Surface>
      <Surface className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("reports.facilitiesByCategory")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("reports.facilitiesByCategoryHint")}</p></div>
          <div className="flex flex-wrap items-center gap-2"><SelectField value={facilityCategoryFilter} onChange={(event) => setFacilityCategoryFilter(event.target.value)} className="w-56"><option value="">{t("reports.allFacilityCategories")}</option>{orderCategoriesAsTree(facilityCategoryOptions as any[]).map((entry: any) => <option key={entry.id} value={entry.id}>{categoryOptionLabel(entry)}</option>)}</SelectField><SecondaryButton onClick={() => printAs("facilities")}><FileText size={14} className="mr-2"/>PDF</SecondaryButton></div>
        </div>
        {facilityReport && (facilityReport.rows.length ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[1fr_1fr_1.2fr_.5fr_.7fr_.7fr] gap-3"><span>{t("reports.mainCategoryCol")}</span><span>{t("reports.subCategoryCol")}</span><span>{t("reports.facilityCol")}</span><span className="text-right">{t("reports.bookingsCol")}</span><span className="text-right">{t("reports.paidCol")}</span><span className="text-right">{t("reports.unpaidCol")}</span></div></TableHeader>{facilityReport.rows.map((row: any) => <TableRow key={row.facilityTypeId} className="grid-cols-[1fr_1fr_1.2fr_.5fr_.7fr_.7fr]"><span className="truncate text-xs">{row.mainCategoryName || t("reports.uncategorised")}</span><span className="truncate text-xs text-muted">{row.subCategoryName || "—"}</span><b className="truncate text-sm font-medium">{row.facilityTypeName}</b><span className="text-right text-xs">{row.bookings}</span><span className="text-right text-xs text-success">{money(row.paidAmount)}</span><span className="text-right text-xs text-warning">{money(row.unpaidAmount)}</span></TableRow>)}<TableRow className="grid-cols-[1fr_1fr_1.2fr_.5fr_.7fr_.7fr]"><b className="text-xs">{t("reports.totalRow")}</b><span/><span/><b className="text-right text-xs">{facilityReport.totals.bookings}</b><b className="text-right text-xs text-success">{money(facilityReport.totals.paidAmount)}</b><b className="text-right text-xs text-warning">{money(facilityReport.totals.unpaidAmount)}</b></TableRow></TableFrame> : <p className="mt-4 text-xs text-muted">{t("reports.noFacilitiesInFilter")}</p>)}
      </Surface>
      <Surface className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("reports.ticketRevenueByType")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("reports.ticketRevenueByTypeHint")}</p></div>
          <div className="flex items-center gap-3"><b className="text-lg">{money(ticketRevenueTotal)}</b><SecondaryButton onClick={() => setShowTicketBreakdown((current) => !current)}>{showTicketBreakdown ? t("reports.hideBreakdown") : t("reports.showBreakdown")}</SecondaryButton></div>
        </div>
        {showTicketBreakdown && <>
          {(ticketRevenue as any[]).length > 1 && <div className="mt-4 max-w-xs"><TextField value={ticketTypeFilter} onChange={(event) => setTicketTypeFilter(event.target.value)} placeholder={t("reports.filterByType")}/></div>}
          {filteredTicketRevenue.length
            ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[1.3fr_.5fr_.7fr_.7fr] gap-3"><span>{t("tickets.ticketType")}</span><span className="text-right">{t("reports.ticketsSoldCol")}</span><span className="text-right">{t("tickets.groupDiscount")}</span><span className="text-right">{t("finance.amountCol")}</span></div></TableHeader>{filteredTicketRevenue.map((row: any) => <TableRow key={`${row.ticketTypeId ?? "legacy"}`} className="grid-cols-[1.3fr_.5fr_.7fr_.7fr]"><span className="min-w-0"><span className="block truncate text-sm font-medium">{row.ticketTypeName}</span><span className="mt-0.5 block text-xs text-muted">{row.ticketGroup === "other_tickets" ? t("tickets.otherTickets") : t("reports.groupWaterPark")}</span></span><span className="text-right text-sm">{row.ticketCount}</span><span className="text-right text-xs text-muted">−{money(row.discountAmount)}</span><b className="text-right text-sm">{money(row.totalAmount)}</b></TableRow>)}</TableFrame>
            : <EmptyState title={t("reports.noRecordsInPeriod")} description={t("reports.noTicketRevenueInPeriod")}/>}
        </>}
      </Surface>
      <Surface className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("reports.facilityRevenueByType")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("reports.facilityRevenueByTypeHint")}</p></div>
          <div className="flex items-center gap-3"><b className="text-lg">{money(facilityRevenueTotal)}</b><SecondaryButton onClick={() => setShowFacilityBreakdown((current) => !current)}>{showFacilityBreakdown ? t("reports.hideBreakdown") : t("reports.showBreakdown")}</SecondaryButton></div>
        </div>
        {showFacilityBreakdown && <>
          {(facilityRevenue as any[]).length > 1 && <div className="mt-4 max-w-xs"><TextField value={facilityTypeFilter} onChange={(event) => setFacilityTypeFilter(event.target.value)} placeholder={t("reports.filterByType")}/></div>}
          {filteredFacilityRevenue.length
            ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[1.3fr_.7fr_.7fr] gap-3"><span>{t("settings.tabFacilityTypes")}</span><span className="text-right">{t("reports.bookingsCol")}</span><span className="text-right">{t("finance.amountCol")}</span></div></TableHeader>{filteredFacilityRevenue.map((row: any) => <TableRow key={row.facilityTypeId} className="grid-cols-[1.3fr_.7fr_.7fr]"><span className="truncate text-sm font-medium">{row.facilityTypeName}</span><span className="text-right text-sm">{row.bookingCount}</span><b className="text-right text-sm">{money(row.totalAmount)}</b></TableRow>)}</TableFrame>
            : <EmptyState title={t("reports.noRecordsInPeriod")} description={t("reports.noFacilityRevenueInPeriod")}/>}
        </>}
      </Surface>
      <Surface className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.singleCategoryReport")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("reports.singleCategoryReportHintReal")}</p></div><FileSearch size={19} className="text-accent"/></div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="max-w-sm flex-1"><Field label={t("finance.reportOn")}><SelectField value={categoryReportKey} onChange={(event) => setCategoryReportKey(event.target.value)}>
            <option value="">{t("reports.chooseRevenueOrExpense")}</option>
            <optgroup label={t("reports.revenueStreamsGroup")}>{Object.entries(REVENUE_STREAM_KEYS).map(([key, labelKey]) => <option key={key} value={`stream:${key}`}>{t(labelKey)}</option>)}</optgroup>
            <optgroup label={t("reports.revenueCategoriesGroup")}>{orderCategoriesAsTree(revenueCategories as any[]).map((category) => <option key={category.id} value={`revenue:${category.id}`}>{categoryOptionLabel(category)}</option>)}</optgroup>
            <optgroup label={t("reports.expenseCategoriesGroup")}>{orderCategoriesAsTree(expenseCategories as any[]).map((category) => <option key={category.id} value={`expense:${category.id}`}>{categoryOptionLabel(category)}</option>)}</optgroup>
            <optgroup label={t("reports.capexCategoriesGroup")}>{orderCategoriesAsTree(assetCategories as any[]).map((category) => <option key={category.id} value={`asset:${category.id}`}>{categoryOptionLabel(category)}</option>)}</optgroup>
          </SelectField></Field></div>
          <Field label={t("common.from")}><DateField value={categoryFrom} onChange={setCategoryFrom}/></Field>
          <Field label={t("common.to")}><DateField value={categoryTo} openToMonthOf={categoryFrom} onChange={setCategoryTo}/></Field>
        </div>
        {categoryReport && <div className="mt-5 border-t border-divider pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-xl tracking-[-.03em]">{categoryReport.title}</h3><p className="mt-1 text-xs text-muted">{categoryReport.rows.length} {categoryReport.rows.length === 1 ? t("reports.recordWord") : t("reports.recordsWord")} · {categoryFrom} {t("reports.toWord")} {categoryTo}{categoryReport.includesSubs ? ` · ${t("reports.includesSubCategories")}` : ""}</p></div><div className="flex items-center gap-3"><div className="text-right"><b className="block text-lg">{money(categoryReport.total)}</b>{categoryReport.balance > 0.0005 && <span className="text-xs text-danger">{t("finance.balanceOwed", { amount: money(categoryReport.balance) })}</span>}</div><SecondaryButton onClick={() => printAs("category")}><FileText size={14} className="mr-2"/>PDF</SecondaryButton><SecondaryButton onClick={() => exportCsv(`marasi-${categoryReportKey.replace(":", "-")}-${categoryFrom}-to-${categoryTo}.xlsx`, [...generatedRows(), [categoryReport.title], ["Date", "Category", "Description", "Total (OMR)", "Paid (OMR)", "Balance (OMR)"], ...categoryReport.rows.map((row: any) => [row.date, row.categoryName, row.description, amountCell(row.amount), amountCell(row.paidAmount), amountCell(row.balanceAmount)]), [], ["Total", "", "", amountCell(categoryReport.total), amountCell(categoryReport.paid), amountCell(categoryReport.balance)]])}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></div></div>
          {categoryReport.rows.length ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[.7fr_.9fr_1.3fr_.6fr_.6fr_.6fr] gap-3"><span>{t("common.date")}</span><span>{t("common.category")}</span><span>{t("common.description")}</span><span className="text-right">{t("finance.totalAmount")}</span><span className="text-right">{t("finance.paidAmount")}</span><span className="text-right">{t("finance.balanceAmount")}</span></div></TableHeader>{categoryReport.rows.map((row: any, index: number) => <TableRow key={index} className="grid-cols-[.7fr_.9fr_1.3fr_.6fr_.6fr_.6fr]"><span className="text-xs text-muted">{dateLabel(row.date)}</span><span className="truncate text-xs">{row.categoryName}</span><span className="truncate text-sm">{row.description}</span><b className="text-right text-sm">{money(row.amount)}</b><span className="text-right text-xs text-success">{money(row.paidAmount)}</span><span className={`text-right text-xs ${Number(row.balanceAmount) > 0.0005 ? "text-danger" : "text-muted"}`}>{money(row.balanceAmount)}</span></TableRow>)}</TableFrame> : <EmptyState title={t("reports.noRecordsInPeriod")} description={t("reports.nothingRecordedForCategory")}/>}
        </div>}
      </Surface>
      <Surface className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.fixedAssetsReport")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.fixedAssetsReportHint")}</p></div><div className="flex gap-2"><SecondaryButton onClick={() => printAs("assets")}><FileText size={14} className="mr-2"/>PDF</SecondaryButton><SecondaryButton onClick={() => exportCsv(`marasi-fixed-assets-${showAllAssets ? "all" : `${assetFrom}-to-${assetTo}`}.xlsx`, [...generatedRows(), ["Asset Tag", "Description", "Category", "Purchase Date", "Total (OMR)", "Paid (OMR)", "Balance (OMR)", "Vendor", "Receipt No.", "Location", "Status", "Useful Life (years)"], ...(assetRecords as any[]).map((entry) => [`AST-${String(entry.id).padStart(6, "0")}`, entry.description, entry.categoryName, isoDate(entry.businessDate), amountCell(entry.amount), amountCell(entry.paidAmount ?? entry.amount), amountCell(entry.balanceAmount), entry.vendor || "", entry.receiptNumber || "", entry.location || "", t(assetStatusReportKeys[entry.status] || "finance.assetStatusActive"), entry.usefulLifeYears != null ? String(entry.usefulLifeYears) : ""]), [], ["Total", "", "", "", amountCell(assetRunningTotal), amountCell(assetPaidTotal), amountCell(assetBalanceTotal)]])}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></div></div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <Field label={t("common.from")}><DateField value={assetFrom} onChange={setAssetFromNarrow}/></Field>
          <Field label={t("common.to")}><DateField value={assetTo} openToMonthOf={assetFrom} onChange={setAssetToNarrow}/></Field>
          <SecondaryButton onClick={() => setShowAllAssets(true)}>{t("common.showAll")}</SecondaryButton>
          <div className="flex items-center gap-2 pb-2 text-xs text-body"><CalendarDays size={15} className="text-accent"/>{t("finance.fixedAssetsRunningTotal")}: <b className="text-ink">{money(assetRunningTotal)}</b>{showAllAssets && <span className="text-subtle">· {t("finance.showingAllAssets")}</span>}</div>
        </div>
        {(assetRecords as any[]).length ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[.7fr_.9fr_1.1fr_.6fr_.8fr_.7fr] gap-3"><span>{t("finance.assetTag")}</span><span>{t("common.date")}</span><span>{t("common.description")}</span><span className="text-right">{t("finance.amountCol")}</span><span>{t("finance.assetLocation")}</span><span>{t("finance.assetStatus")}</span></div></TableHeader>{(assetRecords as any[]).map((entry: any) => <TableRow key={entry.id} className="grid-cols-[.7fr_.9fr_1.1fr_.6fr_.8fr_.7fr]"><span className="font-mono text-xs text-accent">AST-{String(entry.id).padStart(6, "0")}</span><span className="text-xs text-muted">{dateLabel(entry.businessDate)}</span><span className="min-w-0"><span className="block truncate text-sm">{entry.description}</span><span className="mt-0.5 block truncate text-xs text-muted">{entry.categoryName}{entry.vendor ? ` · ${entry.vendor}` : ""}{entry.usefulLifeYears ? ` · ${entry.usefulLifeYears}y` : ""}</span>{(entry.attachments as any[])?.length ? (entry.attachments as any[]).map((attachment: any) => <a key={attachment.id} href={attachment.path} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs font-medium text-accent hover:underline">{t("finance.viewAttachment")}: {attachment.originalName}</a>) : entry.attachmentPath && <a href={entry.attachmentPath} target="_blank" rel="noreferrer" className="mt-0.5 block text-xs font-medium text-accent hover:underline">{t("finance.viewAttachment")}</a>}</span><b className="text-right text-sm">{money(entry.amount)}</b><span className="truncate text-xs text-muted">{entry.location || "—"}</span><StatusPill tone={entry.status === "disposed" ? "danger" : entry.status === "under_maintenance" ? "warning" : "success"}>{t(assetStatusReportKeys[entry.status] || "finance.assetStatusActive")}</StatusPill></TableRow>)}</TableFrame> : <EmptyState title={t("reports.noRecordsInPeriod")} description={t("finance.noFixedAssetsInPeriod")}/>}
      </Surface>
    </>}

    <ReportDocument title={printMode === "revenue" ? t("reports.fullRevenueReport") : printMode === "expense" ? t("reports.fullExpenseReport") : printMode === "cashflow" ? t("reports.cashFlowTitle") : printMode === "assets" ? t("finance.fixedAssetsReport") : printMode === "category" ? (categoryReport?.title || t("finance.singleCategoryReport")) : printMode === "facilities" ? t("reports.facilitiesByCategory") : t("reports.reportDocTitle")} generatedLabel={t("cc.reportGenerated")} generatedByLabel={t("cc.reportGeneratedBy")} generatedBy={user?.name || "—"}>
      {printMode === "summary" && <>
      <p className="report-sub">{t("reports.reportPeriodLabel")}: {from} — {to}</p>
      <ReportSection title={t("finance.revenueVsExpenses")}>
        <ReportStatGrid><ReportStat label={t("finance.revenue")} value={money(totals.revenue)}/><ReportStat label={t("finance.expenses")} value={money(totals.expenses)}/><ReportStat label={t("overview.net")} value={money(totals.net)}/></ReportStatGrid>
      </ReportSection>
      <ReportSection title={t("reports.revenueActivity")}>{revenueRows.length ? <ReportTable headers={[{ label: t("reports.revenueStreamsGroup") }, { label: t("finance.amountCol"), num: true }]} rows={revenueRows.map((row: any) => [row.stream && REVENUE_STREAM_KEYS[row.stream] ? t(REVENUE_STREAM_KEYS[row.stream]) : String(row.stream || t("reports.ticketWord")).replaceAll("_", " "), money(row.total)])}/> : <p className="report-sub">{t("reports.noRevenueRecords")}</p>}</ReportSection>
      <ReportSection title={t("reports.expenseActivity")}>{expenseRows.length ? <ReportTable headers={[{ label: t("finance.tabCategories") }, { label: t("finance.amountCol"), num: true }]} rows={expenseRows.map((row: any) => [row.stream && REVENUE_STREAM_KEYS[row.stream] ? t(REVENUE_STREAM_KEYS[row.stream]) : String(row.stream || t("reports.expenseWord")).replaceAll("_", " "), money(row.total)])}/> : <p className="report-sub">{t("reports.noExpenseRecords")}</p>}</ReportSection>
      <ReportSection title={t("reports.ticketRevenueByType")}>{(ticketRevenue as any[]).length ? <ReportTable headers={[{ label: t("tickets.ticketType") }, { label: t("reports.ticketsSoldCol"), num: true }, { label: t("finance.amountCol"), num: true }]} rows={(ticketRevenue as any[]).map((row: any) => [row.ticketTypeName, String(row.ticketCount), money(row.totalAmount)])}/> : <p className="report-sub">{t("reports.noTicketRevenueInPeriod")}</p>}</ReportSection>
      <ReportSection title={t("reports.facilityRevenueByType")}>{(facilityRevenue as any[]).length ? <ReportTable headers={[{ label: t("settings.tabFacilityTypes") }, { label: t("reports.bookingsCol"), num: true }, { label: t("finance.amountCol"), num: true }]} rows={(facilityRevenue as any[]).map((row: any) => [row.facilityTypeName, String(row.bookingCount), money(row.totalAmount)])}/> : <p className="report-sub">{t("reports.noFacilityRevenueInPeriod")}</p>}</ReportSection>
      {categoryReport && <ReportSection title={`${t("reports.categoryDetailTitle")}: ${categoryReport.title}`}>{categoryReport.rows.length ? <ReportTable headers={[{ label: t("common.date") }, { label: t("common.description") }, { label: t("finance.amountCol"), num: true }]} rows={categoryReport.rows.map((row) => [dateLabel(row.date), row.description, money(row.amount)])}/> : <p className="report-sub">{t("reports.nothingRecordedForCategory")}</p>}</ReportSection>}
      <ReportSection title={t("finance.fixedAssetsReport")}>
        <ReportStatGrid><ReportStat label={t("finance.fixedAssetsRunningTotal")} value={money(assetRunningTotal)}/></ReportStatGrid>
        {(assetRecords as any[]).length ? <ReportTable headers={[{ label: t("finance.assetTag") }, { label: t("common.date") }, { label: t("common.description") }, { label: t("finance.amountCol"), num: true }, { label: t("finance.assetLocation") }, { label: t("finance.assetStatus") }]} rows={(assetRecords as any[]).map((entry: any) => [`AST-${String(entry.id).padStart(6, "0")}`, dateLabel(entry.businessDate), entry.description, money(entry.amount), entry.location || "—", t(assetStatusReportKeys[entry.status] || "finance.assetStatusActive")])}/> : <p className="report-sub">{t("finance.noFixedAssetsInPeriod")}</p>}
      </ReportSection>
      <ReportSection title={t("reports.cashFlowTitle")}>{cashFlow ? <>
          <ReportStatGrid><ReportStat label={t("reports.openingBalance")} value={money(cashFlow.openingBalance)}/><ReportStat label={t("reports.cashIn")} value={money(cashFlow.inflows.total)}/><ReportStat label={t("reports.cashOut")} value={money(cashFlow.outflows.total)}/><ReportStat label={t("reports.closingBalance")} value={money(cashFlow.closingBalance)}/></ReportStatGrid>
          <ReportTable headers={[{ label: t("reports.lineCol") }, { label: t("finance.amountCol"), num: true }]} rows={[[t("reports.openingBalance"), money(cashFlow.openingBalance)], [t("reports.cashInTickets"), money(cashFlow.inflows.tickets)], [t("reports.cashInFacilities"), money(cashFlow.inflows.facilities)], [t("reports.cashInOther"), money(cashFlow.inflows.otherRevenue)], [t("reports.cashOutExpenses"), `−${money(cashFlow.outflows.expenses)}`], [t("reports.cashOutCapex"), `−${money(cashFlow.outflows.capex)}`], [t("reports.cashAdjAdded"), money(cashFlow.adjustments.added)], [t("reports.cashAdjDeducted"), `−${money(cashFlow.adjustments.deducted)}`], [t("reports.closingBalance"), money(cashFlow.closingBalance)]]}/>
        </> : <p className="report-sub">{t("reports.loadingSummary")}</p>}</ReportSection>
      </>}
      {printMode === "revenue" && <>
        <p className="report-sub">{t("reports.reportPeriodLabel")}: {from} — {to}</p>
        <ReportSection title={t("finance.revenue")}><ReportStatGrid><ReportStat label={t("finance.totalAmount")} value={money(totals.revenue)}/><ReportStat label={t("reports.transactionsWord")} value={String(detailRows.revenue.length)}/></ReportStatGrid></ReportSection>
        <ReportSection title={t("reports.revenueActivity")}>{revenueRows.length ? <ReportTable headers={[{ label: t("reports.revenueStreamsGroup") }, { label: t("finance.amountCol"), num: true }]} rows={revenueRows.map((row: any) => [streamLabel(row.stream), money(row.total)])}/> : <p className="report-sub">{t("reports.noRevenueRecords")}</p>}</ReportSection>
        <ReportSection title={t("reports.ticketRevenueByType")}>{(ticketRevenue as any[]).length ? <ReportTable headers={[{ label: t("tickets.ticketType") }, { label: t("reports.ticketsSoldCol"), num: true }, { label: t("finance.amountCol"), num: true }]} rows={(ticketRevenue as any[]).map((row: any) => [row.ticketTypeName, String(row.ticketCount), money(row.totalAmount)])}/> : <p className="report-sub">{t("reports.noTicketRevenueInPeriod")}</p>}</ReportSection>
        <ReportSection title={t("reports.facilityRevenueByType")}>{(facilityRevenue as any[]).length ? <ReportTable headers={[{ label: t("settings.tabFacilityTypes") }, { label: t("reports.bookingsCol"), num: true }, { label: t("finance.amountCol"), num: true }]} rows={(facilityRevenue as any[]).map((row: any) => [row.facilityTypeName, String(row.bookingCount), money(row.totalAmount)])}/> : <p className="report-sub">{t("reports.noFacilityRevenueInPeriod")}</p>}</ReportSection>
        <ReportSection title={t("reports.allTransactions")}>{detailRows.revenue.length ? <ReportTable headers={[{ label: t("common.date") }, { label: t("reports.streamCol") }, { label: t("common.category") }, { label: t("common.description") }, { label: t("finance.totalAmount"), num: true }, { label: t("finance.paidAmount"), num: true }, { label: t("finance.balanceAmount"), num: true }]} rows={[...detailRows.revenue.map((row) => [dateLabel(row.date), row.stream, row.category, row.description, money(row.amount), money(row.paid), money(row.balance)]), ["", "", "", t("reports.totalRow"), money(detailRows.revenue.reduce((sum, row) => sum + row.amount, 0)), money(detailRows.revenue.reduce((sum, row) => sum + row.paid, 0)), money(detailRows.revenue.reduce((sum, row) => sum + row.balance, 0))]]}/> : <p className="report-sub">{t("reports.noRevenueRecords")}</p>}</ReportSection>
      </>}
      {printMode === "expense" && <>
        <p className="report-sub">{t("reports.reportPeriodLabel")}: {from} — {to}</p>
        <ReportSection title={t("finance.expenses")}><ReportStatGrid><ReportStat label={t("finance.totalAmount")} value={money(totals.expenses)}/><ReportStat label={t("finance.paidAmount")} value={money(detailRows.expense.reduce((sum, row) => sum + row.paid, 0))}/><ReportStat label={t("finance.balanceAmount")} value={money(detailRows.expense.reduce((sum, row) => sum + row.balance, 0))}/><ReportStat label={t("reports.transactionsWord")} value={String(detailRows.expense.length)}/></ReportStatGrid></ReportSection>
        <ReportSection title={t("reports.expenseActivity")}>{expenseRows.length ? <ReportTable headers={[{ label: t("finance.tabCategories") }, { label: t("finance.amountCol"), num: true }]} rows={expenseRows.map((row: any) => [streamLabel(row.stream), money(row.total)])}/> : <p className="report-sub">{t("reports.noExpenseRecords")}</p>}</ReportSection>
        <ReportSection title={t("reports.byCategory")}>{detailRows.expense.length ? <ReportTable headers={[{ label: t("common.category") }, { label: t("finance.amountCol"), num: true }]} rows={Object.entries(detailRows.expense.reduce<Record<string, number>>((acc, row) => { acc[row.category] = (acc[row.category] || 0) + row.amount; return acc; }, {})).sort((a, b) => b[1] - a[1]).map(([name, total]) => [name, money(total)])}/> : <p className="report-sub">{t("reports.noExpenseRecords")}</p>}</ReportSection>
        <ReportSection title={t("reports.allTransactions")}>{detailRows.expense.length ? <ReportTable headers={[{ label: t("common.date") }, { label: t("reports.streamCol") }, { label: t("common.category") }, { label: t("common.description") }, { label: t("finance.totalAmount"), num: true }, { label: t("finance.paidAmount"), num: true }, { label: t("finance.balanceAmount"), num: true }]} rows={[...detailRows.expense.map((row) => [dateLabel(row.date), row.stream, row.category, row.description, money(row.amount), money(row.paid), money(row.balance)]), ["", "", "", t("reports.totalRow"), money(detailRows.expense.reduce((sum, row) => sum + row.amount, 0)), money(detailRows.expense.reduce((sum, row) => sum + row.paid, 0)), money(detailRows.expense.reduce((sum, row) => sum + row.balance, 0))]]}/> : <p className="report-sub">{t("reports.noExpenseRecords")}</p>}</ReportSection>
      </>}
      {printMode === "cashflow" && <>
        <p className="report-sub">{t("reports.reportPeriodLabel")}: {from} — {to}</p>
        <ReportSection title={t("reports.cashFlowTitle")}>{cashFlow ? <>
          <ReportStatGrid><ReportStat label={t("reports.openingBalance")} value={money(cashFlow.openingBalance)}/><ReportStat label={t("reports.cashIn")} value={money(cashFlow.inflows.total)}/><ReportStat label={t("reports.cashOut")} value={money(cashFlow.outflows.total)}/><ReportStat label={t("reports.closingBalance")} value={money(cashFlow.closingBalance)}/></ReportStatGrid>
          <ReportTable headers={[{ label: t("reports.lineCol") }, { label: t("finance.amountCol"), num: true }]} rows={[[t("reports.openingBalance"), money(cashFlow.openingBalance)], [t("reports.cashInTickets"), money(cashFlow.inflows.tickets)], [t("reports.cashInFacilities"), money(cashFlow.inflows.facilities)], [t("reports.cashInOther"), money(cashFlow.inflows.otherRevenue)], [t("reports.cashOutExpenses"), `−${money(cashFlow.outflows.expenses)}`], [t("reports.cashOutCapex"), `−${money(cashFlow.outflows.capex)}`], [t("reports.cashAdjAdded"), money(cashFlow.adjustments.added)], [t("reports.cashAdjDeducted"), `−${money(cashFlow.adjustments.deducted)}`], [t("reports.closingBalance"), money(cashFlow.closingBalance)]]}/>
          <ReportStatGrid><ReportStat label={t("reports.bankAccount")} value={money(cashFlow.accounts.bank.closingBalance)}/><ReportStat label={t("reports.cashAccount")} value={money(cashFlow.accounts.cash.closingBalance)}/><ReportStat label={t("reports.accountReceivable")} value={money(cashFlow.receivable.total)}/><ReportStat label={t("reports.accountPayable")} value={money(cashFlow.payable.total)}/></ReportStatGrid>
          <ReportTable headers={[{ label: t("reports.accountCol") }, { label: t("reports.openingBalance"), num: true }, { label: t("reports.inCol"), num: true }, { label: t("reports.outCol"), num: true }, { label: t("reports.adjustmentsCol"), num: true }, { label: t("reports.closingBalance"), num: true }]} rows={accountRows(cashFlow).map((row) => [row.label, money(row.openingBalance), money(row.moneyIn), `−${money(row.moneyOut)}`, money(row.added - row.deducted), money(row.closingBalance)])}/>
        </> : <p className="report-sub">{t("reports.loadingSummary")}</p>}</ReportSection>
        {cashFlow && cashFlow.movements.length > 0 && <ReportSection title={t("reports.cashMovements")}><ReportTable headers={[{ label: t("common.date") }, { label: t("reports.typeCol") }, { label: t("common.description") }, { label: t("reports.accountCol") }, { label: t("reports.inCol"), num: true }, { label: t("reports.outCol"), num: true }]} rows={cashFlow.movements.map((row: any) => [dateLabel(row.date), t(CASH_KIND_KEYS[row.kind]), row.description || "—", movementAccount(row), row.inAmount ? money(row.inAmount) : "", row.outAmount ? money(row.outAmount) : ""])}/></ReportSection>}
        {cashFlow && <ReportSection title={`${t("reports.accountReceivable")} — ${t("reports.positionAt", { date: dateLabel(to) })}`}>{cashFlow.receivable.rows.length ? <ReportTable headers={[{ label: t("common.date") }, { label: t("common.category") }, { label: t("common.description") }, { label: t("finance.totalAmount"), num: true }, { label: t("reports.outstandingCol"), num: true }]} rows={cashFlow.receivable.rows.map((row: any) => [dateLabel(row.businessDate), row.categoryName, row.description, money(row.amount), money(row.outstanding)])}/> : <p className="report-sub">{t("reports.nothingOutstanding")}</p>}</ReportSection>}
        {cashFlow && <ReportSection title={`${t("reports.accountPayable")} — ${t("reports.positionAt", { date: dateLabel(to) })}`}>{cashFlow.payable.rows.length ? <ReportTable headers={[{ label: t("common.date") }, { label: t("common.category") }, { label: t("common.description") }, { label: t("finance.totalAmount"), num: true }, { label: t("reports.outstandingCol"), num: true }]} rows={cashFlow.payable.rows.map((row: any) => [dateLabel(row.businessDate), row.categoryName, row.description, money(row.amount), money(row.outstanding)])}/> : <p className="report-sub">{t("reports.nothingOutstanding")}</p>}</ReportSection>}
      </>}
      {printMode === "facilities" && facilityReport && <>
        <p className="report-sub">{t("reports.reportPeriodLabel")}: {from} — {to} · {facilityFilterName || t("reports.allFacilityCategories")}</p>
        <ReportSection title={t("reports.facilitiesByCategory")}>{facilityReport.rows.length ? <ReportTable headers={[{ label: t("reports.mainCategoryCol") }, { label: t("reports.subCategoryCol") }, { label: t("reports.facilityCol") }, { label: t("reports.bookingsCol"), num: true }, { label: t("reports.paidCol"), num: true }, { label: t("reports.unpaidCol"), num: true }]} rows={[...facilityReport.rows.map((row: any) => [row.mainCategoryName || t("reports.uncategorised"), row.subCategoryName || "—", row.facilityTypeName, String(row.bookings), money(row.paidAmount), money(row.unpaidAmount)]), [t("reports.totalRow"), "", "", String(facilityReport.totals.bookings), money(facilityReport.totals.paidAmount), money(facilityReport.totals.unpaidAmount)]]}/> : <p className="report-sub">{t("reports.noFacilitiesInFilter")}</p>}</ReportSection>
      </>}
      {printMode === "category" && categoryReport && <>
        <p className="report-sub">{t("reports.reportPeriodLabel")}: {categoryFrom} — {categoryTo}{categoryReport.includesSubs ? ` · ${t("reports.includesSubCategories")}` : ""}</p>
        <ReportSection title={categoryReport.title}><ReportStatGrid><ReportStat label={t("finance.totalAmount")} value={money(categoryReport.total)}/><ReportStat label={t("finance.paidAmount")} value={money(categoryReport.paid)}/><ReportStat label={t("finance.balanceAmount")} value={money(categoryReport.balance)}/></ReportStatGrid>
          {categoryReport.rows.length ? <ReportTable headers={[{ label: t("common.date") }, { label: t("common.category") }, { label: t("common.description") }, { label: t("finance.totalAmount"), num: true }, { label: t("finance.paidAmount"), num: true }, { label: t("finance.balanceAmount"), num: true }]} rows={categoryReport.rows.map((row: any) => [dateLabel(row.date), row.categoryName, row.description, money(row.amount), money(row.paidAmount), money(row.balanceAmount)])}/> : <p className="report-sub">{t("reports.nothingRecordedForCategory")}</p>}
        </ReportSection>
      </>}
      {printMode === "assets" && <>
        <p className="report-sub">{t("reports.reportPeriodLabel")}: {showAllAssets ? t("finance.showingAllAssets") : `${assetFrom} — ${assetTo}`}</p>
        <ReportSection title={t("finance.fixedAssetsReport")}>
          <ReportStatGrid><ReportStat label={t("finance.fixedAssetsRunningTotal")} value={money(assetRunningTotal)}/><ReportStat label={t("finance.paidAmount")} value={money(assetPaidTotal)}/><ReportStat label={t("finance.balanceAmount")} value={money(assetBalanceTotal)}/><ReportStat label={t("reports.assetsCount")} value={String((assetRecords as any[]).length)}/></ReportStatGrid>
          {(assetRecords as any[]).length ? <ReportTable headers={[{ label: t("finance.assetTag") }, { label: t("common.date") }, { label: t("common.description") }, { label: t("common.category") }, { label: t("finance.totalAmount"), num: true }, { label: t("finance.paidAmount"), num: true }, { label: t("finance.balanceAmount"), num: true }, { label: t("finance.assetLocation") }, { label: t("finance.assetStatus") }]} rows={(assetRecords as any[]).map((entry: any) => [`AST-${String(entry.id).padStart(6, "0")}`, dateLabel(entry.businessDate), entry.description, entry.categoryName, money(entry.amount), money(entry.paidAmount ?? entry.amount), money(entry.balanceAmount), entry.location || "—", t(assetStatusReportKeys[entry.status] || "finance.assetStatusActive")])}/> : <p className="report-sub">{t("finance.noFixedAssetsInPeriod")}</p>}
        </ReportSection>
      </>}
      <div className="report-footer">{t("cc.reportFooter")}</div>
    </ReportDocument>

    <Dialog open={Boolean(transactionsView)} onOpenChange={(open) => { if (!open) setTransactionsView(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{transactionsView === "revenue" ? t("reports.revenueTransactions") : t("reports.expenseTransactions")} · {from} — {to}</DialogTitle></DialogHeader>
        {transactionsView && <>
          <div className="flex flex-wrap items-center justify-between gap-3"><b className="text-lg">{money(detailRows[transactionsView].reduce((sum, row) => sum + row.amount, 0))} <span className="text-xs font-normal text-muted">· {detailRows[transactionsView].length} {t("reports.transactionsWord")}</span></b><div className="flex gap-2"><SecondaryButton onClick={() => { const view = transactionsView; setTransactionsView(null); printAs(view); }}><FileText size={14} className="mr-2"/>PDF</SecondaryButton><SecondaryButton onClick={() => exportDetail(transactionsView)}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></div></div>
          {detailRows[transactionsView].length ? <TableFrame><TableHeader><div className="grid grid-cols-[.7fr_.8fr_1.4fr_.6fr_.6fr] gap-3"><span>{t("common.date")}</span><span>{t("common.category")}</span><span>{t("common.description")}</span><span className="text-right">{t("finance.totalAmount")}</span><span className="text-right">{t("finance.balanceAmount")}</span></div></TableHeader>{detailRows[transactionsView].map((row) => <TableRow key={row.id} className="grid-cols-[.7fr_.8fr_1.4fr_.6fr_.6fr]"><span className="text-xs text-muted">{dateLabel(row.date)}</span><span className="truncate text-xs">{row.category}</span><span className="truncate text-sm">{row.description}</span><b className={`text-right text-sm ${transactionsView === "revenue" ? "text-success" : "text-danger"}`}>{money(row.amount)}</b><span className={`text-right text-xs ${row.balance > 0.0005 ? "text-danger" : "text-muted"}`}>{money(row.balance)}</span></TableRow>)}</TableFrame> : <EmptyState title={t("reports.noRecordsInPeriod")} description={transactionsView === "revenue" ? t("reports.noRevenueRecordsHint") : t("reports.noExpenseRecordsHint")}/>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}
