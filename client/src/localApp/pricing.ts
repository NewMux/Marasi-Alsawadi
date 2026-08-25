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

// Plain, continuous, non-date-derived numbering (PRD §3.6) — no reset, no
// "MAS-" prefix, starting from the client's own previous numbering as given
// in both the PRD ("e.g. 17843") and the ticket mockup's example ticket.
export const STARTING_TICKET_NUMBER = 17843;
export function formatLocalTicketNumber(sequenceNumber: number) {
  return String(sequenceNumber);
}
