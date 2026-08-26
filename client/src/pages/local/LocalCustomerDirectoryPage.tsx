import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, Phone, Plus, Users } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { EmptyState, Field, MetricCard, PageHeader, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import { dateLabel, money } from "@/localApp/format";
import { useT } from "@/localApp/i18n";
import { createCustomer, useLocalStore } from "@/localApp/store";

const blankNewCustomer = { fullName: "", phone: "", email: "", country: DEFAULT_COUNTRY };

export default function LocalCustomerDirectoryPage() {
  const [, setLocation] = useLocation();
  const t = useT();
  const { customers, purchases } = useLocalStore();
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCustomer, setNewCustomer] = useState(blankNewCustomer);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const c = countryFilter.trim().toLowerCase();
    return customers
      .map((customer) => {
        const visits = purchases
          .filter((purchase) => purchase.customerId === customer.id)
          .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
        const total = visits.reduce((sum, visit) => sum + Number(visit.totalAmount), 0);
        return { customer, visits, total };
      })
      .filter(({ customer, visits }) => !q || customer.fullName.toLowerCase().includes(q) || customer.phone.includes(q) || customer.email.toLowerCase().includes(q) || visits.some((visit) => visit.lines.some((line) => line.ticketNumber.toLowerCase().includes(q))))
      .filter(({ customer }) => !c || customer.country.toLowerCase().includes(c))
      .sort((a, b) => new Date(b.visits[0]?.visitDate || 0).getTime() - new Date(a.visits[0]?.visitDate || 0).getTime());
  }, [customers, purchases, query, countryFilter]);
  const totalVisits = rows.reduce((sum, row) => sum + row.visits.length, 0);
  const submitNewCustomer = () => {
    if (!newCustomer.fullName.trim() || !newCustomer.phone.trim()) return toast.error("Full name and phone are required");
    createCustomer({ fullName: newCustomer.fullName.trim(), phone: newCustomer.phone.trim(), email: newCustomer.email.trim() || undefined, country: newCustomer.country.trim() || undefined });
    toast.success("Customer profile saved");
    setCreating(false);
    setNewCustomer(blankNewCustomer);
  };

  return <>
    <PageHeader eyebrow={t("customers.eyebrow")} title={t("customers.title")} description={t("customers.description")} actions={<div className="flex gap-2"><SecondaryButton onClick={() => setCreating(true)}><Plus size={15} className="mr-2"/>{t("customers.newCustomer")}</SecondaryButton><PrimaryButton onClick={() => setLocation("/tickets")}>{t("customers.newPurchase")} <ArrowUpRight size={15} className="ml-2"/></PrimaryButton></div>}/>
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard icon={Users} label={t("customers.profiles")} value={String(rows.length)} detail={t("customers.matchingSearch")} tone="blue"/>
      <MetricCard icon={CalendarDays} label={t("customers.purchaseRecords")} value={String(totalVisits)} detail={t("customers.groupedVisits")} tone="green"/>
      <MetricCard icon={Phone} label={t("customers.searchCoverage")} value={t("customers.threeFields")} detail="" tone="amber"/>
    </div>
    <Surface className="mt-6"><div className="flex flex-col gap-3 sm:flex-row"><div className="flex-1"><SearchField value={query} onChange={setQuery} placeholder={t("customers.searchPlaceholder")}/></div><SelectField value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} className="sm:w-48"><option value="">{t("customers.allCountries")}</option>{COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}</SelectField></div></Surface>
    <Surface className="mt-6">
      {rows.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.25fr_1fr_.65fr_auto] gap-3"><span>{t("receipt.customer")}</span><span>{t("customers.lastVisit")}</span><span>{t("customers.lifetime")}</span><span className="text-right">{t("customers.history")}</span></div></TableHeader>
        {rows.map(({ customer, visits, total }) => <div key={customer.id}>
          <TableRow className="grid-cols-[1.25fr_1fr_.65fr_auto]">
            <div className="min-w-0"><div className="truncate font-medium text-ink">{customer.fullName}</div><div className="mt-1 truncate text-xs text-muted">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}{customer.country ? ` · ${customer.country}` : ""}</div></div>
            <div className="text-xs text-muted">{dateLabel(visits[0]?.visitDate)}<div className="mt-1"><StatusPill tone="info">{visits.length} {visits.length === 1 ? t("customers.purchase") : t("customers.purchases")}</StatusPill></div></div>
            <b className="text-sm font-medium">{money(total)}</b>
            <button onClick={() => setExpandedId(expandedId === customer.id ? null : customer.id)} className="justify-self-end rounded-full bg-fill px-3 py-2 text-[11px] font-semibold text-ink hover:bg-[#e8e8ed]">{expandedId === customer.id ? t("common.close") : t("common.view")}</button>
          </TableRow>
          {expandedId === customer.id && <div className="border-t border-divider bg-[#fbfbfd] px-4 py-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">{t("customers.purchaseHistory")}</div>
            {visits.length ? <div className="grid gap-2">{visits.slice(0, 8).map((visit) => <div key={visit.id} className="grid grid-cols-[1fr_.8fr_auto] items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-xs"><b className="font-mono text-accent">{visit.lines.map((line) => line.ticketNumber).join(" · ")}</b><span className="text-muted">{dateLabel(visit.visitDate)}</span><b>{money(visit.totalAmount)}</b></div>)}</div> : <p className="text-xs text-muted">No tickets issued yet for this profile.</p>}
          </div>}
        </div>)}
      </TableFrame> : <EmptyState title={t("customers.noMatch")} description={t("customers.noMatchHint")} action={<PrimaryButton onClick={() => setLocation("/tickets")}>{t("overview.openTicketDesk")}</PrimaryButton>}/>}
    </Surface>
    <Dialog open={creating} onOpenChange={(open) => { setCreating(open); if (!open) setNewCustomer(blankNewCustomer); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("customers.newCustomer")}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label={t("tickets.fullName")}><TextField value={newCustomer.fullName} onChange={(event) => setNewCustomer({ ...newCustomer, fullName: event.target.value })}/></Field>
          <Field label={t("common.phone")}><TextField value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} inputMode="tel" placeholder="+968 …"/></Field>
          <Field label={t("common.email")}><TextField type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} placeholder="name@example.com"/></Field>
          <Field label={t("common.country")}><SelectField value={newCustomer.country} onChange={(event) => setNewCustomer({ ...newCustomer, country: event.target.value })}>{COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}</SelectField></Field>
        </div>
        <DialogFooter><PrimaryButton onClick={submitNewCustomer}>{t("common.save")}</PrimaryButton></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
