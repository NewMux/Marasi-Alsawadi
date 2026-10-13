import { useState } from "react";
import { FileText } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { omanMonthStart, omanToday } from "@/lib/omanDate";
import { DateField, EmptyState, Field, LoadingState, SecondaryButton, SelectField, Surface, TableFrame, TableHeader, TableRow, cx } from "@/components/MarasiUI";
import { printReport, ReportDocument, ReportSection, ReportTable } from "@/components/PrintableReport";

const money = (value: unknown) => value === null || value === undefined ? "—" : `OMR ${Number(value).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const ACTIONS = ["amend", "delete", "void_ticket_sale", "void_facility_booking", "payment_method_change", "transfer", "balance_adjustment", "vat_payment", "vat_period_settled", "deposit_received", "deposit_returned", "deposit_returned_partial", "deposit_forfeited", "vat_settings", "vat_period_reopened", "vat_migration_applied", "vat_migration_rolled_back"] as const;
// An adjustment at or above this is flagged so large corrections stand out
// (PRD Round 18, item 4.6.3).
const LARGE_AMOUNT = 100;

function summarise(json: string | null) {
  if (!json) return "";
  try {
    const value = JSON.parse(json);
    if (value && typeof value === "object" && "record" in value) return `${value.record?.description ?? ""} (${value.record?.amount ?? ""})`;
    if (value && typeof value === "object" && "purchase" in value) return `Ticket purchase ${value.purchase?.totalAmount ?? ""}`;
    if (value && typeof value === "object" && "booking" in value) return `${value.booking?.facilityTypeName ?? "Booking"} ${value.booking?.totalAmount ?? ""}`;
    return Object.entries(value).filter(([, inner]) => inner !== null && inner !== undefined && typeof inner !== "object").map(([key, inner]) => `${key}: ${inner}`).join(", ");
  } catch { return json.slice(0, 120); }
}

// PRD Round 18, item 4.6.4: every amend, delete, payment-method change,
// transfer, adjustment (and the VAT / deposit actions) — written by the
// system, never editable. Filter by date range, user and type; print as PDF.
export function FinanceAuditReport() {
  const t = useT();
  const { user } = useAuth();
  const [from, setFrom] = useState(omanMonthStart());
  const [to, setTo] = useState(omanToday());
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const { data: rows = [], isLoading } = trpc.platform.finance.corrections.auditReport.useQuery({ from, to, userId: userId ? Number(userId) : undefined, action: action || undefined });
  const { data: auditUsers = [] } = trpc.platform.finance.corrections.auditUsers.useQuery();
  const actionLabel = (value: string) => t(`finance.auditAction_${value}` as any);
  const when = (value: unknown) => new Date(value as string).toLocaleString("en-GB", { timeZone: "Asia/Muscat", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const isLarge = (row: any) => row.action === "balance_adjustment" && Number(row.amount || 0) >= LARGE_AMOUNT;

  return <Surface className="mt-6">
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.auditReportTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.auditReportHint")}</p></div>
      <SecondaryButton onClick={() => requestAnimationFrame(printReport)}><FileText size={14} className="mr-2"/>PDF</SecondaryButton>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      <Field label={t("common.from")}><DateField value={from} onChange={setFrom}/></Field>
      <Field label={t("common.to")}><DateField value={to} min={from} onChange={setTo}/></Field>
      <Field label={t("settings.userCol")}><SelectField value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">{t("finance.allUsers")}</option>{(auditUsers as any[]).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</SelectField></Field>
      <Field label={t("reports.typeCol")}><SelectField value={action} onChange={(event) => setAction(event.target.value)}><option value="">{t("finance.allTypes")}</option>{ACTIONS.map((entry) => <option key={entry} value={entry}>{actionLabel(entry)}</option>)}</SelectField></Field>
    </div>
    <div className="mt-4">{isLoading ? <LoadingState/> : (rows as any[]).length ? <TableFrame><TableHeader><div className="grid grid-cols-[.8fr_.7fr_.9fr_1fr_.6fr_1.6fr_1fr] gap-3"><span>{t("finance.whenCol")}</span><span>{t("settings.userCol")}</span><span>{t("reports.typeCol")}</span><span>{t("finance.referenceCol")}</span><span className="text-right">{t("common.amount")}</span><span>{t("finance.changeCol")}</span><span>{t("finance.reasonLabel")}</span></div></TableHeader>
      {(rows as any[]).map((row) => <TableRow key={row.id} className={cx("grid-cols-[.8fr_.7fr_.9fr_1fr_.6fr_1.6fr_1fr]", isLarge(row) && "bg-warning-bg")}>
        <span className="text-xs text-muted">{when(row.createdAt)}</span>
        <span className="truncate text-xs">{row.userName || "—"}</span>
        <span className="text-xs font-semibold">{actionLabel(row.action)}{isLarge(row) && <span className="ml-1 text-warning">●</span>}</span>
        <span className="truncate text-xs">{row.reference || `${row.recordType} #${row.recordId ?? ""}`}</span>
        <b className="text-right text-xs">{money(row.amount)}</b>
        <span className="min-w-0 text-[11px] leading-4 text-muted"><span className="block truncate">{summarise(row.oldValues)}</span>{row.newValues && <span className="block truncate text-ink">→ {summarise(row.newValues)}</span>}</span>
        <span className="truncate text-xs">{row.reason || "—"}</span>
      </TableRow>)}
    </TableFrame> : <EmptyState title={t("finance.noAuditEntries")} description={t("finance.noAuditEntriesHint")}/>}</div>
    <ReportDocument title={t("finance.auditReportTitle")} generatedLabel={t("cc.reportGenerated")} generatedByLabel={t("cc.reportGeneratedBy")} generatedBy={user?.name || "—"}>
      <p className="report-sub">{t("cc.reportPeriodLabel")}: {from} – {to}{action ? ` · ${actionLabel(action)}` : ""}</p>
      <ReportSection title={t("finance.auditReportTitle")}>
        {(rows as any[]).length ? <ReportTable headers={[{ label: t("finance.whenCol") }, { label: t("settings.userCol") }, { label: t("reports.typeCol") }, { label: t("finance.referenceCol") }, { label: t("common.amount"), num: true }, { label: t("finance.changeCol") }, { label: t("finance.reasonLabel") }]}
          rows={(rows as any[]).map((row) => [when(row.createdAt), row.userName || "—", `${actionLabel(row.action)}${isLarge(row) ? " (large)" : ""}`, row.reference || `${row.recordType} #${row.recordId ?? ""}`, money(row.amount), `${summarise(row.oldValues)}${row.newValues ? ` → ${summarise(row.newValues)}` : ""}`, row.reason || "—"])}/> : <p className="report-sub">{t("finance.noAuditEntries")}</p>}
      </ReportSection>
      <div className="report-footer">{t("cc.reportFooter")}</div>
    </ReportDocument>
  </Surface>;
}
