import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Landmark, Lock, Receipt, Scale, ShieldCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { omanToday } from "@/lib/omanDate";
import { exportSpreadsheet } from "@/lib/spreadsheetExport";
import { DateField, EmptyState, Field, LoadingState, MetricCard, PrimaryButton, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { csvReportHeaderRows, printReport, ReportDocument, ReportSection, ReportStat, ReportStatGrid, ReportTable } from "@/components/PrintableReport";

const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const num = (value: unknown) => Number(value || 0).toFixed(3);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// PRD Round 18, Section 8: the Tax Account. VAT collected from visitors is
// owed to the tax authority — not the resort's revenue and not its own
// money. Shows what was collected, paid and is still owed, the report per
// tax period (PDF + a generic Excel table), VAT payments from Cash or Bank,
// closing a period, and (Super Admin) the one-time migration of the
// transactions recorded before VAT was split.
export function TaxAccountPanel() {
  const t = useT();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const today = omanToday();
  const isConfigAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const { data: settings } = trpc.platform.finance.vat.settings.useQuery();
  const { data: account } = trpc.platform.finance.vat.account.useQuery({ asAt: today });
  const { data: periods = [] } = trpc.platform.finance.vat.periods.useQuery();
  const [periodKey, setPeriodKey] = useState("");
  useEffect(() => { if (!periodKey && (periods as any[]).length) setPeriodKey(`${periods[0].from}|${periods[0].to}`); }, [periods, periodKey]);
  const [periodFrom, periodTo] = periodKey ? periodKey.split("|") : [today, today];
  const { data: report, isLoading: reportLoading } = trpc.platform.finance.vat.report.useQuery({ from: periodFrom, to: periodTo }, { enabled: Boolean(periodKey) });
  const refresh = () => { utils.platform.finance.vat.invalidate(); utils.platform.finance.cashFlow.invalidate(); utils.platform.finance.corrections.invalidate(); };
  const [payment, setPayment] = useState({ businessDate: today, fromAccount: "bank" as "cash" | "bank", amount: "", reason: "" });
  useEffect(() => { if (report) setPayment((current) => ({ ...current, amount: report.balanceDue > 0 ? report.balanceDue.toFixed(3) : "" })); }, [report?.from, report?.balanceDue]);
  const recordPayment = trpc.platform.finance.vat.recordPayment.useMutation({ onSuccess: () => { refresh(); toast.success(t("vat.paymentSaved")); }, onError: (error) => toast.error(error.message) });
  const settle = trpc.platform.finance.vat.settleThrough.useMutation({ onSuccess: () => { refresh(); toast.success(t("vat.periodSettled")); }, onError: (error) => toast.error(error.message) });
  const reopen = trpc.platform.finance.vat.reopen.useMutation({ onSuccess: () => { refresh(); toast.success(t("vat.periodsReopened")); }, onError: (error) => toast.error(error.message) });
  const [settingsForm, setSettingsForm] = useState({ vatRatePercent: "", vatPeriodStartMonth: 1 });
  useEffect(() => { if (settings) setSettingsForm({ vatRatePercent: String(Number(settings.vatRatePercent)), vatPeriodStartMonth: settings.vatPeriodStartMonth }); }, [settings?.vatRatePercent, settings?.vatPeriodStartMonth]);
  const saveSettings = trpc.platform.finance.vat.updateSettings.useMutation({ onSuccess: () => { refresh(); toast.success(t("vat.settingsSaved")); }, onError: (error) => toast.error(error.message) });
  const typeLabel = (type: string) => t(`vat.type_${["ticket", "facility", "facility_addon", "manual", "deposit_deduction"].includes(type) ? type : "other"}` as any);
  const rows = (report?.transactions ?? []) as any[];
  const periodLabel = `${periodFrom} – ${periodTo}`;
  const exportExcel = () => exportSpreadsheet(`marasi-vat-${periodFrom}-to-${periodTo}.xlsx`, [
    ...csvReportHeaderRows(t("cc.reportGenerated"), t("cc.reportGeneratedBy"), user?.name || "—"),
    ["VAT period", periodFrom, periodTo], ["Net sales (OMR)", num(report?.netSales)], ["VAT collected (OMR)", num(report?.vatCollected)], ["VAT paid (OMR)", num(report?.vatPaid)], ["Balance due (OMR)", num(report?.balanceDue)], [],
    ["Date", "Reference", "Type", "Net (OMR)", "VAT (OMR)", "Gross (OMR)"],
    ...rows.map((row) => [row.date, row.reference, typeLabel(row.type), num(row.net), num(row.vat), num(row.gross)]),
    ["Total", "", "", num(report?.netSales), num(report?.vatCollected), num(report?.grossSales)],
  ]);
  const periodSettled = Boolean(report?.settled);

  return <div className="mt-6 grid gap-6">
    {settings && !settings.vatActive && <Surface tone="tinted"><p className="text-sm font-semibold text-warning">{t("vat.notActiveTitle")}</p><p className="mt-1 text-xs leading-5 text-muted">{t("vat.notActiveHint")}</p></Surface>}
    <div className="grid gap-4 md:grid-cols-3">
      <MetricCard icon={Receipt} label={t("vat.collected")} value={account ? money(account.collected) : "…"} detail={t("vat.collectedHint")} tone="blue"/>
      <MetricCard icon={Landmark} label={t("vat.paid")} value={account ? money(account.paid) : "…"} detail={t("vat.paidHint")} tone="green"/>
      <MetricCard icon={Scale} label={t("vat.balance")} value={account ? money(account.balance) : "…"} detail={t("vat.balanceHint")} tone={account && account.balance > 0 ? "amber" : "green"}/>
    </div>

    <Surface>
      <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("vat.reportTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("vat.reportHint")}</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("vat.period")}><SelectField value={periodKey} onChange={(event) => setPeriodKey(event.target.value)}>{(periods as any[]).map((period) => <option key={period.from} value={`${period.from}|${period.to}`}>{period.label}{period.current ? ` · ${t("vat.current")}` : ""}{period.settled ? ` · ${t("vat.settled")}` : ""}</option>)}</SelectField></Field>
          <SecondaryButton onClick={() => requestAnimationFrame(printReport)}><FileText size={14} className="mr-2"/>PDF</SecondaryButton>
          <SecondaryButton onClick={exportExcel}><Download size={14} className="mr-2"/>Excel</SecondaryButton>
        </div>
      </div>
      {reportLoading || !report ? <LoadingState/> : <>
        <div className="grid gap-3 sm:grid-cols-4">
          {[["vat.netSales", report.netSales], ["vat.collected", report.vatCollected], ["vat.paid", report.vatPaid], ["vat.balanceDue", report.balanceDue]].map(([key, value]) => <div key={key as string} className="rounded-xl bg-well p-3"><span className="text-[11px] text-muted">{t(key as any)}</span><b className="block text-lg">{money(value)}</b></div>)}
        </div>
        {periodSettled && <p className="mt-3 flex items-center gap-1.5 text-xs text-success"><Lock size={13}/>{t("vat.periodIsSettled")}</p>}
        <div className="mt-4">{rows.length ? <TableFrame><TableHeader><div className="grid grid-cols-[.7fr_1.6fr_.8fr_.6fr_.6fr_.6fr] gap-3"><span>{t("common.date")}</span><span>{t("finance.referenceCol")}</span><span>{t("reports.typeCol")}</span><span className="text-right">{t("vat.net")}</span><span className="text-right">{t("vat.vat")}</span><span className="text-right">{t("vat.gross")}</span></div></TableHeader>
          {rows.map((row) => <TableRow key={row.id} className="grid-cols-[.7fr_1.6fr_.8fr_.6fr_.6fr_.6fr]"><span className="text-xs text-muted">{row.date}</span><span className="truncate text-xs">{row.reference}</span><span className="text-xs">{typeLabel(row.type)}</span><span className="text-right text-xs">{num(row.net)}</span><b className={cx("text-right text-xs", row.vat > 0 ? "text-accent" : "text-subtle")}>{num(row.vat)}</b><span className="text-right text-xs">{num(row.gross)}</span></TableRow>)}
          <TableRow className="grid-cols-[.7fr_1.6fr_.8fr_.6fr_.6fr_.6fr] font-semibold"><span className="text-xs">{t("vat.total")}</span><span/><span/><b className="text-right text-xs">{num(report.netSales)}</b><b className="text-right text-xs">{num(report.vatCollected)}</b><b className="text-right text-xs">{num(report.grossSales)}</b></TableRow>
        </TableFrame> : <EmptyState title={t("vat.noTransactions")} description={t("vat.noTransactionsHint")}/>}</div>
      </>}
    </Surface>

    <div className="grid gap-6 xl:grid-cols-2">
      <Surface>
        <div className="mb-4"><h2 className="font-serif text-2xl tracking-[-.04em]">{t("vat.paymentTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("vat.paymentHint")}</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("vat.paidFrom")}><SelectField value={payment.fromAccount} onChange={(event) => setPayment({ ...payment, fromAccount: event.target.value as "cash" | "bank" })}><option value="bank">{t("reports.bankAccount")}</option><option value="cash">{t("reports.cashAccount")}</option></SelectField></Field>
          <Field label={t("common.amount")}><TextField inputMode="decimal" value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })} placeholder="0.000"/></Field>
          <Field label={t("common.date")}><DateField value={payment.businessDate} onChange={(value) => setPayment({ ...payment, businessDate: value })}/></Field>
          <Field label={t("finance.reasonLabel")}><TextField value={payment.reason} onChange={(event) => setPayment({ ...payment, reason: event.target.value })} placeholder={t("vat.paymentReasonPlaceholder")}/></Field>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-muted">{t("vat.paymentForPeriod", { period: periodLabel })}</p>
        <PrimaryButton className="mt-4" pending={recordPayment.isPending} onClick={() => {
          if (!/^\d+(\.\d{1,3})?$/.test(payment.amount.trim()) || !(Number(payment.amount) > 0)) return toast.error(t("finance.enterValidAmount"));
          recordPayment.mutate({ ...payment, amount: Number(payment.amount).toFixed(3), periodFrom, periodTo });
        }}>{t("vat.recordPayment")}</PrimaryButton>
        {(report?.payments as any[])?.length > 0 && <div className="mt-4 divide-y divide-divider border-t border-divider">{(report!.payments as any[]).map((row) => <div key={row.id} className="flex justify-between py-2 text-xs"><span className="text-muted">{row.businessDate} · {row.fromAccount === "bank" ? t("reports.bankAccount") : t("reports.cashAccount")}{row.createdByName ? ` · ${row.createdByName}` : ""}</span><b>{money(row.amount)}</b></div>)}</div>}
      </Surface>
      <Surface>
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("vat.closeTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("vat.closeHint")}</p></div><Lock size={18} className="text-accent"/></div>
        <p className="text-xs">{settings?.vatSettledThrough ? t("vat.settledThrough", { date: settings.vatSettledThrough }) : t("vat.nothingSettled")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton pending={settle.isPending} disabled={periodSettled} onClick={() => { if (window.confirm(t("vat.confirmSettle", { date: periodTo }))) settle.mutate({ through: periodTo }); }}>{t("vat.settlePeriod", { date: periodTo })}</PrimaryButton>
          {isConfigAdmin && settings?.vatSettledThrough && <SecondaryButton onClick={() => { const reason = window.prompt(t("vat.reopenReason")); if (reason && reason.trim().length >= 3) reopen.mutate({ reason: reason.trim() }); }}>{t("vat.reopen")}</SecondaryButton>}
        </div>
        {isConfigAdmin && <div className="mt-6 border-t border-divider pt-4">
          <h3 className="text-sm font-semibold">{t("vat.settingsTitle")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label={t("vat.ratePercent")}><TextField inputMode="decimal" value={settingsForm.vatRatePercent} onChange={(event) => setSettingsForm({ ...settingsForm, vatRatePercent: event.target.value })}/></Field>
            <Field label={t("vat.periodStartMonth")}><SelectField value={String(settingsForm.vatPeriodStartMonth)} onChange={(event) => setSettingsForm({ ...settingsForm, vatPeriodStartMonth: Number(event.target.value) })}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</SelectField></Field>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-muted">{t("vat.settingsHint", { date: settings?.vatStartDate ?? "" })}</p>
          <SecondaryButton className="mt-3" onClick={() => {
            if (!/^\d{1,2}(\.\d{1,2})?$/.test(settingsForm.vatRatePercent.trim())) return toast.error(t("vat.invalidRate"));
            saveSettings.mutate({ vatRatePercent: settingsForm.vatRatePercent.trim(), vatPeriodStartMonth: settingsForm.vatPeriodStartMonth });
          }}>{t("vat.saveSettings")}</SecondaryButton>
        </div>}
      </Surface>
    </div>

    {isSuperAdmin && <VatMigrationPanel onDone={refresh}/>}
    {isSuperAdmin && <DataVerificationPanel/>}

    <ReportDocument title={`${t("vat.reportTitle")} — ${periodLabel}`} generatedLabel={t("cc.reportGenerated")} generatedByLabel={t("cc.reportGeneratedBy")} generatedBy={user?.name || "—"}>
      <ReportStatGrid>
        <ReportStat label={t("vat.netSales")} value={money(report?.netSales)}/>
        <ReportStat label={t("vat.collected")} value={money(report?.vatCollected)}/>
        <ReportStat label={t("vat.paid")} value={money(report?.vatPaid)}/>
        <ReportStat label={t("vat.balanceDue")} value={money(report?.balanceDue)}/>
      </ReportStatGrid>
      <ReportSection title={t("vat.transactions")}>
        <ReportTable headers={[{ label: t("common.date") }, { label: t("finance.referenceCol") }, { label: t("reports.typeCol") }, { label: t("vat.net"), num: true }, { label: t("vat.vat"), num: true }, { label: t("vat.gross"), num: true }]}
          rows={[...rows.map((row) => [row.date, row.reference, typeLabel(row.type), num(row.net), num(row.vat), num(row.gross)]), [t("vat.total"), "", "", num(report?.netSales), num(report?.vatCollected), num(report?.grossSales)]]}/>
      </ReportSection>
      <div className="report-footer">{t("cc.reportFooter")}</div>
    </ReportDocument>
  </div>;
}

// PRD Round 18, item 8.4: the one-time conversion of the transactions
// recorded as gross before VAT was split. Dry run first (changes nothing);
// apply only after a backup — the server re-checks every protected total and
// rolls itself back if any check fails; rollback restores the gross figures.
function VatMigrationPanel({ onDone }: { onDone: () => void }) {
  const t = useT();
  const utils = trpc.useUtils();
  const { data: plan, isLoading, refetch } = trpc.platform.finance.vat.migrationPlan.useQuery();
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [result, setResult] = useState<any>(null);
  const apply = trpc.platform.finance.vat.applyMigration.useMutation({
    onSuccess: (value) => { setResult(value); refetch(); onDone(); utils.platform.finance.invalidate(); value.applied ? toast.success(t("vat.migrationApplied")) : toast.error(t("vat.migrationFailed")); },
    onError: (error) => toast.error(error.message),
  });
  const rollback = trpc.platform.finance.vat.rollbackMigration.useMutation({ onSuccess: () => { setResult(null); refetch(); onDone(); utils.platform.finance.invalidate(); toast.success(t("vat.migrationRolledBack")); }, onError: (error) => toast.error(error.message) });
  const shown = result ?? (plan?.lastRun?.summary as any) ?? null;
  const days = useMemo(() => (plan?.days ?? []) as any[], [plan]);
  if (isLoading || !plan) return <Surface><LoadingState/></Surface>;
  const dayTotals = days.reduce((sum, day) => ({ transactions: sum.transactions + day.transactions, gross: sum.gross + day.gross, revenueBefore: sum.revenueBefore + day.revenueBefore, vat: sum.vat + day.vat, revenueAfter: sum.revenueAfter + day.revenueAfter }), { transactions: 0, gross: 0, revenueBefore: 0, vat: 0, revenueAfter: 0 });

  return <Surface>
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("vat.migrationTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("vat.migrationHint")}</p></div><ShieldCheck size={19} className="text-accent"/></div>
    <div className="flex flex-wrap gap-2 text-xs">
      <StatusPill tone={plan.active ? "success" : "warning"}>{plan.active ? t("vat.migrationActive") : t("vat.migrationNotApplied")}</StatusPill>
      <StatusPill>{t("vat.pendingCount", { count: plan.pendingEntries })}</StatusPill>
      <StatusPill tone="info">{t("vat.cases", { stored: plan.cases.stored, derived: plan.cases.derived, none: plan.cases.none })}</StatusPill>
    </div>
    {days.length > 0 && <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">{t("vat.dryRunTable")}</h3><TableFrame><TableHeader><div className="grid grid-cols-[.8fr_.4fr_.7fr_.7fr_.6fr_.7fr_.7fr] gap-3"><span>{t("common.date")}</span><span className="text-right">#</span><span className="text-right">{t("vat.gross")}</span><span className="text-right">{t("vat.revenueBefore")}</span><span className="text-right">{t("vat.vat")}</span><span className="text-right">{t("vat.revenueAfter")}</span><span className="text-right">{t("vat.casesShort")}</span></div></TableHeader>
      {days.map((day) => <TableRow key={day.date} className="grid-cols-[.8fr_.4fr_.7fr_.7fr_.6fr_.7fr_.7fr]"><span className="text-xs">{day.date}</span><span className="text-right text-xs">{day.transactions}</span><span className="text-right text-xs">{num(day.gross)}</span><span className="text-right text-xs">{num(day.revenueBefore)}</span><b className="text-right text-xs text-accent">{num(day.vat)}</b><b className="text-right text-xs">{num(day.revenueAfter)}</b><span className="text-right text-[11px] text-muted">{day.stored}/{day.derived}/{day.none}</span></TableRow>)}
      <TableRow className="grid-cols-[.8fr_.4fr_.7fr_.7fr_.6fr_.7fr_.7fr]"><b className="text-xs">{t("vat.total")}</b><b className="text-right text-xs">{dayTotals.transactions}</b><b className="text-right text-xs">{num(dayTotals.gross)}</b><b className="text-right text-xs">{num(dayTotals.revenueBefore)}</b><b className="text-right text-xs text-accent">{num(dayTotals.vat)}</b><b className="text-right text-xs">{num(dayTotals.revenueAfter)}</b><span/></TableRow>
    </TableFrame>
    <p className="mt-2 text-[11px] leading-4 text-muted">{t("vat.protectedTotals", { cash: num(plan.before.cashAccount), bank: num(plan.before.bankAccount), flow: num(plan.before.cashFlowClosing), petty: num(plan.before.pettyCash), receivable: num(plan.before.receivable), payable: num(plan.before.payable) })}</p>
    <p className="mt-1 text-[11px] leading-4 text-muted">{plan.netPlusVatEqualsGross ? t("vat.lineCheckOk") : t("vat.lineCheckFailed")}</p></div>}
    {(plan.vatNamedCategories as any[]).length > 0 && <div className="mt-3 rounded-xl bg-warning-bg px-3 py-2 text-[11px] leading-4 text-warning">{t("vat.vatNamedCategories")}: {(plan.vatNamedCategories as any[]).map((row) => `${row.name} (${row.kind}, ${row.records} × ${num(row.total)})`).join("; ")}</div>}
    {/* Every transaction the dry run treats as VAT-free or derives VAT for,
        with the reason — so the VAT setting of each item can be checked
        before anything is applied. Read-only. */}
    {(plan.decisions as any[]).some((row) => row.source !== "stored") && <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">{t("vat.reviewList", { none: plan.cases.none, derived: plan.cases.derived })}</summary>
      <TableFrame className="mt-2"><TableHeader><div className="grid grid-cols-[.7fr_1.5fr_.7fr_.6fr_.5fr_.6fr_1.6fr] gap-3"><span>{t("common.date")}</span><span>{t("finance.referenceCol")}</span><span>{t("reports.typeCol")}</span><span className="text-right">{t("vat.gross")}</span><span className="text-right">{t("vat.vat")}</span><span>{t("vat.casesShort")}</span><span>{t("vat.reasonCol")}</span></div></TableHeader>
        {(plan.decisions as any[]).filter((row) => row.source !== "stored").map((row) => <TableRow key={row.entryId} className="grid-cols-[.7fr_1.5fr_.7fr_.6fr_.5fr_.6fr_1.6fr]"><span className="text-muted">{row.date}</span><span className="truncate">{row.reference}</span><span>{t(`vat.type_${["ticket", "facility", "facility_addon", "manual", "deposit_deduction"].includes(row.type) ? row.type : "other"}` as any)}</span><span className="text-right">{num(row.gross)}</span><b className="text-right">{num(row.vatAmount)}</b><span className={row.source === "none" ? "text-warning" : "text-accent"}>{t(`vat.source_${row.source}` as any)}</span><span className="text-muted">{row.note}</span></TableRow>)}
      </TableFrame>
    </details>}
    <details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold">{t("vat.itemsCarryingVat")}</summary><ul className="mt-2 grid gap-1">{(plan.items as any[]).map((item) => <li key={`${item.kind}-${item.name}`} className="text-muted">{t(`vat.kind_${item.kind}` as any)} · {item.name}: {item.applyVat ? `VAT ${item.vatPercent}%` : t("vat.noVat")}{item.isActive ? "" : ` (${t("vat.inactive")})`}</li>)}</ul></details>
    {!plan.active && plan.pendingEntries > 0 && <div className="mt-4 border-t border-divider pt-4">
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={backupConfirmed} onChange={(event) => setBackupConfirmed(event.target.checked)} className="mt-0.5"/>{t("vat.backupConfirm")}</label>
      <PrimaryButton className="mt-3" disabled={!backupConfirmed || !plan.netPlusVatEqualsGross} pending={apply.isPending} onClick={() => { if (window.confirm(t("vat.confirmApply"))) apply.mutate({ confirmBackup: true }); }}>{t("vat.applyMigration")}</PrimaryButton>
    </div>}
    {shown?.checks && <div className="mt-4 border-t border-divider pt-4"><h3 className="mb-2 text-sm font-semibold">{t("vat.checksTitle")}</h3><ul className="grid gap-1 text-xs">{(shown.checks as any[]).map((check) => <li key={check.name} className={check.passed ? "text-success" : "text-danger"}>{check.passed ? "✓" : "✗"} {check.name}: {check.before} → {check.after} ({t("vat.expected")} {check.expected})</li>)}</ul></div>}
    {plan.active && <div className="mt-4 border-t border-divider pt-4"><SecondaryButton disabled={rollback.isPending} onClick={() => { const reason = window.prompt(t("vat.rollbackReason")); if (reason && reason.trim().length >= 3) rollback.mutate({ reason: reason.trim() }); }}>{t("vat.rollback")}</SecondaryButton><p className="mt-2 text-[11px] leading-4 text-muted">{t("vat.rollbackHint")}</p></div>}
  </Surface>;
}

// PRD Round 18, Section 9: read-only check of the data — each real day,
// the same totals across screens, and no orphaned records. Changes nothing.
function DataVerificationPanel() {
  const t = useT();
  const [days, setDays] = useState("2026-10-08, 2026-10-09, 2026-10-10");
  const [run, setRun] = useState(0);
  const dayList = days.split(",").map((day) => day.trim()).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day));
  const { data, isFetching } = trpc.platform.finance.vat.verifyData.useQuery({ days: dayList }, { enabled: run > 0 });
  return <Surface>
    <div className="mb-4"><h2 className="font-serif text-2xl tracking-[-.04em]">{t("verify.title")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("verify.hint")}</p></div>
    <div className="flex flex-wrap items-end gap-2"><Field label={t("verify.days")}><TextField value={days} onChange={(event) => setDays(event.target.value)}/></Field><PrimaryButton pending={isFetching} onClick={() => setRun((count) => count + 1)}>{t("verify.run")}</PrimaryButton></div>
    {data && <div className="mt-4 grid gap-4 text-xs">
      <StatusPill tone={data.passed ? "success" : "danger"}>{data.passed ? t("verify.allGood") : t("verify.needsAttention")}</StatusPill>
      <div><h3 className="mb-1 font-semibold">{t("verify.perDay")}</h3>{data.perDay.map((day: any) => <div key={day.date} className="py-1">{day.date}: <b>{day.transactions}</b> {t("verify.transactions")} · {t("vat.gross")} {num(day.gross)} · {t("finance.revenue")} {num(day.revenue)} · {t("vat.vat")} {num(day.vat)}</div>)}</div>
      <div><h3 className="mb-1 font-semibold">{t("verify.consistency")}</h3>{data.consistency.map((check: any) => <div key={check.name} className={check.passed ? "text-success" : "text-danger"}>{check.passed ? "✓" : "✗"} {check.name}: {num(check.a)} / {num(check.b)}</div>)}</div>
      <div><h3 className="mb-1 font-semibold">{t("verify.orphans")}</h3>{data.orphans.map((check: any) => <div key={check.name} className={check.count ? "text-danger" : "text-muted"}>{check.count ? `✗ ${check.count}` : "✓"} {check.name}{check.count ? ` — ${check.sample.map((row: any) => `#${row.id}${row.date ? ` ${row.date}` : ""}${row.amount ? ` ${row.amount}` : ""}`).join(", ")}` : ""}</div>)}</div>
    </div>}
  </Surface>;
}
