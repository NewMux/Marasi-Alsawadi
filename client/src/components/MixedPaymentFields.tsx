import { Field, TextField, cx } from "@/components/MarasiUI";
import { useT } from "@/lib/i18n";

// PRD Round 14, Section 6: wherever "Mixed" is the selected payment method
// (Ticket Desk, Facility Bookings' Add Payment), staff enter a Cash/Card/Bank
// split that must sum exactly to the transaction total before the payment
// can be confirmed — one shared component so the fields, math, and copy
// can't drift between the two screens.
export type MixedPaymentValues = { cash: string; card: string; bank: string };

export const blankMixedPaymentValues: MixedPaymentValues = { cash: "", card: "", bank: "" };

export function mixedPaymentSum(values: MixedPaymentValues) {
  return Number(values.cash || 0) + Number(values.card || 0) + Number(values.bank || 0);
}

export function isMixedPaymentValid(values: MixedPaymentValues, total: string) {
  // Compare in baisa (thousandths) to avoid float drift on the 3-decimal OMR amounts.
  return Math.round(mixedPaymentSum(values) * 1000) === Math.round(Number(total) * 1000);
}

export function MixedPaymentFields({ values, onChange, total, attempted }: {
  values: MixedPaymentValues; onChange: (values: MixedPaymentValues) => void; total: string; attempted?: boolean;
}) {
  const t = useT();
  const sum = mixedPaymentSum(values);
  const valid = isMixedPaymentValid(values, total);
  return <div className="rounded-2xl border border-divider bg-well p-4">
    <div className="grid grid-cols-3 gap-3">
      <Field label={t("tickets.cash")}><TextField type="number" min={0} step="0.001" value={values.cash} onChange={(event) => onChange({ ...values, cash: event.target.value })}/></Field>
      <Field label={t("tickets.card")}><TextField type="number" min={0} step="0.001" value={values.card} onChange={(event) => onChange({ ...values, card: event.target.value })}/></Field>
      <Field label={t("tickets.bank")}><TextField type="number" min={0} step="0.001" value={values.bank} onChange={(event) => onChange({ ...values, bank: event.target.value })}/></Field>
    </div>
    <p className={cx("mt-2 text-xs", valid ? "text-success" : attempted ? "text-danger" : "text-muted")}>
      {t("tickets.mixedSum", { sum: sum.toFixed(3), total: Number(total || 0).toFixed(3) })}
      {!valid && attempted ? ` — ${t("tickets.mixedMismatch")}` : ""}
    </p>
  </div>;
}
