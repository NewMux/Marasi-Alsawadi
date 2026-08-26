import { useMemo, useState } from "react";
import { Plus, Printer, Ticket, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Field, PageHeader, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { TicketReceipt, type TicketReceiptData } from "@/components/TicketReceipt";
import { Textarea } from "@/components/ui/textarea";
import { printViaAgent } from "@/lib/printAgent";
import { dateLabel, money, today } from "@/localApp/format";
import { useT, type TranslationKey } from "@/localApp/i18n";
import type { PrdFreeEntryCategory, PrdTicketType } from "@/localApp/pricing";
import { issuePurchase, previewPurchase, useLocalStore, type PurchaseLineDraft } from "@/localApp/store";

type TicketLine = { id: number; rateId: string; ticketType: PrdTicketType; freeEntryCategory: "" | PrdFreeEntryCategory };
type FormState = { customerId: string; customerName: string; customerPhone: string; customerEmail: string; visitDate: string; paymentMethod: "cash" | "card" | "bank" | "mixed"; notes: string };
const blankForm = (): FormState => ({ customerId: "", customerName: "", customerPhone: "", customerEmail: "", visitDate: today(), paymentMethod: "cash", notes: "" });
const blankLine = (id: number): TicketLine => ({ id, rateId: "", ticketType: "waterpark", freeEntryCategory: "" });
const freeKeys: Record<PrdFreeEntryCategory, TranslationKey> = { under_two: "tickets.underTwo", person_of_determination: "tickets.pod", senior: "tickets.senior" };

function Step({ number, title, detail, active }: { number: string; title: string; detail: string; active?: boolean }) {
  return <div className={cx("flex items-start gap-3 rounded-2xl border p-4", active ? "border-[#cce5ff] bg-[#f0f7ff]" : "border-divider bg-white")}><span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", active ? "bg-accent text-white" : "bg-fill text-body")}>{number}</span><div><b className="block text-xs text-ink">{title}</b><span className="mt-1 block text-[11px] leading-4 text-muted">{detail}</span></div></div>;
}

function toReceiptData(created: any): TicketReceiptData {
  return {
    customerName: created.customer.fullName,
    customerPhone: created.customer.phone || "",
    visitDate: created.purchase.visitDate,
    baseSubtotal: created.purchase.baseSubtotal,
    discountAmount: created.purchase.discountAmount,
    vatAmount: created.purchase.vatAmount,
    totalAmount: created.purchase.totalAmount,
    lines: created.purchase.lines.map((line: any) => ({
      ticketNumber: line.ticketNumber, ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory,
      basePrice: line.basePrice, discountAmount: line.discountAmount, vatAmount: line.vatAmount, totalAmount: line.totalAmount,
    })),
  };
}

export default function LocalTicketDeskPage() {
  const t = useT();
  const store = useLocalStore();
  const customers = store.customers;
  const purchases = store.purchases;
  const rates = useMemo(() => store.rates.filter((rate) => rate.active), [store.rates]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [ticketQuery, setTicketQuery] = useState("");
  const [form, setForm] = useState<FormState>(blankForm());
  const [lines, setLines] = useState<TicketLine[]>([blankLine(1)]);
  const [created, setCreated] = useState<any>(null);
  const [receiptWidth, setReceiptWidth] = useState<"80" | "58">("80");

  const matchedCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return [];
    return customers.filter((customer) => customer.fullName.toLowerCase().includes(q) || customer.phone.includes(q)).slice(0, 6);
  }, [customers, customerQuery]);

  const groupedPurchases = useMemo(() => {
    const q = ticketQuery.trim().toLowerCase();
    const withCustomer = purchases.map((purchase) => ({ purchase, customer: customers.find((entry) => entry.id === purchase.customerId) }));
    const filtered = q ? withCustomer.filter(({ purchase, customer }) => customer?.fullName.toLowerCase().includes(q) || customer?.phone.includes(q) || purchase.lines.some((line) => line.ticketNumber.toLowerCase().includes(q))) : withCustomer;
    return filtered.sort((a, b) => new Date(b.purchase.createdAt).getTime() - new Date(a.purchase.createdAt).getTime());
  }, [purchases, customers, ticketQuery]);

  const previewLines: PurchaseLineDraft[] = lines.map((line) => ({ rateId: Number(line.rateId || 0), ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory || null })).filter((line) => line.rateId > 0);
  const validCount = previewLines.length;
  const pricing = validCount === lines.length && validCount > 0 ? previewPurchase(previewLines) : null;

  const selectCustomer = (customer: any) => { setForm((current) => ({ ...current, customerId: String(customer.id), customerName: "", customerPhone: "" })); setCustomerQuery(""); };
  const updateLine = (id: number, patch: Partial<TicketLine>) => setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const addLine = () => setLines((current) => [...current, blankLine(Math.max(...current.map((line) => line.id), 0) + 1)]);
  const removeLine = (id: number) => setLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));

  const issuePurchaseAction = () => {
    if (!form.customerId && (!form.customerName.trim() || !form.customerPhone.trim())) return toast.error("Select a customer or add a name and phone");
    if (validCount !== lines.length) return toast.error("Select a ticket type and approved price for every line");
    try {
      const result = issuePurchase({
        customerId: form.customerId ? Number(form.customerId) : undefined, customerName: form.customerId ? undefined : form.customerName.trim(),
        customerPhone: form.customerId ? undefined : form.customerPhone.trim(), customerEmail: form.customerId ? undefined : form.customerEmail.trim() || undefined,
        visitDate: form.visitDate, paymentMethod: form.paymentMethod,
        notes: form.notes.trim() || undefined, lines: previewLines,
      });
      setCreated(result);
      setForm({ ...blankForm(), visitDate: form.visitDate });
      setLines([blankLine(1)]);
      setCustomerQuery("");
      toast.success(`${result.purchase.lines.length} ticket${result.purchase.lines.length === 1 ? "" : "s"} issued`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue this purchase");
    }
  };
  const printReceipt = async (width: "80" | "58") => {
    if (created && (await printViaAgent(toReceiptData(created)))) { toast.success("Sent to the receipt printer"); return; }
    setReceiptWidth(width);
    window.setTimeout(() => window.print(), 0);
    if (created) toast.message("Local print agent not found — opening the browser print dialog instead.");
  };

  return <>
    <PageHeader eyebrow={t("tickets.eyebrow")} title={t("tickets.title")} description={t("tickets.description")} actions={<StatusPill tone="info">{t("tickets.vatBadge")}</StatusPill>}/>
    <div className="mb-6 grid gap-3 md:grid-cols-3">
      <Step number="1" title={t("tickets.step1")} detail={t("tickets.step1Detail")} active={!form.customerId}/>
      <Step number="2" title={t("tickets.step2")} detail={t("tickets.step2Detail")} active={Boolean(form.customerId || form.customerName) && !created}/>
      <Step number="3" title={t("tickets.step3")} detail={t("tickets.step3Detail")} active={Boolean(created)}/>
    </div>
    <div className="grid gap-6 xl:grid-cols-[.88fr_1.12fr]">
      <div className="space-y-6">
        <Surface>
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("tickets.customerCard")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("tickets.customerCardHint")}</p></div><UserRound size={19} className="text-accent"/></div>
          <SearchField value={customerQuery} onChange={setCustomerQuery} placeholder={t("tickets.searchPlaceholder")}/>
          <div className="mt-3 max-h-44 overflow-y-auto rounded-2xl border border-divider bg-well">
            {customerQuery.trim() ? (matchedCustomers.length ? matchedCustomers.map((customer) => <button key={customer.id} onClick={() => selectCustomer(customer)} className="flex w-full items-center justify-between gap-3 border-b border-divider px-4 py-3 text-left last:border-0 hover:bg-[#f0f7ff]"><span><b className="block text-sm">{customer.fullName}</b><span className="mt-1 block text-xs text-muted">{customer.phone || "—"}</span></span><span className="text-xs font-semibold text-accent">{t("common.view")}</span></button>) : <div className="p-4 text-xs text-muted">{t("tickets.noProfile")}</div>) : <div className="p-4 text-xs text-muted">{t("tickets.startTyping")}</div>}
          </div>
          {form.customerId ? <div className="mt-4 flex items-center justify-between rounded-2xl bg-success-bg px-4 py-3"><span className="block text-xs font-semibold text-success">{t("tickets.savedSelected")}</span><SecondaryButton onClick={() => setForm((current) => ({ ...current, customerId: "" }))}>{t("tickets.change")}</SecondaryButton></div> : <div className="mt-5 grid gap-4">
            <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">{t("tickets.newWalkIn")}</div>
            <Field label={t("tickets.fullName")}><TextField value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })}/></Field>
            <Field label={t("common.phone")}><TextField value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} inputMode="tel" placeholder="+968 …"/></Field>
            <Field label={t("tickets.email")}><TextField type="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} placeholder="name@example.com"/></Field>
          </div>}
        </Surface>
        <Surface>
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("tickets.recentPurchases")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("tickets.recentPurchasesHint")}</p></div><StatusPill>{groupedPurchases.length}</StatusPill></div>
          <SearchField value={ticketQuery} onChange={setTicketQuery} placeholder={t("tickets.searchTickets")}/>
          <div className="mt-4">{groupedPurchases.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.25fr_.75fr_auto] gap-3"><span>{t("receipt.customer")}</span><span>{t("tickets.visitDate")}</span><span className="text-right">{t("common.total")}</span></div></TableHeader>{groupedPurchases.slice(0, 8).map(({ purchase, customer }) => <TableRow key={purchase.id} className="grid-cols-[1.25fr_.75fr_auto]"><div className="min-w-0"><div className="truncate text-sm font-medium">{customer?.fullName || "Customer"}</div><div className="mt-1 truncate font-mono text-[10px] text-accent">{purchase.lines.map((line) => line.ticketNumber).join(" · ")}</div></div><div className="text-xs text-muted">{dateLabel(purchase.visitDate)}</div><b className="text-right text-sm">{money(purchase.totalAmount)}</b></TableRow>)}</TableFrame> : <EmptyState title="No purchases yet" description="Issued purchases will appear here for quick lookup."/>}</div>
        </Surface>
      </div>
      <Surface className="h-fit">
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("tickets.visitorLines")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("tickets.visitorLinesHint")}</p></div><StatusPill tone={validCount === lines.length ? "success" : "warning"}>{validCount}/{lines.length} {t("tickets.ready")}</StatusPill></div>
        <div className="grid gap-3">{lines.map((line, index) => <div key={line.id} className="rounded-2xl border border-divider bg-well p-4">
          <div className="mb-3 flex items-center justify-between"><b className="text-sm">{t("tickets.visitor")} {index + 1}</b><button onClick={() => removeLine(line.id)} aria-label={`Remove visitor ${index + 1}`} className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={14}/></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("tickets.ticketType")}><SelectField value={line.ticketType} onChange={(event) => updateLine(line.id, { ticketType: event.target.value as PrdTicketType, rateId: "" })}><option value="waterpark">{t("tickets.waterpark")}</option><option value="companion">{t("tickets.companion")}</option></SelectField></Field>
            <Field label={t("tickets.approvedPrice")}><SelectField value={line.rateId} onChange={(event) => updateLine(line.id, { rateId: event.target.value })}><option value="">{t("tickets.choosePrice")}</option>{rates.filter((rate) => rate.ticketType === line.ticketType).map((rate) => <option key={rate.id} value={rate.id}>{rate.name} · {money(rate.unitPrice)}</option>)}</SelectField></Field>
            <Field label={t("tickets.freeEntry")}><SelectField value={line.freeEntryCategory} onChange={(event) => updateLine(line.id, { freeEntryCategory: event.target.value as TicketLine["freeEntryCategory"] })}><option value="">{t("tickets.chargeable")}</option><option value="under_two">{t("tickets.underTwo")}</option><option value="person_of_determination">{t("tickets.pod")}</option><option value="senior">{t("tickets.senior")}</option></SelectField></Field>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-muted">{t("tickets.freeHint")}</p>
        </div>)}<SecondaryButton onClick={addLine}><Plus size={15} className="mr-2"/>{t("tickets.addVisitor")}</SecondaryButton></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label={t("tickets.visitDate")}><TextField type="date" value={form.visitDate} onChange={(event) => setForm({ ...form, visitDate: event.target.value })}/></Field>
          <Field label={t("tickets.paymentMethod")}><SelectField value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as FormState["paymentMethod"] })}><option value="cash">{t("tickets.cash")}</option><option value="card">{t("tickets.card")}</option><option value="bank">{t("tickets.bank")}</option><option value="mixed">{t("tickets.mixed")}</option></SelectField></Field>
        </div>
        <div className="mt-5 rounded-[22px] bg-ink p-5 text-white">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#9abff2]">{t("tickets.pricePreview")}</div><div className="mt-2 font-serif text-4xl tracking-[-.05em]">{money(pricing?.totalAmount || 0)}</div></div><StatusPill tone={pricing ? "success" : "neutral"}>{pricing ? "Ready" : t("tickets.completeLines")}</StatusPill></div>
          {pricing && <div className="mt-4 border-t border-white/15 pt-3 text-xs text-[#d6d6da]">
            <div className="flex justify-between py-1"><span>{t("tickets.baseSubtotal")}</span><span>{money(pricing.baseSubtotal)}</span></div>
            <div className="flex justify-between py-1"><span>{t("tickets.groupDiscount")} ({pricing.discountPercentage}%)</span><span>−{money(pricing.discountAmount)}</span></div>
            <div className="flex justify-between py-1"><span>{t("tickets.vatAfterDiscount")}</span><span>{money(pricing.vatAmount)}</span></div>
            {pricing.fees?.map((fee: any) => <div key={fee.feeId} className="flex justify-between py-1"><span>{fee.label}</span><span>{money(fee.amount)}</span></div>)}
            <div className="mt-2 border-t border-white/15 pt-2">{pricing.lines.map((line: any, index: number) => <div key={`${line.rateId}-${index}`} className="flex justify-between py-1"><span>{line.label}{line.freeEntryCategory ? ` · ${t(freeKeys[line.freeEntryCategory as PrdFreeEntryCategory])}` : ""}</span><span>{money(line.totalAmount)}</span></div>)}</div>
          </div>}
        </div>
        <div className="mt-5"><Field label={t("tickets.note")}><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t("tickets.notePlaceholder")} className="min-h-[86px] rounded-xl border-line bg-well"/></Field></div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5">
          <PrimaryButton onClick={issuePurchaseAction} disabled={!pricing || validCount !== lines.length}>{t("tickets.confirmIssue")} <Ticket size={15} className="ml-2"/></PrimaryButton>
          {created && <><SecondaryButton onClick={() => printReceipt("80")}><Printer size={14} className="mr-2"/>{t("tickets.print80")}</SecondaryButton><SecondaryButton onClick={() => printReceipt("58")}><Printer size={14} className="mr-2"/>{t("tickets.print58")}</SecondaryButton></>}
        </div>
        {created && <div className="mt-5 rounded-2xl border border-[#cbead5] bg-[#effaf2] p-4"><StatusPill tone="success">{t("tickets.purchaseReady")}</StatusPill><div className="mt-2 font-mono text-lg font-semibold text-ink">{created.purchase.lines.map((line: any) => line.ticketNumber).join(" · ")}</div><p className="mt-1 text-xs leading-5 text-muted">{t("tickets.purchaseReadyHint")}</p></div>}
      </Surface>
    </div>
    {created && <TicketReceipt data={toReceiptData(created)} width={receiptWidth}/>}
  </>;
}
