import { useEffect, useMemo, useState } from "react";
import { Plus, Printer, Ticket, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Field, PageHeader, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { TicketReceipt, type TicketReceiptData } from "@/components/TicketReceipt";
import { Textarea } from "@/components/ui/textarea";
import { printViaAgent } from "@/lib/printAgent";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import { dateLabel, money, today } from "@/localApp/format";
import { useT, type TranslationKey } from "@/lib/i18n";
import { MAX_TICKETS_PER_PURCHASE, type PrdFreeEntryCategory, type PrdTicketType } from "@/localApp/pricing";
import { issuePurchase, previewPurchase, useLocalStore, type PurchaseLineDraft } from "@/localApp/store";

type FreeEntryCategory = "" | PrdFreeEntryCategory;
type TicketLine = { id: number; rateId: string; ticketType: PrdTicketType; freeEntryCategory: FreeEntryCategory };
type GroupLine = { id: number; ticketType: PrdTicketType; freeEntryCategory: FreeEntryCategory; quantity: number };
type PurchaseMode = "individual" | "group";
type FormState = { customerId: string; customerName: string; customerPhone: string; customerEmail: string; customerCountry: string; groupName: string; visitDate: string; paymentMethod: "cash" | "card" | "bank" | "mixed"; notes: string };
const blankForm = (): FormState => ({ customerId: "", customerName: "", customerPhone: "", customerEmail: "", customerCountry: DEFAULT_COUNTRY, groupName: "", visitDate: today(), paymentMethod: "cash", notes: "" });
const blankLine = (id: number): TicketLine => ({ id, rateId: "", ticketType: "waterpark", freeEntryCategory: "" });
const blankGroupLine = (id: number): GroupLine => ({ id, ticketType: "waterpark", freeEntryCategory: "", quantity: 1 });
const freeKeys: Record<PrdFreeEntryCategory, TranslationKey> = { under_two: "tickets.underTwo", person_of_determination: "tickets.pod", senior: "tickets.senior" };

function Step({ number, title, detail, active }: { number: string; title: string; detail: string; active?: boolean }) {
  return <div className={cx("flex items-start gap-3 rounded-2xl border p-4", active ? "border-[#bfe7ee] bg-[#eaf6f8]" : "border-divider bg-white")}><span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", active ? "bg-accent text-white" : "bg-fill text-body")}>{number}</span><div><b className="block text-xs text-ink">{title}</b><span className="mt-1 block text-[11px] leading-4 text-muted">{detail}</span></div></div>;
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
  const [mode, setMode] = useState<PurchaseMode>("individual");
  const [lines, setLines] = useState<TicketLine[]>([blankLine(1)]);
  const [groupLines, setGroupLines] = useState<GroupLine[]>([blankGroupLine(1)]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [receiptWidth, setReceiptWidth] = useState<"80" | "58">("80");

  const ratesForType = (ticketType: PrdTicketType) => rates.filter((rate) => rate.ticketType === ticketType);
  const resolveRateId = (ticketType: PrdTicketType) => { const matches = ratesForType(ticketType); return matches.length ? String(matches[0].id) : ""; };
  const singleRate = (ticketType: PrdTicketType) => { const matches = ratesForType(ticketType); return matches.length === 1 ? matches[0] : null; };

  useEffect(() => {
    if (!rates.length) return;
    setLines((current) => current.map((line) => line.rateId ? line : { ...line, rateId: resolveRateId(line.ticketType) }));
  }, [rates.length]);

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

  const validCount = lines.filter((line) => rates.some((rate) => String(rate.id) === line.rateId)).length;
  const individualPreviewLines: PurchaseLineDraft[] = lines.map((line) => ({ rateId: Number(line.rateId || 0), ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory || null })).filter((line) => line.rateId > 0);
  const groupPreviewLines: PurchaseLineDraft[] = groupLines.flatMap((line) => {
    const rateId = Number(resolveRateId(line.ticketType) || 0);
    const quantity = Math.max(0, Math.floor(line.quantity || 0));
    if (!rateId || !quantity) return [];
    return Array.from({ length: quantity }, () => ({ rateId, ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory || null }));
  });
  const previewLines = mode === "individual" ? individualPreviewLines : groupPreviewLines;
  const expectedLineCount = mode === "individual" ? lines.length : groupLines.reduce((sum, line) => sum + Math.max(0, Math.floor(line.quantity || 0)), 0);
  const overCapacity = expectedLineCount > MAX_TICKETS_PER_PURCHASE;
  const pricing = previewLines.length === expectedLineCount && expectedLineCount > 0 && !overCapacity ? previewPurchase(previewLines) : null;

  const selectCustomer = (customer: any) => { setForm((current) => ({ ...current, customerId: String(customer.id), customerName: "", customerPhone: "" })); setCustomerQuery(""); };
  const updateLine = (id: number, patch: Partial<TicketLine>) => setLines((current) => current.map((line) => {
    if (line.id !== id) return line;
    const next = { ...line, ...patch };
    if (patch.ticketType && patch.ticketType !== line.ticketType) next.rateId = resolveRateId(patch.ticketType);
    return next;
  }));
  const addLine = () => setLines((current) => [...current, { ...blankLine(Math.max(...current.map((line) => line.id), 0) + 1), rateId: resolveRateId("waterpark") }]);
  const removeLine = (id: number) => setLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));
  const updateGroupLine = (id: number, patch: Partial<GroupLine>) => setGroupLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const addGroupLine = () => setGroupLines((current) => [...current, blankGroupLine(Math.max(...current.map((line) => line.id), 0) + 1)]);
  const removeGroupLine = (id: number) => setGroupLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));

  const customerInvalid = !form.customerId && (!form.customerName.trim() || !form.customerPhone.trim());
  const linesInvalid = previewLines.length !== expectedLineCount || expectedLineCount === 0;

  const issuePurchaseAction = () => {
    setAttemptedSubmit(true);
    if (customerInvalid) return toast.error("Select a customer or add a name and phone");
    if (overCapacity) return toast.error(`One purchase can issue at most ${MAX_TICKETS_PER_PURCHASE} tickets — split this into two purchases`);
    if (linesInvalid) return toast.error(mode === "group" ? "Every group line needs a ticket type and a quantity of at least 1" : "Select a ticket type and approved price for every line");
    try {
      const result = issuePurchase({
        customerId: form.customerId ? Number(form.customerId) : undefined, customerName: form.customerId ? undefined : form.customerName.trim(),
        customerPhone: form.customerId ? undefined : form.customerPhone.trim(), customerEmail: form.customerId ? undefined : form.customerEmail.trim() || undefined,
        customerCountry: form.customerId ? undefined : form.customerCountry.trim() || undefined,
        visitDate: form.visitDate, paymentMethod: form.paymentMethod,
        notes: (mode === "group" && form.groupName.trim() ? `Group: ${form.groupName.trim()}${form.notes.trim() ? " — " : ""}` : "") + form.notes.trim() || undefined,
        lines: previewLines,
      });
      setCreated(result);
      setForm({ ...blankForm(), visitDate: form.visitDate });
      setLines([blankLine(1)]);
      setGroupLines([blankGroupLine(1)]);
      setAttemptedSubmit(false);
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
  const reprintPurchase = (purchase: any, customer: any) => {
    setCreated({ purchase, customer });
    toast.success("Ready to reprint — use the receipt buttons below");
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
            {customerQuery.trim() ? (matchedCustomers.length ? matchedCustomers.map((customer) => <button key={customer.id} onClick={() => selectCustomer(customer)} className="flex w-full items-center justify-between gap-3 border-b border-divider px-4 py-3 text-left last:border-0 hover:bg-[#eaf6f8]"><span><b className="block text-sm">{customer.fullName}</b><span className="mt-1 block text-xs text-muted">{customer.phone || "—"}</span></span><span className="text-xs font-semibold text-accent">{t("common.view")}</span></button>) : <div className="p-4 text-xs text-muted">{t("tickets.noProfile")}</div>) : <div className="p-4 text-xs text-muted">{t("tickets.startTyping")}</div>}
          </div>
          {form.customerId ? <div className="mt-4 flex items-center justify-between rounded-2xl bg-success-bg px-4 py-3"><span className="block text-xs font-semibold text-success">{t("tickets.savedSelected")}</span><SecondaryButton onClick={() => setForm((current) => ({ ...current, customerId: "" }))}>{t("tickets.change")}</SecondaryButton></div> : <div className="mt-5 grid gap-4">
            <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">{t("tickets.newWalkIn")}</div>
            <Field label={t("tickets.fullName")} error={attemptedSubmit && customerInvalid && !form.customerName.trim() ? t("common.required") : undefined}><TextField value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} className={attemptedSubmit && customerInvalid && !form.customerName.trim() ? "border-danger ring-1 ring-danger/30" : undefined}/></Field>
            <Field label={t("common.phone")} error={attemptedSubmit && customerInvalid && !form.customerPhone.trim() ? t("common.required") : undefined}><TextField value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} inputMode="tel" placeholder="+968 …" className={attemptedSubmit && customerInvalid && !form.customerPhone.trim() ? "border-danger ring-1 ring-danger/30" : undefined}/></Field>
            <Field label={t("tickets.email")}><TextField type="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} placeholder="name@example.com"/></Field>
            <Field label={t("common.country")}><SelectField value={form.customerCountry} onChange={(event) => setForm({ ...form, customerCountry: event.target.value })}>{COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}</SelectField></Field>
          </div>}
        </Surface>
        <Surface>
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("tickets.recentPurchases")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("tickets.recentPurchasesHint")}</p></div><StatusPill>{groupedPurchases.length}</StatusPill></div>
          <SearchField value={ticketQuery} onChange={setTicketQuery} placeholder={t("tickets.searchTickets")}/>
          <div className="mt-4">{groupedPurchases.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.1fr_.65fr_.55fr_auto] gap-3"><span>{t("receipt.customer")}</span><span>{t("tickets.visitDate")}</span><span>{t("common.total")}</span><span className="text-right">{t("tickets.reprint")}</span></div></TableHeader>{groupedPurchases.slice(0, 8).map(({ purchase, customer }) => <TableRow key={purchase.id} className="grid-cols-[1.1fr_.65fr_.55fr_auto]"><div className="min-w-0"><div className="truncate text-sm font-medium">{customer?.fullName || "Customer"}</div><div className="mt-1 truncate font-mono text-[10px] text-accent">{purchase.lines.map((line) => line.ticketNumber).join(" · ")}</div></div><div className="text-xs text-muted">{dateLabel(purchase.visitDate)}</div><b className="text-sm">{money(purchase.totalAmount)}</b><button onClick={() => reprintPurchase(purchase, customer)} aria-label="Reprint this ticket" className="justify-self-end rounded-full bg-fill p-2 text-muted hover:bg-[#e8e8ed] hover:text-ink"><Printer size={14}/></button></TableRow>)}</TableFrame> : <EmptyState title="No purchases yet" description="Issued purchases will appear here for quick lookup."/>}</div>
        </Surface>
      </div>
      <Surface className="h-fit">
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("tickets.visitorLines")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("tickets.visitorLinesHint")}</p></div><StatusPill tone={mode === "individual" ? (validCount === lines.length ? "success" : "warning") : (overCapacity ? "danger" : linesInvalid ? "warning" : "success")}>{mode === "individual" ? `${validCount}/${lines.length} ${t("tickets.ready")}` : overCapacity ? `${expectedLineCount} — over ${MAX_TICKETS_PER_PURCHASE} limit` : `${expectedLineCount} ${t("tickets.ticketsCount")}`}</StatusPill></div>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-well p-1">
          <button onClick={() => setMode("individual")} className={cx("flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition", mode === "individual" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}><UserRound size={14}/>{t("tickets.individual")}</button>
          <button onClick={() => setMode("group")} className={cx("flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition", mode === "group" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}><Users size={14}/>{t("tickets.group")}</button>
        </div>
        {mode === "group" && <div className="mb-4"><Field label={t("tickets.groupName")}><TextField value={form.groupName} onChange={(event) => setForm({ ...form, groupName: event.target.value })} placeholder="e.g. Al Falaj School Trip"/></Field></div>}
        {mode === "individual" ? <div className="grid gap-3">{lines.map((line, index) => {
          const rate = singleRate(line.ticketType);
          const lineMissingRate = attemptedSubmit && !line.rateId;
          return <div key={line.id} className={cx("rounded-2xl border bg-well p-4", lineMissingRate ? "border-danger" : "border-divider")}>
            <div className="mb-3 flex items-center justify-between"><b className="text-sm">{t("tickets.visitor")} {index + 1}</b><button onClick={() => removeLine(line.id)} aria-label={`Remove visitor ${index + 1}`} className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={14}/></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("tickets.ticketType")}><SelectField value={line.ticketType} onChange={(event) => updateLine(line.id, { ticketType: event.target.value as PrdTicketType })}><option value="waterpark">{t("tickets.waterpark")}</option><option value="companion">{t("tickets.companion")}</option></SelectField></Field>
              {rate ? <Field label={t("tickets.price")}><div className="flex h-11 items-center rounded-xl border border-line bg-fill px-3.5 text-sm text-ink">{rate.name} · {money(rate.unitPrice)}</div></Field> : <Field label={t("tickets.approvedPrice")} error={lineMissingRate ? t("common.required") : undefined}><SelectField value={line.rateId} onChange={(event) => updateLine(line.id, { rateId: event.target.value })} className={lineMissingRate ? "border-danger ring-1 ring-danger/30" : undefined}><option value="">{t("tickets.choosePrice")}</option>{ratesForType(line.ticketType).map((r) => <option key={r.id} value={r.id}>{r.name} · {money(r.unitPrice)}</option>)}</SelectField></Field>}
              <Field label={t("tickets.freeEntry")}><SelectField value={line.freeEntryCategory} onChange={(event) => updateLine(line.id, { freeEntryCategory: event.target.value as FreeEntryCategory })}><option value="">{t("tickets.chargeable")}</option><option value="under_two">{t("tickets.underTwo")}</option><option value="person_of_determination">{t("tickets.pod")}</option><option value="senior">{t("tickets.senior")}</option></SelectField></Field>
            </div>
            <p className="mt-3 text-[11px] leading-4 text-muted">{t("tickets.freeHint")}</p>
          </div>;
        })}<SecondaryButton onClick={addLine}><Plus size={15} className="mr-2"/>{t("tickets.addVisitor")}</SecondaryButton></div>
        : <div className="grid gap-3">{groupLines.map((line, index) => {
          const rate = singleRate(line.ticketType);
          const lineInvalid = attemptedSubmit && (!rate || !line.quantity || line.quantity < 1);
          return <div key={line.id} className={cx("rounded-2xl border bg-well p-4", lineInvalid ? "border-danger" : "border-divider")}>
            <div className="mb-3 flex items-center justify-between"><b className="text-sm">{t("tickets.groupLine")} {index + 1}</b><button onClick={() => removeGroupLine(line.id)} aria-label={`Remove group line ${index + 1}`} className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={14}/></button></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("tickets.ticketType")}><SelectField value={line.ticketType} onChange={(event) => updateGroupLine(line.id, { ticketType: event.target.value as PrdTicketType })}><option value="waterpark">{t("tickets.waterpark")}</option><option value="companion">{t("tickets.companion")}</option></SelectField></Field>
              <Field label={t("tickets.freeEntry")}><SelectField value={line.freeEntryCategory} onChange={(event) => updateGroupLine(line.id, { freeEntryCategory: event.target.value as FreeEntryCategory })}><option value="">{t("tickets.chargeable")}</option><option value="under_two">{t("tickets.underTwo")}</option><option value="person_of_determination">{t("tickets.pod")}</option><option value="senior">{t("tickets.senior")}</option></SelectField></Field>
              <Field label={t("tickets.quantity")} error={attemptedSubmit && (!line.quantity || line.quantity < 1) ? t("common.required") : undefined}><TextField type="number" min={1} value={line.quantity} onChange={(event) => updateGroupLine(line.id, { quantity: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} className={attemptedSubmit && (!line.quantity || line.quantity < 1) ? "border-danger ring-1 ring-danger/30" : undefined}/></Field>
            </div>
            {rate ? <p className="mt-3 text-[11px] leading-4 text-muted">{rate.name} · {money(rate.unitPrice)} — {line.quantity || 0} × </p> : <p className="mt-3 text-[11px] leading-4 text-danger">{t("tickets.noRateForType")}</p>}
          </div>;
        })}<SecondaryButton onClick={addGroupLine}><Plus size={15} className="mr-2"/>{t("tickets.addGroupLine")}</SecondaryButton></div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label={t("tickets.visitDate")}><TextField type="date" value={form.visitDate} onChange={(event) => setForm({ ...form, visitDate: event.target.value })}/></Field>
          <Field label={t("tickets.paymentMethod")}><SelectField value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as FormState["paymentMethod"] })}><option value="cash">{t("tickets.cash")}</option><option value="card">{t("tickets.card")}</option><option value="bank">{t("tickets.bank")}</option><option value="mixed">{t("tickets.mixed")}</option></SelectField></Field>
        </div>
        <div className="mt-5 rounded-[22px] bg-navy p-5 text-white">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-teal-tint">{t("tickets.pricePreview")}</div><div className="mt-2 font-serif text-4xl tracking-[-.05em]">{money(pricing?.totalAmount || 0)}</div></div><StatusPill tone={pricing ? "success" : "neutral"}>{pricing ? "Ready" : t("tickets.completeLines")}</StatusPill></div>
          {pricing && <div className="mt-4 border-t border-white/15 pt-3 text-xs text-[#d6d6da]">
            <div className="flex justify-between py-1"><span>{t("tickets.baseSubtotal")}</span><span>{money(pricing.baseSubtotal)}</span></div>
            <div className="flex justify-between py-1"><span>{t("tickets.groupDiscount")} ({pricing.discountPercentage}%)</span><span>−{money(pricing.discountAmount)}</span></div>
            <div className="flex justify-between py-1"><span>{t("tickets.vatAfterDiscount")}</span><span>{money(pricing.vatAmount)}</span></div>
            {pricing.fees?.map((fee: any) => <div key={fee.feeId} className="flex justify-between py-1"><span>{fee.label}</span><span>{money(fee.amount)}</span></div>)}
            {mode === "individual" && <div className="mt-2 border-t border-white/15 pt-2">{pricing.lines.map((line: any, index: number) => <div key={`${line.rateId}-${index}`} className="flex justify-between py-1"><span>{line.label}{line.freeEntryCategory ? ` · ${t(freeKeys[line.freeEntryCategory as PrdFreeEntryCategory])}` : ""}</span><span>{money(line.totalAmount)}</span></div>)}</div>}
          </div>}
        </div>
        <div className="mt-5"><Field label={t("tickets.note")}><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t("tickets.notePlaceholder")} className="min-h-[86px] rounded-xl border-line bg-well"/></Field></div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5">
          <PrimaryButton onClick={issuePurchaseAction}>{t("tickets.confirmIssue")} <Ticket size={15} className="ml-2"/></PrimaryButton>
          {created && <><SecondaryButton onClick={() => printReceipt("80")}><Printer size={14} className="mr-2"/>{t("tickets.print80")}</SecondaryButton><SecondaryButton onClick={() => printReceipt("58")}><Printer size={14} className="mr-2"/>{t("tickets.print58")}</SecondaryButton></>}
        </div>
        {created && <div className="mt-5 rounded-2xl border border-[#cbead5] bg-[#effaf2] p-4"><StatusPill tone="success">{t("tickets.purchaseReady")}</StatusPill><div className="mt-2 font-mono text-lg font-semibold text-ink">{created.purchase.lines.length > 3 ? `#${created.purchase.lines[0].ticketNumber}–#${created.purchase.lines[created.purchase.lines.length - 1].ticketNumber} (×${created.purchase.lines.length})` : created.purchase.lines.map((line: any) => line.ticketNumber).join(" · ")}</div><p className="mt-1 text-xs leading-5 text-muted">{t("tickets.purchaseReadyHint")}</p></div>}
      </Surface>
    </div>
    {created && <TicketReceipt data={toReceiptData(created)} width={receiptWidth}/>}
  </>;
}
