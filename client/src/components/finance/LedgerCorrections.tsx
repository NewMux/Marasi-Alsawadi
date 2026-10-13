import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useT } from "@/lib/i18n";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, PrimaryButton, SecondaryButton, SelectField, TextField } from "@/components/MarasiUI";
import { blankMixedPaymentValues, isMixedPaymentValid, MixedPaymentFields, type MixedPaymentValues } from "@/components/MixedPaymentFields";

const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

export type LedgerKind = "expense" | "revenue" | "asset";
type Pending =
  | { mode: "delete"; kind: LedgerKind; entry: any }
  | { mode: "void"; entry: any }
  | { mode: "method"; kind: LedgerKind; entry: any };

// A change inside a VAT period already settled comes back as
// PRECONDITION_FAILED; it is only made after an explicit confirmation
// (PRD Round 18, item 8.7).
function isSettledPeriodError(error: unknown) {
  return (error as any)?.data?.code === "PRECONDITION_FAILED";
}

// PRD Round 18, items 4.4 / 4.6.1: General Ledger corrections for the Finance
// roles — delete (with an optional reason), void a ticket / facility sale,
// and change the payment method. One shared set of dialogs so the ledger
// rows of every type use the same mechanism.
export function useLedgerCorrections(onDone: () => void) {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "bank" | "mixed">("card");
  const [mixed, setMixed] = useState<MixedPaymentValues>(blankMixedPaymentValues);
  const [attempted, setAttempted] = useState(false);
  const close = () => { setPending(null); setReason(""); setAttempted(false); };
  const finish = (message: string) => { toast.success(message); close(); onDone(); };
  const withSettledRetry = (run: (confirmSettledPeriod?: boolean) => Promise<unknown>, message: string) => {
    run().then(() => finish(message)).catch((error) => {
      if (isSettledPeriodError(error) && window.confirm(`${error.message}\n\n${t("finance.confirmSettledChange")}`)) {
        run(true).then(() => finish(message)).catch((retryError) => toast.error(retryError.message));
        return;
      }
      toast.error(error.message);
    });
  };
  const deleteExpense = trpc.platform.finance.expenses.delete.useMutation();
  const deleteRevenue = trpc.platform.finance.revenues.delete.useMutation();
  const deleteAsset = trpc.platform.finance.assets.delete.useMutation();
  const voidSale = trpc.platform.finance.corrections.voidSale.useMutation();
  const changeMethod = trpc.platform.finance.corrections.changePaymentMethod.useMutation();
  const busy = deleteExpense.isPending || deleteRevenue.isPending || deleteAsset.isPending || voidSale.isPending || changeMethod.isPending;

  const startDelete = (kind: LedgerKind, entry: any) => { setPending({ mode: "delete", kind, entry }); setReason(""); };
  const startVoid = (entry: any) => { setPending({ mode: "void", entry }); setReason(""); };
  const startMethod = (kind: LedgerKind, entry: any) => {
    const current = entry.paymentMethod || entry.paymentAccount || "cash";
    setMethod(current === "bank" || current === "card" || current === "mixed" ? current : "cash");
    setMixed(entry.paymentMethod === "mixed" ? { cash: String(entry.cashAmount ?? ""), card: String(entry.cardAmount ?? ""), bank: String(entry.bankAmount ?? "") } : blankMixedPaymentValues);
    setPending({ mode: "method", kind, entry }); setReason(""); setAttempted(false);
  };

  const submit = () => {
    if (!pending) return;
    setAttempted(true);
    if (pending.mode === "delete") {
      const mutation = pending.kind === "expense" ? deleteExpense : pending.kind === "revenue" ? deleteRevenue : deleteAsset;
      withSettledRetry((confirmSettledPeriod) => mutation.mutateAsync({ id: pending.entry.id, reason: reason.trim() || undefined, confirmSettledPeriod }), t("finance.transactionRemoved"));
      return;
    }
    if (reason.trim().length < 3) return toast.error(t("finance.reasonRequired"));
    if (pending.mode === "void") {
      const kind = pending.entry.ledgerSource === "ticket" ? "ticket" : "facility";
      withSettledRetry((confirmSettledPeriod) => voidSale.mutateAsync({ kind, id: pending.entry.referenceId, reason: reason.trim(), confirmSettledPeriod }), t("finance.saleVoided"));
      return;
    }
    const derived = pending.entry.ledgerSource === "ticket" || pending.entry.ledgerSource === "facility" || pending.entry.ledgerSource === "facility_addon";
    const target = derived ? (pending.entry.ledgerSource === "ticket" ? "ticket" : "facility") : pending.kind;
    const id = derived ? pending.entry.referenceId : pending.entry.id;
    if (method === "mixed" && !isMixedPaymentValid(mixed, String(derivedTotal(pending.entry)))) return toast.error(t("tickets.mixedMismatch"));
    withSettledRetry((confirmSettledPeriod) => changeMethod.mutateAsync({
      target, id, method, reason: reason.trim(), confirmSettledPeriod,
      ...(method === "mixed" ? { cashAmount: mixed.cash || "0", cardAmount: mixed.card || "0", bankAmount: mixed.bank || "0" } : {}),
    }), t("finance.methodChanged"));
  };

  // The whole sale's total: a facility booking can carry more than one ledger
  // row (facility + add-ons), and its payment method covers all of them.
  const derivedTotal = (entry: any) => entry.saleTotal ?? entry.amount;
  const derived = pending?.mode === "method" && ["ticket", "facility", "facility_addon"].includes(pending.entry.ledgerSource);

  const dialog = <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{pending?.mode === "delete" ? t("finance.deleteTitle") : pending?.mode === "void" ? t("finance.voidTitle") : t("finance.changeMethodTitle")}</DialogTitle></DialogHeader>
      {pending && <div className="grid gap-3 text-sm">
        <div className="rounded-xl bg-well p-3 text-xs leading-5"><b className="block text-sm text-ink">{pending.entry.description || pending.entry.reference || "—"}</b>{pending.entry.categoryName} · {money(pending.entry.amount)}{pending.entry.reference ? ` · ${pending.entry.reference}` : ""}</div>
        {pending.mode === "delete" && <p className="text-xs leading-5 text-muted">{t("finance.deleteHint")}</p>}
        {pending.mode === "void" && <p className="text-xs leading-5 text-muted">{pending.entry.ledgerSource === "ticket" ? t("finance.voidTicketHint") : t("finance.voidFacilityHint")}</p>}
        {pending.mode === "method" && <>
          <p className="text-xs leading-5 text-muted">{t("finance.changeMethodHint")}</p>
          <Field label={t("tickets.paymentMethod")}><SelectField value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            <option value="card">{t("finance.methodCard")}</option><option value="cash">{t("finance.methodCash")}</option><option value="bank">{t("finance.methodBank")}</option>{derived && <option value="mixed">{t("finance.methodMixed")}</option>}
          </SelectField></Field>
          {method === "mixed" && derived && <MixedPaymentFields values={mixed} onChange={setMixed} total={String(derivedTotal(pending.entry))} attempted={attempted}/>}
        </>}
        <Field label={pending.mode === "delete" ? t("finance.reasonOptional") : t("finance.reasonLabel")}><TextField value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("finance.reasonPlaceholder")}/></Field>
      </div>}
      <DialogFooter><SecondaryButton onClick={close}>{t("finance.cancel")}</SecondaryButton><PrimaryButton pending={busy} onClick={submit} className={pending?.mode === "method" ? undefined : "bg-danger hover:bg-danger"}>{pending?.mode === "delete" ? t("finance.deleteConfirm") : pending?.mode === "void" ? t("finance.voidConfirm") : t("finance.saveChanges")}</PrimaryButton></DialogFooter>
    </DialogContent>
  </Dialog>;

  return { dialog, startDelete, startVoid, startMethod };
}
