import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CheckCircle2, CircleAlert, DollarSign, Printer, ScanLine, Settings, Ticket, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Cell, Pie, PieChart } from "recharts";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField, EmptyState, Field, formatDateDmy, MetricCard, PageHeader, PrimaryButton, SecondaryButton, SectionHeader, StatusPill, Surface, TableFrame, TableHeader, TableRow, cx } from "@/components/MarasiUI";
import { printReport, ReportDocument, ReportSection, ReportStat, ReportStatGrid, ReportTable } from "@/components/PrintableReport";
import { useT } from "@/lib/i18n";

const PIE_COLORS = ["#0e7490", "#af8244"];

type ReportSections = { tickets: boolean; profitLoss: boolean; visitors: boolean; expenses: boolean; ticketTypeBreakdown: boolean };
const allSections: ReportSections = { tickets: true, profitLoss: true, visitors: true, expenses: true, ticketTypeBreakdown: true };

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
// The DB driver returns DATE columns as JS Date objects, not "YYYY-MM-DD"
// strings — String(dateObject).slice(0, 10) mangles them via Date's own
// toString() instead of an ISO date, breaking the same-day comparison below.
const toIsoDate = (value: unknown) => { const date = new Date(value as string); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); };

function SetupChecklist({ setLocation }: { setLocation: (path: string) => void }) {
  const t = useT();
  return <Surface className="mt-6" tone="tinted"><SectionHeader eyebrow={t("cc.firstLaunch")} title={t("cc.setupTitle")} description={t("cc.setupDescription")}/><div className="grid gap-3 md:grid-cols-4"><button onClick={() => setLocation("/settings")} className="rounded-2xl border border-[#bfe7ee] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-accent">01</div><b className="mt-2 block text-sm">{t("cc.step1Title")}</b><p className="mt-1 text-xs leading-5 text-muted">{t("cc.step1Detail")}</p></button><button onClick={() => setLocation("/tickets")} className="rounded-2xl border border-[#bfe7ee] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-accent">02</div><b className="mt-2 block text-sm">{t("cc.step2Title")}</b><p className="mt-1 text-xs leading-5 text-muted">{t("cc.step2Detail")}</p></button><button onClick={() => setLocation("/finance")} className="rounded-2xl border border-[#bfe7ee] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-accent">03</div><b className="mt-2 block text-sm">{t("cc.step3Title")}</b><p className="mt-1 text-xs leading-5 text-muted">{t("cc.step3Detail")}</p></button><button onClick={() => setLocation("/reports")} className="rounded-2xl border border-[#bfe7ee] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-accent">04</div><b className="mt-2 block text-sm">{t("cc.step4Title")}</b><p className="mt-1 text-xs leading-5 text-muted">{t("cc.step4Detail")}</p></button></div></Surface>;
}

export default function CommandCenterPage() {
  const t = useT();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const role = user?.role || "staff";
  const isGuard = role === "guard";
  const canManage = role === "manager" || role === "admin" || role === "super_admin";
  const { data: purchaseRows = [] } = trpc.platform.tickets.purchaseList.useQuery({ from: monthStart, to: today }, { enabled: !isGuard });
  const { data: summary } = trpc.platform.finance.operationalSummary.useQuery({ from: monthStart, to: today }, { enabled: canManage });
  const { data: expenses = [] } = trpc.platform.finance.expenses.list.useQuery({ from: monthStart, to: today }, { enabled: canManage });
  const { data: scans = [] } = trpc.platform.gate.recentScans.useQuery(undefined, { enabled: isGuard || canManage });
  const { data: expenseCategories = [] } = trpc.platform.finance.expenseCategories.list.useQuery({ includeInactive: true }, { enabled: canManage });
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFrom, setReportFrom] = useState(monthStart);
  const [reportTo, setReportTo] = useState(today);
  const [sections, setSections] = useState<ReportSections>(allSections);
  const toggleSection = (key: keyof ReportSections) => setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const allChecked = Object.values(sections).every(Boolean);
  // purchaseList returns one row per ticket line (joined) — group back into
  // unique purchases so counts/sums aren't multiplied by each purchase's line count.
  const tickets = useMemo(() => {
    const map = new Map<number, any>();
    for (const row of purchaseRows as any[]) { const id = row.purchase.id; const current = map.get(id) || { ...row.purchase, customer: row.customer, lines: [] }; if (row.line) current.lines.push(row.line); map.set(id, current); }
    return Array.from(map.values());
  }, [purchaseRows]);
  const { data: reportPurchaseRows = [] } = trpc.platform.tickets.purchaseList.useQuery({ from: reportFrom, to: reportTo }, { enabled: canManage });
  const { data: reportSummary } = trpc.platform.finance.operationalSummary.useQuery({ from: reportFrom, to: reportTo }, { enabled: canManage });
  const { data: reportExpenses = [] } = trpc.platform.finance.expenses.list.useQuery({ from: reportFrom, to: reportTo }, { enabled: canManage });
  const reportTickets = useMemo(() => {
    const map = new Map<number, any>();
    for (const row of reportPurchaseRows as any[]) { const id = row.purchase.id; const current = map.get(id) || { ...row.purchase, customer: row.customer, lines: [] }; if (row.line) current.lines.push(row.line); map.set(id, current); }
    return Array.from(map.values());
  }, [reportPurchaseRows]);
  const todayTickets = tickets.filter((entry: any) => toIsoDate(entry.visitDate) === today);
  const revenue = Number(summary?.revenue || tickets.reduce((total: number, entry: any) => total + Number(entry.totalAmount || 0), 0));
  const expenseTotal = Number(summary?.expenses || expenses.reduce((total: number, entry: any) => total + Number(entry.amount || 0), 0));
  const recentTickets = useMemo(() => tickets.slice(0, 6), [tickets]);
  const scanAllowed = scans.filter((entry: any) => (entry.result || entry.status) === "allowed").length;
  const scanDenied = scans.length - scanAllowed;
  const needsSetup = role === "super_admin" && tickets.length === 0 && expenses.length === 0;
  const uniqueCustomers = new Set(tickets.map((entry: any) => entry.customer?.id).filter(Boolean)).size;
  const expensesByCategory = useMemo(() => {
    const totals = new Map<number, number>();
    for (const entry of expenses as any[]) { const id = Number(entry.categoryId); totals.set(id, (totals.get(id) || 0) + Number(entry.amount || 0)); }
    return Array.from(totals.entries()).map(([categoryId, total]) => ({ name: (expenseCategories as any[]).find((c) => c.id === categoryId)?.name || t("finance.expenseFallback"), total })).sort((a, b) => b.total - a.total);
  }, [expenses, expenseCategories, t]);
  const reportRevenue = Number(reportSummary?.revenue || reportTickets.reduce((total: number, entry: any) => total + Number(entry.totalAmount || 0), 0));
  const reportExpenseTotal = Number(reportSummary?.expenses || (reportExpenses as any[]).reduce((total: number, entry: any) => total + Number(entry.amount || 0), 0));
  const reportUniqueCustomers = new Set(reportTickets.map((entry: any) => entry.customer?.id).filter(Boolean)).size;
  const reportExpensesByCategory = useMemo(() => {
    const totals = new Map<number, number>();
    for (const entry of reportExpenses as any[]) { const id = Number(entry.categoryId); totals.set(id, (totals.get(id) || 0) + Number(entry.amount || 0)); }
    return Array.from(totals.entries()).map(([categoryId, total]) => ({ name: (expenseCategories as any[]).find((c) => c.id === categoryId)?.name || t("finance.expenseFallback"), total })).sort((a, b) => b.total - a.total);
  }, [reportExpenses, expenseCategories, t]);
  const reportTicketTypeBreakdown = useMemo(() => {
    const totals = new Map<string, { count: number; amount: number }>();
    for (const row of reportPurchaseRows as any[]) { if (!row.line) continue; const key = row.line.ticketType === "companion" ? t("settings.companionWord") : t("settings.waterparkWord"); const current = totals.get(key) || { count: 0, amount: 0 }; current.count += 1; current.amount += Number(row.line.totalAmount || 0); totals.set(key, current); }
    return Array.from(totals.entries()).map(([label, entry]) => ({ label, ...entry }));
  }, [reportPurchaseRows, t]);

  if (isGuard) return <><PageHeader eyebrow={t("cc.gateEyebrow")} title={`${t("cc.goodMorning")} ${user?.name?.split(" ")[0] || t("cc.guardFallback")}.`} description={t("cc.guardDescription")} actions={<StatusPill tone="success">{t("cc.scannerReady")}</StatusPill>}/><div className="grid gap-4 sm:grid-cols-3"><MetricCard icon={ScanLine} label={t("cc.scannerStatus")} value={t("cc.ready")} detail={t("cc.cameraOrUsb")} tone="green"/><MetricCard icon={CheckCircle2} label={t("cc.allowedToday")} value={String(scanAllowed)} detail={t("cc.successfulAdmissions")} tone="green"/><MetricCard icon={CircleAlert} label={t("cc.recentDecisions")} value={String(scans.length)} detail={t("cc.latestGateActivity")} tone="amber"/></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><Surface tone="dark"><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-teal-tint">{t("cc.entranceControl")}</div><h2 className="mt-3 font-serif text-3xl tracking-[-.05em] text-white">{t("cc.validateNextTicket")}</h2><p className="mt-3 max-w-md text-sm leading-6 text-[#c5c5ca]">{t("cc.gateChecksDescription")}</p><PrimaryButton className="mt-6" onClick={() => setLocation("/gate")}>{t("cc.openGateScanner")} <ArrowRight size={15} className="ml-2"/></PrimaryButton></Surface><Surface><SectionHeader title={t("cc.recentGateActivity")} description={t("cc.minimumTicketData")}/>{scans.length ? <div className="divide-y divide-divider">{scans.slice(0, 6).map((entry: any) => <div className="flex items-center justify-between gap-3 py-3" key={entry.id}><div><div className="text-sm font-medium">{entry.ticketNumber || entry.ticketId || t("cc.ticketScan")}</div><div className="mt-1 text-xs text-muted">{dateLabel(entry.scannedAt || entry.createdAt)} · {entry.reason || t("cc.validated")}</div></div><StatusPill tone={entry.result === "allowed" ? "success" : "danger"}>{entry.result || t("cc.denied")}</StatusPill></div>)}</div> : <EmptyState title={t("cc.noScansYet")} description={t("cc.nextGateDecision")}/>}</Surface></div></>;

  return <><PageHeader eyebrow={t("cc.eyebrow")} title={t("cc.title")} description={t("cc.description")} actions={<><SecondaryButton onClick={() => setLocation("/reports")}>{t("cc.viewReport")} <ArrowRight size={14} className="ml-2"/></SecondaryButton>{canManage && <SecondaryButton onClick={() => setReportOpen(true)}><Printer size={14} className="mr-2"/>{t("cc.printReport")}</SecondaryButton>}<PrimaryButton onClick={() => setLocation("/tickets")}>{t("cc.newTicket")} <Ticket size={14} className="ml-2"/></PrimaryButton></>}/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard icon={DollarSign} label={t("cc.revenueThisMonth")} value={money(revenue)} detail={`${todayTickets.length} ${t("cc.ticketsToday")}`} tone="blue"/><MetricCard icon={CheckCircle2} label={t("cc.operatingResult")} value={money(revenue - expenseTotal)} detail={`${money(expenseTotal)} ${t("cc.categorizedExpenses")}`} tone={revenue >= expenseTotal ? "green" : "red"}/><MetricCard icon={Users} label={t("cc.customerVisits")} value={String(tickets.length)} detail={t("cc.searchablePurchaseRecords")} tone="amber"/><MetricCard icon={ScanLine} label={t("cc.gateDecisions")} value={String(scans.length)} detail={`${scanAllowed} ${t("cc.entriesAllowed")}`} tone="green"/></div>{needsSetup && <SetupChecklist setLocation={setLocation}/>}<div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]"><Surface><SectionHeader eyebrow={t("cc.commercialPulse")} title={t("cc.recentTicketActivity")} description={t("cc.everySaleSearchable")} action={<button onClick={() => setLocation("/tickets")} className="text-xs font-semibold text-accent">{t("cc.openDeskArrow")}</button>}/>{recentTickets.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.2fr_.7fr_auto] gap-3"><span>{t("cc.customerCol")}</span><span>{t("cc.visitCol")}</span><span className="text-right">{t("cc.amountCol")}</span></div></TableHeader>{recentTickets.map((entry: any) => { const ticket = entry.t || entry; return <TableRow key={ticket.id} className="grid-cols-[1.2fr_.7fr_auto]"><div><div className="text-sm font-medium">{entry.c?.fullName || ticket.customerName || t("cc.customerVisitFallback")}</div><div className="mt-1 font-mono text-[10px] text-accent">{ticket.ticketNumber}</div></div><div className="text-xs text-muted">{dateLabel(ticket.visitDate)}</div><b className="text-right font-medium">{money(ticket.totalAmount)}</b></TableRow>; })}</TableFrame> : <EmptyState title={t("cc.noTicketsYet")} description={t("cc.issueFirstTicket")} action={<PrimaryButton onClick={() => setLocation("/tickets")}>{t("cc.issueTicket")}</PrimaryButton>}/>}</Surface><Surface tone="dark"><SectionHeader tone="dark" title={t("cc.attentionNow")} description={t("cc.attentionHint")}/><div className="space-y-3"><div className="flex items-start gap-3 rounded-2xl bg-white/[.08] p-3"><Ticket size={17} className="mt-0.5 text-teal-tint"/><span><span className="block text-sm font-medium text-white">{todayTickets.length} {todayTickets.length === 1 ? t("cc.ticketWord") : t("cc.ticketsWord")} {t("cc.todayWord")}</span><span className="mt-1 block text-xs leading-5 text-[#b7b7bd]">{t("cc.keepSaleLinked")}</span></span></div><div className="flex items-start gap-3 rounded-2xl bg-white/[.08] p-3"><Users size={17} className="mt-0.5 text-gold-tint"/><span><span className="block text-sm font-medium text-white">{tickets.length} {tickets.length === 1 ? t("cc.customerRecordWord") : t("cc.customerRecordsWord")}</span><span className="mt-1 block text-xs leading-5 text-[#b7b7bd]">{t("cc.searchPastVisits")}</span></span></div><div className="flex items-start gap-3 rounded-2xl bg-white/[.08] p-3"><DollarSign size={17} className="mt-0.5 text-mint"/><span><span className="block text-sm font-medium text-white">{money(expenseTotal)} {t("cc.categorizedExpenses")}</span><span className="mt-1 block text-xs leading-5 text-[#b7b7bd]">{t("cc.reviewNetResult")}</span></span></div></div></Surface></div><div className="mt-6 grid gap-6 xl:grid-cols-2"><Surface><SectionHeader title={t("cc.financeControl")} description={t("cc.keepDecisionsOneRecord")}/><div className="rounded-2xl bg-success-bg p-4"><div className="text-[11px] font-medium text-success">{t("overview.net")}</div><div className="mt-2 font-serif text-3xl tracking-[-.04em] text-ink">{money(revenue - expenseTotal)}</div><div className="mt-2 text-xs leading-5 text-muted">{summary ? t("cc.liveFromMonth") : t("cc.addApprovedFinance")}</div></div><div className="mt-4 flex flex-wrap gap-2"><PrimaryButton onClick={() => setLocation("/finance")}>{t("cc.openFinance")}</PrimaryButton><SecondaryButton onClick={() => setLocation("/reports")}>{t("cc.revenueReport")}</SecondaryButton></div></Surface><Surface><SectionHeader title={t("cc.systemReadiness")} description={t("cc.simpleViewOfSystem")}/><div className="space-y-3"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-success"/>{t("cc.ticketDeskWord")}</span><StatusPill tone="success">{t("cc.ready")}</StatusPill></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-success"/>{t("cc.customerDatabase")}</span><StatusPill tone="success">{t("cc.ready")}</StatusPill></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-success"/>{t("cc.expenseAndReport")}</span><StatusPill tone="success">{t("cc.ready")}</StatusPill></div>{role === "super_admin" && <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-success"/><Settings size={14}/>{t("cc.commercialSettingsWord")}</span><StatusPill tone="info">{t("cc.adminOnly")}</StatusPill></div>}</div></Surface></div>

    {canManage && <Dialog open={reportOpen} onOpenChange={setReportOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("cc.printReportModalTitle")}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted">{t("cc.printReportModalHint")}</p>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <Field label={t("common.from")}><DateField value={reportFrom} onChange={setReportFrom}/></Field>
          <Field label={t("common.to")}><DateField value={reportTo} min={reportFrom} onChange={setReportTo}/></Field>
        </div>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2 rounded-xl bg-well p-3 text-xs font-semibold"><input type="checkbox" checked={allChecked} onChange={() => setSections(allChecked ? { tickets: false, profitLoss: false, visitors: false, expenses: false, ticketTypeBreakdown: false } : allSections)}/>{t("cc.selectAll")}</label>
          <label className="flex items-center gap-2 rounded-xl border border-divider p-3 text-xs"><input type="checkbox" checked={sections.tickets} onChange={() => toggleSection("tickets")}/>{t("cc.sectionTicketsIssued")}</label>
          <label className="flex items-center gap-2 rounded-xl border border-divider p-3 text-xs"><input type="checkbox" checked={sections.profitLoss} onChange={() => toggleSection("profitLoss")}/>{t("cc.sectionProfitLoss")}</label>
          <label className="flex items-center gap-2 rounded-xl border border-divider p-3 text-xs"><input type="checkbox" checked={sections.visitors} onChange={() => toggleSection("visitors")}/>{t("cc.sectionVisitors")}</label>
          <label className="flex items-center gap-2 rounded-xl border border-divider p-3 text-xs"><input type="checkbox" checked={sections.expenses} onChange={() => toggleSection("expenses")}/>{t("cc.sectionExpenses")}</label>
          <label className="flex items-center gap-2 rounded-xl border border-divider p-3 text-xs"><input type="checkbox" checked={sections.ticketTypeBreakdown} onChange={() => toggleSection("ticketTypeBreakdown")}/>{t("cc.sectionTicketTypeBreakdown")}</label>
        </div>
        <DialogFooter><PrimaryButton onClick={() => { setReportOpen(false); requestAnimationFrame(printReport); }}><Printer size={14} className="mr-2"/>{t("cc.generateReport")}</PrimaryButton></DialogFooter>
      </DialogContent>
    </Dialog>}

    {canManage && <ReportDocument title={t("cc.reportDocTitle")} generatedLabel={t("cc.reportGenerated")} generatedByLabel={t("cc.reportGeneratedBy")} generatedBy={user?.name || "—"}>
      <p className="report-sub">{t("cc.reportPeriodLabel")}: {formatDateDmy(reportFrom)} – {formatDateDmy(reportTo)}</p>
      {sections.tickets && <ReportSection title={t("cc.sectionTicketsIssued")}><ReportStatGrid><ReportStat label={t("cc.ticketsIssuedPeriod")} value={String(reportTickets.length)}/><ReportStat label={t("cc.totalTicketRevenue")} value={money(reportRevenue)}/></ReportStatGrid></ReportSection>}
      {sections.profitLoss && <ReportSection title={t("cc.sectionProfitLoss")}>
        <div className="report-chart-row">
          <ReportStatGrid><ReportStat label={t("cc.reportRevenue")} value={money(reportRevenue)}/><ReportStat label={t("cc.reportExpenses")} value={money(reportExpenseTotal)}/><ReportStat label={t("cc.reportNetResult")} value={money(reportRevenue - reportExpenseTotal)}/></ReportStatGrid>
          {(reportRevenue > 0 || reportExpenseTotal > 0) && <PieChart width={200} height={160}><Pie data={[{ name: t("cc.reportRevenue"), value: reportRevenue }, { name: t("cc.reportExpenses"), value: reportExpenseTotal }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>{PIE_COLORS.map((color, i) => <Cell key={i} fill={color}/>)}</Pie></PieChart>}
        </div>
      </ReportSection>}
      {sections.visitors && <ReportSection title={t("cc.sectionVisitors")}><ReportStatGrid><ReportStat label={t("cc.reportCustomerVisits")} value={String(reportTickets.length)}/><ReportStat label={t("cc.reportUniqueCustomers")} value={String(reportUniqueCustomers)}/></ReportStatGrid></ReportSection>}
      {sections.expenses && <ReportSection title={t("cc.sectionExpenses")}>{reportExpensesByCategory.length ? <ReportTable headers={[{ label: t("cc.reportCategoryCol") }, { label: t("cc.reportAmountCol"), num: true }]} rows={reportExpensesByCategory.map((row) => [row.name, money(row.total)])}/> : <p className="report-sub">{t("cc.reportNoExpenses")}</p>}</ReportSection>}
      {sections.ticketTypeBreakdown && <ReportSection title={t("cc.sectionTicketTypeBreakdown")}>{reportTicketTypeBreakdown.length ? <ReportTable headers={[{ label: t("cc.reportTicketTypeCol") }, { label: t("cc.reportCountCol"), num: true }, { label: t("cc.reportAmountCol"), num: true }]} rows={reportTicketTypeBreakdown.map((row) => [row.label, String(row.count), money(row.amount)])}/> : <p className="report-sub">{t("cc.reportNoTicketTypeData")}</p>}</ReportSection>}
      <div className="report-footer">{t("cc.reportFooter")}</div>
    </ReportDocument>}
  </>;
}
