import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Download, FileSearch, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { EmptyState, Field, LoadingState, MetricCard, PageHeader, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";
import { printReport, ReportDocument, ReportSection, ReportStat, ReportStatGrid, ReportTable } from "@/components/PrintableReport";
import { useT, type TranslationKey } from "@/lib/i18n";

const REVENUE_STREAM_KEYS: Record<string, TranslationKey> = { rooms: "reports.streamRooms", aqua_park: "reports.streamAquaPark", fnb: "reports.streamFnb", extras: "reports.streamExtras" };
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const money = (value: unknown) => `OMR ${Number(value ?? 0).toLocaleString("en-OM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function exportCsv(name: string, rows: string[][]) { const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
function Stream({ title, description, tone, revenueLabel, expenseLabel, children }: { title: string; description: string; tone: "success" | "warning"; revenueLabel: string; expenseLabel: string; children: ReactNode }) { return <Surface><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{title}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{description}</p></div><StatusPill tone={tone}>{tone === "success" ? revenueLabel : expenseLabel}</StatusPill></div><div className="mt-5 divide-y divide-divider">{children}</div></Surface>; }

export default function ManagementReportsPage() {
  const t = useT();
  const { user } = useAuth();
  const [from, setFrom] = useState(monthStart); const [to, setTo] = useState(today); const input = { from, to };
  const [categoryReportKey, setCategoryReportKey] = useState("");
  const { data: summary = [], isLoading } = trpc.platform.finance.summary.useQuery(input);
  const { data: finance = [] } = trpc.platform.finance.list.useQuery(input);
  const { data: expenseCategories = [] } = trpc.platform.finance.expenseCategories.list.useQuery({ includeInactive: false });
  const { data: expenses = [] } = trpc.platform.finance.expenses.list.useQuery(input);
  const revenueRows = (summary as any[]).filter((row) => row.type === "revenue"); const expenseRows = (summary as any[]).filter((row) => row.type === "expense");
  const totals = useMemo(() => { const revenue = revenueRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0); const expenses = expenseRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0); return { revenue, expenses, net: revenue - expenses }; }, [revenueRows, expenseRows]);
  const categoryReport = useMemo(() => {
    if (!categoryReportKey) return null;
    const [kind, key] = categoryReportKey.split(":");
    if (kind === "revenue") {
      const rows = (finance as any[]).filter((entry) => entry.type === "revenue" && entry.stream === key);
      const streamLabel = REVENUE_STREAM_KEYS[key] ? t(REVENUE_STREAM_KEYS[key]) : key;
      return { title: `${streamLabel} — ${t("reports.revenueReportSuffix")}`, total: rows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), rows: rows.map((entry) => ({ date: entry.date, description: entry.description || t("reports.revenueFallback"), amount: entry.amount })) };
    }
    const categoryId = Number(key);
    const rows = (expenses as any[]).filter((entry) => Number(entry.categoryId) === categoryId);
    const categoryName = (expenseCategories as any[]).find((entry) => entry.id === categoryId)?.name || t("reports.categoryFallback");
    return { title: `${categoryName} — ${t("reports.expenseReportSuffix")}`, total: rows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), rows: rows.map((entry) => ({ date: entry.businessDate, description: entry.description || entry.payee || t("finance.expenseFallback"), amount: entry.amount })) };
  }, [categoryReportKey, finance, expenses, expenseCategories, t]);
  return <><PageHeader eyebrow={t("reports.eyebrow")} title={t("finance.revenueVsExpenses")} description={t("reports.description")} actions={<><StatusPill tone="info">{t("reports.selectedPeriod")}</StatusPill><SecondaryButton onClick={() => { requestAnimationFrame(printReport); }}><Printer size={14} className="mr-2"/>{t("reports.print")}</SecondaryButton><SecondaryButton onClick={() => exportCsv(`marasi-revenue-expenses-${from}-to-${to}.csv`, [["Type", "Stream", "Amount (OMR)"], ...(finance as any[]).map((entry) => [entry.type, entry.stream, entry.amount]), [], ["Revenue", "", totals.revenue.toFixed(2)], ["Expenses", "", totals.expenses.toFixed(2)], ["Net", "", totals.net.toFixed(2)]])}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></>}/><Surface tone="tinted"><div className="flex flex-wrap items-end gap-4"><Field label={t("common.from")}><TextField type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></Field><Field label={t("common.to")}><TextField type="date" value={to} onChange={(event) => setTo(event.target.value)}/></Field><div className="flex items-center gap-2 pb-2 text-xs text-body"><CalendarDays size={15} className="text-accent"/>{t("reports.summaryUsesSelectedPeriod")}</div></div></Surface>{isLoading ? <div className="mt-6"><LoadingState label={t("reports.loadingSummary")}/></div> : <><div className="mt-6 grid gap-4 md:grid-cols-3"><MetricCard icon={TrendingUp} label={t("finance.revenue")} value={money(totals.revenue)} detail={`${revenueRows.length} ${revenueRows.length === 1 ? t("reports.revenueStream") : t("reports.revenueStreams")}`} tone="green"/><MetricCard icon={TrendingDown} label={t("finance.expenses")} value={money(totals.expenses)} detail={`${expenseRows.length} ${expenseRows.length === 1 ? t("reports.expenseStream") : t("reports.expenseStreams")}`} tone="amber"/><MetricCard icon={totals.net >= 0 ? TrendingUp : TrendingDown} label={t("overview.net")} value={money(totals.net)} detail={totals.net >= 0 ? t("reports.positiveResult") : t("finance.reviewSpending")} tone={totals.net >= 0 ? "blue" : "red"}/></div><div className="mt-6 grid gap-6 xl:grid-cols-2"><Stream title={t("reports.revenueActivity")} description={t("reports.revenueActivityHint")} tone="success" revenueLabel={t("finance.revenue")} expenseLabel={t("finance.expenses")}>{revenueRows.length ? revenueRows.map((row: any) => <div key={`${row.stream}-${row.type}`} className="flex items-center justify-between gap-3 py-3"><span className="text-sm capitalize">{row.stream && REVENUE_STREAM_KEYS[row.stream] ? t(REVENUE_STREAM_KEYS[row.stream]) : (row.stream || t("reports.ticketWord")).replaceAll("_", " ")}</span><b>{money(row.total)}</b></div>) : <EmptyState title={t("reports.noRevenueRecords")} description={t("reports.noRevenueRecordsHint")}/>}</Stream><Stream title={t("reports.expenseActivity")} description={t("reports.expenseActivityHint")} tone="warning" revenueLabel={t("finance.revenue")} expenseLabel={t("finance.expenses")}>{expenseRows.length ? expenseRows.map((row: any) => <div key={`${row.stream}-${row.type}`} className="flex items-center justify-between gap-3 py-3"><span className="text-sm capitalize">{row.stream && REVENUE_STREAM_KEYS[row.stream] ? t(REVENUE_STREAM_KEYS[row.stream]) : (row.stream || t("reports.expenseWord")).replaceAll("_", " ")}</span><b className="text-danger">−{money(row.total)}</b></div>) : <EmptyState title={t("reports.noExpenseRecords")} description={t("reports.noExpenseRecordsHint")}/>}</Stream></div>
      <Surface className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.singleCategoryReport")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("reports.singleCategoryReportHintReal")}</p></div><FileSearch size={19} className="text-accent"/></div>
        <div className="mt-4 max-w-sm"><Field label={t("finance.reportOn")}><SelectField value={categoryReportKey} onChange={(event) => setCategoryReportKey(event.target.value)}>
          <option value="">{t("reports.chooseRevenueOrExpense")}</option>
          <optgroup label={t("reports.revenueStreamsGroup")}>{Object.entries(REVENUE_STREAM_KEYS).map(([key, labelKey]) => <option key={key} value={`revenue:${key}`}>{t(labelKey)}</option>)}</optgroup>
          <optgroup label={t("finance.tabCategories")}>{(expenseCategories as any[]).map((category) => <option key={category.id} value={`expense:${category.id}`}>{category.name}</option>)}</optgroup>
        </SelectField></Field></div>
        {categoryReport && <div className="mt-5 border-t border-divider pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-xl tracking-[-.03em]">{categoryReport.title}</h3><p className="mt-1 text-xs text-muted">{categoryReport.rows.length} {categoryReport.rows.length === 1 ? t("reports.recordWord") : t("reports.recordsWord")} · {from} {t("reports.toWord")} {to}</p></div><div className="flex items-center gap-3"><b className="text-lg">{money(categoryReport.total)}</b><SecondaryButton onClick={() => exportCsv(`marasi-${categoryReportKey.replace(":", "-")}-${from}-to-${to}.csv`, [["Date", "Description", "Amount (OMR)"], ...categoryReport.rows.map((row) => [String(row.date).slice(0, 10), row.description, String(row.amount)])])}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></div></div>
          {categoryReport.rows.length ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[.7fr_1.3fr_auto] gap-3"><span>{t("common.date")}</span><span>{t("common.description")}</span><span className="text-right">{t("finance.amountCol")}</span></div></TableHeader>{categoryReport.rows.map((row, index) => <TableRow key={index} className="grid-cols-[.7fr_1.3fr_auto]"><span className="text-xs text-muted">{dateLabel(row.date)}</span><span className="truncate text-sm">{row.description}</span><b className="text-right text-sm">{money(row.amount)}</b></TableRow>)}</TableFrame> : <EmptyState title={t("reports.noRecordsInPeriod")} description={t("reports.nothingRecordedForCategory")}/>}
        </div>}
      </Surface>
    </>}

    <ReportDocument title={t("reports.reportDocTitle")} generatedLabel={t("cc.reportGenerated")} generatedByLabel={t("cc.reportGeneratedBy")} generatedBy={user?.name || "—"}>
      <p className="report-sub">{t("reports.reportPeriodLabel")}: {from} — {to}</p>
      <ReportSection title={t("finance.revenueVsExpenses")}>
        <ReportStatGrid><ReportStat label={t("finance.revenue")} value={money(totals.revenue)}/><ReportStat label={t("finance.expenses")} value={money(totals.expenses)}/><ReportStat label={t("overview.net")} value={money(totals.net)}/></ReportStatGrid>
      </ReportSection>
      <ReportSection title={t("reports.revenueActivity")}>{revenueRows.length ? <ReportTable headers={[{ label: t("reports.revenueStreamsGroup") }, { label: t("finance.amountCol"), num: true }]} rows={revenueRows.map((row: any) => [row.stream && REVENUE_STREAM_KEYS[row.stream] ? t(REVENUE_STREAM_KEYS[row.stream]) : String(row.stream || t("reports.ticketWord")).replaceAll("_", " "), money(row.total)])}/> : <p className="report-sub">{t("reports.noRevenueRecords")}</p>}</ReportSection>
      <ReportSection title={t("reports.expenseActivity")}>{expenseRows.length ? <ReportTable headers={[{ label: t("finance.tabCategories") }, { label: t("finance.amountCol"), num: true }]} rows={expenseRows.map((row: any) => [row.stream && REVENUE_STREAM_KEYS[row.stream] ? t(REVENUE_STREAM_KEYS[row.stream]) : String(row.stream || t("reports.expenseWord")).replaceAll("_", " "), money(row.total)])}/> : <p className="report-sub">{t("reports.noExpenseRecords")}</p>}</ReportSection>
      {categoryReport && <ReportSection title={`${t("reports.categoryDetailTitle")}: ${categoryReport.title}`}>{categoryReport.rows.length ? <ReportTable headers={[{ label: t("common.date") }, { label: t("common.description") }, { label: t("finance.amountCol"), num: true }]} rows={categoryReport.rows.map((row) => [dateLabel(row.date), row.description, money(row.amount)])}/> : <p className="report-sub">{t("reports.nothingRecordedForCategory")}</p>}</ReportSection>}
      <div className="report-footer">{t("cc.reportFooter")}</div>
    </ReportDocument>
  </>;
}
