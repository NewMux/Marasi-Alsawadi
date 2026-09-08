import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Edit3, LogOut, Plus, Receipt, Send, Trash2, UserPlus, Wallet } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DateField, EmptyState, Field, LoadingState, MetricCard, PageHeader, PrimaryButton, SecondaryButton, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LanguageToggle } from "@/contexts/LanguageContext";
import { useT } from "@/lib/i18n";
import marasiLogoIcon from "@/assets/marasi-logo-icon.webp";

const today = new Date().toISOString().slice(0, 10);
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
// PRD Round 5, Section 3: the allocation log needs the time an allocation
// was sent, not just its date — createdAt is a full timestamp, unlike the
// spend log's date-only businessDate.
const dateTimeLabel = (value: unknown) => { const date = new Date(value as string); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
const blankCustodian = { username: "", name: "", temporaryPassword: "", fixedAmount: "" };
const blankSpend = { businessDate: today, amount: "", description: "", attachmentDataBase64: "", attachmentMimeType: "", attachmentFileName: "" };
const blankAllocation = { amount: "", note: "" };

function readFileAsAttachment(file: File): Promise<{ dataBase64: string; mimeType: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const result = reader.result as string; resolve({ dataBase64: result.split(",")[1] || "", mimeType: file.type, fileName: file.name }); };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// A petty cash custodian lands directly on this screen with no sidebar or
// other nav chrome at all (PRD: "should NOT see the normal
// sidebar/navigation ... with no access to any other page").
function CustodianShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const t = useT();
  return <div className="min-h-screen bg-canvas text-ink">
    <header className="sticky top-0 z-10 flex h-[64px] items-center justify-between border-b border-black/[.06] bg-white/80 px-4 backdrop-blur-2xl md:px-10">
      <div className="flex items-center gap-3"><img src={marasiLogoIcon} alt="Marasi Alsawadi" className="h-8 w-8 shrink-0 object-contain"/><span className="font-serif text-lg leading-5 tracking-[-.03em]">Marasi</span></div>
      <div className="flex items-center gap-2 sm:gap-3">
        <LanguageToggle/>
        <span className="hidden rounded-full bg-fill px-3 py-1.5 text-[11px] font-medium text-body sm:inline">{user?.name || t("pettyCash.title")}</span>
        <button onClick={logout} className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[11px] font-medium text-body hover:bg-[#e8e8ed] hover:text-ink"><LogOut size={13}/>Sign out</button>
      </div>
    </header>
    <div className="mx-auto max-w-[1100px] p-4 pb-16 md:p-8 lg:p-10">{children}</div>
  </div>;
}

function CustodianView() {
  const t = useT();
  const utils = trpc.useUtils();
  const [spendForm, setSpendForm] = useState({ ...blankSpend });
  const { data: mine, isLoading } = trpc.platform.finance.pettyCashFunds.mine.useQuery();
  const { data: spends = [], isLoading: spendsLoading } = trpc.platform.finance.pettyCashFunds.mineSpends.useQuery();
  const { data: allocations = [], isLoading: allocationsLoading } = trpc.platform.finance.pettyCashFunds.mineAllocations.useQuery();
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
    logSpend.mutate({
      businessDate: spendForm.businessDate, amount: spendForm.amount, description: spendForm.description.trim(),
      attachment: spendForm.attachmentDataBase64 ? { dataBase64: spendForm.attachmentDataBase64, mimeType: spendForm.attachmentMimeType, fileName: spendForm.attachmentFileName } : undefined,
    });
  };
  const onAttachmentSelected = async (file: File | undefined) => {
    if (!file) return setSpendForm((current) => ({ ...current, attachmentDataBase64: "", attachmentMimeType: "", attachmentFileName: "" }));
    if (file.size > 5 * 1024 * 1024) return toast.error(t("finance.attachmentTooLarge"));
    const attachment = await readFileAsAttachment(file);
    setSpendForm((current) => ({ ...current, attachmentDataBase64: attachment.dataBase64, attachmentMimeType: attachment.mimeType, attachmentFileName: attachment.fileName }));
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
          <Field label={t("pettyCash.spendDate")}><DateField value={spendForm.businessDate} onChange={(value) => setSpendForm({ ...spendForm, businessDate: value })}/></Field>
          <Field label={t("pettyCash.spendAmount")}><TextField inputMode="decimal" value={spendForm.amount} onChange={(event) => setSpendForm({ ...spendForm, amount: event.target.value })} placeholder="0.00"/></Field>
          <Field label={t("pettyCash.spendDescription")}><TextField value={spendForm.description} onChange={(event) => setSpendForm({ ...spendForm, description: event.target.value })}/></Field>
          <Field label={t("finance.attachment")}><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => onAttachmentSelected(event.target.files?.[0])} className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-fill file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink hover:file:bg-[#e8e8ed]"/></Field>
          {spendForm.attachmentFileName && <p className="truncate text-[11px] text-accent">{spendForm.attachmentFileName}</p>}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={submitSpend} pending={logSpend.isPending}>{t("pettyCash.logSpendingButton")}<Plus size={15} className="ml-2"/></PrimaryButton></div>
      </Surface>
      <Surface>
        <div className="mb-5 flex items-start justify-between gap-3"><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.spendHistory")}</h2><StatusPill>{spends.length}</StatusPill></div>
        {spendsLoading ? <LoadingState/> : spends.length ? <TableFrame><TableHeader><div className="grid grid-cols-[.7fr_1.3fr_.6fr] gap-3"><span>{t("pettyCash.spendDate")}</span><span>{t("common.description")}</span><span className="text-right">{t("pettyCash.spendAmount")}</span></div></TableHeader>{(spends as any[]).map((entry: any) => <TableRow key={entry.id} className="grid-cols-[.7fr_1.3fr_.6fr]"><span className="text-xs text-muted">{dateLabel(entry.businessDate)}</span><span className="min-w-0"><span className="block truncate text-sm">{entry.description}</span>{entry.attachmentPath && <a href={entry.attachmentPath} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-medium text-accent hover:underline">{t("finance.viewAttachment")}</a>}</span><b className="text-right text-sm text-danger">{money(entry.amount)}</b></TableRow>)}</TableFrame> : <EmptyState icon={Receipt} title={t("pettyCash.noSpendsYet")} description=""/>}
      </Surface>
    </div>
    <Surface className="mt-6">
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.allocationHistory")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("pettyCash.allocationHistoryCustodianHint")}</p></div><StatusPill>{allocations.length}</StatusPill></div>
      {allocationsLoading ? <LoadingState/> : allocations.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1fr_.7fr_.6fr] gap-3"><span>{t("pettyCash.allocationSentAt")}</span><span>{t("pettyCash.allocationSentBy")}</span><span className="text-right">{t("pettyCash.spendAmount")}</span></div></TableHeader>{(allocations as any[]).map((row: any) => <TableRow key={row.allocation.id} className="grid-cols-[1fr_.7fr_.6fr]"><span className="min-w-0"><span className="block truncate text-xs text-muted">{dateTimeLabel(row.allocation.createdAt)}</span>{row.allocation.note && <span className="mt-0.5 block truncate text-xs text-subtle">{row.allocation.note}</span>}</span><span className="truncate text-xs">{row.sender?.name || row.sender?.username || "—"}</span><b className="text-right text-sm text-success">+{money(row.allocation.amount)}</b></TableRow>)}</TableFrame> : <EmptyState icon={Wallet} title={t("pettyCash.noAllocationsYet")} description=""/>}
    </Surface>
  </>;
}

function ManagerView() {
  const t = useT();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const utils = trpc.useUtils();
  const [custodianForm, setCustodianForm] = useState({ ...blankCustodian });
  const [expandedFundId, setExpandedFundId] = useState<number | null>(null);
  const [allocatingFund, setAllocatingFund] = useState<any>(null);
  const [allocationForm, setAllocationForm] = useState({ ...blankAllocation });
  const { data: funds = [], isLoading } = trpc.platform.finance.pettyCashFunds.list.useQuery();
  const { data: expandedSpends = [], isLoading: expandedSpendsLoading } = trpc.platform.finance.pettyCashFunds.spendsFor.useQuery({ fundId: expandedFundId ?? 0 }, { enabled: expandedFundId !== null });
  const { data: expandedAllocations = [], isLoading: expandedAllocationsLoading } = trpc.platform.finance.pettyCashFunds.allocationsFor.useQuery({ fundId: expandedFundId ?? 0 }, { enabled: expandedFundId !== null });

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
  const allocate = trpc.platform.finance.pettyCashFunds.allocate.useMutation({
    onSuccess: () => { refresh(); utils.platform.finance.pettyCashFunds.allocationsFor.invalidate(); toast.success(t("pettyCash.allocationSent")); setAllocatingFund(null); setAllocationForm({ ...blankAllocation }); },
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
  const openAllocate = (fund: any) => { setAllocationForm({ ...blankAllocation }); setAllocatingFund(fund); };
  const submitAllocate = () => {
    if (!allocatingFund || !allocationForm.amount || Number(allocationForm.amount) <= 0) return toast.error(t("pettyCash.completeCustodianFields"));
    allocate.mutate({ id: allocatingFund.id, amount: allocationForm.amount, note: allocationForm.note.trim() || undefined });
  };

  return <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
    <Surface>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.createCustodian")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{isSuperAdmin ? t("pettyCash.createCustodianHint") : t("pettyCash.superAdminOnlyHint")}</p></div><UserPlus size={19} className="text-accent"/></div>
      {isSuperAdmin ? <>
        <div className="grid gap-4">
          <Field label={t("pettyCash.custodianName")}><TextField value={custodianForm.name} onChange={(event) => setCustodianForm({ ...custodianForm, name: event.target.value })}/></Field>
          <Field label={t("pettyCash.custodianUsername")}><TextField autoComplete="off" value={custodianForm.username} onChange={(event) => setCustodianForm({ ...custodianForm, username: event.target.value.toLowerCase() })}/></Field>
          <Field label={t("login.tempPassword")} hint={t("settings.minimum12Chars")}><TextField type="password" autoComplete="new-password" value={custodianForm.temporaryPassword} onChange={(event) => setCustodianForm({ ...custodianForm, temporaryPassword: event.target.value })}/></Field>
          <Field label={t("pettyCash.fixedAmountLabel")}><TextField inputMode="decimal" value={custodianForm.fixedAmount} onChange={(event) => setCustodianForm({ ...custodianForm, fixedAmount: event.target.value })} placeholder="0.00"/></Field>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={submitCustodian} pending={createCustodian.isPending}>{t("pettyCash.createCustodianButton")}<Plus size={15} className="ml-2"/></PrimaryButton></div>
      </> : null}
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
            {isSuperAdmin && <button aria-label="Send top-up" onClick={() => openAllocate(row.fund)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink"><Send size={14}/></button>}
            {isSuperAdmin && <button aria-label="Edit fixed amount" onClick={() => editAmount(row.fund)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink"><Edit3 size={14}/></button>}
            <button aria-label="Toggle spending" onClick={() => setExpandedFundId(expanded ? null : row.fund.id)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink">{expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
          </div>
        </div>
        {expanded && <div className="mt-3 grid gap-3 rounded-xl bg-well p-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">{t("pettyCash.spendHistory")}</div>
            {expandedSpendsLoading ? <LoadingState/> : (expandedSpends as any[]).length ? <div className="divide-y divide-divider">{(expandedSpends as any[]).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="text-muted">{dateLabel(entry.businessDate)}</span><span className="min-w-0 flex-1 truncate px-3">{entry.description}</span><b className="text-danger">{money(entry.amount)}</b><button aria-label="Delete spend" onClick={() => window.confirm(t("pettyCash.confirmDeleteSpend")) && deleteSpend.mutate({ id: entry.id })} className="ml-2 rounded-full p-1.5 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={13}/></button></div>)}</div> : <p className="py-2 text-center text-xs text-muted">{t("pettyCash.noSpendsYet")}</p>}
          </div>
          <div className="border-t border-divider pt-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">{t("pettyCash.allocationHistory")}</div>
            {expandedAllocationsLoading ? <LoadingState/> : (expandedAllocations as any[]).length ? <div className="divide-y divide-divider">{(expandedAllocations as any[]).map((row2: any) => <div key={row2.allocation.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="min-w-0 flex-1"><span className="block truncate text-muted">{dateTimeLabel(row2.allocation.createdAt)}</span>{row2.allocation.note && <span className="mt-0.5 block truncate text-subtle">{row2.allocation.note}</span>}</span><span className="truncate text-muted">{row2.sender?.name || row2.sender?.username || "—"}</span><b className="text-success">+{money(row2.allocation.amount)}</b></div>)}</div> : <p className="py-2 text-center text-xs text-muted">{t("pettyCash.noAllocationsYet")}</p>}
          </div>
        </div>}
      </div>; })}</div> : <EmptyState icon={Wallet} title={t("pettyCash.noCustodiansYet")} description={t("pettyCash.noCustodiansHint")}/>}
    </Surface>
    <Dialog open={Boolean(allocatingFund)} onOpenChange={(open) => { if (!open) setAllocatingFund(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("pettyCash.sendTopUpTo")} {allocatingFund && ((funds as any[]).find((row) => row.fund.id === allocatingFund.id)?.custodian?.name || "")}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label={t("pettyCash.spendAmount")}><TextField inputMode="decimal" value={allocationForm.amount} onChange={(event) => setAllocationForm({ ...allocationForm, amount: event.target.value })} placeholder="0.00"/></Field>
          <Field label={t("pettyCash.allocationNote")}><TextField value={allocationForm.note} onChange={(event) => setAllocationForm({ ...allocationForm, note: event.target.value })} placeholder={t("common.optional")}/></Field>
        </div>
        <DialogFooter><SecondaryButton onClick={() => setAllocatingFund(null)}>{t("common.close")}</SecondaryButton><PrimaryButton onClick={submitAllocate} pending={allocate.isPending}>{t("pettyCash.sendTopUpAction")}</PrimaryButton></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

export default function PettyCashPage() {
  const { user } = useAuth();
  const t = useT();
  const isCustodian = user?.role === "petty_cash";
  const content = <>
    <PageHeader eyebrow={t("pettyCash.eyebrow")} title={t("pettyCash.title")} description={isCustodian ? t("pettyCash.descriptionCustodian") : t("pettyCash.descriptionManager")}/>
    {isCustodian ? <CustodianView/> : <ManagerView/>}
  </>;
  return isCustodian ? <CustodianShell>{content}</CustodianShell> : content;
}
