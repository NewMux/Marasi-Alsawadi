import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { EmptyState, Field, LoadingState, PageHeader, PrimaryButton, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";
import { useT, type TranslationKey } from "@/lib/i18n";

const today = new Date().toISOString().slice(0, 10);
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const facilityMethodLabelKey: Record<string, TranslationKey> = { hourly: "facility.perHour", daily: "facility.perDay", fixed: "facility.flatRate" };
const addonMethodLabelKey: Record<string, TranslationKey> = { per_person: "facility.perPerson", fixed: "facility.flatRate", hourly: "facility.perHour" };
const addonQuantityLabelKey: Record<string, TranslationKey> = { per_person: "facility.people", hourly: "facility.hours", fixed: "facility.quantity" };

type AddonLine = { id: number; addonServiceId: string; quantity: string };
const blankAddonLine = (id: number): AddonLine => ({ id, addonServiceId: "", quantity: "1" });

export default function FacilityBookingsPage() {
  const t = useT();
  const utils = trpc.useUtils();
  const { data: catalog } = trpc.platform.facilityBookings.catalog.useQuery();
  const facilityTypes = (catalog?.facilityTypes || []) as any[];
  const addonServices = (catalog?.addonServices || []) as any[];
  const { data: bookingRows = [], isLoading: bookingsLoading } = trpc.platform.facilityBookings.list.useQuery({});

  const [facilityTypeId, setFacilityTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [bookingDate, setBookingDate] = useState(today);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [addonLines, setAddonLines] = useState<AddonLine[]>([]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const selectedFacility = facilityTypes.find((facility) => String(facility.id) === facilityTypeId);
  const validAddonLines = addonLines.filter((line) => line.addonServiceId && Number(line.quantity) > 0);

  const previewEnabled = Boolean(selectedFacility && (selectedFacility.pricingMethod === "fixed" || Number(quantity) > 0));
  const { data: pricing } = trpc.platform.facilityBookings.preview.useQuery({
    facilityTypeId: Number(facilityTypeId) || 0,
    quantity: selectedFacility?.pricingMethod === "fixed" ? 1 : Number(quantity) || 0,
    addons: validAddonLines.map((line) => ({ addonServiceId: Number(line.addonServiceId), quantity: Number(line.quantity) })),
  }, { enabled: previewEnabled });

  const addAddonLine = () => setAddonLines((current) => [...current, blankAddonLine(Math.max(0, ...current.map((line) => line.id)) + 1)]);
  const updateAddonLine = (id: number, patch: Partial<AddonLine>) => setAddonLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const removeAddonLine = (id: number) => setAddonLines((current) => current.filter((line) => line.id !== id));

  const create = trpc.platform.facilityBookings.create.useMutation({
    onSuccess: () => {
      utils.platform.facilityBookings.list.invalidate();
      utils.platform.finance.invalidate();
      toast.success(t("facility.bookingConfirmed"));
      setFacilityTypeId(""); setQuantity("1"); setCustomerName(""); setNotes(""); setAddonLines([]); setAttemptedSubmit(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const facilityInvalid = !facilityTypeId;
  const quantityInvalid = selectedFacility?.pricingMethod !== "fixed" && !(Number(quantity) > 0);

  const submit = () => {
    setAttemptedSubmit(true);
    if (facilityInvalid) return toast.error(t("facility.chooseFacility"));
    if (quantityInvalid) return toast.error(t("facility.enterQuantity"));
    create.mutate({
      facilityTypeId: Number(facilityTypeId), bookingDate,
      quantity: selectedFacility?.pricingMethod === "fixed" ? 1 : Number(quantity),
      addons: validAddonLines.map((line) => ({ addonServiceId: Number(line.addonServiceId), quantity: Number(line.quantity) })),
      customerName: customerName.trim() || undefined, notes: notes.trim() || undefined,
    });
  };

  return <>
    <PageHeader eyebrow={t("facility.eyebrow")} title={t("facility.title")} description={t("facility.description")} actions={<StatusPill tone="info">{t("facility.noCalendarBadge")}</StatusPill>}/>
    <div className="grid gap-6 xl:grid-cols-[.88fr_1.12fr]">
      <div className="space-y-6">
        <Surface>
          <h2 className="font-serif text-2xl tracking-[-.04em]">{t("facility.newBooking")}</h2>
          <p className="mt-1.5 text-xs leading-5 text-muted">{t("facility.newBookingHint")}</p>
          <div className="mt-5 grid gap-4">
            <Field label={t("facility.facility")} error={attemptedSubmit && facilityInvalid ? t("common.required") : undefined}>
              <SelectField value={facilityTypeId} onChange={(event) => setFacilityTypeId(event.target.value)} className={attemptedSubmit && facilityInvalid ? "border-danger ring-1 ring-danger/30" : undefined}>
                <option value="">{t("facility.chooseFacility")}</option>
                {facilityTypes.map((facility) => <option key={facility.id} value={facility.id}>{facility.name} — {money(facility.rate)} {t(facilityMethodLabelKey[facility.pricingMethod])}</option>)}
              </SelectField>
            </Field>
            {selectedFacility && selectedFacility.pricingMethod !== "fixed" && <Field label={selectedFacility.pricingMethod === "hourly" ? t("facility.hours") : t("facility.days")} error={attemptedSubmit && quantityInvalid ? t("common.required") : undefined}>
              <TextField type="number" min={0.5} step="0.5" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={attemptedSubmit && quantityInvalid ? "border-danger ring-1 ring-danger/30" : undefined}/>
            </Field>}
            <Field label={t("common.date")}><TextField type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)}/></Field>
            <Field label={t("facility.customerName")}><TextField value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t("common.optional")}/></Field>
            <Field label={t("common.description")}><TextField value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("common.optional")}/></Field>
          </div>
        </Surface>
        <Surface>
          <div className="mb-5 flex items-start justify-between gap-3"><h2 className="font-serif text-2xl tracking-[-.04em]">{t("facility.recentBookings")}</h2><StatusPill>{bookingRows.length}</StatusPill></div>
          {bookingsLoading ? <LoadingState/> : bookingRows.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1fr_.7fr_.6fr] gap-3"><span>{t("facility.facility")}</span><span>{t("common.date")}</span><span className="text-right">{t("common.total")}</span></div></TableHeader>{(bookingRows as any[]).slice(0, 8).map((row: any) => <TableRow key={row.booking.id} className="grid-cols-[1fr_.7fr_.6fr]"><div className="min-w-0"><div className="truncate text-sm font-medium">{row.booking.facilityTypeName}</div>{row.booking.customerName && <div className="mt-1 truncate text-xs text-muted">{row.booking.customerName}</div>}</div><span className="text-xs text-muted">{dateLabel(row.booking.bookingDate)}</span><b className="text-right text-sm">{money(row.booking.totalAmount)}</b></TableRow>)}</TableFrame> : <EmptyState title={t("facility.noBookingsYet")} description={t("facility.noBookingsHint")}/>}
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
          <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-teal-tint">{t("facility.pricePreview")}</div><div className="mt-2 font-serif text-4xl tracking-[-.05em]">{money(pricing?.totalAmount || 0)}</div></div><StatusPill tone={pricing ? "success" : "neutral"}>{pricing ? t("tickets.readyPill") : t("tickets.completeLines")}</StatusPill></div>
          {pricing && <div className="mt-4 border-t border-white/15 pt-3 text-xs text-[#d6d6da]">
            <div className="flex justify-between py-1"><span>{selectedFacility?.name}</span><span>{money(pricing.facilityAmount)}</span></div>
            {(pricing.addons as any[]).map((addon: any, index: number) => <div key={`${addon.addonServiceId}-${index}`} className="flex justify-between py-1"><span>{addon.addonServiceName}</span><span>{money(addon.amount)}</span></div>)}
          </div>}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={submit} pending={create.isPending}>{t("facility.confirmBooking")}</PrimaryButton></div>
      </Surface>
    </div>
  </>;
}
