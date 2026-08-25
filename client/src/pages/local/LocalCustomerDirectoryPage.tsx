import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, Phone, Users } from "lucide-react";
import { useLocation } from "wouter";
import { EmptyState, MetricCard, PageHeader, PrimaryButton, SearchField, StatusPill, Surface, TableFrame, TableHeader, TableRow } from "@/components/MarasiUI";
import { dateLabel, money } from "@/localApp/format";
import { useT } from "@/localApp/i18n";
import { useLocalStore } from "@/localApp/store";

export default function LocalCustomerDirectoryPage() {
  const [, setLocation] = useLocation();
  const t = useT();
  const { customers, purchases } = useLocalStore();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .map((customer) => {
        const visits = purchases
          .filter((purchase) => purchase.customerId === customer.id)
          .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
        const total = visits.reduce((sum, visit) => sum + Number(visit.totalAmount), 0);
        return { customer, visits, total };
      })
      .filter(({ customer, visits }) => !q || customer.fullName.toLowerCase().includes(q) || customer.phone.includes(q) || visits.some((visit) => visit.lines.some((line) => line.ticketNumber.toLowerCase().includes(q))))
      .sort((a, b) => new Date(b.visits[0]?.visitDate || 0).getTime() - new Date(a.visits[0]?.visitDate || 0).getTime());
  }, [customers, purchases, query]);
  const totalVisits = rows.reduce((sum, row) => sum + row.visits.length, 0);

  return <>
    <PageHeader eyebrow={t("customers.eyebrow")} title={t("customers.title")} description={t("customers.description")} actions={<PrimaryButton onClick={() => setLocation("/tickets")}>{t("customers.newPurchase")} <ArrowUpRight size={15} className="ml-2"/></PrimaryButton>}/>
    <div className="grid gap-4 sm:grid-cols-3">
      <MetricCard icon={Users} label={t("customers.profiles")} value={String(rows.length)} detail={t("customers.matchingSearch")} tone="blue"/>
      <MetricCard icon={CalendarDays} label={t("customers.purchaseRecords")} value={String(totalVisits)} detail={t("customers.groupedVisits")} tone="green"/>
      <MetricCard icon={Phone} label={t("customers.searchCoverage")} value={t("customers.threeFields")} detail="" tone="amber"/>
    </div>
    <Surface className="mt-6"><SearchField value={query} onChange={setQuery} placeholder={t("customers.searchPlaceholder")}/></Surface>
    <Surface className="mt-6">
      {rows.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.25fr_1fr_.65fr_auto] gap-3"><span>{t("receipt.customer")}</span><span>{t("customers.lastVisit")}</span><span>{t("customers.lifetime")}</span><span className="text-right">{t("customers.history")}</span></div></TableHeader>
        {rows.map(({ customer, visits, total }) => <div key={customer.id}>
          <TableRow className="grid-cols-[1.25fr_1fr_.65fr_auto]">
            <div className="min-w-0"><div className="truncate font-medium text-ink">{customer.fullName}</div><div className="mt-1 truncate text-xs text-muted">{customer.phone}</div></div>
            <div className="text-xs text-muted">{dateLabel(visits[0]?.visitDate)}<div className="mt-1"><StatusPill tone="info">{visits.length} {visits.length === 1 ? t("customers.purchase") : t("customers.purchases")}</StatusPill></div></div>
            <b className="text-sm font-medium">{money(total)}</b>
            <button onClick={() => setExpandedId(expandedId === customer.id ? null : customer.id)} className="justify-self-end rounded-full bg-fill px-3 py-2 text-[11px] font-semibold text-ink hover:bg-[#e8e8ed]">{expandedId === customer.id ? t("common.close") : t("common.view")}</button>
          </TableRow>
          {expandedId === customer.id && <div className="border-t border-divider bg-[#fbfbfd] px-4 py-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">{t("customers.purchaseHistory")}</div>
            <div className="grid gap-2">{visits.slice(0, 8).map((visit) => <div key={visit.id} className="grid grid-cols-[1fr_.8fr_auto] items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-xs"><b className="font-mono text-accent">{visit.lines.map((line) => line.ticketNumber).join(" · ")}</b><span className="text-muted">{dateLabel(visit.visitDate)}</span><b>{money(visit.totalAmount)}</b></div>)}</div>
          </div>}
        </div>)}
      </TableFrame> : <EmptyState title={t("customers.noMatch")} description={t("customers.noMatchHint")} action={<PrimaryButton onClick={() => setLocation("/tickets")}>{t("overview.openTicketDesk")}</PrimaryButton>}/>}
    </Surface>
  </>;
}
