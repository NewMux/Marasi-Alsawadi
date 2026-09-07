import { useState } from "react";
import { Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { DateField, EmptyState, Field, LoadingState, PageHeader, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { FacilityReceipt, type FacilityReceiptData } from "@/components/FacilityReceipt";
import { printFacilityReceiptViaAgent } from "@/lib/printAgent";
import { useT, type TranslationKey } from "@/lib/i18n";

const today = new Date().toISOString().slice(0, 10);
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const facilityMethodLabelKey: Record<string, TranslationKey> = { hourly: "facility.perHour", daily: "facility.perDay", fixed: "facility.flatRate" };
const addonMethodLabelKey: Record<string, TranslationKey> = { per_person: "facility.perPerson", fixed: "facility.flatRate", hourly: "facility.perHour" };
const addonQuantityLabelKey: Record<string, TranslationKey> = { per_person: "facility.people", hourly: "facility.hours", fixed: "facility.quantity" };

type AddonLine = { id: number; addonServiceId: string; quantity: string };
const blankAddonLine = (id: number): AddonLine => ({ id, addonServiceId: "", quantity: "1" });

// PRD Round 3, Section 5.1: Daily/Hourly facilities are billed automatically
// from a date or time range — staff never types a raw quantity or touches
// the rate, only the two endpoints of the period they're booking.
function daysBetween(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) return 0;
  const from = new Date(fromDate); const to = new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}
function hoursBetween(fromTime: string, toTime: string) {
  if (!fromTime || !toTime) return 0;
  const [fromHour, fromMinute] = fromTime.split(":").map(Number);
  const [toHour, toMinute] = toTime.split(":").map(Number);
  if ([fromHour, fromMinute, toHour, toMinute].some((value) => Number.isNaN(value))) return 0;
  const diff = (toHour * 60 + toMinute - (fromHour * 60 + fromMinute)) / 60;
  return diff > 0 ? diff : 0;
}

export default function FacilityBookingsPage() {
  const t = useT();
  const utils = trpc.useUtils();
  const { data: catalog } = trpc.platform.facilityBookings.catalog.useQuery();
  const facilityTypes = (catalog?.facilityTypes || []) as any[];
  const addonServices = (catalog?.addonServices || []) as any[];
  const partnerEntities = (catalog?.partnerEntities || []) as any[];
  const [partnerEntityId, setPartnerEntityId] = useState("");
  const [bookingListQuery, setBookingListQuery] = useState("");
  const { data: bookingRows = [], isLoading: bookingsLoading } = trpc.platform.facilityBookings.list.useQuery({ query: bookingListQuery.trim() || undefined });
  const [expandedBookingId, setExpandedBookingId] = useState<number | null>(null);
  const [rowAddonServiceId, setRowAddonServiceId] = useState("");
  const [rowAddonQuantity, setRowAddonQuantity] = useState("1");
  const [rowAddonDate, setRowAddonDate] = useState(today);
  const rowAddon = addonServices.find((entry) => String(entry.id) === rowAddonServiceId);
  const addAddonToRow = trpc.platform.facilityBookings.addAddon.useMutation({
    onSuccess: () => { utils.platform.facilityBookings.list.invalidate(); utils.platform.finance.invalidate(); toast.success(t("facility.addonsLogged")); setRowAddonServiceId(""); setRowAddonQuantity("1"); },
    onError: (error) => toast.error(error.message),
  });
  const submitRowAddon = (bookingId: number) => {
    if (!rowAddonServiceId || !(Number(rowAddonQuantity) > 0)) return toast.error(t("facility.addAtLeastOneAddon"));
    addAddonToRow.mutate({ bookingId, businessDate: rowAddonDate, addons: [{ addonServiceId: Number(rowAddonServiceId), quantity: Number(rowAddonQuantity) }] });
  };

  const [bookingMode, setBookingMode] = useState<"new" | "addonsOnly">("new");
  const [facilityTypeId, setFacilityTypeId] = useState("");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [fromTime, setFromTime] = useState("09:00");
  const [toTime, setToTime] = useState("17:00");
  const [bookingDate, setBookingDate] = useState(today);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [addonLines, setAddonLines] = useState<AddonLine[]>([]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [existingBookingQuery, setExistingBookingQuery] = useState("");
  const [existingBookingId, setExistingBookingId] = useState("");
  const [created, setCreated] = useState<FacilityReceiptData | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<"80" | "58">("80");

  const selectedFacility = facilityTypes.find((facility) => String(facility.id) === facilityTypeId);
  const quantity = selectedFacility?.pricingMethod === "daily" ? daysBetween(fromDate, toDate) : selectedFacility?.pricingMethod === "hourly" ? hoursBetween(fromTime, toTime) : 1;
  const validAddonLines = addonLines.filter((line) => line.addonServiceId && Number(line.quantity) > 0);

  const { data: existingBookingResults = [] } = trpc.platform.facilityBookings.list.useQuery({ query: existingBookingQuery }, { enabled: bookingMode === "addonsOnly" && existingBookingQuery.trim().length > 0 });
  const selectedExistingBooking = (bookingRows as any[]).find((row) => String(row.booking.id) === existingBookingId) || (existingBookingResults as any[]).find((row) => String(row.booking.id) === existingBookingId);

  const previewEnabled = bookingMode === "new" && Boolean(selectedFacility && (selectedFacility.pricingMethod === "fixed" || quantity > 0));
  const { data: pricing } = trpc.platform.facilityBookings.preview.useQuery({
    facilityTypeId: Number(facilityTypeId) || 0,
    quantity: selectedFacility?.pricingMethod === "fixed" ? 1 : quantity,
    addons: validAddonLines.map((line) => ({ addonServiceId: Number(line.addonServiceId), quantity: Number(line.quantity) })),
    partnerEntityId: partnerEntityId ? Number(partnerEntityId) : undefined,
  }, { enabled: previewEnabled });
  // Add-ons Only has no facility line to price server-side, so the addon
  // total is computed client-side from the same catalog rates shown in the
  // dropdown — a display-only preview; addAddon still recomputes it
  // authoritatively from the Admin-set rate on submit.
  const addonsOnlyTotal = validAddonLines.reduce((sum, line) => {
    const addon = addonServices.find((entry) => String(entry.id) === line.addonServiceId);
    if (!addon) return sum;
    const lineQuantity = addon.pricingMethod === "fixed" ? 1 : Number(line.quantity);
    return sum + Number(addon.rate) * lineQuantity;
  }, 0);

  const addAddonLine = () => setAddonLines((current) => [...current, blankAddonLine(Math.max(0, ...current.map((line) => line.id)) + 1)]);
  const updateAddonLine = (id: number, patch: Partial<AddonLine>) => setAddonLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const removeAddonLine = (id: number) => setAddonLines((current) => current.filter((line) => line.id !== id));
  const resetForm = () => {
    setFacilityTypeId(""); setFromDate(today); setToDate(today); setFromTime("09:00"); setToTime("17:00");
    setCustomerName(""); setNotes(""); setAddonLines([]); setAttemptedSubmit(false); setExistingBookingId(""); setExistingBookingQuery(""); setPartnerEntityId("");
  };

  const create = trpc.platform.facilityBookings.create.useMutation({
    onSuccess: () => {
      utils.platform.facilityBookings.list.invalidate(); utils.platform.finance.invalidate(); toast.success(t("facility.bookingConfirmed"));
      if (pricing && selectedFacility) {
        setCreated({
          facilityName: selectedFacility.name, customerName: customerName.trim(), bookingDate,
          durationLabel: selectedFacility.pricingMethod === "daily" ? `${quantity} ${quantity === 1 ? t("facility.day") : t("facility.daysWord")}` : selectedFacility.pricingMethod === "hourly" ? `${quantity.toFixed(2)} ${t("facility.hoursWord")}` : null,
          facilityAmount: pricing.facilityAmount, addons: (pricing.addons as any[]).map((addon) => ({ name: addon.addonServiceName, quantity: addon.quantity, amount: addon.amount })),
          notes: notes.trim() || null, totalAmount: pricing.totalAmount,
          partnerEntityName: (pricing as any).partnerEntity?.name || null, discountPercentage: (pricing as any).discountPercentage || null,
        });
      }
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });
  const addAddon = trpc.platform.facilityBookings.addAddon.useMutation({
    onSuccess: () => { utils.platform.facilityBookings.list.invalidate(); utils.platform.finance.invalidate(); toast.success(t("facility.addonsLogged")); resetForm(); },
    onError: (error) => toast.error(error.message),
  });

  const facilityInvalid = bookingMode === "new" && !facilityTypeId;
  const quantityInvalid = bookingMode === "new" && selectedFacility?.pricingMethod !== "fixed" && !(quantity > 0);
  const existingBookingInvalid = bookingMode === "addonsOnly" && !existingBookingId;
  const addonsRequiredInvalid = bookingMode === "addonsOnly" && validAddonLines.length === 0;

  const submit = () => {
    setAttemptedSubmit(true);
    if (bookingMode === "new") {
      if (facilityInvalid) return toast.error(t("facility.chooseFacility"));
      if (quantityInvalid) return toast.error(t("facility.enterQuantity"));
      create.mutate({
        facilityTypeId: Number(facilityTypeId), bookingDate,
        quantity: selectedFacility?.pricingMethod === "fixed" ? 1 : quantity,
        addons: validAddonLines.map((line) => ({ addonServiceId: Number(line.addonServiceId), quantity: Number(line.quantity) })),
        customerName: customerName.trim() || undefined, notes: notes.trim() || undefined,
        partnerEntityId: partnerEntityId ? Number(partnerEntityId) : undefined,
      });
    } else {
      if (existingBookingInvalid) return toast.error(t("facility.chooseExistingBooking"));
      if (addonsRequiredInvalid) return toast.error(t("facility.addAtLeastOneAddon"));
      addAddon.mutate({
        bookingId: Number(existingBookingId), businessDate: bookingDate,
        addons: validAddonLines.map((line) => ({ addonServiceId: Number(line.addonServiceId), quantity: Number(line.quantity) })),
      });
    }
  };

  const printReceipt = async (width: "80" | "58") => {
    if (created && (await printFacilityReceiptViaAgent(created))) { toast.success(t("tickets.sentToPrinter")); return; }
    setReceiptWidth(width);
    window.setTimeout(() => window.print(), 0);
    if (created) toast.message(t("tickets.printAgentNotFound"));
  };

  return <>
    <PageHeader eyebrow={t("facility.eyebrow")} title={t("facility.title")} description={t("facility.description")} actions={<StatusPill tone="info">{t("facility.noCalendarBadge")}</StatusPill>}/>
    <div className="grid gap-6 xl:grid-cols-[.88fr_1.12fr]">
      <div className="space-y-6">
        <Surface>
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("facility.newBooking")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{bookingMode === "new" ? t("facility.newBookingHint") : t("facility.addonsOnlyHint")}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-well p-1">
            <button onClick={() => { setBookingMode("new"); setAttemptedSubmit(false); }} className={cx("rounded-xl py-2 text-xs font-semibold transition", bookingMode === "new" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}>{t("facility.modeNewBooking")}</button>
            <button onClick={() => { setBookingMode("addonsOnly"); setAttemptedSubmit(false); }} className={cx("rounded-xl py-2 text-xs font-semibold transition", bookingMode === "addonsOnly" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}>{t("facility.modeAddonsOnly")}</button>
          </div>
          <div className="mt-5 grid gap-4">
            {bookingMode === "new" ? <>
              <Field label={t("facility.facility")} error={attemptedSubmit && facilityInvalid ? t("common.required") : undefined}>
                <SelectField value={facilityTypeId} onChange={(event) => setFacilityTypeId(event.target.value)} className={attemptedSubmit && facilityInvalid ? "border-danger ring-1 ring-danger/30" : undefined}>
                  <option value="">{t("facility.chooseFacility")}</option>
                  {facilityTypes.map((facility) => <option key={facility.id} value={facility.id}>{facility.name} — {money(facility.rate)} {t(facilityMethodLabelKey[facility.pricingMethod])}</option>)}
                </SelectField>
              </Field>
              {selectedFacility?.pricingMethod === "daily" && <div className="grid grid-cols-2 gap-3">
                <Field label={t("facility.fromDate")} error={attemptedSubmit && quantityInvalid ? t("common.required") : undefined}><DateField value={fromDate} onChange={setFromDate}/></Field>
                <Field label={t("facility.toDate")}><DateField value={toDate} min={fromDate} onChange={setToDate}/></Field>
              </div>}
              {selectedFacility?.pricingMethod === "hourly" && <div className="grid grid-cols-2 gap-3">
                <Field label={t("facility.fromTime")} error={attemptedSubmit && quantityInvalid ? t("common.required") : undefined}><TextField type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)}/></Field>
                <Field label={t("facility.toTime")}><TextField type="time" value={toTime} onChange={(event) => setToTime(event.target.value)}/></Field>
              </div>}
              {selectedFacility && selectedFacility.pricingMethod !== "fixed" && <p className="-mt-2 text-[11px] text-subtle">{selectedFacility.pricingMethod === "daily" ? `${quantity} ${quantity === 1 ? t("facility.day") : t("facility.daysWord")}` : `${quantity.toFixed(2)} ${t("facility.hoursWord")}`} · {t("facility.rateNotEditable")}</p>}
              <Field label={t("common.date")}><DateField value={bookingDate} onChange={setBookingDate}/></Field>
              <Field label={t("facility.customerName")}><TextField value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t("common.optional")}/></Field>
              <Field label={t("common.description")}><TextField value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("common.optional")}/></Field>
              {partnerEntities.length > 0 && <Field label={t("tickets.partnerEntity")} hint={t("facility.partnerEntityHint")}><SelectField value={partnerEntityId} onChange={(event) => setPartnerEntityId(event.target.value)}><option value="">{t("tickets.noPartnerEntity")}</option>{partnerEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</SelectField></Field>}
            </> : <>
              <Field label={t("facility.findBooking")} error={attemptedSubmit && existingBookingInvalid ? t("common.required") : undefined}>
                <SearchField value={existingBookingQuery} onChange={(value) => { setExistingBookingQuery(value); setExistingBookingId(""); }} placeholder={t("facility.findBookingPlaceholder")}/>
              </Field>
              {existingBookingQuery.trim() && !existingBookingId && <div className="max-h-44 overflow-y-auto rounded-2xl border border-divider bg-well">{(existingBookingResults as any[]).length ? (existingBookingResults as any[]).slice(0, 6).map((row: any) => <button key={row.booking.id} onClick={() => { setExistingBookingId(String(row.booking.id)); setExistingBookingQuery(`${row.booking.facilityTypeName} — ${row.booking.customerName || t("facility.noCustomerName")}`); }} className="flex w-full items-center justify-between gap-3 border-b border-divider px-4 py-3 text-left last:border-0 hover:bg-[#eaf6f8]"><span><b className="block text-sm">{row.booking.facilityTypeName}</b><span className="mt-1 block text-xs text-muted">{row.booking.customerName || t("facility.noCustomerName")} · {dateLabel(row.booking.bookingDate)}</span></span><span className="text-xs font-semibold text-accent">{t("tickets.select")}</span></button>) : <div className="p-4 text-xs text-muted">{t("facility.noBookingsMatch")}</div>}</div>}
              {selectedExistingBooking && <div className="rounded-2xl bg-success-bg px-4 py-3 text-xs text-success">{t("facility.addingTo")}: <b>{selectedExistingBooking.booking.facilityTypeName}</b> — {dateLabel(selectedExistingBooking.booking.bookingDate)} ({money(selectedExistingBooking.booking.totalAmount)} {t("facility.soFar")})</div>}
              <Field label={t("facility.addonDate")}><DateField value={bookingDate} onChange={setBookingDate}/></Field>
            </>}
          </div>
        </Surface>
        <Surface>
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("facility.bookingsList")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("facility.bookingsListHint")}</p></div><StatusPill>{bookingRows.length}</StatusPill></div>
          <SearchField value={bookingListQuery} onChange={setBookingListQuery} placeholder={t("facility.findBookingPlaceholder")}/>
          <div className="mt-4">{bookingsLoading ? <LoadingState/> : bookingRows.length ? <div className="divide-y divide-divider">{(bookingRows as any[]).slice(0, 30).map((row: any) => { const expanded = expandedBookingId === row.booking.id; return <div key={row.booking.id} className="py-3">
            <button onClick={() => { setExpandedBookingId(expanded ? null : row.booking.id); setRowAddonServiceId(""); setRowAddonQuantity("1"); }} className="grid w-full grid-cols-[1fr_.7fr_.6fr] items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-fill">
              <div className="min-w-0"><div className="truncate text-sm font-medium">{row.booking.facilityTypeName}</div><div className="mt-1 truncate text-xs text-muted">{row.booking.customerName || t("facility.noCustomerName")}</div></div>
              <span className="text-xs text-muted">{dateLabel(row.booking.bookingDate)}</span>
              <b className="text-right text-sm">{money(row.booking.totalAmount)}</b>
            </button>
            {expanded && <div className="mt-3 rounded-2xl bg-well p-4">
              <div className="grid gap-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted">{row.booking.facilityTypeName}</span><span>{money(row.booking.facilityAmount)}</span></div>
                {(row.addons as any[]).map((addon: any) => <div key={addon.id} className="flex justify-between"><span className="text-muted">{addon.addonServiceName} ×{addon.quantity}</span><span>{money(addon.amount)}</span></div>)}
                {row.booking.notes && <div className="mt-1 text-muted">{row.booking.notes}</div>}
                <div className="mt-1.5 flex justify-between border-t border-divider pt-1.5 font-semibold"><span>{t("common.total")}</span><span>{money(row.booking.totalAmount)}</span></div>
              </div>
              <div className="mt-4 border-t border-divider pt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.14em] text-subtle">{t("facility.addAddonLine")}</div>
                <div className="grid gap-2 sm:grid-cols-[1.3fr_.6fr_.6fr_auto]">
                  <SelectField value={rowAddonServiceId} onChange={(event) => setRowAddonServiceId(event.target.value)}><option value="">{t("facility.chooseAddon")}</option>{addonServices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} — {money(entry.rate)}</option>)}</SelectField>
                  {rowAddon && rowAddon.pricingMethod !== "fixed" && <TextField type="number" min={1} value={rowAddonQuantity} onChange={(event) => setRowAddonQuantity(event.target.value)} placeholder={t(addonQuantityLabelKey[rowAddon.pricingMethod])}/>}
                  <DateField value={rowAddonDate} onChange={setRowAddonDate}/>
                  <SecondaryButton onClick={() => submitRowAddon(row.booking.id)}><Plus size={14} className="mr-1"/>{t("common.add")}</SecondaryButton>
                </div>
              </div>
            </div>}
          </div>; })}</div> : <EmptyState title={t("facility.noBookingsYet")} description={t("facility.noBookingsHint")}/>}</div>
        </Surface>
      </div>
      <Surface className="h-fit">
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("facility.addonsTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("facility.addonsHint")}</p></div></div>
        <div className="grid gap-3">
          {addonLines.map((line) => {
            const addon = addonServices.find((entry) => String(entry.id) === line.addonServiceId);
            return <div key={line.id} className="rounded-2xl border border-divider bg-well p-4">
              <div className="mb-3 flex items-center justify-between"><b className="text-sm">{t("facility.addonLine")}</b><button onClick={() => removeAddonLine(line.id)} aria-label="Remove add-on line" className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={14}/></button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("facility.addonService")}><SelectField value={line.addonServiceId} onChange={(event) => updateAddonLine(line.id, { addonServiceId: event.target.value })}><option value="">{t("facility.chooseAddon")}</option>{addonServices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} — {money(entry.rate)} {t(addonMethodLabelKey[entry.pricingMethod])}</option>)}</SelectField></Field>
                {addon && addon.pricingMethod !== "fixed" && <Field label={t(addonQuantityLabelKey[addon.pricingMethod])}><TextField type="number" min={1} value={line.quantity} onChange={(event) => updateAddonLine(line.id, { quantity: event.target.value })}/></Field>}
              </div>
            </div>;
          })}
        </div>
        <SecondaryButton onClick={addAddonLine} className="mt-3"><Plus size={15} className="mr-2"/>{t("facility.addAddonLine")}</SecondaryButton>
        <div className="mt-5 rounded-[22px] bg-navy p-5 text-white">
          <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-teal-tint">{t("facility.pricePreview")}</div><div className="mt-2 font-serif text-4xl tracking-[-.05em]">{money(bookingMode === "new" ? pricing?.totalAmount || 0 : addonsOnlyTotal)}</div></div><StatusPill tone={(bookingMode === "new" ? pricing : validAddonLines.length) ? "success" : "neutral"}>{(bookingMode === "new" ? pricing : validAddonLines.length) ? t("tickets.readyPill") : t("tickets.completeLines")}</StatusPill></div>
          {bookingMode === "new" && pricing && <div className="mt-4 border-t border-white/15 pt-3 text-xs text-[#d6d6da]">
            <div className="flex justify-between py-1"><span>{selectedFacility?.name}</span><span>{money(Number(pricing.facilityAmount) + Number((pricing as any).discountAmount || 0))}</span></div>
            {Number((pricing as any).discountAmount) > 0 && <div className="flex justify-between py-1"><span>{(pricing as any).partnerEntity?.name} ({Number((pricing as any).discountPercentage).toFixed(0)}%)</span><span>−{money((pricing as any).discountAmount)}</span></div>}
            {(pricing.addons as any[]).map((addon: any, index: number) => <div key={`${addon.addonServiceId}-${index}`} className="flex justify-between py-1"><span>{addon.addonServiceName}</span><span>{money(addon.amount)}</span></div>)}
          </div>}
          {bookingMode === "addonsOnly" && validAddonLines.length > 0 && <div className="mt-4 border-t border-white/15 pt-3 text-xs text-[#d6d6da]">{validAddonLines.map((line) => { const addon = addonServices.find((entry) => String(entry.id) === line.addonServiceId); return addon ? <div key={line.id} className="flex justify-between py-1"><span>{addon.name}</span><span>{money(Number(addon.rate) * (addon.pricingMethod === "fixed" ? 1 : Number(line.quantity)))}</span></div> : null; })}</div>}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={submit} pending={create.isPending || addAddon.isPending}>{bookingMode === "new" ? t("facility.confirmBooking") : t("facility.logAddons")}</PrimaryButton>{created && <><SecondaryButton onClick={() => printReceipt("80")}><Printer size={14} className="mr-2"/>{t("tickets.print80")}</SecondaryButton><SecondaryButton onClick={() => printReceipt("58")}><Printer size={14} className="mr-2"/>{t("tickets.print58")}</SecondaryButton></>}</div>
        {created && <div className="mt-5 rounded-2xl border border-[#cbead5] bg-[#effaf2] p-4"><StatusPill tone="success">{t("facility.bookingConfirmed")}</StatusPill><div className="mt-2 font-mono text-lg font-semibold text-ink">{created.facilityName}</div><p className="mt-1 text-xs leading-5 text-muted">{t("facility.receiptReadyHint")}</p></div>}
      </Surface>
    </div>
    {created && <FacilityReceipt data={created} width={receiptWidth}/>}
  </>;
}
