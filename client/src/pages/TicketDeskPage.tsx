import { useEffect, useMemo, useState } from "react";
import { Plus, Printer, Ticket, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { EmptyState, Field, PageHeader, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { TicketReceipt, type TicketReceiptData } from "@/components/TicketReceipt";
import { Textarea } from "@/components/ui/textarea";
import { printViaAgent } from "@/lib/printAgent";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";

const today = new Date().toISOString().slice(0, 10);
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const freeLabels: Record<string, string> = { under_two: "Under 2 years", person_of_determination: "Person of determination", senior: "Retiree / senior" };
type TicketType = "waterpark" | "companion";
type FreeEntryCategory = "" | "under_two" | "person_of_determination" | "senior";
type TicketLine = { id: number; rateId: string; ticketType: TicketType; freeEntryCategory: FreeEntryCategory };
type GroupLine = { id: number; ticketType: TicketType; freeEntryCategory: FreeEntryCategory; quantity: number };
type PurchaseMode = "individual" | "group";
type FormState = { customerId: string; customerName: string; customerPhone: string; customerEmail: string; customerCountry: string; groupName: string; visitDate: string; paymentMethod: "cash" | "card" | "bank" | "mixed"; notes: string };
const blankForm: FormState = { customerId: "", customerName: "", customerPhone: "", customerEmail: "", customerCountry: DEFAULT_COUNTRY, groupName: "", visitDate: today, paymentMethod: "cash", notes: "" };
const blankLine = (id: number): TicketLine => ({ id, rateId: "", ticketType: "waterpark", freeEntryCategory: "" });
const blankGroupLine = (id: number): GroupLine => ({ id, ticketType: "waterpark", freeEntryCategory: "", quantity: 1 });

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
    lines: created.lines.map((line: any) => ({
      ticketNumber: line.ticketNumber, ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory,
      basePrice: line.basePrice, discountAmount: line.discountAmount, vatAmount: line.vatAmount, totalAmount: line.totalAmount,
    })),
  };
}

export default function TicketDeskPage() {
  const utils = trpc.useUtils();
  const [customerQuery, setCustomerQuery] = useState("");
  const [ticketQuery, setTicketQuery] = useState("");
  const [form, setForm] = useState<FormState>(blankForm);
  const [mode, setMode] = useState<PurchaseMode>("individual");
  const [lines, setLines] = useState<TicketLine[]>([blankLine(1)]);
  const [groupLines, setGroupLines] = useState<GroupLine[]>([blankGroupLine(1)]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [receiptWidth, setReceiptWidth] = useState<"80" | "58">("80");
  const [reprintingId, setReprintingId] = useState<number | null>(null);
  const { data: catalog } = trpc.platform.tickets.prdCatalog.useQuery();
  const rates = (catalog?.rates || []) as any[];
  const maxTicketsPerPurchase = catalog?.maxTicketsPerPurchase ?? 2000;
  const { data: customers = [], isLoading: customersLoading } = trpc.platform.customers.search.useQuery({ query: customerQuery.trim() || undefined });
  const { data: purchaseRows = [], isLoading: purchasesLoading } = trpc.platform.tickets.purchaseList.useQuery({ query: ticketQuery.trim() || undefined });

  const ratesForType = (ticketType: TicketType) => rates.filter((rate) => rate.ticketType === ticketType);
  const resolveRateId = (ticketType: TicketType) => { const matches = ratesForType(ticketType); return matches.length ? String(matches[0].id) : ""; };
  const singleRate = (ticketType: TicketType) => { const matches = ratesForType(ticketType); return matches.length === 1 ? matches[0] : null; };

  // Once rates load, silently fill in the rate for any individual line that
  // hasn't had one chosen yet — most resorts only have one price per ticket
  // type, so there is nothing for staff to pick (see 2.1: the "approved
  // base price" dropdown was flagged as a redundant extra click).
  useEffect(() => {
    if (!rates.length) return;
    setLines((current) => current.map((line) => line.rateId ? line : { ...line, rateId: resolveRateId(line.ticketType) }));
  }, [rates.length]);

  const validLines = lines.filter((line) => rates.some((rate) => String(rate.id) === line.rateId));
  const previewLines = mode === "individual"
    ? lines.map((line) => ({ rateId: Number(line.rateId || 0), ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory || null })).filter((line) => line.rateId > 0)
    : groupLines.flatMap((line) => {
        const rateId = Number(resolveRateId(line.ticketType) || 0);
        const quantity = Math.max(0, Math.floor(line.quantity || 0));
        if (!rateId || !quantity) return [];
        return Array.from({ length: quantity }, () => ({ rateId, ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory || null }));
      });
  const expectedLineCount = mode === "individual" ? lines.length : groupLines.reduce((sum, line) => sum + Math.max(0, Math.floor(line.quantity || 0)), 0);
  const { data: pricing } = trpc.platform.tickets.purchasePreview.useQuery({ lines: previewLines }, { enabled: previewLines.length === expectedLineCount && expectedLineCount > 0 && expectedLineCount <= maxTicketsPerPurchase });
  const groupedPurchases = useMemo(() => {
    const map = new Map<number, any>();
    (purchaseRows as any[]).forEach((row) => { const id = row.purchase.id; const current = map.get(id) || { ...row, lines: [] }; if (row.line) current.lines.push(row.line); map.set(id, current); });
    return Array.from(map.values());
  }, [purchaseRows]);
  const issue = trpc.platform.tickets.purchaseCreate.useMutation({
    onSuccess: (result: any) => {
      setCreated(result); setForm((current) => ({ ...blankForm, visitDate: current.visitDate })); setLines([blankLine(1)]); setGroupLines([blankGroupLine(1)]); setAttemptedSubmit(false); setCustomerQuery("");
      utils.platform.tickets.purchaseList.invalidate(); utils.platform.customers.search.invalidate(); utils.platform.finance.invalidate();
      toast.success(`${result.lines.length} ticket${result.lines.length === 1 ? "" : "s"} issued`);
    },
    onError: (error) => toast.error(error.message),
  });
  const selectCustomer = (customer: any) => { setForm((current) => ({ ...current, customerId: String(customer.id), customerName: "", customerPhone: "" })); setCustomerQuery(""); };
  const updateLine = (id: number, patch: Partial<TicketLine>) => setLines((current) => current.map((line) => {
    if (line.id !== id) return line;
    const next = { ...line, ...patch };
    if (patch.ticketType && patch.ticketType !== line.ticketType) next.rateId = resolveRateId(patch.ticketType);
    return next;
  }));
  const addLine = () => setLines((current) => [...current, { ...blankLine(Math.max(...current.map((line) => line.id), 0) + 1), rateId: resolveRateId("waterpark") }]);
  const removeLine = (id: number) => setLines((current) => current.length === 1 ? current : current.filter((line) => line.id !== id));
  const updateGroupLine = (id: number, patch: Partial<GroupLine>) => setGroupLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const addGroupLine = () => setGroupLines((current) => [...current, blankGroupLine(Math.max(...current.map((line) => line.id), 0) + 1)]);
  const removeGroupLine = (id: number) => setGroupLines((current) => current.length === 1 ? current : current.filter((line) => line.id !== id));

  const customerInvalid = !form.customerId && (!form.customerName.trim() || !form.customerPhone.trim());
  const linesInvalid = previewLines.length !== expectedLineCount || expectedLineCount === 0;
  const overCapacity = expectedLineCount > maxTicketsPerPurchase;

  const issuePurchase = () => {
    setAttemptedSubmit(true);
    if (customerInvalid) return toast.error("Select a customer or add a name and phone");
    if (overCapacity) return toast.error(`One purchase can issue at most ${maxTicketsPerPurchase} tickets — split this into two purchases`);
    if (linesInvalid) return toast.error(mode === "group" ? "Every group line needs a ticket type and a quantity of at least 1" : "Select a ticket type and approved price for every line");
    if (!pricing) return toast.error("Waiting on the price preview — try again in a moment");
    issue.mutate({
      customerId: form.customerId ? Number(form.customerId) : undefined,
      customerName: form.customerId ? undefined : form.customerName.trim(),
      customerPhone: form.customerId ? undefined : form.customerPhone.trim(),
      customerEmail: form.customerId ? undefined : form.customerEmail.trim() || undefined,
      customerNationality: form.customerId ? undefined : form.customerCountry.trim() || undefined,
      visitDate: form.visitDate, paymentMethod: form.paymentMethod,
      notes: (mode === "group" && form.groupName.trim() ? `Group: ${form.groupName.trim()}${form.notes.trim() ? " — " : ""}` : "") + form.notes.trim() || undefined,
      lines: previewLines,
    });
  };
  const printReceipt = async (width: "80" | "58") => {
    if (created && (await printViaAgent(toReceiptData(created)))) { toast.success("Sent to the receipt printer"); return; }
    setReceiptWidth(width);
    window.setTimeout(() => window.print(), 0);
    if (created) toast.message("Local print agent not found — opening the browser print dialog instead.");
  };
  const reprintPurchase = async (entry: any) => {
    setReprintingId(entry.purchase.id);
    try {
      const lines = await utils.platform.tickets.purchaseLines.fetch({ purchaseId: entry.purchase.id });
      setCreated({ customer: entry.customer, purchase: entry.purchase, lines });
      toast.success("Ready to reprint — use the receipt buttons below");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this ticket for reprinting");
    } finally {
      setReprintingId(null);
    }
  };

  return <>
    <PageHeader eyebrow="Front office · ticketing" title="Issue tickets" description="Build one purchase with Waterpark or Companion lines, apply the PRD rules, and print a normal receipt." actions={<StatusPill tone="info">5% VAT · server calculated</StatusPill>}/>
    <div className="mb-6 grid gap-3 md:grid-cols-3"><Step number="1" title="Customer" detail="Search a saved profile or add a walk-in." active={!form.customerId}/><Step number="2" title="Visitors" detail="Select ticket type and free-entry status per person." active={Boolean(form.customerId || form.customerName) && !created}/><Step number="3" title="Receipt" detail="Review discount, VAT, fees, and print." active={Boolean(created)}/></div>
    <div className="grid gap-6 xl:grid-cols-[.88fr_1.12fr]">
      <div className="space-y-6">
        <Surface><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">Customer</h2><p className="mt-1.5 text-xs leading-5 text-muted">One customer record anchors this purchase and its visit history.</p></div><UserRound size={19} className="text-accent"/></div><SearchField value={customerQuery} onChange={setCustomerQuery} placeholder="Search by name or phone"/><div className="mt-3 max-h-44 overflow-y-auto rounded-2xl border border-divider bg-well">{customerQuery.trim() ? customersLoading ? <div className="p-4 text-xs text-muted">Searching customers…</div> : customers.length ? (customers as any[]).slice(0, 6).map((customer: any) => <button key={customer.id} onClick={() => selectCustomer(customer)} className="flex w-full items-center justify-between gap-3 border-b border-divider px-4 py-3 text-left last:border-0 hover:bg-[#eaf6f8]"><span><b className="block text-sm">{customer.fullName}</b><span className="mt-1 block text-xs text-muted">{customer.phone || "No phone"}</span></span><span className="text-xs font-semibold text-accent">Select</span></button>) : <div className="p-4 text-xs text-muted">No profile found. Add the walk-in details below.</div> : <div className="p-4 text-xs text-muted">Start typing to find an existing customer.</div>}</div>{form.customerId ? <div className="mt-4 flex items-center justify-between rounded-2xl bg-success-bg px-4 py-3"><div><span className="block text-xs font-semibold text-success">Saved customer selected</span><span className="mt-1 block text-xs text-muted">ID {form.customerId}</span></div><SecondaryButton onClick={() => setForm((current) => ({ ...current, customerId: "" }))}>Change</SecondaryButton></div> : <div className="mt-5 grid gap-4"><div className="text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">New walk-in</div><Field label="Full name" error={attemptedSubmit && customerInvalid && !form.customerName.trim() ? "Required" : undefined}><TextField value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="Customer full name" className={attemptedSubmit && customerInvalid && !form.customerName.trim() ? "border-danger ring-1 ring-danger/30" : undefined}/></Field><Field label="Phone number" error={attemptedSubmit && customerInvalid && !form.customerPhone.trim() ? "Required" : undefined}><TextField value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} inputMode="tel" placeholder="+968 …" className={attemptedSubmit && customerInvalid && !form.customerPhone.trim() ? "border-danger ring-1 ring-danger/30" : undefined}/></Field><Field label="Email (optional)"><TextField type="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} placeholder="name@example.com"/></Field><Field label="Country"><SelectField value={form.customerCountry} onChange={(event) => setForm({ ...form, customerCountry: event.target.value })}>{COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}</SelectField></Field></div>}</Surface>
        <Surface><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">Recent purchases</h2><p className="mt-1.5 text-xs leading-5 text-muted">Continuous ticket numbers and customer visits.</p></div><StatusPill>{groupedPurchases.length} purchases</StatusPill></div><SearchField value={ticketQuery} onChange={setTicketQuery} placeholder="Ticket number, customer, or phone"/><div className="mt-4">{purchasesLoading ? <div className="p-4 text-sm text-muted">Loading purchase history…</div> : groupedPurchases.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.15fr_.7fr_.55fr_auto] gap-3"><span>Customer / ticket</span><span>Visit</span><span>Total</span><span className="text-right">Reprint</span></div></TableHeader>{groupedPurchases.slice(0, 8).map((entry: any) => <TableRow key={entry.purchase.id} className="grid-cols-[1.15fr_.7fr_.55fr_auto]"><div className="min-w-0"><div className="truncate text-sm font-medium">{entry.customer?.fullName || "Customer"}</div><div className="mt-1 truncate font-mono text-[10px] text-accent">{entry.lines.map((line: any) => line.ticketNumber).join(" · ")}</div></div><div className="text-xs text-muted">{dateLabel(entry.purchase.visitDate)}</div><b className="text-sm">{money(entry.purchase.totalAmount)}</b><button onClick={() => reprintPurchase(entry)} disabled={reprintingId === entry.purchase.id} aria-label="Reprint this ticket" className="justify-self-end rounded-full bg-fill p-2 text-muted hover:bg-[#e8e8ed] hover:text-ink disabled:opacity-50"><Printer size={14}/></button></TableRow>)}</TableFrame> : <EmptyState title="No purchases yet" description="Issued purchases will appear here for quick lookup."/>}</div></Surface>
      </div>
      <Surface className="h-fit">
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">Visitor lines</h2><p className="mt-1.5 text-xs leading-5 text-muted">Choose the correct type strictly by pool use, not by age or relationship.</p></div><StatusPill tone={mode === "individual" ? (validLines.length === lines.length ? "success" : "warning") : (overCapacity ? "danger" : linesInvalid ? "warning" : "success")}>{mode === "individual" ? `${validLines.length}/${lines.length} ready` : overCapacity ? `${expectedLineCount} tickets — over ${maxTicketsPerPurchase} limit` : `${expectedLineCount} tickets`}</StatusPill></div>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-well p-1">
          <button onClick={() => setMode("individual")} className={cx("flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition", mode === "individual" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}><UserRound size={14}/>Individual</button>
          <button onClick={() => setMode("group")} className={cx("flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition", mode === "group" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}><Users size={14}/>Group</button>
        </div>
        {mode === "group" && <div className="mb-4"><Field label="Group / booking name (optional)"><TextField value={form.groupName} onChange={(event) => setForm({ ...form, groupName: event.target.value })} placeholder="e.g. Al Falaj School Trip"/></Field></div>}
        {mode === "individual" ? <div className="grid gap-3">{lines.map((line, index) => {
          const rate = singleRate(line.ticketType);
          const lineMissingRate = attemptedSubmit && !line.rateId;
          return <div key={line.id} className={cx("rounded-2xl border bg-well p-4", lineMissingRate ? "border-danger" : "border-divider")}>
            <div className="mb-3 flex items-center justify-between"><b className="text-sm">Visitor {index + 1}</b><button onClick={() => removeLine(line.id)} aria-label={`Remove visitor ${index + 1}`} className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={14}/></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ticket type"><SelectField value={line.ticketType} onChange={(event) => updateLine(line.id, { ticketType: event.target.value as TicketType })}><option value="waterpark">Waterpark · uses pool</option><option value="companion">Companion · does not use pool</option></SelectField></Field>
              {rate ? <Field label="Price"><div className="flex h-11 items-center rounded-xl border border-line bg-fill px-3.5 text-sm text-ink">{rate.name} · {money(rate.unitPrice)}</div></Field> : <Field label="Approved base price" error={lineMissingRate ? "Required" : undefined}><SelectField value={line.rateId} onChange={(event) => updateLine(line.id, { rateId: event.target.value })} className={lineMissingRate ? "border-danger ring-1 ring-danger/30" : undefined}><option value="">Choose {line.ticketType} price</option>{ratesForType(line.ticketType).map((r) => <option key={r.id} value={r.id}>{r.name} · {money(r.unitPrice)}</option>)}</SelectField></Field>}
              <Field label="Free entry category"><SelectField value={line.freeEntryCategory} onChange={(event) => updateLine(line.id, { freeEntryCategory: event.target.value as FreeEntryCategory })}><option value="">Chargeable visitor</option><option value="under_two">Under 2 years old</option><option value="person_of_determination">Person of determination</option><option value="senior">Retiree / senior citizen</option></SelectField></Field>
            </div>
            <p className="mt-3 text-[11px] leading-4 text-muted">Free lines are issued for headcount but excluded from the group-discount count.</p>
          </div>;
        })}<SecondaryButton onClick={addLine}><Plus size={15} className="mr-2"/>Add visitor line</SecondaryButton></div>
        : <div className="grid gap-3">{groupLines.map((line, index) => {
          const rate = singleRate(line.ticketType);
          const lineInvalid = attemptedSubmit && (!rate || !line.quantity || line.quantity < 1);
          return <div key={line.id} className={cx("rounded-2xl border bg-well p-4", lineInvalid ? "border-danger" : "border-divider")}>
            <div className="mb-3 flex items-center justify-between"><b className="text-sm">Group line {index + 1}</b><button onClick={() => removeGroupLine(line.id)} aria-label={`Remove group line ${index + 1}`} className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={14}/></button></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Ticket type"><SelectField value={line.ticketType} onChange={(event) => updateGroupLine(line.id, { ticketType: event.target.value as TicketType })}><option value="waterpark">Waterpark · uses pool</option><option value="companion">Companion · does not use pool</option></SelectField></Field>
              <Field label="Free entry category"><SelectField value={line.freeEntryCategory} onChange={(event) => updateGroupLine(line.id, { freeEntryCategory: event.target.value as FreeEntryCategory })}><option value="">Chargeable visitors</option><option value="under_two">Under 2 years old</option><option value="person_of_determination">Person of determination</option><option value="senior">Retiree / senior citizen</option></SelectField></Field>
              <Field label="Quantity" error={attemptedSubmit && (!line.quantity || line.quantity < 1) ? "At least 1" : undefined}><TextField type="number" min={1} value={line.quantity} onChange={(event) => updateGroupLine(line.id, { quantity: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} className={attemptedSubmit && (!line.quantity || line.quantity < 1) ? "border-danger ring-1 ring-danger/30" : undefined}/></Field>
            </div>
            {rate ? <p className="mt-3 text-[11px] leading-4 text-muted">{rate.name} · {money(rate.unitPrice)} each — {line.quantity || 0} ticket{line.quantity === 1 ? "" : "s"} of this type.</p> : <p className="mt-3 text-[11px] leading-4 text-danger">No {line.ticketType} price is configured yet — ask a super admin to add one.</p>}
          </div>;
        })}<SecondaryButton onClick={addGroupLine}><Plus size={15} className="mr-2"/>Add group line</SecondaryButton></div>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Visit date"><TextField type="date" value={form.visitDate} onChange={(event) => setForm({ ...form, visitDate: event.target.value })}/></Field><Field label="Payment method"><SelectField value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as FormState["paymentMethod"] })}><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option><option value="mixed">Mixed</option></SelectField></Field></div>
        <div className="mt-5 rounded-[22px] bg-navy p-5 text-white"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-teal-tint">PRD price preview</div><div className="mt-2 font-serif text-4xl tracking-[-.05em]">{money(pricing?.totalAmount || 0)}</div></div><StatusPill tone={pricing ? "success" : "neutral"}>{pricing ? "Ready" : "Complete lines"}</StatusPill></div>{pricing && <div className="mt-4 border-t border-white/15 pt-3 text-xs text-[#d6d6da]"><div className="flex justify-between py-1"><span>Base subtotal</span><span>{money(pricing.baseSubtotal)}</span></div><div className="flex justify-between py-1"><span>Group discount ({pricing.discountPercentage}%)</span><span>−{money(pricing.discountAmount)}</span></div><div className="flex justify-between py-1"><span>VAT (5%) after discount</span><span>{money(pricing.vatAmount)}</span></div>{pricing.fees?.map((fee: any) => <div key={fee.code} className="flex justify-between py-1"><span>{fee.label}</span><span>{money(fee.amount)}</span></div>)}{mode === "individual" && <div className="mt-2 border-t border-white/15 pt-2">{pricing.lines.map((line: any, index: number) => <div key={`${line.rateId}-${index}`} className="flex justify-between py-1"><span>{line.label}{line.freeEntryCategory ? ` · ${freeLabels[line.freeEntryCategory]}` : ""}</span><span>{money(line.totalAmount)}</span></div>)}</div>}</div>}</div>
        <div className="mt-5"><Field label="Note (optional)"><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Short note for this purchase" className="min-h-[86px] rounded-xl border-line bg-well"/></Field></div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={issuePurchase} pending={issue.isPending}>Confirm & issue purchase <Ticket size={15} className="ml-2"/></PrimaryButton>{created && <><SecondaryButton onClick={() => printReceipt("80")}><Printer size={14} className="mr-2"/>80 mm receipt</SecondaryButton><SecondaryButton onClick={() => printReceipt("58")}><Printer size={14} className="mr-2"/>58 mm</SecondaryButton></>}</div>
        {created && <div className="mt-5 rounded-2xl border border-[#cbead5] bg-[#effaf2] p-4"><StatusPill tone="success">Purchase ready</StatusPill><div className="mt-2 font-mono text-lg font-semibold text-ink">{created.lines.length > 3 ? `#${created.lines[0].ticketNumber}–#${created.lines[created.lines.length - 1].ticketNumber} (×${created.lines.length})` : created.lines.map((line: any) => line.ticketNumber).join(" · ")}</div><p className="mt-1 text-xs leading-5 text-muted">Print the normal receipt for the customer. Ticket numbers continue across all visits.</p></div>}
      </Surface>
    </div>
    {created && <TicketReceipt data={toReceiptData(created)} width={receiptWidth}/>}
  </>;
}
