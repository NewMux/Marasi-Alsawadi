import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Edit3, FileText, LogOut, Plus, Receipt, Scale, Send, Trash2, UserPlus, Wallet } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DateField, EmptyState, Field, LoadingState, MetricCard, PageHeader, PrimaryButton, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField } from "@/components/MarasiUI";
import { printReport, ReportDocument, ReportSection, ReportStat, ReportStatGrid, ReportTable } from "@/components/PrintableReport";
import { categoryOptionLabel, orderCategoriesAsTree } from "@/lib/categoryTree";
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
const blankCustodian = { username: "", name: "", temporaryPassword: "" };
const blankSpend = { businessDate: today, amount: "", description: "", categoryId: "", attachmentDataBase64: "", attachmentMimeType: "", attachmentFileName: "" };
const blankAllocation = { amount: "", note: "" };
const blankEditCustodian = { name: "", username: "" };
const toIso = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);

// PRD Round 16, item 11: the expense categories a spend can post to (the
// same controlled library Finance Control uses, sub-categories nested).
function useExpenseCategoryOptions() {
  const { data: categories = [] } = trpc.platform.finance.expenseCategories.list.useQuery({ includeInactive: false });
  return orderCategoriesAsTree(categories as any[]);
}

// PRD Round 16, item 11: edit one spend — the custodian their own, a
// manager anyone's. Every field the spend was logged with stays editable.
function EditSpendDialog({ spend, onClose }: { spend: any; onClose: () => void }) {
  const t = useT();
  const utils = trpc.useUtils();
  const categoryOptions = useExpenseCategoryOptions();
  const [form, setForm] = useState({ businessDate: toIso(spend?.businessDate), amount: String(spend?.amount ?? ""), description: spend?.description || "", categoryId: spend?.categoryId ? String(spend.categoryId) : "" });
  const update = trpc.platform.finance.pettyCashFunds.updateSpend.useMutation({
    onSuccess: () => { utils.platform.finance.pettyCashFunds.invalidate(); toast.success(t("pettyCash.spendUpdated")); onClose(); },
    onError: (error) => toast.error(error.message),
  });
  const submit = () => {
    if (!form.amount || Number(form.amount) <= 0 || !form.description.trim() || !form.categoryId) return toast.error(t("pettyCash.completeSpendFields"));
    update.mutate({ id: spend.id, businessDate: form.businessDate, amount: form.amount, description: form.description.trim(), categoryId: Number(form.categoryId) });
  };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{t("pettyCash.editSpendTitle")}</DialogTitle></DialogHeader>
      <div className="grid gap-4">
        <Field label={t("pettyCash.spendDate")}><DateField value={form.businessDate} onChange={(value) => setForm({ ...form, businessDate: value })}/></Field>
        <Field label={t("pettyCash.spendAmount")}><TextField inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })}/></Field>
        <Field label={t("common.category")}><SelectField value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">{t("finance.chooseCategory")}</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{categoryOptionLabel(category)}</option>)}</SelectField></Field>
        <Field label={t("pettyCash.spendDescription")}><TextField value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></Field>
      </div>
      <DialogFooter><SecondaryButton onClick={onClose}>{t("common.close")}</SecondaryButton><PrimaryButton onClick={submit} pending={update.isPending}>{t("common.save")}</PrimaryButton></DialogFooter>
    </DialogContent>
  </Dialog>;
}

// Allocations are top-ups (+); since Round 16 a manager's balance
// adjustment is logged in the same history and may be negative (−).
const signedAllocation = (amount: unknown) => Number(amount) < 0 ? `−${money(Math.abs(Number(amount)))}` : `+${money(amount)}`;

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
  const { user } = useAuth();
  const [spendForm, setSpendForm] = useState({ ...blankSpend });
  const [editingSpend, setEditingSpend] = useState<any>(null);
  const categoryOptions = useExpenseCategoryOptions();
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
      businessDate: spendForm.businessDate, amount: spendForm.amount, description: spendForm.description.trim(), categoryId: spendForm.categoryId ? Number(spendForm.categoryId) : undefined,
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
          <Field label={t("common.category")} hint={t("pettyCash.categoryHint")}><SelectField value={spendForm.categoryId} onChange={(event) => setSpendForm({ ...spendForm, categoryId: event.target.value })}><option value="">{t("pettyCash.defaultCategory")}</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{categoryOptionLabel(category)}</option>)}</SelectField></Field>
          <Field label={t("finance.attachment")}><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => onAttachmentSelected(event.target.files?.[0])} className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-fill file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink hover:file:bg-[#e8e8ed]"/></Field>
          {spendForm.attachmentFileName && <p className="truncate text-[11px] text-accent">{spendForm.attachmentFileName}</p>}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={submitSpend} pending={logSpend.isPending}>{t("pettyCash.logSpendingButton")}<Plus size={15} className="ml-2"/></PrimaryButton></div>
      </Surface>
      <Surface>
        <div className="mb-5 flex items-start justify-between gap-3"><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.spendHistory")}</h2><div className="flex items-center gap-2"><SecondaryButton onClick={() => requestAnimationFrame(() => requestAnimationFrame(printReport))}><FileText size={14} className="mr-2"/>{t("pettyCash.pdfReport")}</SecondaryButton><StatusPill>{spends.length}</StatusPill></div></div>
        {spendsLoading ? <LoadingState/> : spends.length ? <TableFrame><TableHeader><div className="grid grid-cols-[.7fr_1.3fr_.6fr_auto] gap-3"><span>{t("pettyCash.spendDate")}</span><span>{t("common.description")}</span><span className="text-right">{t("pettyCash.spendAmount")}</span><span/></div></TableHeader>{(spends as any[]).map((entry: any) => <TableRow key={entry.id} className="grid-cols-[.7fr_1.3fr_.6fr_auto]"><span className="text-xs text-muted">{dateLabel(entry.businessDate)}</span><span className="min-w-0"><span className="block truncate text-sm">{entry.description}</span>{entry.categoryName && <span className="mt-0.5 block truncate text-xs text-muted">{entry.categoryName}</span>}{entry.attachmentPath && <a href={entry.attachmentPath} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-medium text-accent hover:underline">{t("finance.viewAttachment")}</a>}</span><b className="text-right text-sm text-danger">{money(entry.amount)}</b><button aria-label="Edit spend" onClick={() => setEditingSpend(entry)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink"><Edit3 size={14}/></button></TableRow>)}</TableFrame> : <EmptyState icon={Receipt} title={t("pettyCash.noSpendsYet")} description=""/>}
      </Surface>
    </div>
    <Surface className="mt-6">
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.allocationHistory")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("pettyCash.allocationHistoryCustodianHint")}</p></div><StatusPill>{allocations.length}</StatusPill></div>
      {allocationsLoading ? <LoadingState/> : allocations.length ? <TableFrame><TableHeader><div className="grid grid-cols-[1fr_.7fr_.6fr] gap-3"><span>{t("pettyCash.allocationSentAt")}</span><span>{t("pettyCash.allocationSentBy")}</span><span className="text-right">{t("pettyCash.spendAmount")}</span></div></TableHeader>{(allocations as any[]).map((row: any) => <TableRow key={row.allocation.id} className="grid-cols-[1fr_.7fr_.6fr]"><span className="min-w-0"><span className="block truncate text-xs text-muted">{dateTimeLabel(row.allocation.createdAt)}</span>{row.allocation.note && <span className="mt-0.5 block truncate text-xs text-subtle">{row.allocation.note}</span>}</span><span className="truncate text-xs">{row.sender?.name || row.sender?.username || "—"}</span><b className={`text-right text-sm ${Number(row.allocation.amount) < 0 ? "text-danger" : "text-success"}`}>{signedAllocation(row.allocation.amount)}</b></TableRow>)}</TableFrame> : <EmptyState icon={Wallet} title={t("pettyCash.noAllocationsYet")} description=""/>}
    </Surface>
    {editingSpend && <EditSpendDialog spend={editingSpend} onClose={() => setEditingSpend(null)}/>}
    <ReportDocument title={t("pettyCash.reportTitle")} generatedLabel={t("cc.reportGenerated")} generatedByLabel={t("cc.reportGeneratedBy")} generatedBy={user?.name || "—"}>
      <p className="report-sub">{t("pettyCash.custodianName")}: {user?.name || "—"}</p>
      <ReportSection title={t("pettyCash.title")}><ReportStatGrid><ReportStat label={t("pettyCash.fixedAmountLabel")} value={money(mine.fund.fixedAmount)}/><ReportStat label={t("pettyCash.totalSpent")} value={money(Number(mine.fund.fixedAmount) - mine.balance)}/><ReportStat label={t("pettyCash.remainingBalance")} value={money(mine.balance)}/></ReportStatGrid></ReportSection>
      <ReportSection title={t("pettyCash.spendHistory")}>{(spends as any[]).length ? <ReportTable headers={[{ label: t("pettyCash.spendDate") }, { label: t("common.category") }, { label: t("common.description") }, { label: t("pettyCash.spendAmount"), num: true }]} rows={[...(spends as any[]).map((entry: any) => [dateLabel(entry.businessDate), entry.categoryName || "—", entry.description, money(entry.amount)]), ["", "", t("reports.totalRow"), money((spends as any[]).reduce((sum, entry) => sum + Number(entry.amount || 0), 0))]]}/> : <p className="report-sub">{t("pettyCash.noSpendsYet")}</p>}</ReportSection>
      <ReportSection title={t("pettyCash.allocationHistory")}>{(allocations as any[]).length ? <ReportTable headers={[{ label: t("pettyCash.allocationSentAt") }, { label: t("pettyCash.allocationSentBy") }, { label: t("pettyCash.allocationNote") }, { label: t("pettyCash.spendAmount"), num: true }]} rows={(allocations as any[]).map((row: any) => [dateTimeLabel(row.allocation.createdAt), row.sender?.name || row.sender?.username || "—", row.allocation.note || "", signedAllocation(row.allocation.amount)])}/> : <p className="report-sub">{t("pettyCash.noAllocationsYet")}</p>}</ReportSection>
      <div className="report-footer">{t("cc.reportFooter")}</div>
    </ReportDocument>
  </>;
}

function ManagerView() {
  const t = useT();
  const { user } = useAuth();
  // PRD Round 16, item 12: Admin Operations manages custodians too.
  const isSuperAdmin = user?.role === "super_admin" || user?.role === "admin";
  const utils = trpc.useUtils();
  const [editingSpend, setEditingSpend] = useState<any>(null);
  const [adjustingFund, setAdjustingFund] = useState<any>(null);
  const [adjustForm, setAdjustForm] = useState({ mode: "zero" as "zero" | "add" | "deduct", amount: "", note: "" });
  const [custodianForm, setCustodianForm] = useState({ ...blankCustodian });
  const [expandedFundId, setExpandedFundId] = useState<number | null>(null);
  const [allocatingFund, setAllocatingFund] = useState<any>(null);
  const [allocationForm, setAllocationForm] = useState({ ...blankAllocation });
  const [editingCustodian, setEditingCustodian] = useState<any>(null);
  const [editCustodianForm, setEditCustodianForm] = useState({ ...blankEditCustodian });
  const { data: funds = [], isLoading } = trpc.platform.finance.pettyCashFunds.list.useQuery();
  const { data: expandedSpends = [], isLoading: expandedSpendsLoading } = trpc.platform.finance.pettyCashFunds.spendsFor.useQuery({ fundId: expandedFundId ?? 0 }, { enabled: expandedFundId !== null });
  const { data: expandedAllocations = [], isLoading: expandedAllocationsLoading } = trpc.platform.finance.pettyCashFunds.allocationsFor.useQuery({ fundId: expandedFundId ?? 0 }, { enabled: expandedFundId !== null });

  const refresh = () => utils.platform.finance.pettyCashFunds.invalidate();
  const createCustodian = trpc.platform.finance.pettyCashFunds.createCustodian.useMutation({
    onSuccess: () => { refresh(); setCustodianForm({ ...blankCustodian }); toast.success(t("pettyCash.custodianCreated")); },
    onError: (error) => toast.error(error.message),
  });
  const updateCustodian = trpc.platform.finance.pettyCashFunds.updateCustodian.useMutation({
    onSuccess: () => { refresh(); toast.success(t("pettyCash.custodianUpdated")); setEditingCustodian(null); },
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

  const adjustBalance = trpc.platform.finance.pettyCashFunds.adjustBalance.useMutation({
    onSuccess: () => { refresh(); toast.success(t("pettyCash.balanceAdjusted")); setAdjustingFund(null); },
    onError: (error) => toast.error(error.message),
  });
  const openAdjust = (row: any) => { setAdjustForm({ mode: "zero", amount: "", note: "" }); setAdjustingFund(row); };
  const submitAdjust = () => {
    if (!adjustingFund) return;
    if (adjustForm.mode !== "zero" && !(Number(adjustForm.amount) > 0)) return toast.error(t("finance.enterValidAmount"));
    if (adjustForm.mode === "zero" && !window.confirm(t("pettyCash.confirmZero", { amount: money(adjustingFund.balance) }))) return;
    adjustBalance.mutate({ id: adjustingFund.fund.id, mode: adjustForm.mode, amount: adjustForm.mode === "zero" ? undefined : adjustForm.amount, note: adjustForm.note.trim() || undefined });
  };
  const submitCustodian = () => {
    if (custodianForm.username.trim().length < 3 || custodianForm.name.trim().length < 2 || custodianForm.temporaryPassword.length < 12) {
      return toast.error(t("pettyCash.completeCustodianFields"));
    }
    createCustodian.mutate({ username: custodianForm.username.trim(), name: custodianForm.name.trim(), temporaryPassword: custodianForm.temporaryPassword });
  };
  const openAllocate = (fund: any) => { setAllocationForm({ ...blankAllocation }); setAllocatingFund(fund); };
  const submitAllocate = () => {
    if (!allocatingFund || !allocationForm.amount || Number(allocationForm.amount) <= 0) return toast.error(t("pettyCash.completeCustodianFields"));
    allocate.mutate({ id: allocatingFund.id, amount: allocationForm.amount, note: allocationForm.note.trim() || undefined });
  };
  const openEditCustodian = (row: any) => { setEditCustodianForm({ name: row.custodian?.name || "", username: row.custodian?.username || "" }); setEditingCustodian(row.custodian); };
  const submitEditCustodian = () => {
    if (!editingCustodian || editCustodianForm.name.trim().length < 2 || editCustodianForm.username.trim().length < 3) return toast.error(t("pettyCash.completeCustodianFields"));
    updateCustodian.mutate({ userId: editingCustodian.id, name: editCustodianForm.name.trim(), username: editCustodianForm.username.trim().toLowerCase() });
  };

  return <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
    <Surface>
      <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("pettyCash.createCustodian")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{isSuperAdmin ? t("pettyCash.createCustodianHint") : t("pettyCash.superAdminOnlyHint")}</p></div><UserPlus size={19} className="text-accent"/></div>
      {isSuperAdmin ? <>
        <div className="grid gap-4">
          <Field label={t("pettyCash.custodianName")}><TextField value={custodianForm.name} onChange={(event) => setCustodianForm({ ...custodianForm, name: event.target.value })}/></Field>
          <Field label={t("pettyCash.custodianUsername")}><TextField autoComplete="off" value={custodianForm.username} onChange={(event) => setCustodianForm({ ...custodianForm, username: event.target.value.toLowerCase() })}/></Field>
          <Field label={t("login.tempPassword")} hint={t("settings.minimum12Chars")}><TextField type="password" autoComplete="new-password" value={custodianForm.temporaryPassword} onChange={(event) => setCustodianForm({ ...custodianForm, temporaryPassword: event.target.value })}/></Field>
        </div>
        <p className="mt-3 text-[11px] leading-4 text-muted">{t("pettyCash.fundAfterCreateHint")}</p>
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
            {isSuperAdmin && <button aria-label="Adjust balance" title={t("pettyCash.adjustBalance")} onClick={() => openAdjust(row)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink"><Scale size={14}/></button>}
            {isSuperAdmin && <button aria-label="Edit custodian" onClick={() => openEditCustodian(row)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink"><Edit3 size={14}/></button>}
            <button aria-label="Toggle spending" onClick={() => setExpandedFundId(expanded ? null : row.fund.id)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink">{expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button>
          </div>
        </div>
        {expanded && <div className="mt-3 grid gap-3 rounded-xl bg-well p-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">{t("pettyCash.spendHistory")}</div>
            {expandedSpendsLoading ? <LoadingState/> : (expandedSpends as any[]).length ? <div className="divide-y divide-divider">{(expandedSpends as any[]).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="text-muted">{dateLabel(entry.businessDate)}</span><span className="min-w-0 flex-1 truncate px-3"><span className="block truncate">{entry.description}</span>{entry.categoryName && <span className="block truncate text-[11px] text-subtle">{entry.categoryName}</span>}{entry.attachmentPath && <a href={entry.attachmentPath} target="_blank" rel="noreferrer" className="mt-0.5 block text-[11px] font-medium text-accent hover:underline">{t("finance.viewAttachment")}</a>}</span><b className="text-danger">{money(entry.amount)}</b><button aria-label="Edit spend" onClick={() => setEditingSpend(entry)} className="ml-2 rounded-full p-1.5 text-muted hover:bg-fill hover:text-ink"><Edit3 size={13}/></button><button aria-label="Delete spend" onClick={() => window.confirm(t("pettyCash.confirmDeleteSpend")) && deleteSpend.mutate({ id: entry.id })} className="ml-2 rounded-full p-1.5 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={13}/></button></div>)}</div> : <p className="py-2 text-center text-xs text-muted">{t("pettyCash.noSpendsYet")}</p>}
          </div>
          <div className="border-t border-divider pt-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-subtle">{t("pettyCash.allocationHistory")}</div>
            {expandedAllocationsLoading ? <LoadingState/> : (expandedAllocations as any[]).length ? <div className="divide-y divide-divider">{(expandedAllocations as any[]).map((row2: any) => <div key={row2.allocation.id} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="min-w-0 flex-1"><span className="block truncate text-muted">{dateTimeLabel(row2.allocation.createdAt)}</span>{row2.allocation.note && <span className="mt-0.5 block truncate text-subtle">{row2.allocation.note}</span>}</span><span className="truncate text-muted">{row2.sender?.name || row2.sender?.username || "—"}</span><b className={Number(row2.allocation.amount) < 0 ? "text-danger" : "text-success"}>{signedAllocation(row2.allocation.amount)}</b></div>)}</div> : <p className="py-2 text-center text-xs text-muted">{t("pettyCash.noAllocationsYet")}</p>}
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
    {editingSpend && <EditSpendDialog spend={editingSpend} onClose={() => setEditingSpend(null)}/>}
    <Dialog open={Boolean(adjustingFund)} onOpenChange={(open) => { if (!open) setAdjustingFund(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("pettyCash.adjustBalance")} — {adjustingFund?.custodian?.name || adjustingFund?.custodian?.username || ""}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted">{t("pettyCash.currentBalance")}: <b className="text-ink">{money(adjustingFund?.balance)}</b></p>
        <div className="grid gap-4">
          <Field label={t("finance.adjustmentType")}><SelectField value={adjustForm.mode} onChange={(event) => setAdjustForm({ ...adjustForm, mode: event.target.value as any })}><option value="zero">{t("pettyCash.modeZero")}</option><option value="add">{t("pettyCash.modeAdd")}</option><option value="deduct">{t("pettyCash.modeDeduct")}</option></SelectField></Field>
          {adjustForm.mode !== "zero" && <Field label={t("pettyCash.spendAmount")}><TextField inputMode="decimal" value={adjustForm.amount} onChange={(event) => setAdjustForm({ ...adjustForm, amount: event.target.value })} placeholder="0.000"/></Field>}
          <Field label={t("pettyCash.allocationNote")}><TextField value={adjustForm.note} onChange={(event) => setAdjustForm({ ...adjustForm, note: event.target.value })} placeholder={t("common.optional")}/></Field>
          <p className="text-[11px] leading-4 text-subtle">{t("pettyCash.adjustHint")}</p>
        </div>
        <DialogFooter><SecondaryButton onClick={() => setAdjustingFund(null)}>{t("common.close")}</SecondaryButton><PrimaryButton onClick={submitAdjust} pending={adjustBalance.isPending}>{t("common.save")}</PrimaryButton></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editingCustodian)} onOpenChange={(open) => { if (!open) setEditingCustodian(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("pettyCash.editCustodianTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <Field label={t("pettyCash.custodianName")}><TextField value={editCustodianForm.name} onChange={(event) => setEditCustodianForm({ ...editCustodianForm, name: event.target.value })}/></Field>
          <Field label={t("pettyCash.custodianUsername")}><TextField autoComplete="off" value={editCustodianForm.username} onChange={(event) => setEditCustodianForm({ ...editCustodianForm, username: event.target.value.toLowerCase() })}/></Field>
        </div>
        <DialogFooter><SecondaryButton onClick={() => setEditingCustodian(null)}>{t("common.close")}</SecondaryButton><PrimaryButton onClick={submitEditCustodian} pending={updateCustodian.isPending}>{t("common.save")}</PrimaryButton></DialogFooter>
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
