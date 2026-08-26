import { useMemo, useState } from "react";
import { ArrowRightLeft, CircleDollarSign, Download, ListChecks, MinusCircle, PlusCircle, ReceiptText, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Field, MetricCard, PageHeader, PrimaryButton, SecondaryButton, SelectField, StatusPill, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { money, today } from "@/localApp/format";
import { useT, type TranslationKey } from "@/localApp/i18n";
import {
  addDiscountTier, addExpense, addExpenseCategory, addExpenseAdjustment, addFee, addRate, exportData, removeExpense,
  transferExpenseCategory, updateDiscountTier, updateExpenseCategory, updateFee, updateRate, useLocalStore,
} from "@/localApp/store";

type Tab = "expenses" | "pricing" | "discounts" | "fees" | "categories" | "adjustments";
const blankRateForm = { id: "", name: "", code: "", ticketType: "waterpark" as "waterpark" | "companion", unitPrice: "" };
const blankDiscountForm = { id: "", minTickets: "25", maxTickets: "29", percentage: "15" };
const blankFeeForm = { id: "", name: "", code: "", calculationType: "fixed" as "fixed" | "percentage", value: "", applicationBasis: "per_transaction" as "per_ticket" | "per_transaction", displayOrder: "0" };
const blankCategoryForm = { id: "", name: "", code: "" };
const blankExpenseForm = { businessDate: today(), categoryId: "", amount: "", payee: "", description: "", receiptNumber: "", attachmentDataUrl: "", attachmentName: "" };
const blankAdjustmentForm = { mode: "adjust" as "adjust" | "transfer", businessDate: today(), categoryId: "", toCategoryId: "", type: "add" as "add" | "deduct", amount: "", note: "" };
const adjustmentTypeKeys: Record<string, TranslationKey> = { add: "finance.typeAdded", deduct: "finance.typeDeducted", transfer_out: "finance.typeTransferOut", transfer_in: "finance.typeTransferIn" };

function exportCsv(filename: string, rows: string[][]) { const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function LocalFinancePage() {
  const t = useT();
  const store = useLocalStore();
  const [tab, setTab] = useState<Tab>("expenses");
  const [range, setRange] = useState({ from: `${today().slice(0, 8)}01`, to: today() });
  const [rateForm, setRateForm] = useState(blankRateForm);
  const [discountForm, setDiscountForm] = useState(blankDiscountForm);
  const [feeForm, setFeeForm] = useState(blankFeeForm);
  const [categoryForm, setCategoryForm] = useState(blankCategoryForm);
  const [expenseForm, setExpenseForm] = useState(blankExpenseForm);
  const [adjustmentForm, setAdjustmentForm] = useState(blankAdjustmentForm);
  const [categoryReportKey, setCategoryReportKey] = useState("");

  const periodPurchases = useMemo(() => store.purchases.filter((purchase) => purchase.visitDate >= range.from && purchase.visitDate <= range.to), [store.purchases, range]);
  const periodExpenses = useMemo(() => store.expenses.filter((expense) => expense.businessDate >= range.from && expense.businessDate <= range.to), [store.expenses, range]);
  const periodAdjustments = useMemo(() => store.expenseAdjustments.filter((entry) => entry.businessDate >= range.from && entry.businessDate <= range.to).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [store.expenseAdjustments, range]);
  const categoryBalances = useMemo(() => store.expenseCategories.filter((category) => category.active).map((category) => {
    const categoryAdjustments = periodAdjustments.filter((entry) => entry.categoryId === category.id);
    const totalAdded = categoryAdjustments.filter((entry) => entry.type === "add").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalDeducted = categoryAdjustments.filter((entry) => entry.type === "deduct").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalTransferredIn = categoryAdjustments.filter((entry) => entry.type === "transfer_in").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalTransferredOut = categoryAdjustments.filter((entry) => entry.type === "transfer_out").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const totalExpenses = periodExpenses.filter((entry) => entry.categoryId === category.id).reduce((sum, entry) => sum + Number(entry.amount), 0);
    const balance = totalAdded - totalDeducted + totalTransferredIn - totalTransferredOut - totalExpenses;
    return { categoryId: category.id, categoryName: category.name, totalAdded, totalDeducted, totalTransferredIn, totalTransferredOut, totalExpenses, balance };
  }), [store.expenseCategories, periodAdjustments, periodExpenses]);
  const categoryReport = useMemo(() => {
    if (!categoryReportKey) return null;
    if (categoryReportKey === "revenue:tickets") {
      return { title: "Ticket Sales — revenue report", total: periodPurchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0), rows: periodPurchases.map((purchase) => ({ date: purchase.visitDate, description: `Purchase #${purchase.id} (${purchase.lines.length} ticket${purchase.lines.length === 1 ? "" : "s"})`, amount: purchase.totalAmount })) };
    }
    const categoryId = Number(categoryReportKey.split(":")[1]);
    const rows = periodExpenses.filter((expense) => expense.categoryId === categoryId);
    const categoryName = store.expenseCategories.find((category) => category.id === categoryId)?.name || "Category";
    return { title: `${categoryName} — expense report`, total: rows.reduce((sum, expense) => sum + Number(expense.amount), 0), rows: rows.map((expense) => ({ date: expense.businessDate, description: expense.description || expense.payee || "Expense", amount: expense.amount })) };
  }, [categoryReportKey, periodPurchases, periodExpenses, store.expenseCategories]);
  const revenue = periodPurchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount), 0);
  const costs = periodExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const activeCategories = store.expenseCategories.filter((category) => category.active);

  const tabs: Array<{ id: Tab; label: string; icon: any }> = [
    { id: "expenses", label: t("finance.tabExpenses"), icon: TrendingUp },
    { id: "pricing", label: t("finance.tabPricing"), icon: CircleDollarSign },
    { id: "discounts", label: t("finance.tabDiscounts"), icon: CircleDollarSign },
    { id: "fees", label: t("finance.tabFees"), icon: ReceiptText },
    { id: "categories", label: t("finance.tabCategories"), icon: ListChecks },
    { id: "adjustments", label: t("finance.tabAdjustments"), icon: ArrowRightLeft },
  ];

  const submitExpense = () => {
    if (!expenseForm.categoryId || !expenseForm.amount || Number(expenseForm.amount) <= 0 || !expenseForm.description.trim()) return toast.error("Choose a category and add a positive amount and description");
    try {
      addExpense({
        businessDate: expenseForm.businessDate, categoryId: Number(expenseForm.categoryId), amount: expenseForm.amount,
        payee: expenseForm.payee.trim() || undefined, description: expenseForm.description.trim(),
        receiptNumber: expenseForm.receiptNumber.trim() || undefined,
        attachmentDataUrl: expenseForm.attachmentDataUrl || undefined, attachmentName: expenseForm.attachmentName || undefined,
      });
      setExpenseForm({ ...blankExpenseForm, businessDate: expenseForm.businessDate });
      toast.success("Expense recorded");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not record this expense"); }
  };

  const onAttachmentSelected = async (file: File | undefined) => {
    if (!file) return setExpenseForm((current) => ({ ...current, attachmentDataUrl: "", attachmentName: "" }));
    if (file.size > 5 * 1024 * 1024) return toast.error("Attachment must be 5 MB or smaller");
    const dataUrl = await readFileAsDataUrl(file);
    setExpenseForm((current) => ({ ...current, attachmentDataUrl: dataUrl, attachmentName: file.name }));
  };

  const submitRate = () => {
    if (!rateForm.name.trim() || !rateForm.code.trim() || Number(rateForm.unitPrice) <= 0) return toast.error("Complete the price name, code, and positive amount");
    const payload = { name: rateForm.name.trim(), code: rateForm.code.trim().toUpperCase(), ticketType: rateForm.ticketType, unitPrice: rateForm.unitPrice };
    if (rateForm.id) updateRate(Number(rateForm.id), payload); else addRate(payload);
    setRateForm(blankRateForm);
    toast.success(rateForm.id ? "Price updated" : "Price added");
  };

  const submitDiscount = () => {
    const minTickets = Number(discountForm.minTickets);
    const maxTickets = discountForm.maxTickets ? Number(discountForm.maxTickets) : null;
    if (!Number.isInteger(minTickets) || minTickets < 1 || (maxTickets !== null && (!Number.isInteger(maxTickets) || maxTickets < minTickets)) || Number(discountForm.percentage) < 0 || Number(discountForm.percentage) > 100) return toast.error("Enter a valid ticket range and discount between 0% and 100%");
    const payload = { minTickets, maxTickets, percentage: discountForm.percentage };
    if (discountForm.id) updateDiscountTier(Number(discountForm.id), payload); else addDiscountTier(payload);
    setDiscountForm(blankDiscountForm);
    toast.success(discountForm.id ? "Discount tier updated" : "Discount tier added");
  };

  const submitFee = () => {
    if (!feeForm.name.trim() || !feeForm.code.trim() || Number(feeForm.value) <= 0) return toast.error("Complete the fee name, code, and positive value");
    const payload = { name: feeForm.name.trim(), code: feeForm.code.trim().toUpperCase(), calculationType: feeForm.calculationType, value: feeForm.value, applicationBasis: feeForm.applicationBasis, displayOrder: Number(feeForm.displayOrder || 0) };
    if (feeForm.id) updateFee(Number(feeForm.id), payload); else addFee(payload);
    setFeeForm(blankFeeForm);
    toast.success(feeForm.id ? "Fee item updated" : "Fee item added");
  };

  const submitCategory = () => {
    if (!categoryForm.name.trim() || !categoryForm.code.trim()) return toast.error("Add a name and code");
    const payload = { name: categoryForm.name.trim(), code: categoryForm.code.trim().toUpperCase() };
    if (categoryForm.id) updateExpenseCategory(Number(categoryForm.id), payload); else addExpenseCategory(payload);
    setCategoryForm(blankCategoryForm);
    toast.success(categoryForm.id ? "Category updated" : "Category added");
  };

  const submitAdjustment = () => {
    if (!adjustmentForm.categoryId || !adjustmentForm.amount || Number(adjustmentForm.amount) <= 0) return toast.error("Choose a category and a positive amount");
    try {
      if (adjustmentForm.mode === "transfer") {
        if (!adjustmentForm.toCategoryId) return toast.error("Choose a destination category");
        transferExpenseCategory({ businessDate: adjustmentForm.businessDate, fromCategoryId: Number(adjustmentForm.categoryId), toCategoryId: Number(adjustmentForm.toCategoryId), amount: adjustmentForm.amount, note: adjustmentForm.note.trim() || undefined });
        toast.success("Transfer logged");
      } else {
        addExpenseAdjustment({ businessDate: adjustmentForm.businessDate, categoryId: Number(adjustmentForm.categoryId), type: adjustmentForm.type, amount: adjustmentForm.amount, note: adjustmentForm.note.trim() || undefined });
        toast.success("Adjustment logged");
      }
      setAdjustmentForm({ ...blankAdjustmentForm, businessDate: adjustmentForm.businessDate });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not log this adjustment"); }
  };

  return <>
    <PageHeader eyebrow={t("finance.eyebrow")} title={t("finance.title")} description={t("finance.description")} actions={<SecondaryButton onClick={exportData}><Download size={14} className="mr-2"/>{t("layout.exportData")}</SecondaryButton>}/>
    <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-white bg-white/75 p-2 shadow-sm">
      {tabs.map((entry) => { const Icon = entry.icon; return <button key={entry.id} onClick={() => setTab(entry.id)} className={cx("flex min-w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition", tab === entry.id ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-fill hover:text-ink")}><Icon size={15}/>{entry.label}</button>; })}
    </div>

    {tab === "expenses" && <>
      <Surface tone="tinted"><div className="flex flex-wrap items-end gap-4">
        <Field label={t("common.from")}><TextField type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })}/></Field>
        <Field label={t("common.to")}><TextField type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })}/></Field>
      </div></Surface>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <MetricCard icon={TrendingUp} label={t("finance.revenue")} value={money(revenue)} detail={String(periodPurchases.length)} tone="green"/>
        <MetricCard icon={TrendingDown} label={t("finance.expenses")} value={money(costs)} detail={String(periodExpenses.length)} tone="amber"/>
        <MetricCard icon={revenue >= costs ? TrendingUp : TrendingDown} label={t("finance.net")} value={money(revenue - costs)} detail="" tone={revenue >= costs ? "blue" : "red"}/>
      </div>
      <Surface className="mt-6">
        <h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.singleCategoryReport")}</h2>
        <p className="mt-2 text-xs leading-5 text-muted">{t("finance.singleCategoryReportHint")}</p>
        <div className="mt-4 max-w-sm"><Field label={t("finance.reportOn")}><SelectField value={categoryReportKey} onChange={(event) => setCategoryReportKey(event.target.value)}>
          <option value="">{t("finance.chooseReportSource")}</option>
          <optgroup label="Revenue"><option value="revenue:tickets">{t("finance.ticketSales")}</option></optgroup>
          <optgroup label={t("finance.tabCategories")}>{store.expenseCategories.filter((category) => category.active).map((category) => <option key={category.id} value={`expense:${category.id}`}>{category.name}</option>)}</optgroup>
        </SelectField></Field></div>
        {categoryReport && <div className="mt-5 border-t border-divider pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-serif text-xl tracking-[-.03em]">{categoryReport.title}</h3><p className="mt-1 text-xs text-muted">{categoryReport.rows.length} · {range.from} to {range.to}</p></div><div className="flex items-center gap-3"><b className="text-lg">{money(categoryReport.total)}</b><SecondaryButton onClick={() => exportCsv(`marasi-${categoryReportKey.replace(":", "-")}-${range.from}-to-${range.to}.csv`, [["Date", "Description", "Amount (OMR)"], ...categoryReport.rows.map((row) => [row.date, row.description, String(row.amount)])])}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></div></div>
          {categoryReport.rows.length ? <div className="mt-4 divide-y divide-divider">{categoryReport.rows.map((row, index) => <div key={index} className="flex items-center justify-between gap-3 py-3"><div><b className="text-sm">{row.description}</b><div className="mt-1 text-xs text-muted">{row.date}</div></div><b className="text-sm">{money(row.amount)}</b></div>)}</div> : <p className="py-8 text-center text-sm text-muted">{t("finance.noExpenses")}</p>}
        </div>}
      </Surface>
      <Surface className="mt-6">
        <h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.recordExpense")}</h2>
        <p className="mt-2 text-xs leading-5 text-muted">{t("finance.recordExpenseHint")}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label={t("finance.expenseDate")}><TextField type="date" value={expenseForm.businessDate} onChange={(event) => setExpenseForm({ ...expenseForm, businessDate: event.target.value })}/></Field>
          <Field label={t("common.category")}><SelectField value={expenseForm.categoryId} onChange={(event) => setExpenseForm({ ...expenseForm, categoryId: event.target.value })}><option value="">{t("finance.selectCategory")}</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField></Field>
          <Field label={t("common.amount")}><TextField inputMode="decimal" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })}/></Field>
          <Field label={t("finance.payee")}><TextField value={expenseForm.payee} onChange={(event) => setExpenseForm({ ...expenseForm, payee: event.target.value })}/></Field>
          <Field label={t("finance.receiptNumber")}><TextField value={expenseForm.receiptNumber} onChange={(event) => setExpenseForm({ ...expenseForm, receiptNumber: event.target.value })}/></Field>
          <div className="sm:col-span-2"><Field label={t("common.description")}><TextField value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })}/></Field></div>
          <div className="sm:col-span-2">
            <Field label={t("finance.attachment")}>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => onAttachmentSelected(event.target.files?.[0])} className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-fill file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink hover:file:bg-[#e8e8ed]"/>
            </Field>
            <p className="mt-1.5 text-[11px] leading-4 text-muted">{t("finance.attachmentHint")}</p>
            {expenseForm.attachmentName && <p className="mt-1 truncate text-[11px] text-accent">{expenseForm.attachmentName}</p>}
          </div>
        </div>
        <PrimaryButton className="mt-5" onClick={submitExpense}>{t("finance.recordExpense")}</PrimaryButton>
      </Surface>
      <Surface className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.ledger")}</h2><span className="text-[11px] font-medium text-subtle">{periodExpenses.length}</span></div>
        <p className="mb-4 text-xs leading-5 text-muted">{t("finance.ledgerHint")}</p>
        {periodExpenses.length ? <div className="divide-y divide-divider">{periodExpenses.map((expense) => <div key={expense.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><b className="text-sm text-ink">{expense.description}</b><div className="mt-1 text-xs text-muted">{expense.categoryName} · {expense.businessDate}{expense.receiptNumber ? ` · #${expense.receiptNumber}` : ""}</div>{expense.attachmentDataUrl && <a href={expense.attachmentDataUrl} download={expense.attachmentName || "receipt"} className="mt-1 inline-block text-xs font-medium text-accent hover:underline">{t("finance.viewAttachment")}</a>}</div><div className="flex items-center gap-3"><b className="text-sm font-medium text-danger">−{money(expense.amount)}</b><SecondaryButton onClick={() => removeExpense(expense.id)}>{t("common.delete")}</SecondaryButton></div></div>)}</div> : <p className="py-8 text-center text-sm text-muted">{t("finance.noExpenses")}</p>}
      </Surface>
    </>}

    {tab === "pricing" && <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <Surface><h2 className="font-serif text-2xl tracking-[-.035em]">{rateForm.id ? "Edit price" : "Add price"}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={t("finance.rateName")}><TextField value={rateForm.name} onChange={(event) => setRateForm({ ...rateForm, name: event.target.value })}/></Field>
          <Field label={t("common.code")}><TextField value={rateForm.code} onChange={(event) => setRateForm({ ...rateForm, code: event.target.value.toUpperCase() })}/></Field>
          <Field label={t("finance.ticketType")}><SelectField value={rateForm.ticketType} onChange={(event) => setRateForm({ ...rateForm, ticketType: event.target.value as "waterpark" | "companion" })}><option value="waterpark">{t("tickets.waterpark")}</option><option value="companion">{t("tickets.companion")}</option></SelectField></Field>
          <Field label={t("finance.price")}><TextField inputMode="decimal" value={rateForm.unitPrice} onChange={(event) => setRateForm({ ...rateForm, unitPrice: event.target.value })}/></Field>
        </div>
        <div className="mt-5 flex gap-2"><PrimaryButton onClick={submitRate}>{rateForm.id ? t("common.save") : t("finance.addPrice")}</PrimaryButton>{rateForm.id && <SecondaryButton onClick={() => setRateForm(blankRateForm)}>{t("common.cancel")}</SecondaryButton>}</div>
      </Surface>
      <Surface><h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.tabPricing")}</h2>
        <div className="mt-4 divide-y divide-divider">{store.rates.map((rate) => <div key={rate.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><div className="flex items-center gap-2"><b>{rate.name}</b><span className="font-mono text-[10px] text-accent">{rate.code}</span>{!rate.active && <span className="rounded-full bg-danger-bg px-2 py-1 text-[10px] text-danger">{t("finance.inactive")}</span>}</div><div className="mt-1 text-xs text-muted">{money(rate.unitPrice)} · {rate.ticketType === "companion" ? t("tickets.companion") : t("tickets.waterpark")}</div></div>
          <div className="flex gap-2"><SecondaryButton onClick={() => setRateForm({ id: String(rate.id), name: rate.name, code: rate.code, ticketType: rate.ticketType, unitPrice: String(rate.unitPrice) })}>{t("common.edit")}</SecondaryButton><SecondaryButton onClick={() => updateRate(rate.id, { active: !rate.active })}>{rate.active ? t("common.retire") : t("common.activate")}</SecondaryButton></div>
        </div>)}</div>
      </Surface>
    </div>}

    {tab === "discounts" && <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <Surface><h2 className="font-serif text-2xl tracking-[-.035em]">{discountForm.id ? "Edit discount tier" : "Add discount tier"}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label={t("finance.minTickets")}><TextField type="number" min="1" value={discountForm.minTickets} onChange={(event) => setDiscountForm({ ...discountForm, minTickets: event.target.value })}/></Field>
          <Field label={t("finance.maxTickets")}><TextField type="number" min="1" placeholder="∞" value={discountForm.maxTickets} onChange={(event) => setDiscountForm({ ...discountForm, maxTickets: event.target.value })}/></Field>
          <Field label={t("finance.percentage")}><TextField inputMode="decimal" value={discountForm.percentage} onChange={(event) => setDiscountForm({ ...discountForm, percentage: event.target.value })}/></Field>
        </div>
        <div className="mt-5 flex gap-2"><PrimaryButton onClick={submitDiscount}>{discountForm.id ? t("common.save") : t("finance.addTier")}</PrimaryButton>{discountForm.id && <SecondaryButton onClick={() => setDiscountForm(blankDiscountForm)}>{t("common.cancel")}</SecondaryButton>}</div>
      </Surface>
      <Surface><h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.tabDiscounts")}</h2>
        <div className="mt-4 divide-y divide-divider">{store.discountTiers.map((tier) => <div key={tier.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><b>{tier.minTickets}–{tier.maxTickets ?? "∞"}</b><div className="mt-1 text-xs text-muted">{Number(tier.percentage).toFixed(2)}% · {tier.active ? "Active" : t("finance.inactive")}</div></div>
          <div className="flex gap-2"><SecondaryButton onClick={() => setDiscountForm({ id: String(tier.id), minTickets: String(tier.minTickets), maxTickets: tier.maxTickets === null ? "" : String(tier.maxTickets), percentage: String(tier.percentage) })}>{t("common.edit")}</SecondaryButton><SecondaryButton onClick={() => updateDiscountTier(tier.id, { active: !tier.active })}>{tier.active ? t("common.retire") : t("common.activate")}</SecondaryButton></div>
        </div>)}</div>
      </Surface>
    </div>}

    {tab === "fees" && <div className="grid gap-6 xl:grid-cols-[.95fr_1.05fr]">
      <Surface><h2 className="font-serif text-2xl tracking-[-.035em]">{feeForm.id ? "Edit fee item" : "Add fee item"}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={t("finance.feeName")}><TextField value={feeForm.name} onChange={(event) => setFeeForm({ ...feeForm, name: event.target.value })}/></Field>
          <Field label={t("common.code")}><TextField value={feeForm.code} onChange={(event) => setFeeForm({ ...feeForm, code: event.target.value.toUpperCase() })}/></Field>
          <Field label={t("finance.calculationType")}><SelectField value={feeForm.calculationType} onChange={(event) => setFeeForm({ ...feeForm, calculationType: event.target.value as "fixed" | "percentage" })}><option value="fixed">{t("finance.fixed")}</option><option value="percentage">{t("finance.percentageType")}</option></SelectField></Field>
          <Field label={feeForm.calculationType === "fixed" ? t("common.amount") : t("finance.percentage")}><TextField inputMode="decimal" value={feeForm.value} onChange={(event) => setFeeForm({ ...feeForm, value: event.target.value })}/></Field>
          <Field label={t("finance.applicationBasis")}><SelectField value={feeForm.applicationBasis} onChange={(event) => setFeeForm({ ...feeForm, applicationBasis: event.target.value as "per_ticket" | "per_transaction" })}><option value="per_transaction">{t("finance.perTransaction")}</option><option value="per_ticket">{t("finance.perTicket")}</option></SelectField></Field>
        </div>
        <div className="mt-5 flex gap-2"><PrimaryButton onClick={submitFee}>{feeForm.id ? t("common.save") : t("finance.addFee")}</PrimaryButton>{feeForm.id && <SecondaryButton onClick={() => setFeeForm(blankFeeForm)}>{t("common.cancel")}</SecondaryButton>}</div>
      </Surface>
      <Surface><h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.tabFees")}</h2>
        <div className="mt-4 divide-y divide-divider">{store.fees.length ? store.fees.map((fee) => <div key={fee.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><div className="flex items-center gap-2"><b>{fee.name}</b><span className="font-mono text-[10px] text-accent">{fee.code}</span>{!fee.active && <span className="rounded-full bg-danger-bg px-2 py-1 text-[10px] text-danger">{t("finance.inactive")}</span>}</div><div className="mt-1 text-xs text-muted">{fee.calculationType === "percentage" ? `${Number(fee.value)}%` : money(fee.value)} · {fee.applicationBasis === "per_ticket" ? t("finance.perTicket") : t("finance.perTransaction")}</div></div>
          <div className="flex gap-2"><SecondaryButton onClick={() => setFeeForm({ id: String(fee.id), name: fee.name, code: fee.code, calculationType: fee.calculationType, value: String(fee.value), applicationBasis: fee.applicationBasis, displayOrder: String(fee.displayOrder) })}>{t("common.edit")}</SecondaryButton><SecondaryButton onClick={() => updateFee(fee.id, { active: !fee.active })}>{fee.active ? t("common.retire") : t("common.activate")}</SecondaryButton></div>
        </div>) : <p className="py-8 text-center text-sm text-muted">No fee items yet. Tickets use the base price only.</p>}</div>
      </Surface>
    </div>}

    {tab === "categories" && <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <Surface><h2 className="font-serif text-2xl tracking-[-.035em]">{categoryForm.id ? "Edit category" : "Add expense category"}</h2>
        <div className="mt-5 grid gap-4"><Field label={t("finance.categoryName")}><TextField value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}/></Field><Field label={t("common.code")}><TextField value={categoryForm.code} onChange={(event) => setCategoryForm({ ...categoryForm, code: event.target.value.toUpperCase() })}/></Field></div>
        <div className="mt-5 flex gap-2"><PrimaryButton onClick={submitCategory}>{categoryForm.id ? t("common.save") : t("finance.addCategory")}</PrimaryButton>{categoryForm.id && <SecondaryButton onClick={() => setCategoryForm(blankCategoryForm)}>{t("common.cancel")}</SecondaryButton>}</div>
      </Surface>
      <Surface><h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.tabCategories")}</h2>
        <div className="mt-4 divide-y divide-divider">{store.expenseCategories.map((category) => <div key={category.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><b>{category.name}</b><span className="ml-2 font-mono text-[10px] text-accent">{category.code}</span>{!category.active && <span className="ml-2 text-[10px] text-danger">{t("finance.inactive")}</span>}</div>
          <div className="flex gap-2"><SecondaryButton onClick={() => setCategoryForm({ id: String(category.id), name: category.name, code: category.code })}>{t("common.edit")}</SecondaryButton><SecondaryButton onClick={() => updateExpenseCategory(category.id, { active: !category.active })}>{category.active ? t("common.retire") : t("common.activate")}</SecondaryButton></div>
        </div>)}</div>
      </Surface>
    </div>}

    {tab === "adjustments" && <>
    <Surface>
      <h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.categoryBalances")}</h2>
      <p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.categoryBalancesHint")}</p>
      {categoryBalances.length ? <TableFrame className="mt-4"><TableHeader><div className="grid grid-cols-[1.2fr_.55fr_.55fr_.55fr_.55fr_.6fr] gap-3"><span>{t("common.category")}</span><span>{t("finance.adjustmentAdd")}</span><span>{t("finance.adjustmentDeduct")}</span><span>{t("finance.adjustTransfer")}</span><span>{t("finance.expenses")}</span><span className="text-right">{t("finance.balance")}</span></div></TableHeader>{categoryBalances.map((entry) => <TableRow key={entry.categoryId} className="grid-cols-[1.2fr_.55fr_.55fr_.55fr_.55fr_.6fr]"><span className="truncate text-xs font-medium">{entry.categoryName}</span><span className="text-xs text-success">+{money(entry.totalAdded)}</span><span className="text-xs text-danger">−{money(entry.totalDeducted)}</span><span className="text-xs text-muted">{entry.totalTransferredIn - entry.totalTransferredOut >= 0 ? "+" : "−"}{money(Math.abs(entry.totalTransferredIn - entry.totalTransferredOut))}</span><span className="text-xs text-danger">−{money(entry.totalExpenses)}</span><b className={cx("text-right text-sm", entry.balance >= 0 ? "text-ink" : "text-danger")}>{money(entry.balance)}</b></TableRow>)}</TableFrame> : <p className="mt-4 py-8 text-center text-sm text-muted">{t("finance.noExpenses")}</p>}
    </Surface>
    <div className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
      <Surface>
        <h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.tabAdjustments")}</h2>
        <div className="my-4 grid grid-cols-2 gap-2 rounded-2xl bg-well p-1">
          <button onClick={() => setAdjustmentForm({ ...adjustmentForm, mode: "adjust" })} className={cx("flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition", adjustmentForm.mode === "adjust" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}><PlusCircle size={14}/>{t("finance.adjustAdd")}</button>
          <button onClick={() => setAdjustmentForm({ ...adjustmentForm, mode: "transfer" })} className={cx("flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition", adjustmentForm.mode === "transfer" ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink")}><ArrowRightLeft size={14}/>{t("finance.adjustTransfer")}</button>
        </div>
        <div className="grid gap-4">
          <Field label={t("finance.expenseDate")}><TextField type="date" value={adjustmentForm.businessDate} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, businessDate: event.target.value })}/></Field>
          <Field label={adjustmentForm.mode === "transfer" ? t("finance.fromCategory") : t("common.category")}><SelectField value={adjustmentForm.categoryId} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, categoryId: event.target.value })}><option value="">{t("finance.selectCategory")}</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField></Field>
          {adjustmentForm.mode === "transfer" ? <Field label={t("finance.toCategory")}><SelectField value={adjustmentForm.toCategoryId} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, toCategoryId: event.target.value })}><option value="">{t("finance.selectCategory")}</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField></Field>
            : <Field label={t("finance.adjustmentType")}><SelectField value={adjustmentForm.type} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, type: event.target.value as "add" | "deduct" })}><option value="add">{t("finance.adjustmentAdd")}</option><option value="deduct">{t("finance.adjustmentDeduct")}</option></SelectField></Field>}
          <Field label={t("common.amount")}><TextField inputMode="decimal" value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })}/></Field>
          <Field label={t("finance.adjustmentNote")}><TextField value={adjustmentForm.note} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, note: event.target.value })}/></Field>
        </div>
        <PrimaryButton className="mt-5" onClick={submitAdjustment}>{adjustmentForm.mode === "transfer" ? t("finance.logTransfer") : adjustmentForm.type === "add" ? t("finance.logAddition") : t("finance.logDeduction")}{adjustmentForm.mode === "transfer" ? <ArrowRightLeft size={15} className="ml-2"/> : adjustmentForm.type === "add" ? <PlusCircle size={15} className="ml-2"/> : <MinusCircle size={15} className="ml-2"/>}</PrimaryButton>
      </Surface>
      <Surface>
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="font-serif text-2xl tracking-[-.035em]">{t("finance.transactionLog")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.transactionLogHint")}</p></div><SecondaryButton onClick={() => exportCsv(`marasi-category-adjustments-${range.from}-to-${range.to}.csv`, [["Date", "Category", "Type", "Amount (OMR)", "Related category", "Note"], ...periodAdjustments.map((entry) => [entry.businessDate, entry.categoryName, t(adjustmentTypeKeys[entry.type]), entry.amount, entry.relatedCategoryName || "", entry.note])])}><Download size={14} className="mr-2"/>{t("common.export")}</SecondaryButton></div>
        {periodAdjustments.length ? <TableFrame><TableHeader><div className="grid grid-cols-[.7fr_1fr_.9fr_.7fr_1fr] gap-3"><span>{t("common.date")}</span><span>{t("common.category")}</span><span>{t("finance.adjustmentType")}</span><span>{t("common.amount")}</span><span>{t("finance.adjustmentNote")}</span></div></TableHeader>{periodAdjustments.map((entry) => <TableRow key={entry.id} className="grid-cols-[.7fr_1fr_.9fr_.7fr_1fr]"><span className="text-xs text-muted">{entry.businessDate}</span><span className="truncate text-xs">{entry.categoryName}</span><StatusPill tone={entry.type === "add" || entry.type === "transfer_in" ? "success" : "warning"}>{t(adjustmentTypeKeys[entry.type])}</StatusPill><b className={cx("text-sm", entry.type === "add" || entry.type === "transfer_in" ? "text-success" : "text-danger")}>{entry.type === "add" || entry.type === "transfer_in" ? "+" : "−"}{money(entry.amount)}</b><span className="truncate text-xs text-muted">{entry.relatedCategoryName ? `${entry.type === "transfer_out" ? "→" : "←"} ${entry.relatedCategoryName}${entry.note ? " — " : ""}` : ""}{entry.note}</span></TableRow>)}</TableFrame> : <p className="py-8 text-center text-sm text-muted">{t("finance.noAdjustments")}</p>}
      </Surface>
    </div>
    </>}
  </>;
}
