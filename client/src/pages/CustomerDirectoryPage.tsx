import { trpc } from "@/lib/trpc";
import { ArrowUpRight, CalendarDays, Phone, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { EmptyState, Field, LoadingState, MetricCard, PageHeader, PrimaryButton, SearchField, SecondaryButton, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const blankNewCustomer = { fullName: "", phone: "", email: "", nationality: "" };

export default function CustomerDirectoryPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCustomer, setNewCustomer] = useState(blankNewCustomer);
  const utils = trpc.useUtils();
  const searchInput = { query: query.trim() || undefined, country: countryFilter.trim() || undefined };
  const { data: records = [], isLoading: customersLoading, isError: customersError } = trpc.platform.customers.search.useQuery(searchInput);
  const { data: purchaseRows = [], isLoading: purchasesLoading } = trpc.platform.tickets.purchaseList.useQuery({ query: query.trim() || undefined });
  const isLoading = customersLoading || purchasesLoading;
  const createCustomer = trpc.platform.customers.create.useMutation({
    onSuccess: () => { toast.success("Customer profile saved"); setCreating(false); setNewCustomer(blankNewCustomer); utils.platform.customers.search.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const customers = useMemo(() => {
    const map = new Map<number, any>();
    (records as any[]).forEach((customer) => { if (customer.id) map.set(customer.id, { id: customer.id, name: customer.fullName || "Guest", phone: customer.phone || "—", email: customer.email || "", country: customer.nationality || "", visits: [], total: 0 }); });
    (purchaseRows as any[]).forEach((row) => {
      const customer = row.customer || {};
      if (!customer.id) return;
      // A country filter narrows to profiles matching that country; skip the
      // ticket-number fallback below so an unrelated country's customer
      // can't sneak back in just because their ticket number matched.
      if (!map.has(customer.id) && countryFilter.trim()) return;
      const current = map.get(customer.id) || { id: customer.id, name: customer.fullName || "Guest", phone: customer.phone || "—", email: customer.email || "", country: customer.nationality || "", visits: [], total: 0 };
      let purchase = current.visits.find((entry: any) => entry.id === row.purchase.id);
      if (!purchase) { purchase = { id: row.purchase.id, visitDate: row.purchase.visitDate, totalAmount: row.purchase.totalAmount, ticketNumbers: [] }; current.visits.push(purchase); current.total += Number(row.purchase.totalAmount || 0); }
      if (row.line?.ticketNumber && !purchase.ticketNumbers.includes(row.line.ticketNumber)) purchase.ticketNumbers.push(row.line.ticketNumber);
      map.set(customer.id, current);
    });
    return Array.from(map.values()).map((customer) => ({ ...customer, visits: customer.visits.sort((a: any, b: any) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()) })).sort((a, b) => new Date(b.visits[0]?.visitDate || 0).getTime() - new Date(a.visits[0]?.visitDate || 0).getTime());
  }, [records, purchaseRows, countryFilter]);
  const totalVisits = customers.reduce((sum, customer) => sum + customer.visits.length, 0);
  const submitNewCustomer = () => {
    if (!newCustomer.fullName.trim() || !newCustomer.phone.trim()) return toast.error("Full name and phone are required");
    createCustomer.mutate({ fullName: newCustomer.fullName.trim(), phone: newCustomer.phone.trim(), email: newCustomer.email.trim() || undefined, nationality: newCustomer.nationality.trim() || undefined });
  };
  return <>
    <PageHeader eyebrow="Front office" title="Customer directory" description="Search customer profiles and every PRD ticket purchase by name, phone, email, or country." actions={<div className="flex gap-2"><SecondaryButton onClick={() => setCreating(true)}><Plus size={15} className="mr-2"/>New customer</SecondaryButton><PrimaryButton onClick={() => setLocation("/tickets")}>New purchase <ArrowUpRight size={15} className="ml-2"/></PrimaryButton></div>}/>
    <div className="grid gap-4 sm:grid-cols-3"><MetricCard icon={Users} label="Customer profiles" value={String(customers.length)} detail="Matching current search" tone="blue"/><MetricCard icon={CalendarDays} label="Purchase records" value={String(totalVisits)} detail="Grouped customer visits" tone="green"/><MetricCard icon={Phone} label="Search coverage" value="Name · phone · email" detail="Plus a country filter" tone="amber"/></div>
    <Surface className="mt-6"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="flex flex-1 flex-col gap-3 sm:flex-row"><div className="flex-1"><SearchField value={query} onChange={setQuery} placeholder="Search customer name, phone, email, or ticket number"/></div><TextField value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} placeholder="Filter by country" className="sm:w-48"/></div><div className="text-xs text-subtle">{isLoading ? "Searching…" : `${customers.length} profile${customers.length === 1 ? "" : "s"}`}</div></div></Surface>
    <div className="mt-6">{customersError ? <Surface><EmptyState title="Could not load customers" description="Refresh the page or try again from the ticket desk." action={<PrimaryButton onClick={() => setLocation("/tickets")}>Open ticket desk</PrimaryButton>}/></Surface> : isLoading ? <LoadingState label="Searching customer history…"/> : customers.length ? <Surface className="p-0"><TableFrame className="border-0"><TableHeader><div className="grid grid-cols-[1.25fr_1fr_.65fr_auto] gap-3"><span>Customer</span><span>Last visit</span><span>Lifetime</span><span className="text-right">History</span></div></TableHeader>{customers.map((customer) => <div key={customer.id}><TableRow className="grid-cols-[1.25fr_1fr_.65fr_auto]"><div className="min-w-0"><div className="truncate font-medium text-ink">{customer.name}</div><div className="mt-1 truncate text-xs text-muted">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}{customer.country ? ` · ${customer.country}` : ""}</div></div><div className="text-xs text-muted">{fmt(customer.visits[0]?.visitDate)}<div className="mt-1"><StatusPill tone="info">{customer.visits.length} {customer.visits.length === 1 ? "purchase" : "purchases"}</StatusPill></div></div><b className="text-sm font-medium">{money(customer.total)}</b><button onClick={() => setExpandedId(expandedId === customer.id ? null : customer.id)} className="justify-self-end rounded-full bg-fill px-3 py-2 text-[11px] font-semibold text-ink hover:bg-[#e8e8ed]">{expandedId === customer.id ? "Close" : "View"}</button></TableRow>{expandedId === customer.id && <div className="border-t border-divider bg-[#fbfbfd] px-4 py-4"><div className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">Purchase history</div>{customer.visits.length ? <div className="grid gap-2">{customer.visits.slice(0, 8).map((visit: any) => <div key={visit.id} className="grid grid-cols-[1fr_.8fr_auto] items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-xs"><div><b className="font-mono text-accent">{visit.ticketNumbers.join(" · ") || `Purchase #${visit.id}`}</b><div className="mt-1 text-muted">Waterpark purchase</div></div><span className="text-muted">{fmt(visit.visitDate)}</span><b>{money(visit.totalAmount)}</b></div>)}</div> : <p className="text-xs text-muted">No tickets issued yet for this profile.</p>}</div>}</div>)}</TableFrame></Surface> : <Surface><EmptyState title="No matching customers" description="Try a name, phone number, email, or country. New profiles can be created here or at the Ticket Desk." action={<PrimaryButton onClick={() => setLocation("/tickets")}>Open Ticket Desk</PrimaryButton>}/></Surface>}</div>
    <Dialog open={creating} onOpenChange={(open) => { setCreating(open); if (!open) setNewCustomer(blankNewCustomer); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>New customer profile</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Full name"><TextField value={newCustomer.fullName} onChange={(event) => setNewCustomer({ ...newCustomer, fullName: event.target.value })} placeholder="Customer full name"/></Field>
          <Field label="Phone number"><TextField value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} inputMode="tel" placeholder="+968 …"/></Field>
          <Field label="Email (optional)"><TextField type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} placeholder="name@example.com"/></Field>
          <Field label="Country (optional)"><TextField value={newCustomer.nationality} onChange={(event) => setNewCustomer({ ...newCustomer, nationality: event.target.value })} placeholder="Oman"/></Field>
        </div>
        <DialogFooter><PrimaryButton onClick={submitNewCustomer} pending={createCustomer.isPending}>Save customer</PrimaryButton></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
