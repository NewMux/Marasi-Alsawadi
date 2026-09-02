import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Edit3, Plus, Receipt, Trash2, UserPlus, Wallet } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { EmptyState, Field, LoadingState, MetricCard, PageHeader, PrimaryButton, SecondaryButton, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";
import { useT } from "@/lib/i18n";

const today = new Date().toISOString().slice(0, 10);
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const blankCustodian = { username: "", name: "", temporaryPassword: "", fixedAmount: "" };
const blankSpend = { businessDate: today, amount: "", description: "" };

function CustodianView() {
  const t = useT();
  const utils = trpc.useUtils();
  const [spendForm, setSpendForm] = useState({ ...blankSpend });
  const { data: mine, isLoading } = trpc.platform.finance.pettyCashFunds.mine.useQuery();
  const { data: spends = [], isLoading: spendsLoading } = trpc.platform.finance.pettyCashFunds.mineSpends.useQuery();
  const logSpend = trpc.platform.finance.pettyCashFunds.spend.useMutation({
    onSuccess: () => {
      utils.platform.finance.pettyCashFunds.mine.invalidate();
      utils.platform.finance.pettyCashFunds.mineSpends.invalidate();
      setSpendForm({ ...blankSpend });
      toast.success(t("pettyCash.spendLogged"));
    },
    onError: (error) => toast.error(error.message),
  });

  if (isLoading) return <LoadingState label={t("pettyCash.title")}/>;
  if (!mine) return <EmptyState icon={Wallet} title={t("pettyCash.noFundAssigned")} description={t("pettyCash.noFundAssignedHint")}/>;

  const submitSpend = () => {
    if (!spendForm.amount || Number(spendForm.amount) <= 0 || !spendForm.description.trim()) return toast.error(t("pettyCash.completeSpendFields"));
    logSpend.mutate({ businessDate: spendForm.businessDate, amount: spendForm.amount, description: spendForm.description.trim() });
  };

  return <>
    <div className="grid gap-4 md:grid-cols-3">
      <MetricCard icon={Wallet} label={t("pettyCash.fixedAmountLabel")} value={money(mine.fund.fixedAmount)} detail={t("pettyCash.fixedAmountReadonly")} tone="blue"/>
      <MetricCard icon={Receipt} label={t("pettyCash.totalSpent")} value={money(Number(mine.fund.fixedAmount) - mine.balance)} detail={`${spends.length}`} tone="amber"/>
      <MetricCard icon={Wallet} label={t("pettyCash.remainingBalance")} value={money(mine.balance)} detail="" tone={mine.balance >= 0 ? "green" : "red"}/>
    </div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <Surface>
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.logSpending")}</h2></div><Receipt size={19} className="text-accent"/></div>
        <div className="grid gap-4">
          <Field label={t("pettyCash.spendDate")}><TextField type="date" value={spendForm.businessDate} onChange={(event) => setSpendForm({ ...spendForm, businessDate: event.target.value })}/></Field>
          <Field label={t("pettyCash.spendAmount")}><TextField inputMode="decimal" value={spendForm.amount} onChange={(event) => setSpendForm({ ...spendForm, amount: event.target.value })} placeholder="0.00"/></Field>
          <Field label={t("pettyCash.spendDescription")}><TextField value={spendForm.description} onChange={(event) => setSpendForm({ ...spendForm, description: event.target.value })}/></Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={submitSpend} pending={logSpend.isPending}>{t("pettyCash.logSpendingButton")}<Plus size={15} className="ml-2"/></PrimaryButton></div>
      </Surface>
      <Surface>
        <div className="mb-5 flex items-start justify-between gap-3"><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.spendHistory")}</h2><StatusPill>{spends.length}</StatusPill></div>
        {spendsLoading ? <LoadingState/> : spends.length ? <TableFrame><TableHeader><div className="grid grid-cols-[.7fr_1.3fr_.6fr] gap-3"><span>{t("pettyCash.spendDate")}</span><span>{t("common.description")}</span><span className="text-right">{t("pettyCash.spendAmount")}</span></div></TableHeader>{(spends as any[]).map((entry) => <TableRow key={entry.id} className="grid-cols-[.7fr_1.3fr_.6fr]"><span className="text-xs text-muted">{dateLabel(entry.businessDate)}</span><span className="truncate text-sm">{entry.description}</span><b className="text-right text-sm text-danger">{money(entry.amount)}</b></TableRow>)}</TableFrame> : <EmptyState icon={Receipt} title={t("pettyCash.noSpendsYet")} description=""/>}
      </Surface>
    </div>
  </>;
}

function ManagerView() {
  const t = useT();
  const utils = trpc.useUtils();
  const [custodianForm, setCustodianForm] = useState({ ...blankCustodian });
  const [expandedFundId, setExpandedFundId] = useState<number | null>(null);
  const { data: funds = [], isLoading } = trpc.platform.finance.pettyCashFunds.list.useQuery();
  const { data: expandedSpends = [], isLoading: expandedSpendsLoading } = trpc.platform.finance.pettyCashFunds.spendsFor.useQuery({ fundId: expandedFundId ?? 0 }, { enabled: expandedFundId !== null });

  const refresh = () => utils.platform.finance.pettyCashFunds.invalidate();
  const createCustodian = trpc.platform.finance.pettyCashFunds.createCustodian.useMutation({
    onSuccess: () => { refresh(); setCustodianForm({ ...blankCustodian }); toast.success(t("pettyCash.custodianCreated")); },
    onError: (error) => toast.error(error.message),
  });
  const updateAmount = trpc.platform.finance.pettyCashFunds.updateAmount.useMutation({
    onSuccess: () => { refresh(); toast.success(t("pettyCash.amountUpdated")); },
    onError: (error) => toast.error(error.message),
  });
  const deleteSpend = trpc.platform.finance.pettyCashFunds.deleteSpend.useMutation({
    onSuccess: () => { refresh(); utils.platform.finance.pettyCashFunds.spendsFor.invalidate(); toast.success(t("pettyCash.spendRemoved")); },
    onError: (error) => toast.error(error.message),
  });

  const submitCustodian = () => {
    if (custodianForm.username.trim().length < 3 || custodianForm.name.trim().length < 2 || custodianForm.temporaryPassword.length < 12 || Number(custodianForm.fixedAmount) <= 0) {
      return toast.error(t("pettyCash.completeCustodianFields"));
    }
    createCustodian.mutate({ username: custodianForm.username.trim(), name: custodianForm.name.trim(), temporaryPassword: custodianForm.temporaryPassword, fixedAmount: custodianForm.fixedAmount });
  };
  const editAmount = (fund: any) => {
    const next = window.prompt(t("pettyCash.newFixedAmountPrompt"), String(fund.fixedAmount));
    if (next === null) return;
    if (!Number(next) || Number(next) <= 0) return toast.error(t("pettyCash.completeCustodianFields"));
    updateAmount.mutate({ id: fund.id, fixedAmount: next });
  };

  return <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
    <Surface>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.createCustodian")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("pettyCash.createCustodianHint")}</p></div><UserPlus size={19} className="text-accent"/></div>
      <div className="grid gap-4">
        <Field label={t("pettyCash.custodianName")}><TextField value={custodianForm.name} onChange={(event) => setCustodianForm({ ...custodianForm, name: event.target.value })}/></Field>
        <Field label={t("pettyCash.custodianUsername")}><TextField autoComplete="off" value={custodianForm.username} onChange={(event) => setCustodianForm({ ...custodianForm, username: event.target.value.toLowerCase() })}/></Field>
        <Field label={t("login.tempPassword")} hint={t("settings.minimum12Chars")}><TextField type="password" autoComplete="new-password" value={custodianForm.temporaryPassword} onChange={(event) => setCustodianForm({ ...custodianForm, temporaryPassword: event.target.value })}/></Field>
        <Field label={t("pettyCash.fixedAmountLabel")}><TextField inputMode="decimal" value={custodianForm.fixedAmount} onChange={(event) => setCustodianForm({ ...custodianForm, fixedAmount: event.target.value })} placeholder="0.00"/></Field>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={submitCustodian} pending={createCustodian.isPending}>{t("pettyCash.createCustodianButton")}<Plus size={15} className="ml-2"/></PrimaryButton></div>
    </Surface>
    <Surface>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.custodiansList")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("pettyCash.custodiansListHint")}</p></div><StatusPill>{funds.length}</StatusPill></div>
      {isLoading ? <LoadingState/> : funds.length ? <div className="divide-y divide-divider">{(funds as any[]).map((row) => { const expanded = expandedFundId === row.fund.id; return <div key={row.fund.id} className="py-4">
        <div className="grid grid-cols-[1.1fr_.7fr_.7fr_.7fr_auto] items-center gap-3">
          <div><b className="block text-sm">{row.custodian?.name || row.custodian?.username || "—"}</b><span className="mt-0.5 block font-mono text-[10px] text-accent">{row.custodian?.username}</span></div>
          <span className="text-xs">{money(row.fund.fixedAmount)}</span>
          <span className="text-xs text-danger">−{money(row.totalSpent)}</span>
          <b className={row.balance >= 0 ? "text-sm text-ink" : "text-sm text-danger"}>{money(row.balance)}</b>
          <div className="flex justify-end gap-1">
            <button aria-label="Edit fixed amount" onClick={() => editAmount(row.fund)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink"><Edit3 size={14}/></button>
            <button aria-label="Toggle spending" onClick={() => setExpandedFundId(expanded ? null : row.fund.id)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink">{expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
          </div>
        </div>
        {expanded && <div className="mt-3 rounded-xl bg-well p-3">
          {expandedSpendsLoading ? <LoadingState/> : (expandedSpends as any[]).length ? <div className="divide-y divide-divider">{(expandedSpends as any[]).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="text-muted">{dateLabel(entry.businessDate)}</span><span className="min-w-0 flex-1 truncate px-3">{entry.description}</span><b className="text-danger">{money(entry.amount)}</b><button aria-label="Delete spend" onClick={() => window.confirm(t("pettyCash.confirmDeleteSpend")) && deleteSpend.mutate({ id: entry.id })} className="ml-2 rounded-full p-1.5 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={13}/></button></div>)}</div> : <p className="py-2 text-center text-xs text-muted">{t("pettyCash.noSpendsYet")}</p>}
        </div>}
      </div>; })}</div> : <EmptyState icon={Wallet} title={t("pettyCash.noCustodiansYet")} description={t("pettyCash.noCustodiansHint")}/>}
    </Surface>
  </div>;
}

export default function PettyCashPage() {
  const { user } = useAuth();
  const t = useT();
  const isCustodian = user?.role === "petty_cash";
  return <>
    <PageHeader eyebrow={t("pettyCash.eyebrow")} title={t("pettyCash.title")} description={isCustodian ? t("pettyCash.descriptionCustodian") : t("pettyCash.descriptionManager")}/>
    {isCustodian ? <CustodianView/> : <ManagerView/>}
  </>;
}
