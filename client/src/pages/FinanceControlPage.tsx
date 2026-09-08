import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ArrowRightLeft, CalendarDays, Download, Edit3, FileText, MinusCircle, PlusCircle, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DateField, EmptyState, Field, LoadingState, MetricCard, PageHeader, PrimaryButton, SearchField, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { csvReportHeaderRows } from "@/components/PrintableReport";
import { useT, type TranslationKey } from "@/lib/i18n";

type CategoryType = "expense" | "revenue" | "asset";

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const blankTransaction = { id: "", categoryType: "expense" as CategoryType, businessDate: today, categoryId: "", amount: "", description: "", receiptNumber: "", vendor: "", location: "", status: "active" as "active" | "under_maintenance" | "disposed", usefulLifeYears: "" };
const assetStatusKeys: Record<string, TranslationKey> = { active: "finance.assetStatusActive", under_maintenance: "finance.assetStatusUnderMaintenance", disposed: "finance.assetStatusDisposed" };
const blankAdjust = { businessDate: today, categoryId: "", type: "add" as "add" | "deduct", amount: "", note: "" };
const blankTransfer = { businessDate: today, fromCategoryId: "", toCategoryId: "", amount: "", note: "" };
const adjustmentTypeKeys: Record<string, TranslationKey> = { add: "finance.typeAdded", deduct: "finance.typeDeducted", transfer_out: "finance.typeTransferOut", transfer_in: "finance.typeTransferIn" };
const categoryTypeLabelKeys: Record<CategoryType, TranslationKey> = { expense: "finance.expenseTypeWord", revenue: "finance.revenueTypeWord", asset: "finance.assetTypeWord" };

function readFileAsAttachment(file: File): Promise<{ dataBase64: string; mimeType: string; fileName: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ dataBase64: result.split(",")[1] || "", mimeType: file.type, fileName: file.name });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
// The database driver returns DATE columns as JS Date objects, not "YYYY-MM-DD"
// strings — String(dateObject).slice(0, 10) silently mangles them (e.g. into
// "Wed Aug 26" from Date's own toString()), which then fails the update query.
function toDateInputValue(value: unknown) { const date = new Date(value as string); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); }
const dateLabel = (value: unknown) => value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function exportCsv(filename: string, rows: string[][]) { const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }

export default function FinanceControlPage() {
  const t = useT();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const canRecord = Boolean(user);
  const canManage = user?.role === "manager" || user?.role === "admin" || user?.role === "super_admin";
  const canViewFinancials = canManage;
  const isSuperAdmin = user?.role === "super_admin";
  const [range, setRange] = useState({ from: today, to: today });
  const [showAllLedger, setShowAllLedger] = useState(false);
  const ledgerRange = showAllLedger ? {} : range;
  const setRangeAndNarrow = (next: { from: string; to: string }) => { setRange(next); setShowAllLedger(false); };
  const [screenTab, setScreenTab] = useState<"record" | "adjust" | "transfer">("record");
  const [transactionForm, setTransactionForm] = useState({ ...blankTransaction });
  // PRD Round 5, Section 1/2: attachments are addable on create AND edit, and
  // any number of them — pendingAttachments are new files not yet uploaded
  // (sent with the create/update mutation), editingAttachments are the
  // entry's already-saved ones (each individually removable while editing).
  const [pendingAttachments, setPendingAttachments] = useState<{ dataBase64: string; mimeType: string; fileName: string }[]>([]);
  const [editingAttachments, setEditingAttachments] = useState<{ id: number; path: string; originalName: string }[]>([]);
  const resetTransactionForm = (categoryType: CategoryType = transactionForm.categoryType) => {
    setTransactionForm({ ...blankTransaction, categoryType });
    setPendingAttachments([]);
    setEditingAttachments([]);
  };
  const [adjustCategoryType, setAdjustCategoryType] = useState<CategoryType>("expense");
  const [adjustForm, setAdjustForm] = useState({ ...blankAdjust });
  const [transferForm, setTransferForm] = useState({ ...blankTransfer });
  const [ledgerQuery, setLedgerQuery] = useState("");

  const { data: categories = [], isLoading: categoriesLoading } = trpc.platform.finance.expenseCategories.list.useQuery({ includeInactive: false }, { enabled: canRecord });
  const { data: revenueCategories = [], isLoading: revenueCategoriesLoading } = trpc.platform.finance.revenueCategories.list.useQuery({ includeInactive: false }, { enabled: canRecord });
  const { data: assetCategories = [], isLoading: assetCategoriesLoading } = trpc.platform.finance.assetCategories.list.useQuery({ includeInactive: false }, { enabled: canRecord });
  const { data: expenses = [], isLoading: expensesLoading } = trpc.platform.finance.expenses.list.useQuery(ledgerRange, { enabled: canRecord });
  const { data: revenueRecords = [], isLoading: revenueRecordsLoading } = trpc.platform.finance.revenues.list.useQuery(ledgerRange, { enabled: canRecord });
  const { data: assetRecords = [], isLoading: assetRecordsLoading } = trpc.platform.finance.assets.list.useQuery(ledgerRange, { enabled: canRecord });
  const { data: summary, isLoading: summaryLoading } = trpc.platform.finance.operationalSummary.useQuery(range, { enabled: canViewFinancials });
  const { data: adjustments = [], isLoading: adjustmentsLoading } = trpc.platform.finance.expenseAdjustments.list.useQuery(range, { enabled: canManage });
  const { data: balances = [], isLoading: balancesLoading } = trpc.platform.finance.expenseAdjustments.balances.useQuery(range, { enabled: canManage });
  const { data: revenueAdjustmentsData = [], isLoading: revenueAdjustmentsLoading } = trpc.platform.finance.revenueAdjustments.list.useQuery(range, { enabled: canManage });
  const { data: revenueBalances = [], isLoading: revenueBalancesLoading } = trpc.platform.finance.revenueAdjustments.balances.useQuery(range, { enabled: canManage });
  const { data: assetAdjustmentsData = [], isLoading: assetAdjustmentsLoading } = trpc.platform.finance.assetAdjustments.list.useQuery(range, { enabled: canManage });
  const { data: assetBalances = [], isLoading: assetBalancesLoading } = trpc.platform.finance.assetAdjustments.balances.useQuery(range, { enabled: canManage });

  const invalidate = () => { utils.platform.finance.expenses.invalidate(); utils.platform.finance.revenues.invalidate(); utils.platform.finance.assets.invalidate(); utils.platform.finance.operationalSummary.invalidate(); utils.platform.finance.invalidate(); };
  const createExpense = trpc.platform.finance.expenses.create.useMutation({ onSuccess: () => { invalidate(); resetTransactionForm(); toast.success(t("finance.transactionRecorded")); }, onError: (error) => toast.error(error.message) });
  const updateExpense = trpc.platform.finance.expenses.update.useMutation({ onSuccess: () => { invalidate(); resetTransactionForm(); toast.success(t("finance.transactionUpdated")); }, onError: (error) => toast.error(error.message) });
  const deleteExpense = trpc.platform.finance.expenses.delete.useMutation({ onSuccess: () => { invalidate(); toast.success(t("finance.transactionRemoved")); }, onError: (error) => toast.error(error.message) });
  const createRevenue = trpc.platform.finance.revenues.create.useMutation({ onSuccess: () => { invalidate(); resetTransactionForm(); toast.success(t("finance.transactionRecorded")); }, onError: (error) => toast.error(error.message) });
  const updateRevenue = trpc.platform.finance.revenues.update.useMutation({ onSuccess: () => { invalidate(); resetTransactionForm(); toast.success(t("finance.transactionUpdated")); }, onError: (error) => toast.error(error.message) });
  const deleteRevenue = trpc.platform.finance.revenues.delete.useMutation({ onSuccess: () => { invalidate(); toast.success(t("finance.transactionRemoved")); }, onError: (error) => toast.error(error.message) });
  const createAsset = trpc.platform.finance.assets.create.useMutation({ onSuccess: () => { invalidate(); resetTransactionForm(); toast.success(t("finance.transactionRecorded")); }, onError: (error) => toast.error(error.message) });
  const updateAsset = trpc.platform.finance.assets.update.useMutation({ onSuccess: () => { invalidate(); resetTransactionForm(); toast.success(t("finance.transactionUpdated")); }, onError: (error) => toast.error(error.message) });
  const deleteAsset = trpc.platform.finance.assets.delete.useMutation({ onSuccess: () => { invalidate(); toast.success(t("finance.transactionRemoved")); }, onError: (error) => toast.error(error.message) });

  const adjustCategory = trpc.platform.finance.expenseAdjustments.adjust.useMutation({ onSuccess: () => { utils.platform.finance.expenseAdjustments.invalidate(); setAdjustForm({ ...blankAdjust }); toast.success(t("finance.adjustmentLogged")); }, onError: (error) => toast.error(error.message) });
  const transferCategory = trpc.platform.finance.expenseAdjustments.transfer.useMutation({ onSuccess: () => { utils.platform.finance.expenseAdjustments.invalidate(); setTransferForm({ ...blankTransfer }); toast.success(t("finance.transferLogged")); }, onError: (error) => toast.error(error.message) });
  const adjustRevenueCategory = trpc.platform.finance.revenueAdjustments.adjust.useMutation({ onSuccess: () => { utils.platform.finance.revenueAdjustments.invalidate(); setAdjustForm({ ...blankAdjust }); toast.success(t("finance.adjustmentLogged")); }, onError: (error) => toast.error(error.message) });
  const transferRevenueCategory = trpc.platform.finance.revenueAdjustments.transfer.useMutation({ onSuccess: () => { utils.platform.finance.revenueAdjustments.invalidate(); setTransferForm({ ...blankTransfer }); toast.success(t("finance.transferLogged")); }, onError: (error) => toast.error(error.message) });
  const adjustAssetCategory = trpc.platform.finance.assetAdjustments.adjust.useMutation({ onSuccess: () => { utils.platform.finance.assetAdjustments.invalidate(); setAdjustForm({ ...blankAdjust }); toast.success(t("finance.adjustmentLogged")); }, onError: (error) => toast.error(error.message) });
  const transferAssetCategory = trpc.platform.finance.assetAdjustments.transfer.useMutation({ onSuccess: () => { utils.platform.finance.assetAdjustments.invalidate(); setTransferForm({ ...blankTransfer }); toast.success(t("finance.transferLogged")); }, onError: (error) => toast.error(error.message) });

  const categoriesForType = (type: CategoryType) => type === "expense" ? categories : type === "revenue" ? revenueCategories : assetCategories;
  const activeAdjustCategories = categoriesForType(adjustCategoryType);
  const activeBalances = adjustCategoryType === "expense" ? balances : adjustCategoryType === "revenue" ? revenueBalances : assetBalances;
  const activeAdjustments = adjustCategoryType === "expense" ? adjustments : adjustCategoryType === "revenue" ? revenueAdjustmentsData : assetAdjustmentsData;
  const activeAdjustmentsLoading = adjustCategoryType === "expense" ? adjustmentsLoading : adjustCategoryType === "revenue" ? revenueAdjustmentsLoading : assetAdjustmentsLoading;
  const activeBalancesLoading = adjustCategoryType === "expense" ? balancesLoading : adjustCategoryType === "revenue" ? revenueBalancesLoading : assetBalancesLoading;
  const activeAdjustMutation = adjustCategoryType === "expense" ? adjustCategory : adjustCategoryType === "revenue" ? adjustRevenueCategory : adjustAssetCategory;
  const activeTransferMutation = adjustCategoryType === "expense" ? transferCategory : adjustCategoryType === "revenue" ? transferRevenueCategory : transferAssetCategory;
  const selectAdjustCategoryType = (type: CategoryType) => { setAdjustCategoryType(type); setAdjustForm({ ...blankAdjust }); setTransferForm({ ...blankTransfer }); };

  const submitAdjust = () => {
    if (!adjustForm.categoryId || !adjustForm.amount || Number(adjustForm.amount) <= 0) return toast.error(t("finance.chooseCategoryAndAmount"));
    activeAdjustMutation.mutate({ businessDate: adjustForm.businessDate, categoryId: Number(adjustForm.categoryId), type: adjustForm.type, amount: adjustForm.amount, note: adjustForm.note.trim() || undefined });
  };
  const submitTransfer = () => {
    if (!transferForm.fromCategoryId || !transferForm.amount || Number(transferForm.amount) <= 0) return toast.error(t("finance.chooseCategoryAndAmount"));
    if (!transferForm.toCategoryId) return toast.error(t("finance.chooseDestination"));
    if (transferForm.toCategoryId === transferForm.fromCategoryId) return toast.error(t("finance.chooseTwoDifferent"));
    activeTransferMutation.mutate({ businessDate: transferForm.businessDate, fromCategoryId: Number(transferForm.fromCategoryId), toCategoryId: Number(transferForm.toCategoryId), amount: transferForm.amount, note: transferForm.note.trim() || undefined });
  };

  // The three ledgers stay separate queries (each type has its own shape —
  // payee/source/vendor, different mutations) but only one is ever shown at
  // a time, driven by the Record Transaction tab's own Category Type field.
  const ledgerRecords = transactionForm.categoryType === "expense" ? expenses : transactionForm.categoryType === "revenue" ? revenueRecords : assetRecords;
  const ledgerLoading = transactionForm.categoryType === "expense" ? expensesLoading : transactionForm.categoryType === "revenue" ? revenueRecordsLoading : assetRecordsLoading;
  const filteredLedger = useMemo(() => (ledgerRecords as any[]).filter((entry) => `${entry.description || ""} ${entry.payee || entry.source || entry.vendor || ""} ${entry.categoryName || ""}`.toLowerCase().includes(ledgerQuery.toLowerCase())), [ledgerRecords, ledgerQuery]);
  const editing = Boolean(transactionForm.id);
  const revenue = Number(summary?.revenue || 0); const expenseTotal = Number(summary?.expenses || 0); const net = revenue - expenseTotal;

  const submitTransaction = () => {
    if (!transactionForm.businessDate || !transactionForm.categoryId || !transactionForm.amount || Number(transactionForm.amount) <= 0) return toast.error(t("finance.chooseDateCategoryAmount"));
    if (!transactionForm.description.trim()) return toast.error(t("finance.addExpenseDescription"));
    const shared = { businessDate: transactionForm.businessDate, categoryId: Number(transactionForm.categoryId), amount: transactionForm.amount, description: transactionForm.description.trim(), receiptNumber: transactionForm.receiptNumber.trim() || undefined, attachments: pendingAttachments.length ? pendingAttachments : undefined };
    if (transactionForm.categoryType === "expense") {
      editing ? updateExpense.mutate({ id: Number(transactionForm.id), ...shared, department: "general" as any }) : createExpense.mutate({ ...shared, department: "general" as any });
    } else if (transactionForm.categoryType === "revenue") {
      editing ? updateRevenue.mutate({ id: Number(transactionForm.id), ...shared }) : createRevenue.mutate({ ...shared });
    } else {
      const assetFields = { vendor: transactionForm.vendor.trim() || undefined, location: transactionForm.location.trim() || undefined, status: transactionForm.status, usefulLifeYears: transactionForm.usefulLifeYears ? Number(transactionForm.usefulLifeYears) : undefined };
      editing ? updateAsset.mutate({ id: Number(transactionForm.id), ...shared, ...assetFields }) : createAsset.mutate({ ...shared, ...assetFields });
    }
  };
  const editLedgerEntry = (entry: any) => {
    setTransactionForm({
      id: String(entry.id), categoryType: transactionForm.categoryType, businessDate: toDateInputValue(entry.businessDate || entry.date),
      categoryId: String(entry.categoryId || ""), amount: String(entry.amount), description: entry.description || "",
      receiptNumber: entry.receiptNumber || "",
      vendor: entry.vendor || "", location: entry.location || "", status: entry.status || "active", usefulLifeYears: entry.usefulLifeYears != null ? String(entry.usefulLifeYears) : "",
    });
    setPendingAttachments([]);
    setEditingAttachments((entry.attachments || []).map((a: any) => ({ id: a.id, path: a.path, originalName: a.originalName })));
  };
  const deleteLedgerEntry = (entry: any) => {
    if (!window.confirm(t("finance.confirmRemoveTransaction"))) return;
    if (transactionForm.categoryType === "expense") deleteExpense.mutate({ id: entry.id });
    else if (transactionForm.categoryType === "revenue") deleteRevenue.mutate({ id: entry.id });
    else deleteAsset.mutate({ id: entry.id });
  };
  const savingTransaction = createExpense.isPending || updateExpense.isPending || createRevenue.isPending || updateRevenue.isPending || createAsset.isPending || updateAsset.isPending;
  const deleteAttachment = trpc.platform.finance.attachments.delete.useMutation({
    onSuccess: (_data, variables) => { setEditingAttachments((current) => current.filter((entry) => entry.id !== variables.id)); invalidate(); toast.success(t("finance.attachmentRemoved")); },
    onError: (error) => toast.error(error.message),
  });
  const onAttachmentsSelected = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    for (const file of Array.from(fileList)) {
      if (file.size > 5 * 1024 * 1024) { toast.error(t("finance.attachmentTooLarge")); continue; }
      const attachment = await readFileAsAttachment(file);
      setPendingAttachments((current) => [...current, attachment]);
    }
  };
  const removePendingAttachment = (index: number) => setPendingAttachments((current) => current.filter((_, entryIndex) => entryIndex !== index));

  if (!canRecord) return <Surface><EmptyState title={t("finance.accessRequired")} description={t("finance.signInToRecord")}/> </Surface>;

  const categoryTypeSelect = (value: CategoryType, onChange: (type: CategoryType) => void) => <Field label={t("finance.categoryTypeLabel")}><SelectField value={value} onChange={(event) => onChange(event.target.value as CategoryType)}><option value="expense">{t("finance.expenseTypeWord")}</option><option value="revenue">{t("finance.revenueTypeWord")}</option><option value="asset">{t("finance.assetTypeWord")}</option></SelectField></Field>;

  return <>
    <PageHeader eyebrow={t("finance.expenseControlEyebrow")} title={t("finance.expenseControlTitle")} description={t("finance.expenseControlDescription")} actions={<><StatusPill tone="info">{t("finance.omrLedger")}</StatusPill><SecondaryButton onClick={() => exportCsv(`marasi-expenses-${range.from}-to-${range.to}.csv`, [...csvReportHeaderRows(t("cc.reportGenerated"), t("cc.reportGeneratedBy"), user?.name || "—"), ["Date", "Category", "Description", "Amount (OMR)"], ...(expenses as any[]).map((entry) => [entry.businessDate || entry.date, entry.categoryName || entry.category, entry.description, String(entry.amount)])])}><Download size={14} className="mr-2"/>{t("finance.exportExpenses")}</SecondaryButton></>}/>
    <Surface tone="tinted"><div className="flex flex-wrap items-end gap-4"><Field label={t("common.from")}><DateField value={range.from} onChange={(value) => setRangeAndNarrow({ ...range, from: value })}/></Field><Field label={t("common.to")}><DateField value={range.to} onChange={(value) => setRangeAndNarrow({ ...range, to: value })}/></Field><div className="flex items-center gap-2 pb-2 text-xs text-body"><CalendarDays size={15} className="text-accent"/>{t("finance.selectedReportPeriod")}{showAllLedger && <span className="text-subtle"> · {t("finance.showingAllLedger")}</span>}</div><SecondaryButton onClick={() => setRangeAndNarrow({ from: today, to: today })}>{t("finance.today")}</SecondaryButton><SecondaryButton onClick={() => setRangeAndNarrow({ from: monthStart, to: today })}>{t("finance.thisMonth")}</SecondaryButton><SecondaryButton onClick={() => setShowAllLedger(true)}>{t("common.showAll")}</SecondaryButton></div></Surface>

    <div className="mt-6 grid gap-4 md:grid-cols-3">{canViewFinancials ? <><MetricCard icon={TrendingUp} label={t("finance.revenue")} value={money(revenue)} detail={t("finance.finalTicketTotals")} tone="blue"/><MetricCard icon={TrendingDown} label={t("finance.expenses")} value={money(expenseTotal)} detail={`${expenses.length} ${expenses.length === 1 ? t("finance.categorizedRecords") : t("finance.categorizedRecordsPlural")}`} tone="amber"/><MetricCard icon={FileText} label={t("finance.netResult")} value={money(net)} detail={net >= 0 ? t("finance.revenueLessExpenses") : t("finance.reviewSpending")} tone={net >= 0 ? "green" : "red"}/></> : <Surface className="md:col-span-3"><p className="text-sm font-medium text-ink">{t("finance.expenseEntryWorkspace")}</p><p className="mt-1 text-xs leading-5 text-muted">{t("finance.revenueReportingRestricted")}</p></Surface>}</div>

    {canManage && <Surface tone="tinted" className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.expenseWorkspace")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.expenseWorkspaceHint")}</p></div><div className="flex gap-2 rounded-full bg-well p-1"><button onClick={() => setScreenTab("record")} className={cx("rounded-full px-3.5 py-1.5 text-xs font-semibold transition", screenTab === "record" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}>{t("finance.tabRecordTransaction")}</button><button onClick={() => setScreenTab("adjust")} className={cx("rounded-full px-3.5 py-1.5 text-xs font-semibold transition", screenTab === "adjust" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}>{t("finance.tabAdjustBalance")}</button><button onClick={() => setScreenTab("transfer")} className={cx("rounded-full px-3.5 py-1.5 text-xs font-semibold transition", screenTab === "transfer" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}>{t("finance.adjustTransfer")}</button></div></div></Surface>}

    {(!canManage || screenTab === "record") && <div className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <Surface>
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{editing ? t("finance.saveChanges") : t("finance.tabRecordTransaction")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.recordTransactionHint")}</p></div></div>
        <div className="grid gap-4">
          {categoryTypeSelect(transactionForm.categoryType, (categoryType) => resetTransactionForm(categoryType))}
          <Field label={t("common.category")}><SelectField value={transactionForm.categoryId} onChange={(event) => setTransactionForm({ ...transactionForm, categoryId: event.target.value })}><option value="">{t("finance.chooseCategory")}</option>{(categoriesForType(transactionForm.categoryType) as any[]).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField>{(categoriesLoading || revenueCategoriesLoading || assetCategoriesLoading) && <span className="text-[11px] text-subtle">{t("finance.loadingCategories")}</span>}{isSuperAdmin && <span className="text-[11px] leading-4 text-subtle">{t("finance.categoriesInSettings")}</span>}</Field>
          <Field label={t("common.amount")}><TextField inputMode="decimal" value={transactionForm.amount} onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })} placeholder="0.00"/></Field>
          <Field label={t("common.date")}><DateField value={transactionForm.businessDate} onChange={(value) => setTransactionForm({ ...transactionForm, businessDate: value })}/></Field>
          <Field label={t("common.description")}><TextField value={transactionForm.description} onChange={(event) => setTransactionForm({ ...transactionForm, description: event.target.value })} placeholder={t("finance.whatWasPurchased")}/></Field>
          {transactionForm.categoryType === "asset" && <>
            <Field label={t("finance.vendor")}><TextField value={transactionForm.vendor} onChange={(event) => setTransactionForm({ ...transactionForm, vendor: event.target.value })} placeholder={t("common.optional")}/></Field>
            <Field label={t("finance.assetLocation")}><TextField value={transactionForm.location} onChange={(event) => setTransactionForm({ ...transactionForm, location: event.target.value })} placeholder={t("finance.assetLocationPlaceholder")}/></Field>
            <Field label={t("finance.assetStatus")}><SelectField value={transactionForm.status} onChange={(event) => setTransactionForm({ ...transactionForm, status: event.target.value as any })}>{(["active", "under_maintenance", "disposed"] as const).map((status) => <option key={status} value={status}>{t(assetStatusKeys[status])}</option>)}</SelectField></Field>
            <Field label={t("finance.usefulLifeYears")} hint={t("finance.usefulLifeYearsHint")}><TextField type="number" min={1} value={transactionForm.usefulLifeYears} onChange={(event) => setTransactionForm({ ...transactionForm, usefulLifeYears: event.target.value })} placeholder={t("common.optional")}/></Field>
          </>}
          <Field label={t("finance.receiptNumber")}><TextField value={transactionForm.receiptNumber} onChange={(event) => setTransactionForm({ ...transactionForm, receiptNumber: event.target.value })}/></Field>
          <div>
            <Field label={t("finance.attachments")}><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { onAttachmentsSelected(event.target.files); event.target.value = ""; }} className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-fill file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink hover:file:bg-[#e8e8ed]"/></Field>
            <p className="mt-1.5 text-[11px] leading-4 text-muted">{t("finance.attachmentHint")}</p>
            {editingAttachments.length > 0 && <div className="mt-2 grid gap-1.5">{editingAttachments.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-well px-2.5 py-1.5"><a href={entry.path} target="_blank" rel="noreferrer" className="truncate text-[11px] font-medium text-accent hover:underline">{entry.originalName}</a><button type="button" aria-label="Remove attachment" onClick={() => deleteAttachment.mutate({ id: entry.id })} className="shrink-0 rounded-full p-1 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={12}/></button></div>)}</div>}
            {pendingAttachments.length > 0 && <div className="mt-2 grid gap-1.5">{pendingAttachments.map((entry, index) => <div key={index} className="flex items-center justify-between gap-2 rounded-lg bg-well px-2.5 py-1.5"><span className="truncate text-[11px] text-accent">{entry.fileName}</span><button type="button" aria-label="Remove attachment" onClick={() => removePendingAttachment(index)} className="shrink-0 rounded-full p-1 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={12}/></button></div>)}</div>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5"><PrimaryButton onClick={submitTransaction} pending={savingTransaction}>{editing ? t("finance.saveChanges") : t("finance.tabRecordTransaction")}<Plus size={15} className="ml-2"/></PrimaryButton>{editing && <SecondaryButton onClick={() => resetTransactionForm()}>{t("finance.cancel")}</SecondaryButton>}</div>
      </Surface>
      <Surface>
        <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.ledger")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t(categoryTypeLabelKeys[transactionForm.categoryType])}</p></div><StatusPill>{filteredLedger.length} {t("finance.shown")}</StatusPill></div>
        <SearchField value={ledgerQuery} onChange={setLedgerQuery} placeholder={t("finance.searchTransactions")}/>
        <div className="mt-4">{ledgerLoading ? <LoadingState label={t("finance.loadingLedger")}/> : filteredLedger.length ? <TableFrame><TableHeader><div className="grid grid-cols-[.75fr_1fr_1.3fr_.65fr_auto] gap-3"><span>{t("common.date")}</span><span>{t("common.category")}</span><span>{t("common.description")}</span><span>{t("finance.amountCol")}</span><span className="text-right">{t("finance.actions")}</span></div></TableHeader>{filteredLedger.map((entry: any) => <TableRow key={entry.id} className="grid-cols-[.75fr_1fr_1.3fr_.65fr_auto]"><span className="text-xs text-muted">{dateLabel(entry.businessDate || entry.date)}</span><span className="truncate text-xs">{entry.categoryName || entry.category || "—"}</span><span className="min-w-0"><b className="block truncate text-sm font-medium">{entry.description || "—"}</b>{(entry.payee || entry.source || entry.vendor) && <span className="mt-1 block truncate text-xs text-muted">{entry.payee || entry.source || entry.vendor}</span>}{entry.receiptNumber && <span className="mt-1 block truncate text-xs text-muted">#{entry.receiptNumber}</span>}{(entry.attachments as any[])?.length ? (entry.attachments as any[]).map((attachment: any) => <a key={attachment.id} href={attachment.path} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs font-medium text-accent hover:underline">{t("finance.viewAttachment")}: {attachment.originalName}</a>) : entry.attachmentPath && <a href={entry.attachmentPath} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-medium text-accent hover:underline">{t("finance.viewAttachment")}</a>}</span><b className={cx("text-sm", transactionForm.categoryType === "expense" ? "text-danger" : transactionForm.categoryType === "revenue" ? "text-success" : "text-ink")}>{money(entry.amount)}</b><div className="flex justify-end gap-1">{canManage && <><button aria-label="Edit transaction" onClick={() => editLedgerEntry(entry)} className="rounded-full p-2 text-muted hover:bg-fill hover:text-ink"><Edit3 size={14}/></button><button aria-label="Delete transaction" onClick={() => deleteLedgerEntry(entry)} className="rounded-full p-2 text-muted hover:bg-danger-bg hover:text-danger"><Trash2 size={14}/></button></>}</div></TableRow>)}</TableFrame> : <EmptyState title={t("finance.noTransactionsInPeriod")} description={t("finance.recordFirstTransaction")}/>}</div>
      </Surface>
    </div>}

    {canManage && (screenTab === "adjust" || screenTab === "transfer") && <div className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <Surface>
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{screenTab === "adjust" ? t("finance.tabAdjustBalance") : t("finance.adjustTransfer")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{screenTab === "adjust" ? t("finance.adjustBalanceHint") : t("finance.transferHint")}</p></div>{screenTab === "adjust" ? <PlusCircle size={19} className="text-accent"/> : <ArrowRightLeft size={19} className="text-accent"/>}</div>
        <div className="grid gap-4">
          {categoryTypeSelect(adjustCategoryType, selectAdjustCategoryType)}
          {screenTab === "adjust" ? <>
            <Field label={t("common.category")}><SelectField value={adjustForm.categoryId} onChange={(event) => setAdjustForm({ ...adjustForm, categoryId: event.target.value })}><option value="">{t("finance.chooseCategory")}</option>{(activeAdjustCategories as any[]).map((category) => <option key={category.id} value={category.id}>{category.name} ({t("finance.balanceLabel")}: {money((activeBalances as any[]).find((b) => b.categoryId === category.id)?.balance ?? 0)})</option>)}</SelectField></Field>
            <Field label={t("finance.adjustmentType")}><SelectField value={adjustForm.type} onChange={(event) => setAdjustForm({ ...adjustForm, type: event.target.value as "add" | "deduct" })}><option value="add">{t("finance.adjustmentAdd")}</option><option value="deduct">{t("finance.adjustmentDeduct")}</option></SelectField></Field>
            <Field label={t("common.amount")}><TextField inputMode="decimal" value={adjustForm.amount} onChange={(event) => setAdjustForm({ ...adjustForm, amount: event.target.value })} placeholder="0.00"/></Field>
            <Field label={t("finance.adjustmentNote")}><TextField value={adjustForm.note} onChange={(event) => setAdjustForm({ ...adjustForm, note: event.target.value })} placeholder="Reason for this adjustment"/></Field>
          </> : <>
            <Field label={t("finance.fromCategory")}><SelectField value={transferForm.fromCategoryId} onChange={(event) => setTransferForm({ ...transferForm, fromCategoryId: event.target.value })}><option value="">{t("finance.chooseCategory")}</option>{(activeAdjustCategories as any[]).map((category) => <option key={category.id} value={category.id}>{category.name} ({t("finance.balanceLabel")}: {money((activeBalances as any[]).find((b) => b.categoryId === category.id)?.balance ?? 0)})</option>)}</SelectField></Field>
            <Field label={t("finance.toCategory")}><SelectField value={transferForm.toCategoryId} onChange={(event) => setTransferForm({ ...transferForm, toCategoryId: event.target.value })}><option value="">{t("finance.chooseCategory")}</option>{(activeAdjustCategories as any[]).map((category) => <option key={category.id} value={category.id}>{category.name} ({t("finance.balanceLabel")}: {money((activeBalances as any[]).find((b) => b.categoryId === category.id)?.balance ?? 0)})</option>)}</SelectField></Field>
            <Field label={t("common.amount")}><TextField inputMode="decimal" value={transferForm.amount} onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })} placeholder="0.00"/></Field>
            <Field label={t("finance.adjustmentNote")}><TextField value={transferForm.note} onChange={(event) => setTransferForm({ ...transferForm, note: event.target.value })} placeholder="Reason for this transfer"/></Field>
          </>}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-5">{screenTab === "adjust" ? <PrimaryButton onClick={submitAdjust} pending={activeAdjustMutation.isPending}>{adjustForm.type === "add" ? t("finance.logAddition") : t("finance.logDeduction")}{adjustForm.type === "add" ? <PlusCircle size={15} className="ml-2"/> : <MinusCircle size={15} className="ml-2"/>}</PrimaryButton> : <PrimaryButton onClick={submitTransfer} pending={activeTransferMutation.isPending}>{t("finance.logTransfer")}<ArrowRightLeft size={15} className="ml-2"/></PrimaryButton>}</div>
      </Surface>
      <div className="space-y-6">
        <Surface>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.categoryBalances")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.categoryBalancesHint")}</p></div></div>
          {activeBalancesLoading ? <LoadingState label={t("finance.loadingBalances")}/> : (activeBalances as any[]).length ? <TableFrame><TableHeader><div className="grid grid-cols-[1.2fr_.55fr_.55fr_.55fr_.55fr_.6fr] gap-3"><span>{t("common.category")}</span><span>{t("finance.addedCol")}</span><span>{t("finance.deductedCol")}</span><span>{t("finance.transfersCol")}</span><span>{adjustCategoryType === "expense" ? t("finance.expensesCol") : adjustCategoryType === "revenue" ? t("finance.revenueCol") : t("finance.assetsCol")}</span><span className="text-right">{t("finance.balance")}</span></div></TableHeader>{(activeBalances as any[]).map((entry) => <TableRow key={entry.categoryId} className="grid-cols-[1.2fr_.55fr_.55fr_.55fr_.55fr_.6fr]"><span className="truncate text-xs font-medium">{entry.categoryName}</span><span className="text-xs text-success">+{money(entry.totalAdded)}</span><span className="text-xs text-danger">−{money(entry.totalDeducted)}</span><span className="text-xs text-muted">{entry.totalTransferredIn - entry.totalTransferredOut >= 0 ? "+" : "−"}{money(Math.abs(entry.totalTransferredIn - entry.totalTransferredOut))}</span>{adjustCategoryType === "expense" ? <span className="text-xs text-danger">−{money(entry.totalExpenses)}</span> : adjustCategoryType === "revenue" ? <span className="text-xs text-success">+{money(entry.totalRevenue)}</span> : <span className="text-xs text-success">+{money(entry.totalAssets)}</span>}<b className={cx("text-right text-sm", entry.balance >= 0 ? "text-ink" : "text-danger")}>{money(entry.balance)}</b></TableRow>)}</TableFrame> : <EmptyState title={adjustCategoryType === "expense" ? t("finance.noCategoriesYet") : adjustCategoryType === "revenue" ? t("finance.noRevenueCategoriesYet") : t("finance.noAssetCategoriesYet")} description={t("finance.categoriesInSettings")}/>}
        </Surface>
        <Surface>
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.transactionLog")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.transactionLogHint")}</p></div><SecondaryButton onClick={() => exportCsv(`marasi-category-adjustments-${range.from}-to-${range.to}.csv`, [...csvReportHeaderRows(t("cc.reportGenerated"), t("cc.reportGeneratedBy"), user?.name || "—"), ["Date", "Category", "Type", "Amount (OMR)", "Related category", "Note"], ...(activeAdjustments as any[]).map((entry) => [dateLabel(entry.businessDate), entry.categoryName, t(adjustmentTypeKeys[entry.type]) || entry.type, String(entry.amount), entry.relatedCategoryName || "", entry.note || ""])])}><Download size={14} className="mr-2"/>{t("finance.exportLog")}</SecondaryButton></div>
          {activeAdjustmentsLoading ? <LoadingState label={t("finance.loadingTransactionLog")}/> : (activeAdjustments as any[]).length ? <TableFrame><TableHeader><div className="grid grid-cols-[.7fr_1fr_.9fr_.7fr_1fr] gap-3"><span>{t("common.date")}</span><span>{t("common.category")}</span><span>{t("finance.adjustmentType")}</span><span>{t("finance.amountCol")}</span><span>{t("finance.adjustmentNote")}</span></div></TableHeader>{(activeAdjustments as any[]).map((entry) => <TableRow key={entry.id} className="grid-cols-[.7fr_1fr_.9fr_.7fr_1fr]"><span className="text-xs text-muted">{dateLabel(entry.businessDate)}</span><span className="truncate text-xs">{entry.categoryName}</span><StatusPill tone={entry.type === "add" || entry.type === "transfer_in" ? "success" : "warning"}>{t(adjustmentTypeKeys[entry.type]) || entry.type}</StatusPill><b className={cx("text-sm", entry.type === "add" || entry.type === "transfer_in" ? "text-success" : "text-danger")}>{entry.type === "add" || entry.type === "transfer_in" ? "+" : "−"}{money(entry.amount)}</b><span className="truncate text-xs text-muted">{entry.relatedCategoryName ? `${entry.type === "transfer_out" ? t("finance.relatedTo") : t("finance.relatedFrom")} ${entry.relatedCategoryName}${entry.note ? " — " : ""}` : ""}{entry.note || ""}</span></TableRow>)}</TableFrame> : <EmptyState title={t("finance.noAdjustments")} description={t("finance.transactionLogHint")}/>}
        </Surface>
      </div>
    </div>}

    <Surface className="mt-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.revenueVsExpenses")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.revenueVsExpensesHint")}</p></div><SecondaryButton onClick={() => window.location.href = "/reports"}>{t("finance.openFullReport")} <TrendingUp size={14} className="ml-2"/></SecondaryButton></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-fill"><div className="h-full rounded-full bg-accent transition-all" style={{ width: revenue > 0 ? `${Math.min(100, Math.max(0, revenue / Math.max(revenue, expenseTotal) * 100))}%` : "0%" }}/></div></Surface>
  </>;
}
