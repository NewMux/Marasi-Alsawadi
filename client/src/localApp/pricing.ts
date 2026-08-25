// Re-exports the real PRD pricing engine so the backend-free local app uses
// the exact same, already-tested calculation as the real backend instead of
// a second, drifting reimplementation. server/ticketingRules.ts has zero
// dependencies of its own (no Node/db imports), so it's safe to bundle
// straight into the browser — this file is the one place that reaches
// across the client/server boundary.
export {
  calculatePrdPurchasePricing,
  isPositiveMoney,
  moneyToMinor,
  minorToMoney,
  PRD_VAT_PERCENT,
} from "../../../server/ticketingRules";
export type {
  PrdFreeEntryCategory,
  PrdTicketType,
  PrdRateInput,
  PrdDiscountTierInput,
  PrdTicketLineInput,
  TicketFeeInput,
} from "../../../server/ticketingRules";

export function formatLocalTicketNumber(sequenceNumber: number) {
  return `MAS-${String(sequenceNumber).padStart(8, "0")}`;
}
