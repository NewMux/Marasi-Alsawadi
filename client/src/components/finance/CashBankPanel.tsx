import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { omanToday } from "@/lib/omanDate";
import { DateField, EmptyState, Field, LoadingState, MetricCard, PrimaryButton, SelectField, Surface, TableFrame, TableHeader, TableRow, TextField, cx } from "@/components/MarasiUI";
import { ArrowLeftRight, Banknote, Landmark, Scale } from "lucide-react";

const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
const ADJUSTMENT_CATEGORIES = ["counting_difference", "bank_charges", "bank_interest", "other"] as const;

// PRD Round 18, items 4.6.2 / 4.6.3: move real money between the Cash and
// Bank accounts, and correct either balance after counting the cash or
// checking the bank statement. Finance roles only (the page hides it from
// everyone else and the server refuses them). Neither is revenue, expense
// or VAT; both are written to the audit report.
export function CashBankPanel() {
  const t = useT();
  const utils = trpc.useUtils();
  const today = omanToday();
  const { data: balances } = trpc.platform.finance.corrections.balances.useQuery({ asAt: today });
  const { data: movements = [], isLoading } = trpc.platform.finance.corrections.movements.useQuery({});
  const refresh = () => { utils.platform.finance.corrections.invalidate(); utils.platform.finance.cashFlow.invalidate(); };
  const [transfer, setTransfer] = useState({ businessDate: today, fromAccount: "cash" as "cash" | "bank", amount: "", reason: "" });
  const [adjust, setAdjust] = useState({ businessDate: today, account: "cash" as "cash" | "bank", direction: "decrease" as "increase" | "decrease", amount: "", category: "counting_difference" as (typeof ADJUSTMENT_CATEGORIES)[number], reason: "" });
  const createTransfer = trpc.platform.finance.corrections.transfer.useMutation({ onSuccess: () => { refresh(); setTransfer({ ...transfer, amount: "", reason: "" }); toast.success(t("finance.transferSaved")); }, onError: (error) => toast.error(error.message) });
  const createAdjust = trpc.platform.finance.corrections.adjust.useMutation({ onSuccess: () => { refresh(); setAdjust({ ...adjust, amount: "", reason: "" }); toast.success(t("finance.adjustmentSaved")); }, onError: (error) => toast.error(error.message) });
  const validAmount = (value: string) => /^\d+(\.\d{1,3})?$/.test(value.trim()) && Number(value) > 0;
  const accountLabel = (account: unknown) => account === "bank" ? t("reports.bankAccount") : t("reports.cashAccount");
  const categoryLabel = (category: unknown) => t(`finance.adjCategory_${String(category || "other")}` as any);

  return <div className="mt-6 grid gap-6">
    <div className="grid gap-4 md:grid-cols-2">
      <MetricCard icon={Banknote} label={t("reports.cashAccount")} value={balances ? money(balances.cash) : "…"} detail={t("finance.balanceToday")} tone="green"/>
      <MetricCard icon={Landmark} label={t("reports.bankAccount")} value={balances ? money(balances.bank) : "…"} detail={t("finance.balanceToday")} tone="blue"/>
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Surface>
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.transferTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.cashTransferHint")}</p></div><ArrowLeftRight size={19} className="text-accent"/></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("finance.transferDirection")}><SelectField value={transfer.fromAccount} onChange={(event) => setTransfer({ ...transfer, fromAccount: event.target.value as "cash" | "bank" })}><option value="cash">{t("finance.cashToBank")}</option><option value="bank">{t("finance.bankToCash")}</option></SelectField></Field>
          <Field label={t("common.amount")}><TextField inputMode="decimal" value={transfer.amount} onChange={(event) => setTransfer({ ...transfer, amount: event.target.value })} placeholder="0.000"/></Field>
          <Field label={t("common.date")}><DateField value={transfer.businessDate} onChange={(value) => setTransfer({ ...transfer, businessDate: value })}/></Field>
          <Field label={t("finance.reasonLabel")}><TextField value={transfer.reason} onChange={(event) => setTransfer({ ...transfer, reason: event.target.value })} placeholder={t("finance.transferReasonPlaceholder")}/></Field>
        </div>
        <p className="mt-3 rounded-xl bg-warning-bg px-3 py-2 text-[11px] leading-4 text-warning">{t("finance.transferNotForMethod")}</p>
        <PrimaryButton className="mt-4" pending={createTransfer.isPending} onClick={() => {
          if (!validAmount(transfer.amount)) return toast.error(t("finance.enterValidAmount"));
          if (transfer.reason.trim().length < 3) return toast.error(t("finance.reasonRequired"));
          createTransfer.mutate({ ...transfer, amount: Number(transfer.amount).toFixed(3), reason: transfer.reason.trim() });
        }}>{t("finance.recordTransfer")}</PrimaryButton>
      </Surface>
      <Surface>
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.adjustAccountTitle")}</h2><p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.adjustAccountHint")}</p></div><Scale size={19} className="text-accent"/></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("settings.cashFlowAccount")}><SelectField value={adjust.account} onChange={(event) => setAdjust({ ...adjust, account: event.target.value as "cash" | "bank" })}><option value="cash">{t("reports.cashAccount")}</option><option value="bank">{t("reports.bankAccount")}</option></SelectField></Field>
          <Field label={t("finance.adjustmentType")}><SelectField value={adjust.direction} onChange={(event) => setAdjust({ ...adjust, direction: event.target.value as "increase" | "decrease" })}><option value="decrease">{t("finance.decreaseBalance")}</option><option value="increase">{t("finance.increaseBalance")}</option></SelectField></Field>
          <Field label={t("finance.adjustmentCategory")}><SelectField value={adjust.category} onChange={(event) => setAdjust({ ...adjust, category: event.target.value as typeof adjust.category })}>{ADJUSTMENT_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</SelectField></Field>
          <Field label={t("finance.differenceAmount")}><TextField inputMode="decimal" value={adjust.amount} onChange={(event) => setAdjust({ ...adjust, amount: event.target.value })} placeholder="0.000"/></Field>
          <Field label={t("common.date")}><DateField value={adjust.businessDate} onChange={(value) => setAdjust({ ...adjust, businessDate: value })}/></Field>
          <Field label={t("finance.reasonLabel")}><TextField value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} placeholder={t("finance.reasonPlaceholder")}/></Field>
        </div>
        {balances && validAmount(adjust.amount) && <p className="mt-3 text-[11px] leading-4 text-muted">{t("finance.adjustPreview", { account: accountLabel(adjust.account), before: money(balances[adjust.account]), after: money(balances[adjust.account] + (adjust.direction === "increase" ? 1 : -1) * Number(adjust.amount)) })}</p>}
        <PrimaryButton className="mt-4" pending={createAdjust.isPending} onClick={() => {
          if (!validAmount(adjust.amount)) return toast.error(t("finance.enterValidAmount"));
          if (adjust.reason.trim().length < 3) return toast.error(t("finance.reasonRequired"));
          createAdjust.mutate({ ...adjust, amount: Number(adjust.amount).toFixed(3), reason: adjust.reason.trim() });
        }}>{t("finance.recordAdjustment")}</PrimaryButton>
      </Surface>
    </div>
    <Surface>
      <h2 className="font-serif text-2xl tracking-[-.04em]">{t("finance.movementsTitle")}</h2>
      <p className="mt-1.5 text-xs leading-5 text-muted">{t("finance.movementsHint")}</p>
      <div className="mt-4">{isLoading ? <LoadingState/> : (movements as any[]).length ? <TableFrame><TableHeader><div className="grid grid-cols-[.7fr_1fr_1.4fr_.7fr_.8fr] gap-3"><span>{t("common.date")}</span><span>{t("reports.typeCol")}</span><span>{t("finance.reasonLabel")}</span><span className="text-right">{t("common.amount")}</span><span>{t("settings.userCol")}</span></div></TableHeader>
        {(movements as any[]).map((row) => <TableRow key={row.id} className="grid-cols-[.7fr_1fr_1.4fr_.7fr_.8fr]">
          <span className="text-xs text-muted">{row.businessDate}</span>
          <span className="text-xs">{row.kind === "transfer" ? `${accountLabel(row.fromAccount)} → ${accountLabel(row.toAccount)}` : row.kind === "adjustment" ? `${accountLabel(row.account)} · ${categoryLabel(row.category)}` : `${t("finance.vatPaymentLabel")} · ${accountLabel(row.fromAccount)}`}</span>
          <span className="truncate text-xs">{row.reason}</span>
          <b className={cx("text-right text-sm", row.kind === "adjustment" && row.direction === "increase" ? "text-success" : row.kind === "transfer" ? "text-ink" : "text-danger")}>{row.kind === "transfer" ? "" : row.direction === "increase" ? "+" : "−"}{money(row.amount)}</b>
          <span className="truncate text-xs text-muted">{row.createdByName || "—"}</span>
        </TableRow>)}
      </TableFrame> : <EmptyState title={t("finance.noMovements")} description={t("finance.noMovementsHint")}/>}</div>
    </Surface>
  </div>;
}
