import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField, Field, formatDateDmy, PrimaryButton, SecondaryButton } from "@/components/MarasiUI";
import { printReport, ReportDocument, ReportSection, ReportStat, ReportStatGrid, ReportTable } from "@/components/PrintableReport";
import { useT } from "@/lib/i18n";

const today = new Date().toISOString().slice(0, 10);
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const isoDate = (value: unknown) => { const date = new Date(value as string); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); };

type Split = { cash: number; card: number; bank: number };

// A single-method payment is all in that method; a mixed one uses its
// recorded Cash/Card/Bank breakdown (PRD Round 14, Section 6).
function paymentSplit(row: { paymentMethod?: string; totalAmount?: unknown; cashAmount?: unknown; cardAmount?: unknown; bankAmount?: unknown }): Split {
  const total = Number(row.totalAmount || 0);
  if (row.paymentMethod === "mixed") return { cash: Number(row.cashAmount || 0), card: Number(row.cardAmount || 0), bank: Number(row.bankAmount || 0) };
  if (row.paymentMethod === "card") return { cash: 0, card: total, bank: 0 };
  if (row.paymentMethod === "bank") return { cash: 0, card: 0, bank: total };
  return { cash: total, card: 0, bank: 0 };
}

// A group purchase can carry dozens of tickets — print their range, like
// the Ticket Desk's "#17843–#17867 (×25)", rather than every number.
function ticketRange(numbers: string[]) {
  if (numbers.length <= 3) return numbers.join(", ");
  const sorted = [...numbers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return `${sorted[0]}–${sorted[sorted.length - 1]} (×${numbers.length})`;
}

// PRD Round 17, item 3.6: a Cashier reaches the Command Centre but had no
// way to print anything from it — the comprehensive report is manager-only
// because it covers the whole resort. This prints the cashier's own
// activity only: ticket purchases they issued and facility bookings they
// created, which the server already restricts to their own records for the
// cashier role (purchaseList / facilityBookings.list), plus a basic finance
// summary of what they collected by payment method.
export function CashierOwnReport() {
  const t = useT();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const { data: purchaseRows = [] } = trpc.platform.tickets.purchaseList.useQuery({ from, to });
  const { data: bookingRows = [] } = trpc.platform.facilityBookings.list.useQuery({ from, to });

  const purchases = useMemo(() => {
    const map = new Map<number, any>();
    for (const row of purchaseRows as any[]) {
      const current = map.get(row.purchase.id) || { ...row.purchase, customer: row.customer, lines: [] as any[] };
      if (row.line) current.lines.push(row.line);
      map.set(row.purchase.id, current);
    }
    return Array.from(map.values());
  }, [purchaseRows]);
  const bookings = (bookingRows as any[]).map((row) => row.booking);

  const issued = purchases.filter((purchase) => purchase.status !== "refunded");
  const returned = purchases.filter((purchase) => purchase.status === "refunded");
  const paidBookings = bookings.filter((booking) => booking.status === "confirmed");
  const ticketTotal = issued.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
  const facilityTotal = paidBookings.reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0);
  const split = [...issued, ...paidBookings].map(paymentSplit).reduce((sum, entry) => ({ cash: sum.cash + entry.cash, card: sum.card + entry.card, bank: sum.bank + entry.bank }), { cash: 0, card: 0, bank: 0 });
  const methodLabel = (method: string) => method === "card" ? t("cashierReport.card") : method === "bank" ? t("cashierReport.bank") : method === "mixed" ? t("cashierReport.mixed") : t("cashierReport.cash");

  const transactionRows = [
    ...purchases.map((purchase) => ({
      date: isoDate(purchase.visitDate), type: t("cashierReport.ticketPurchase"),
      reference: ticketRange(purchase.lines.map((line: any) => String(line.ticketNumber || "")).filter(Boolean)) || `#${purchase.id}`,
      customer: purchase.customer?.fullName || "—", method: methodLabel(purchase.paymentMethod),
      status: purchase.status === "refunded" ? t("cashierReport.returned") : t("cashierReport.issued"), amount: Number(purchase.totalAmount || 0),
    })),
    ...bookings.map((booking) => ({
      date: isoDate(booking.bookingDate), type: t("cashierReport.facilityBooking"), reference: `${booking.facilityTypeName} #${booking.id}`,
      customer: booking.customerName || "—", method: methodLabel(booking.paymentMethod),
      status: booking.status === "cancelled" ? t("cashierReport.cancelled") : booking.status === "booking" ? t("cashierReport.awaitingPayment") : t("cashierReport.paid"), amount: Number(booking.totalAmount || 0),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return <>
    <SecondaryButton onClick={() => setOpen(true)}><Printer size={14} className="mr-2"/>{t("cashierReport.button")}</SecondaryButton>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("cashierReport.title")}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted">{t("cashierReport.hint")}</p>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <Field label={t("common.from")}><DateField value={from} onChange={setFrom}/></Field>
          <Field label={t("common.to")}><DateField value={to} min={from} onChange={setTo}/></Field>
        </div>
        <DialogFooter><PrimaryButton onClick={() => { setOpen(false); requestAnimationFrame(printReport); }}><Printer size={14} className="mr-2"/>{t("cc.generateReport")}</PrimaryButton></DialogFooter>
      </DialogContent>
    </Dialog>
    <ReportDocument title={t("cashierReport.title")} generatedLabel={t("cc.reportGenerated")} generatedByLabel={t("cc.reportGeneratedBy")} generatedBy={user?.name || "—"}>
      <p className="report-sub">{t("cashierReport.cashierLabel")}: {user?.name || "—"}</p>
      <p className="report-sub">{t("cc.reportPeriodLabel")}: {formatDateDmy(from)} – {formatDateDmy(to)}</p>
      <ReportSection title={t("cashierReport.financeSummary")}>
        <ReportStatGrid>
          <ReportStat label={t("cashierReport.ticketsCollected", { count: issued.length })} value={money(ticketTotal)}/>
          <ReportStat label={t("cashierReport.facilitiesCollected", { count: paidBookings.length })} value={money(facilityTotal)}/>
          <ReportStat label={t("cashierReport.totalCollected")} value={money(ticketTotal + facilityTotal)}/>
        </ReportStatGrid>
        <ReportTable headers={[{ label: t("cashierReport.paymentMethod") }, { label: t("cc.reportAmountCol"), num: true }]} rows={[
          [t("cashierReport.cash"), money(split.cash)], [t("cashierReport.card"), money(split.card)], [t("cashierReport.bank"), money(split.bank)],
        ]}/>
        {returned.length > 0 && <p className="report-sub">{t("cashierReport.returnedNote", { count: returned.length, amount: money(returned.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0)) })}</p>}
      </ReportSection>
      <ReportSection title={t("cashierReport.transactions")}>
        {transactionRows.length ? <ReportTable
          headers={[{ label: t("common.date") }, { label: t("cashierReport.typeCol") }, { label: t("cashierReport.referenceCol") }, { label: t("cashierReport.customerCol") }, { label: t("cashierReport.paymentMethod") }, { label: t("cashierReport.statusCol") }, { label: t("cc.reportAmountCol"), num: true }]}
          rows={transactionRows.map((row) => [formatDateDmy(row.date), row.type, row.reference, row.customer, row.method, row.status, money(row.amount)])}/>
          : <p className="report-sub">{t("cashierReport.noTransactions")}</p>}
      </ReportSection>
      <div className="report-footer">{t("cc.reportFooter")}</div>
    </ReportDocument>
  </>;
}
