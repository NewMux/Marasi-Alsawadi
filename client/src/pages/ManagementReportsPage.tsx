import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Download, FileSearch, TrendingDown, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EmptyState, Field, LoadingState, MetricCard, PageHeader, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";

const REVENUE_STREAM_LABELS: Record<string, string> = { rooms: "Rooms", aqua_park: "Aqua Park / Ticket Sales", fnb: "Food & Beverage", extras: "Extras" };
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const money = (value: unknown) => `OMR ${Number(value ?? 0).toLocaleString("en-OM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function exportCsv(name: string, rows: string[][]) { const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
function Stream({ title, description, tone, children }: { title: string; description: string; tone: "success" | "warning"; children: ReactNode }) { return <Surface><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{title}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{description}</p></div><StatusPill tone={tone}>{tone === "success" ? "Revenue" : "Expenses"}</StatusPill></div><div className="mt-5 divide-y divide-divider">{children}</div></Surface>; }

export default function ManagementReportsPage() {
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
      return { title: `${REVENUE_STREAM_LABELS[key] || key} — revenue report`, total: rows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), rows: rows.map((entry) => ({ date: entry.date, description: entry.description || "Revenue", amount: entry.amount })) };
    }
    const categoryId = Number(key);
    const rows = (expenses as any[]).filter((entry) => Number(entry.categoryId) === categoryId);
    const categoryName = (expenseCategories as any[]).find((entry) => entry.id === categoryId)?.name || "Category";
    return { title: `${categoryName} — expense report`, total: rows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), rows: rows.map((entry) => ({ date: entry.businessDate, description: entry.description || entry.payee || "Expense", amount: entry.amount })) };
  }, [categoryReportKey, finance, expenses, expenseCategories]);
  return <><PageHeader eyebrow="Basic report" title="Revenue versus expenses" description="A clear period summary of recorded ticket revenue, categorized expenses, and net operating result." actions={<><StatusPill tone="info">Selected period</StatusPill><SecondaryButton onClick={() => exportCsv(`marasi-revenue-expenses-${from}-to-${to}.csv`, [["Type", "Stream", "Amount (OMR)"], ...(finance as any[]).map((entry) => [entry.type, entry.stream, entry.amount]), [], ["Revenue", "", totals.revenue.toFixed(2)], ["Expenses", "", totals.expenses.toFixed(2)], ["Net", "", totals.net.toFixed(2)]])}><Download size={14} className="mr-2"/>Export CSV</SecondaryButton></>}/><Surface tone="tinted"><div className="flex flex-wrap items-end gap-4"><Field label="From"><TextField type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></Field><Field label="To"><TextField type="date" value={to} onChange={(event) => setTo(event.target.value)}/></Field><div className="flex items-center gap-2 pb-2 text-xs text-body"><CalendarDays size={15} className="text-accent"/>Summary uses the selected period.</div></div></Surface>{isLoading ? <div className="mt-6"><LoadingState label="Loading financial summary…"/></div> : <><div className="mt-6 grid gap-4 md:grid-cols-3"><MetricCard icon={TrendingUp} label="Revenue" value={money(totals.revenue)} detail={`${revenueRows.length} revenue stream${revenueRows.length === 1 ? "" : "s"}`} tone="green"/><MetricCard icon={TrendingDown} label="Expenses" value={money(totals.expenses)} detail={`${expenseRows.length} expense stream${expenseRows.length === 1 ? "" : "s"}`} tone="amber"/><MetricCard icon={totals.net >= 0 ? TrendingUp : TrendingDown} label="Net operating result" value={money(totals.net)} detail={totals.net >= 0 ? "Positive result" : "Review spending"} tone={totals.net >= 0 ? "blue" : "red"}/></div><div className="mt-6 grid gap-6 xl:grid-cols-2"><Stream title="Revenue activity" description="Ticket totals recorded in the selected period." tone="success">{revenueRows.length ? revenueRows.map((row: any) => <div key={`${row.stream}-${row.type}`} className="flex items-center justify-between gap-3 py-3"><span className="text-sm capitalize">{String(row.stream || "ticket").replaceAll("_", " ")}</span><b>{money(row.total)}</b></div>) : <EmptyState title="No revenue records" description="Issued tickets will appear here once the period has activity."/>}</Stream><Stream title="Expense activity" description="Categorized costs recorded in the selected period." tone="warning">{expenseRows.length ? expenseRows.map((row: any) => <div key={`${row.stream}-${row.type}`} className="flex items-center justify-between gap-3 py-3"><span className="text-sm capitalize">{String(row.stream || "expense").replaceAll("_", " ")}</span><b className="text-danger">−{money(row.total)}</b></div>) : <EmptyState title="No expense records" description="Recorded expenses will appear here by category."/>}</Stream></div>
      <Surface className="mt-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="font-serif text-2xl tracking-[-.04em]">Single-category report</h2><p className="mt-1.5 text-xs leading-5 text-muted">Generate a report scoped to one revenue stream or one expense category on its own.</p></div><FileSearch size={19} className="text-accent"/></div>
        <div className="mt-4 max-w-sm"><Field label="Report on"><SelectField value={categoryReportKey} onChange={(event) => setCategoryReportKey(event.target.value)}>
          <option value="">Choose a revenue stream or expense category</option>
          <optgroup label="Revenue streams">{Object.entries(REVENUE_STREAM_LABELS).map(([key, label]) => <option key={key} value={`revenue:${key}`}>{label}</option>)}</optgroup>
          <optgroup label="Expense categories">{(expenseCategories as any[]).map((category) => <option key={category.id} value={`expense:${category.id}`}>{category.name}</option>)}</optgroup>
        </SelectField></Field></div>
        {categoryReport && <div className="mt-5 border-t border-divider pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-xl tracking-[-.03em]">{categoryReport.title}</h3><p className="mt-1 text-xs text-muted">{categoryReport.rows.length} record{categoryReport.rows.length === 1 ? "" : "s"} · {from} to {to}</p></div><div className="flex items-center gap-3"><b className="text-lg">{money(categoryReport.total)}</b><SecondaryButton onClick={() => exportCsv(`marasi-${categoryReportKey.replace(":", "-")}-${from}-to-${to}.csv`, [["Date", "Description", "Amount (OMR)"], ...categoryReport.rows.map((row) => [String(row.date).slice(0, 10), row.description, String(row.amount)])])}><Download size={14} className="mr-2"/>Export CSV</SecondaryButton></div></div>
          {categoryReport.rows.length ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[.7fr_1.3fr_auto] gap-3"><span>Date</span><span>Description</span><span className="text-right">Amount</span></div></TableHeader>{categoryReport.rows.map((row, index) => <TableRow key={index} className="grid-cols-[.7fr_1.3fr_auto]"><span className="text-xs text-muted">{dateLabel(row.date)}</span><span className="truncate text-sm">{row.description}</span><b className="text-right text-sm">{money(row.amount)}</b></TableRow>)}</TableFrame> : <EmptyState title="No records in this period" description="Nothing was recorded for this category in the selected date range."/>}
        </div>}
      </Surface>
    </>}</>;
}
