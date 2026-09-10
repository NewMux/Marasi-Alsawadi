import { useMemo, useState } from "react";
import { Plus, Printer, Ticket, Trash2, Undo2, UserRound, Users, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { CountryField, DateField, EmptyState, Field, PageHeader, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { TicketReceipt, type TicketReceiptData } from "@/components/TicketReceipt";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { printViaAgent } from "@/lib/printAgent";
import { applyCountryDialCode, COUNTRY_DIAL_CODES, DEFAULT_COUNTRY } from "@/lib/countries";
import { useT } from "@/lib/i18n";

const today = new Date().toISOString().slice(0, 10);
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
type TicketGroup = "water_park" | "other_tickets";
type GroupLine = { id: number; categoryId: string; quantity: number };
type PurchaseMode = "individual" | "group";
type FormState = { customerId: string; customerName: string; customerPhone: string; customerEmail: string; customerCountry: string; groupName: string; visitDate: string; paymentMethod: "cash" | "card" | "bank" | "mixed"; notes: string };
const blankForm: FormState = { customerId: "", customerName: "", customerPhone: `${COUNTRY_DIAL_CODES[DEFAULT_COUNTRY]} `, customerEmail: "", customerCountry: DEFAULT_COUNTRY, groupName: "", visitDate: today, paymentMethod: "cash", notes: "" };
const blankGroupLine = (id: number): GroupLine => ({ id, categoryId: "", quantity: 1 });

function Step({ number, title, detail, active }: { number: string; title: string; detail: string; active?: boolean }) {
  return <div className={cx("flex items-start gap-3 rounded-2xl border p-4", active ? "border-[#bfe7ee] bg-[#eaf6f8]" : "border-divider bg-white")}><span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", active ? "bg-accent text-white" : "bg-fill text-body")}>{number}</span><div><b className="block text-xs text-ink">{title}</b><span className="mt-1 block text-[11px] leading-4 text-muted">{detail}</span></div></div>;
}

function toReceiptData(created: any, ticketTypeById: Map<number, any>): TicketReceiptData {
  const firstLine = created.lines[0];
  const ticketGroup: TicketGroup = firstLine?.ticketTypeId ? (ticketTypeById.get(firstLine.ticketTypeId)?.ticketGroup || "water_park") : "water_park";
  return {
    customerName: created.customer.fullName,
    customerPhone: created.customer.phone || "",
    visitDate: created.purchase.visitDate,
    ticketGroup,
    baseSubtotal: created.purchase.baseSubtotal,
    discountAmount: created.purchase.discountAmount,
    vatAmount: created.purchase.vatAmount,
    totalAmount: created.purchase.totalAmount,
    partnerEntityName: created.purchase.partnerEntityName || null,
    discountPercentage: created.purchase.discountPercentage,
    lines: created.lines.map((line: any) => ({
      ticketNumber: line.ticketNumber, label: line.label,
      ticketType: line.ticketType ?? null, freeEntryCategory: line.freeEntryCategory ?? null,
      basePrice: line.basePrice, discountAmount: line.discountAmount, vatAmount: line.vatAmount, totalAmount: line.totalAmount,
    })),
  };
}

export default function TicketDeskPage() {
  const t = useT();
  const utils = trpc.useUtils();
  const [ticketQuery, setTicketQuery] = useState("");
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [ticketGroup, setTicketGroup] = useState<TicketGroup>("water_park");
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState("");
  const [mode, setMode] = useState<PurchaseMode>("individual");
  const [categoryQuantities, setCategoryQuantities] = useState<Record<number, string>>({});
  const [groupLines, setGroupLines] = useState<GroupLine[]>([blankGroupLine(1)]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [receiptWidth, setReceiptWidth] = useState<"80" | "58">("80");
  const [reprintingId, setReprintingId] = useState<number | null>(null);
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const [cancelingEntry, setCancelingEntry] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [partnerEntityId, setPartnerEntityId] = useState("");
  const { data: catalog } = trpc.platform.tickets.prdCatalog.useQuery();
  const allTicketTypes = (catalog?.ticketTypes || []) as any[];
  const visitorCategories = ((catalog?.visitorCategories || []) as any[]).filter((c) => c.isActive);
  const prices = (catalog?.prices || []) as any[];
  const partnerEntities = (catalog?.partnerEntities || []) as any[];
  const maxTicketsPerPurchase = catalog?.maxTicketsPerPurchase ?? 2000;
  const ticketTypeById = useMemo(() => new Map(allTicketTypes.map((type) => [type.id, type])), [allTicketTypes]);
  const { data: purchaseRows = [], isLoading: purchasesLoading } = trpc.platform.tickets.purchaseList.useQuery({ query: ticketQuery.trim() || undefined });
  // PRD Round 4, Section 8: phone is a standalone field entered first — as
  // soon as it looks complete, look it up against the Customer Directory
  // (exact match) instead of a free-text name/phone search, so a returning
  // customer typing the same number twice never creates a second record.
  const phoneLookupEnabled = !form.customerId && form.customerPhone.trim().length >= 7;
  const { data: phoneMatch, isFetching: phoneChecking } = trpc.platform.customers.findByPhone.useQuery({ phone: form.customerPhone.trim() }, { enabled: phoneLookupEnabled });
  const phoneResolved = phoneLookupEnabled && !phoneChecking;
  const isNewCustomerFlow = phoneResolved && !phoneMatch;

  // PRD Round 7, Section 1.1: a new top-level "Other Tickets" tab, sibling
  // to Water Park — each ticket type belongs to exactly one group, and the
  // group determines which tab it's selectable from (Section 1.2).
  const ticketTypesInGroup = allTicketTypes.filter((type) => type.isActive && type.ticketGroup === ticketGroup);
  const effectiveTicketTypeId = selectedTicketTypeId || (ticketTypesInGroup.length === 1 ? String(ticketTypesInGroup[0].id) : "");
  const selectedTicketType = ticketTypesInGroup.find((type) => String(type.id) === effectiveTicketTypeId) || null;
  const priceFor = (categoryId: number) => prices.find((price) => price.ticketTypeId === Number(effectiveTicketTypeId) && price.categoryId === categoryId);
  const priceIdFor = (categoryId: number) => { const price = priceFor(categoryId); return price && price.isActive ? price.id : 0; };

  const switchGroup = (group: TicketGroup) => {
    setTicketGroup(group); setSelectedTicketTypeId(""); setCategoryQuantities({}); setGroupLines([blankGroupLine(1)]); setAttemptedSubmit(false);
  };

  const previewLines = mode === "individual"
    ? visitorCategories.flatMap((category) => {
        const priceId = priceIdFor(category.id);
        const quantity = Math.max(0, Math.floor(Number(categoryQuantities[category.id]) || 0));
        if (!priceId || !quantity) return [];
        return Array.from({ length: quantity }, () => ({ priceId }));
      })
    : groupLines.flatMap((line) => {
        const priceId = line.categoryId ? priceIdFor(Number(line.categoryId)) : 0;
        const quantity = Math.max(0, Math.floor(line.quantity || 0));
        if (!priceId || !quantity) return [];
        return Array.from({ length: quantity }, () => ({ priceId }));
      });
  const expectedLineCount = mode === "individual"
    ? visitorCategories.reduce((sum, category) => sum + Math.max(0, Math.floor(Number(categoryQuantities[category.id]) || 0)), 0)
    : groupLines.reduce((sum, line) => sum + Math.max(0, Math.floor(line.quantity || 0)), 0);
  const { data: pricing } = trpc.platform.tickets.purchasePreview.useQuery({ lines: previewLines, partnerEntityId: partnerEntityId ? Number(partnerEntityId) : undefined }, { enabled: previewLines.length === expectedLineCount && expectedLineCount > 0 && expectedLineCount <= maxTicketsPerPurchase });
  const groupedPurchases = useMemo(() => {
    const map = new Map<number, any>();
    (purchaseRows as any[]).forEach((row) => { const id = row.purchase.id; const current = map.get(id) || { ...row, lines: [] }; if (row.line) current.lines.push(row.line); map.set(id, current); });
    return Array.from(map.values());
  }, [purchaseRows]);
  const issue = trpc.platform.tickets.purchaseCreate.useMutation({
    onSuccess: (result: any) => {
      setCreated(result); setForm((current) => ({ ...blankForm, visitDate: current.visitDate })); setCategoryQuantities({}); setGroupLines([blankGroupLine(1)]); setAttemptedSubmit(false); setPartnerEntityId("");
      utils.platform.tickets.purchaseList.invalidate(); utils.platform.customers.search.invalidate(); utils.platform.finance.invalidate();
      toast.success(`${result.lines.length} ticket${result.lines.length === 1 ? "" : "s"} issued`);
    },
    onError: (error) => toast.error(error.message),
  });
  const useMatchedCustomer = () => { if (phoneMatch) setForm((current) => ({ ...current, customerId: String(phoneMatch.id) })); };
  const changeCustomer = () => setForm((current) => ({ ...current, customerId: "", customerName: "", customerPhone: `${COUNTRY_DIAL_CODES[current.customerCountry] || COUNTRY_DIAL_CODES[DEFAULT_COUNTRY]} `, customerEmail: "", customerCountry: DEFAULT_COUNTRY }));
  const updateCategoryQuantity = (categoryId: number, value: string, maxPerBooking: number | null) => {
    const clamped = maxPerBooking && value !== "" ? String(Math.min(maxPerBooking, Math.max(0, Math.floor(Number(value) || 0)))) : value;
    setCategoryQuantities((current) => ({ ...current, [categoryId]: clamped }));
  };
  const updateGroupLine = (id: number, patch: Partial<GroupLine>) => setGroupLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const addGroupLine = () => setGroupLines((current) => [...current, blankGroupLine(Math.max(...current.map((line) => line.id), 0) + 1)]);
  const removeGroupLine = (id: number) => setGroupLines((current) => current.length === 1 ? current : current.filter((line) => line.id !== id));

  const customerInvalid = !form.customerId && (!phoneResolved || (isNewCustomerFlow && !form.customerName.trim()));
  const linesInvalid = previewLines.length !== expectedLineCount || expectedLineCount === 0;
  const overCapacity = expectedLineCount > maxTicketsPerPurchase;

  const issuePurchase = () => {
    setAttemptedSubmit(true);
    if (!effectiveTicketTypeId) return toast.error(t("tickets.chooseTicketType"));
    if (customerInvalid) return toast.error(t("tickets.selectCustomerOrWalkIn"));
    if (overCapacity) return toast.error(t("tickets.overCapacity", { max: maxTicketsPerPurchase }));
    if (linesInvalid) return toast.error(mode === "group" ? t("tickets.everyGroupLineNeeds") : t("tickets.enterAtLeastOneCategory"));
    if (!pricing) return toast.error(t("tickets.waitingOnPreview"));
    issue.mutate({
      customerId: form.customerId ? Number(form.customerId) : undefined,
      customerName: form.customerId ? undefined : form.customerName.trim(),
      customerPhone: form.customerId ? undefined : form.customerPhone.trim(),
      customerEmail: form.customerId ? undefined : form.customerEmail.trim() || undefined,
      customerNationality: form.customerId ? undefined : form.customerCountry.trim() || undefined,
      visitDate: form.visitDate, paymentMethod: form.paymentMethod,
      notes: (mode === "group" && form.groupName.trim() ? `${t("tickets.groupNotePrefix")}: ${form.groupName.trim()}${form.notes.trim() ? " — " : ""}` : "") + form.notes.trim() || undefined,
      lines: previewLines,
      partnerEntityId: partnerEntityId ? Number(partnerEntityId) : undefined,
    });
  };
  const printReceipt = async (width: "80" | "58") => {
    if (created && (await printViaAgent(toReceiptData(created, ticketTypeById)))) { toast.success(t("tickets.sentToPrinter")); return; }
    setReceiptWidth(width);
    window.setTimeout(() => window.print(), 0);
    if (created) toast.message(t("tickets.printAgentNotFound"));
  };
  const reprintPurchase = async (entry: any) => {
    setReprintingId(entry.purchase.id);
    try {
      const lines = await utils.platform.tickets.purchaseLines.fetch({ purchaseId: entry.purchase.id });
      setCreated({ customer: entry.customer, purchase: entry.purchase, lines });
      toast.success(t("tickets.readyToReprint"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("tickets.couldNotLoadReprint"));
    } finally {
      setReprintingId(null);
    }
  };
  const refundPurchase = trpc.platform.tickets.purchaseRefund.useMutation({
    onSuccess: () => {
      utils.platform.tickets.purchaseList.invalidate();
      utils.platform.finance.invalidate();
      toast.success(t("tickets.returnSuccess"));
    },
    onError: (error) => toast.error(error.message || t("tickets.returnFailed")),
    onSettled: () => setRefundingId(null),
  });
  const returnPurchase = (entry: any) => {
    setCancelReason("");
    setCancelingEntry(entry);
  };
  const confirmCancelPurchase = () => {
    if (!cancelingEntry) return;
    setRefundingId(cancelingEntry.purchase.id);
    refundPurchase.mutate({ purchaseId: cancelingEntry.purchase.id, reason: cancelReason.trim() || undefined });
    setCancelingEntry(null);
  };

  return <>
    <PageHeader eyebrow={t("tickets.eyebrow")} title={t("tickets.title")} description={t("tickets.descriptionReal")} actions={<StatusPill tone="info">{t("tickets.vatBadgeReal")}</StatusPill>}/>
    <div className="mb-6 grid gap-3 md:grid-cols-3"><Step number="1" title={t("tickets.step1")} detail={t("tickets.step1Detail")} active={!form.customerId}/><Step number="2" title={t("tickets.step2")} detail={t("tickets.step2Detail")} active={Boolean(form.customerId || form.customerName) && !created}/><Step number="3" title={t("tickets.step3")} detail={t("tickets.step3Detail")} active={Boolean(created)}/></div>
    <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-white bg-white/75 p-1.5 shadow-sm">
      <button onClick={() => switchGroup("water_park")} className={cx("rounded-xl py-2.5 text-xs font-semibold transition", ticketGroup === "water_park" ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-fill hover:text-ink")}>{t("tickets.waterparkTab")}</button>
      <button onClick={() => switchGroup("other_tickets")} className={cx("rounded-xl py-2.5 text-xs font-semibold transition", ticketGroup === "other_tickets" ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-fill hover:text-ink")}>{t("tickets.otherTickets")}</button>
    </div>
    <div className="grid gap-6 xl:grid-cols-[.88fr_1.12fr]">
      <div className="space-y-6">
        <Surface>
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("tickets.customerCard")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("tickets.customerCardHint")}</p></div><UserRound size={19} className="text-accent"/></div>
          {form.customerId ? <div className="flex items-center justify-between rounded-2xl bg-success-bg px-4 py-3"><div><span className="block text-xs font-semibold text-success">{t("tickets.savedSelected")}</span><span className="mt-1 block text-xs text-muted">{t("tickets.idPrefix")} {form.customerId}</span></div><SecondaryButton onClick={changeCustomer}>{t("tickets.change")}</SecondaryButton></div> : <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("common.country")}><CountryField value={form.customerCountry} onChange={(country) => setForm((current) => ({ ...current, customerCountry: country, customerPhone: applyCountryDialCode(current.customerPhone, current.customerCountry, country) }))}/></Field>
              <Field label={t("customers.phoneNumber")} error={attemptedSubmit && customerInvalid && !phoneResolved ? t("common.required") : undefined}>
                <TextField value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} inputMode="tel" placeholder="+968 …" className={attemptedSubmit && customerInvalid && !phoneResolved ? "border-danger ring-1 ring-danger/30" : undefined}/>
              </Field>
            </div>
            {!phoneLookupEnabled && <p className="mt-2 text-xs text-muted">{t("tickets.enterPhoneToLookup")}</p>}
            {phoneLookupEnabled && phoneChecking && <p className="mt-2 text-xs text-muted">{t("tickets.checkingPhone")}</p>}
            {phoneResolved && phoneMatch && <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-success-bg px-4 py-3"><div className="min-w-0"><span className="block text-xs font-semibold text-success">{t("tickets.existingCustomerFound")}</span><span className="mt-1 block truncate text-xs text-muted">{phoneMatch.fullName}{phoneMatch.email ? ` · ${phoneMatch.email}` : ""}{phoneMatch.nationality ? ` · ${phoneMatch.nationality}` : ""}</span></div><SecondaryButton onClick={useMatchedCustomer}>{t("tickets.useThisCustomer")}</SecondaryButton></div>}
            {isNewCustomerFlow && <div className="mt-5 grid gap-4">
              <div className="flex items-center gap-2 rounded-xl bg-well px-3 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-subtle">{t("tickets.newWalkIn")}</div>
              <Field label={t("tickets.fullName")} error={attemptedSubmit && customerInvalid && !form.customerName.trim() ? t("common.required") : undefined}><TextField value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} placeholder="Customer full name" className={attemptedSubmit && customerInvalid && !form.customerName.trim() ? "border-danger ring-1 ring-danger/30" : undefined}/></Field>
              <Field label={t("tickets.email")}><TextField type="email" value={form.customerEmail} onChange={(event) => setForm({ ...form, customerEmail: event.target.value })} placeholder="name@example.com"/></Field>
            </div>}
          </>}
        </Surface>
        <Surface>
          <button onClick={() => setRecentExpanded((current) => !current)} className="flex w-full items-start justify-between gap-3 text-left"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("tickets.recentPurchases")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("tickets.recentPurchasesHint")}</p></div><div className="flex items-center gap-2"><StatusPill>{groupedPurchases.length} {t("tickets.purchasesCount")}</StatusPill>{recentExpanded ? <ChevronUp size={16} className="mt-1 text-muted"/> : <ChevronDown size={16} className="mt-1 text-muted"/>}</div></button>
          {recentExpanded && <>
            <div className="mt-4"><SearchField value={ticketQuery} onChange={setTicketQuery} placeholder={t("tickets.searchTickets")}/></div>
            <div className="mt-4">{purchasesLoading ? <div className="p-4 text-sm text-muted">{t("tickets.loadingHistory")}</div> : groupedPurchases.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.15fr_.7fr_.55fr_auto] gap-3"><span>{t("tickets.customerTicketCol")}</span><span>{t("tickets.visitCol")}</span><span>{t("common.total")}</span><span className="text-right">{t("finance.actions")}</span></div></TableHeader>{groupedPurchases.slice(0, 8).map((entry: any) => { const refunded = entry.purchase.status === "refunded"; return <TableRow key={entry.purchase.id} className="grid-cols-[1.15fr_.7fr_.55fr_auto]"><div className="min-w-0"><div className="truncate text-sm font-medium">{entry.customer?.fullName || t("tickets.customerFallback")}</div><div className="mt-1 truncate font-mono text-[10px] text-accent">{entry.lines.map((line: any) => line.ticketNumber).join(" · ")}</div></div><div className="text-xs text-muted">{dateLabel(entry.purchase.visitDate)}</div><b className={cx("text-sm", refunded && "text-muted line-through")}>{money(entry.purchase.totalAmount)}</b><div className="flex items-center justify-end gap-1"><button onClick={() => reprintPurchase(entry)} disabled={reprintingId === entry.purchase.id} aria-label="Reprint this ticket" className="rounded-full bg-fill p-2 text-muted hover:bg-[#e8e8ed] hover:text-ink disabled:opacity-50"><Printer size={14}/></button>{refunded ? <StatusPill tone="danger">{t("tickets.returned")}</StatusPill> : <button onClick={() => returnPurchase(entry)} disabled={refundingId === entry.purchase.id} aria-label="Return this purchase" className="rounded-full bg-fill p-2 text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"><Undo2 size={14}/></button>}</div></TableRow>; })}</TableFrame> : <EmptyState title={t("tickets.noPurchasesYet")} description={t("tickets.noPurchasesHint")}/>}</div>
          </>}
        </Surface>
      </div>
      <Surface className="h-fit">
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("tickets.visitorLines")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("tickets.visitorLinesHint")}</p></div><StatusPill tone={overCapacity ? "danger" : linesInvalid ? "warning" : "success"}>{overCapacity ? `${expectedLineCount} ${t("tickets.overCapacityPill", { max: maxTicketsPerPurchase })}` : `${expectedLineCount} ${t("tickets.ticketsCount")}`}</StatusPill></div>
        {ticketTypesInGroup.length > 1 && <div className="mb-4"><Field label={t("tickets.ticketType")}><SelectField value={effectiveTicketTypeId} onChange={(event) => { setSelectedTicketTypeId(event.target.value); setCategoryQuantities({}); setGroupLines([blankGroupLine(1)]); }}><option value="">{t("tickets.chooseTicketType")}</option>{ticketTypesInGroup.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</SelectField></Field></div>}
        {!ticketTypesInGroup.length && <EmptyState title={t("tickets.noTicketTypesYet")} description={t("tickets.noTicketTypesHint")}/>}
        {Boolean(ticketTypesInGroup.length) && <>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-well p-1">
          <button onClick={() => setMode("individual")} className={cx("flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition", mode === "individual" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}><UserRound size={14}/>{t("tickets.individual")}</button>
          <button onClick={() => setMode("group")} className={cx("flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition", mode === "group" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}><Users size={14}/>{t("tickets.group")}</button>
        </div>
        {mode === "group" && <div className="mb-4"><Field label={t("tickets.groupName")}><TextField value={form.groupName} onChange={(event) => setForm({ ...form, groupName: event.target.value })} placeholder="e.g. Al Falaj School Trip"/></Field></div>}
        {mode === "individual" ? <div className="grid gap-3">{visitorCategories.map((category) => {
          const maxPerBooking = category.maxPerBooking ?? null;
          const price = priceFor(category.id);
          const quantity = categoryQuantities[category.id] || "";
          const rowMissingPrice = attemptedSubmit && Number(quantity) > 0 && !priceIdFor(category.id);
          return <div key={category.id} className={cx("flex items-center justify-between gap-4 rounded-2xl border bg-well p-4", rowMissingPrice ? "border-danger" : "border-divider")}>
            <div className="min-w-0">
              <b className="text-sm">{category.name}</b>
              <div className="mt-1 text-[11px] leading-4 text-muted">{!price ? t("tickets.noPriceConfigured") : Number(price.unitPrice) === 0 ? t("tickets.freeHint") : money(price.unitPrice)}{maxPerBooking ? ` · ${t("tickets.maxPerBookingHint", { max: maxPerBooking })}` : ""}</div>
            </div>
            <TextField type="number" min={0} max={maxPerBooking ?? undefined} value={quantity} onChange={(event) => updateCategoryQuantity(category.id, event.target.value, maxPerBooking)} placeholder="0" className="w-20 shrink-0 text-center"/>
          </div>;
        })}</div>
        : <div className="grid gap-3">{groupLines.map((line, index) => {
          const category = visitorCategories.find((entry) => String(entry.id) === line.categoryId);
          const price = category ? priceFor(category.id) : null;
          const lineInvalid = attemptedSubmit && (!price || !line.quantity || line.quantity < 1);
          return <div key={line.id} className={cx("rounded-2xl border bg-well p-4", lineInvalid ? "border-danger" : "border-divider")}>
            <div className="mb-3 flex items-center justify-between"><b className="text-sm">{t("tickets.groupLine")} {index + 1}</b><button onClick={() => removeGroupLine(line.id)} aria-label={`Remove group line ${index + 1}`} className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={14}/></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("tickets.freeEntry")}><SelectField value={line.categoryId} onChange={(event) => updateGroupLine(line.id, { categoryId: event.target.value })}><option value="">{t("tickets.chooseCategory")}</option>{visitorCategories.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</SelectField></Field>
              <Field label={t("tickets.quantity")} error={attemptedSubmit && (!line.quantity || line.quantity < 1) ? t("tickets.atLeastOne") : undefined}><TextField type="number" min={1} max={category?.maxPerBooking ?? undefined} value={line.quantity} onChange={(event) => updateGroupLine(line.id, { quantity: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} className={attemptedSubmit && (!line.quantity || line.quantity < 1) ? "border-danger ring-1 ring-danger/30" : undefined}/></Field>
            </div>
            {price ? <p className="mt-3 text-[11px] leading-4 text-muted">{category?.name} · {money(price.unitPrice)} {t("tickets.eachOf")} — {line.quantity || 0} {t("tickets.ticketsCount")} {t("tickets.ofThisType")}{category?.maxPerBooking ? ` · ${t("tickets.maxPerBookingHint", { max: category.maxPerBooking })}` : ""}</p> : <p className="mt-3 text-[11px] leading-4 text-danger">{t("tickets.noPriceConfigured")}</p>}
          </div>;
        })}<SecondaryButton onClick={addGroupLine}><Plus size={15} className="mr-2"/>{t("tickets.addGroupLine")}</SecondaryButton></div>}
        </>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label={t("tickets.visitDate")}><DateField value={form.visitDate} onChange={(value) => setForm({ ...form, visitDate: value })}/></Field><Field label={t("tickets.paymentMethod")}><SelectField value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as FormState["paymentMethod"] })}><option value="cash">{t("tickets.cash")}</option><option value="card">{t("tickets.card")}</option><option value="bank">{t("tickets.bank")}</option><option value="mixed">{t("tickets.mixed")}</option></SelectField></Field></div>
        {partnerEntities.length > 0 && <div className="mt-3"><Field label={t("tickets.partnerEntity")} hint={t("tickets.partnerEntityHint")}><SelectField value={partnerEntityId} onChange={(event) => setPartnerEntityId(event.target.value)}><option value="">{t("tickets.noPartnerEntity")}</option>{partnerEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</SelectField></Field></div>}
        <div className="mt-5 rounded-[22px] bg-navy p-5 text-white"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-teal-tint">{t("tickets.pricePreview")}</div><div className="mt-2 font-serif text-4xl tracking-[-.05em]">{money(pricing?.totalAmount || 0)}</div></div><StatusPill tone={pricing ? "success" : "neutral"}>{pricing ? t("tickets.readyPill") : t("tickets.completeLines")}</StatusPill></div>{pricing && <div className="mt-4 border-t border-white/15 pt-3 text-xs text-[#d6d6da]"><div className="flex justify-between py-1"><span>{t("tickets.baseSubtotal")}</span><span>{money(pricing.baseSubtotal)}</span></div><div className="flex justify-between py-1"><span>{partnerEntityId ? partnerEntities.find((entity) => String(entity.id) === partnerEntityId)?.name : t("tickets.groupDiscount")} ({pricing.discountPercentage}%)</span><span>−{money(pricing.discountAmount)}</span></div><div className="flex justify-between py-1"><span>{t("tickets.vatAfterDiscount")}</span><span>{money(pricing.vatAmount)}</span></div>{pricing.fees?.map((fee: any) => <div key={fee.code} className="flex justify-between py-1"><span>{fee.label}</span><span>{money(fee.amount)}</span></div>)}{mode === "individual" && <div className="mt-2 border-t border-white/15 pt-2">{pricing.lines.map((line: any, index: number) => <div key={`${line.priceId}-${index}`} className="flex justify-between py-1"><span>{line.label}</span><span>{money(line.totalAmount)}</span></div>)}</div>}</div>}</div>
        <div className="mt-5"><Field label={t("tickets.note")}><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t("tickets.notePlaceholder")} className="min-h-[86px] rounded-xl border-line bg-well"/></Field></div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={issuePurchase} pending={issue.isPending}>{t("tickets.confirmIssue")} <Ticket size={15} className="ml-2"/></PrimaryButton>{created && <><SecondaryButton onClick={() => printReceipt("80")}><Printer size={14} className="mr-2"/>{t("tickets.print80")}</SecondaryButton><SecondaryButton onClick={() => printReceipt("58")}><Printer size={14} className="mr-2"/>{t("tickets.print58")}</SecondaryButton></>}</div>
        {created && <div className="mt-5 rounded-2xl border border-[#cbead5] bg-[#effaf2] p-4"><StatusPill tone="success">{t("tickets.purchaseReady")}</StatusPill><div className="mt-2 font-mono text-lg font-semibold text-ink">{created.lines.length > 3 ? `#${created.lines[0].ticketNumber}–#${created.lines[created.lines.length - 1].ticketNumber} (×${created.lines.length})` : created.lines.map((line: any) => line.ticketNumber).join(" · ")}</div><p className="mt-1 text-xs leading-5 text-muted">{t("tickets.purchaseReadyHint")}</p></div>}
      </Surface>
    </div>
    {created && <TicketReceipt data={toReceiptData(created, ticketTypeById)} width={receiptWidth}/>}
    <Dialog open={Boolean(cancelingEntry)} onOpenChange={(open) => { if (!open) setCancelingEntry(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("tickets.confirmReturn")}</DialogTitle></DialogHeader>
        <Field label={t("tickets.cancelReasonLabel")}><Textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder={t("tickets.cancelReasonPlaceholder")} className="min-h-[86px] rounded-xl border-line bg-well"/></Field>
        <DialogFooter><SecondaryButton onClick={() => setCancelingEntry(null)}>{t("common.close")}</SecondaryButton><PrimaryButton onClick={confirmCancelPurchase} pending={refundingId === cancelingEntry?.purchase.id}>{t("tickets.confirmReturnAction")}</PrimaryButton></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
