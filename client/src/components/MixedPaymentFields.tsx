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

// PRD Round 15, Section 4: the fields are filled left to right (Cash, Card,
// Bank) — editing one of them recalculates whatever total is still
// outstanding and drops it straight into the next field in that order, so
// two-way and three-way splits alike need only one manual figure typed in.
const FIELD_ORDER: (keyof MixedPaymentValues)[] = ["cash", "card", "bank"];

export function MixedPaymentFields({ values, onChange, total, attempted }: {
  values: MixedPaymentValues; onChange: (values: MixedPaymentValues) => void; total: string; attempted?: boolean;
}) {
  const t = useT();
  const sum = mixedPaymentSum(values);
  const valid = isMixedPaymentValid(values, total);
  const updateField = (field: keyof MixedPaymentValues, rawValue: string) => {
    const next = { ...values, [field]: rawValue };
    const index = FIELD_ORDER.indexOf(field);
    const nextField = FIELD_ORDER[index + 1];
    if (nextField) {
      const enteredSoFar = FIELD_ORDER.slice(0, index + 1).reduce((runningTotal, key) => runningTotal + Number(next[key] || 0), 0);
      const remaining = Math.max(0, Number(total || 0) - enteredSoFar);
      next[nextField] = remaining.toFixed(3);
    }
    onChange(next);
  };
  return <div className="rounded-2xl border border-divider bg-well p-4">
    <div className="grid grid-cols-3 gap-3">
      <Field label={t("tickets.cash")}><TextField type="number" min={0} step="0.001" value={values.cash} onChange={(event) => updateField("cash", event.target.value)}/></Field>
      <Field label={t("tickets.card")}><TextField type="number" min={0} step="0.001" value={values.card} onChange={(event) => updateField("card", event.target.value)}/></Field>
      <Field label={t("tickets.bank")}><TextField type="number" min={0} step="0.001" value={values.bank} onChange={(event) => updateField("bank", event.target.value)}/></Field>
    </div>
    <p className={cx("mt-2 text-xs", valid ? "text-success" : attempted ? "text-danger" : "text-muted")}>
      {t("tickets.mixedSum", { sum: sum.toFixed(3), total: Number(total || 0).toFixed(3) })}
      {!valid && attempted ? ` — ${t("tickets.mixedMismatch")}` : ""}
    </p>
  </div>;
}
