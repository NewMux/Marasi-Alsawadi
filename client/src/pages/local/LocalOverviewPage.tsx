import { ArrowUpRight, DollarSign, TrendingDown, Users } from "lucide-react";
import { useLocation } from "wouter";
import { EmptyState, MetricCard, PageHeader, PrimaryButton, StatusPill, Surface, TableFrame, TableHeader, TableRow } from "@/components/MarasiUI";
import { dateLabel, money } from "@/localApp/format";
import { useT } from "@/localApp/i18n";
import { useLocalStore } from "@/localApp/store";

export default function LocalOverviewPage() {
  const [, setLocation] = useLocation();
  const t = useT();
  const { purchases, expenses, customers } = useLocalStore();
  const revenue = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0);
  const costs = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const recent = [...purchases].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  return <>
    <PageHeader eyebrow={t("overview.eyebrow")} title={t("overview.title")} description={t("overview.description")} actions={<PrimaryButton onClick={() => setLocation("/tickets")}>{t("overview.openTicketDesk")} <ArrowUpRight size={15} className="ml-2"/></PrimaryButton>}/>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={DollarSign} label={t("overview.revenue")} value={money(revenue)} detail={`${purchases.length}`} tone="blue"/>
      <MetricCard icon={TrendingDown} label={t("overview.expenses")} value={money(costs)} detail={`${expenses.length}`} tone="amber"/>
      <MetricCard icon={ArrowUpRight} label={t("overview.net")} value={money(revenue - costs)} detail={revenue >= costs ? "+" : "−"} tone={revenue >= costs ? "green" : "red"}/>
      <MetricCard icon={Users} label={t("overview.customers")} value={String(customers.length)} detail="" tone="blue"/>
    </div>
    <Surface className="mt-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 className="font-serif text-2xl tracking-[-.04em]">{t("overview.recentPurchases")}</h2>
        <StatusPill tone="info">{purchases.length}</StatusPill>
      </div>
      {recent.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.2fr_.8fr_auto] gap-3"><span>{t("receipt.customer")}</span><span>{t("tickets.visitDate")}</span><span className="text-right">{t("common.total")}</span></div></TableHeader>
        {recent.map((purchase) => {
          const customer = customers.find((entry) => entry.id === purchase.customerId);
          return <TableRow key={purchase.id} className="grid-cols-[1.2fr_.8fr_auto]">
            <div className="min-w-0"><div className="truncate text-sm font-medium">{customer?.fullName || "Customer"}</div><div className="mt-1 truncate font-mono text-[10px] text-accent">{purchase.lines.map((line) => line.ticketNumber).join(" · ")}</div></div>
            <span className="text-xs text-muted">{dateLabel(purchase.visitDate)}</span>
            <b className="text-right">{money(purchase.totalAmount)}</b>
          </TableRow>;
        })}
      </TableFrame> : <EmptyState title={t("overview.noPurchases")} description={t("overview.noPurchasesHint")} action={<PrimaryButton onClick={() => setLocation("/tickets")}>{t("overview.openTicketDesk")}</PrimaryButton>}/>}
    </Surface>
  </>;
}
