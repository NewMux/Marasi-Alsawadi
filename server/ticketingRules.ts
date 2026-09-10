export function formatTicketNumber(ticketYear: number, sequenceNumber: number) {
  return `MAS-${ticketYear}-${String(sequenceNumber).padStart(6, "0")}`;
}

// OMR is a 3-decimal-place currency (1 rial = 1000 baisa), not the 2-decimal
// "cents" precision most currencies use — so up to 3 decimal digits, not 2.
export function isPositiveMoney(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && /^\d+(\.\d{1,3})?$/.test(value);
}

export function calculateTicketTotal(unitPrice: string, quantity: number) {
  if (!isPositiveMoney(unitPrice) || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Ticket quantity and unit price must be positive");
  }
  return Number(minorToMoney(moneyToMinor(unitPrice) * quantity));
}

export type TicketFeeInput = {
  id: number;
  name: string;
  code: string;
  calculationType: "fixed" | "percentage";
  value: string;
  applicationBasis: "per_ticket" | "per_transaction";
  displayOrder: number;
};

export type TicketPriceLine = {
  lineType: "base" | "fee";
  label: string;
  code: string | null;
  quantity: number;
  unitAmount: string;
  lineAmount: string;
  sortOrder: number;
};

// "Minor" units are baisa (thousandths of a rial), not cents — matching
// OMR's real 3-decimal precision.
export function moneyToMinor(value: string) {
  if (!/^\d+(\.\d{1,3})?$/.test(value)) throw new Error("Enter an OMR amount with up to three decimals");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}

export function minorToMoney(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Money value exceeds the supported range");
  return (value / 1000).toFixed(3);
}

function percentageToScaled(value: string) {
  if (!/^\d+(\.\d{1,4})?$/.test(value) || Number(value) <= 0 || Number(value) > 100) {
    throw new Error("Percentage fees must be greater than 0 and no more than 100");
  }
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 10_000 + Number(fraction.padEnd(4, "0"));
}

export function calculateTicketPricing(input: {
  unitPrice: string;
  quantity: number;
  rateName: string;
  rateCode: string;
  fees: TicketFeeInput[];
}) {
  if (!isPositiveMoney(input.unitPrice) || !Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error("Ticket quantity and unit price must be positive");
  }
  const unitMinor = moneyToMinor(input.unitPrice);
  const baseMinor = unitMinor * input.quantity;
  const lines: TicketPriceLine[] = [{
    lineType: "base", label: input.rateName, code: input.rateCode,
    quantity: input.quantity, unitAmount: minorToMoney(unitMinor),
    lineAmount: minorToMoney(baseMinor), sortOrder: 0,
  }];
  let feeMinor = 0;
  for (const fee of [...input.fees].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)) {
    let lineMinor: number;
    let lineQuantity = 1;
    if (fee.calculationType === "percentage") {
      lineMinor = Math.round((baseMinor * percentageToScaled(fee.value)) / 1_000_000);
    } else {
      const fixedMinor = moneyToMinor(Number(fee.value).toFixed(3));
      lineQuantity = fee.applicationBasis === "per_ticket" ? input.quantity : 1;
      lineMinor = fixedMinor * lineQuantity;
    }
    feeMinor += lineMinor;
    lines.push({
      lineType: "fee", label: fee.name, code: fee.code, quantity: lineQuantity,
      unitAmount: fee.value, lineAmount: minorToMoney(lineMinor), sortOrder: fee.displayOrder,
    });
  }
  return {
    baseSubtotal: minorToMoney(baseMinor), feeTotal: minorToMoney(feeMinor),
    totalAmount: minorToMoney(baseMinor + feeMinor), lines,
  };
}

export const PRD_VAT_PERCENT = 5;
// PRD Round 7, Section 1.3: ticket types and visitor categories are now
// fully Admin-managed (server/ticketingDb.ts's ticketTypes/visitorCategories
// tables), each Ticket Type x Category combination carrying its own
// editable price — replacing the old fixed waterpark/companion ticketType
// enum and the hardcoded-free under_two/person_of_determination/senior
// categories. A line's price of 0 is simply "free" (no special-casing
// needed for discount/VAT/fees — a percentage of 0 is 0). Whether a line
// counts toward the group-discount tier's ticket-count threshold is its
// own explicit, Admin-configurable per-category flag (PRD Round 8, Section
// 2 — restored after Round 7 briefly derived it from price alone), also
// reused to decide per-ticket fee eligibility (a category excluded from
// the group-discount count is likewise excluded from per-ticket fees,
// matching the pre-Round-7 free-category behavior).
export type PrdPriceInput = { id: number; name: string; code: string; unitPrice: string };
export type PrdDiscountTierInput = { id: number; minTickets: number; maxTickets: number | null; percentage: string };
export type PrdTicketLineInput = { price: PrdPriceInput; ticketTypeId: number; categoryId: number; countsTowardGroupDiscount: boolean };

function percentageToBasisPoints(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) < 0 || Number(value) > 100) throw new Error("Discount percentages must be between 0 and 100");
  return Math.round(Number(value) * 100);
}

export function calculatePrdPurchasePricing(input: {
  lines: PrdTicketLineInput[];
  discountTiers: PrdDiscountTierInput[];
  fees: TicketFeeInput[];
  // PRD Round 4, Section 5 (Partner/Entity Discounts): a selected partner
  // entity replaces the automatic group-size tier entirely (never stacks on
  // top of it) with its OWN per-ticket-type negotiated rate — e.g. 10% on
  // Water Park Entry but 20% on Festival Entry. Passing this object at all
  // (even {}) means a partner entity is selected; a ticket type absent from
  // it gets 0%, it does NOT fall back to the group-size tier. Keyed by
  // ticketTypeId (stringified, since object keys are always strings).
  overrideDiscountByTicketType?: Record<string, string>;
}) {
  if (!input.lines.length) throw new Error("Add at least one ticket line");
  const isChargeableLine = (line: PrdTicketLineInput) => line.countsTowardGroupDiscount;
  const chargeableTicketCount = input.lines.filter(isChargeableLine).length;
  const usingPartnerOverride = input.overrideDiscountByTicketType !== undefined;
  const tier = usingPartnerOverride ? undefined : [...input.discountTiers]
    .filter((candidate) => candidate.minTickets <= chargeableTicketCount && (candidate.maxTickets === null || candidate.maxTickets >= chargeableTicketCount))
    .sort((a, b) => b.minTickets - a.minTickets || b.id - a.id)[0];
  const tierBasisPoints = tier ? percentageToBasisPoints(String(tier.percentage)) : 0;
  const basisPointsForLine = (line: PrdTicketLineInput) => usingPartnerOverride
    ? percentageToBasisPoints(input.overrideDiscountByTicketType![String(line.ticketTypeId)] ?? "0")
    : tierBasisPoints;
  const discountPercentageForLine = (line: PrdTicketLineInput) => (basisPointsForLine(line) / 100).toFixed(2);
  const baseSubtotalMinor = input.lines.reduce((sum, line) => sum + moneyToMinor(String(line.price.unitPrice)), 0);
  const discountMinorByLine = input.lines.map((line) => Math.round((moneyToMinor(String(line.price.unitPrice)) * basisPointsForLine(line)) / 10_000));
  const discountAmountMinor = discountMinorByLine.reduce((sum, value) => sum + value, 0);
  // Purchase-level summary percentage: the flat tier rate when one applies,
  // otherwise the blended (discount / pre-discount subtotal) rate — the only
  // single number that stays meaningful when lines carry different percentages.
  const discountPercentage = usingPartnerOverride
    ? (baseSubtotalMinor > 0 ? ((discountAmountMinor / baseSubtotalMinor) * 100).toFixed(2) : "0.00")
    : (tierBasisPoints / 100).toFixed(2);
  const discountedBaseMinorByLine = input.lines.map((line, index) => moneyToMinor(String(line.price.unitPrice)) - discountMinorByLine[index]);
  const discountedBaseMinor = discountedBaseMinorByLine.reduce((sum, value) => sum + value, 0);
  const vatAmountMinor = Math.round((discountedBaseMinor * (PRD_VAT_PERCENT * 100)) / 10_000);
  const vatFloors = discountedBaseMinorByLine.map((value) => Math.floor((value * (PRD_VAT_PERCENT * 100)) / 10_000));
  const vatRemainders = discountedBaseMinorByLine.map((value, index) => ({ index, remainder: (value * (PRD_VAT_PERCENT * 100)) % 10_000 }));
  const vatMinorByLine = [...vatFloors];
  let vatCentsRemaining = vatAmountMinor - vatFloors.reduce((sum, value) => sum + value, 0);
  vatRemainders.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < vatRemainders.length && vatCentsRemaining > 0; index += 1, vatCentsRemaining -= 1) vatMinorByLine[vatRemainders[index].index] += 1;
  const applicableFees = [...input.fees].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
  const feeAmounts = applicableFees.map((fee) => {
    const value = fee.calculationType === "percentage" ? Math.round((discountedBaseMinor * percentageToBasisPoints(String(fee.value))) / 10_000) : moneyToMinor(Number(fee.value).toFixed(3));
    const quantity = fee.applicationBasis === "per_ticket" ? chargeableTicketCount : 1;
    return { fee, amountMinor: value * quantity, quantity };
  });
  const feeTotalMinor = feeAmounts.reduce((sum, entry) => sum + entry.amountMinor, 0);
  const perTicketFeeMinor = feeAmounts.filter((entry) => entry.fee.applicationBasis === "per_ticket").reduce((sum, entry) => sum + Math.round(entry.amountMinor / Math.max(1, chargeableTicketCount)), 0);
  const lines = input.lines.map((line, index) => {
    const unitMinor = moneyToMinor(String(line.price.unitPrice));
    const chargeable = isChargeableLine(line);
    const lineTotalMinor = unitMinor - discountMinorByLine[index] + vatMinorByLine[index] + (chargeable ? perTicketFeeMinor : 0);
    return {
      ticketTypeId: line.ticketTypeId, categoryId: line.categoryId, priceId: line.price.id,
      label: line.price.name, code: line.price.code, basePrice: minorToMoney(unitMinor),
      discountPercentage: discountPercentageForLine(line), discountAmount: minorToMoney(discountMinorByLine[index]), vatAmount: minorToMoney(vatMinorByLine[index]),
      feeAmount: minorToMoney(chargeable ? perTicketFeeMinor : 0), totalAmount: minorToMoney(lineTotalMinor),
    };
  });
  return {
    chargeableTicketCount, discountPercentage, baseSubtotal: minorToMoney(baseSubtotalMinor), discountAmount: minorToMoney(discountAmountMinor),
    vatAmount: minorToMoney(vatAmountMinor), feeTotal: minorToMoney(feeTotalMinor),
    totalAmount: minorToMoney(discountedBaseMinor + vatAmountMinor + feeTotalMinor),
    appliedTier: tier || null,
    lines,
    fees: feeAmounts.map(({ fee, amountMinor, quantity }) => ({ feeId: fee.id, label: fee.name, code: fee.code, calculationType: fee.calculationType, applicationBasis: fee.applicationBasis, value: String(fee.value), amount: minorToMoney(amountMinor), quantity })),
  };
}

// Plain, continuous, non-date-derived numbering (PRD §3.6) — no reset, no
// "MAS-" prefix, starting from the client's own previous numbering as given
// in both the PRD ("e.g. 17843") and the ticket mockup's example ticket.
// Shared by the real backend (server/ticketingDb.ts) and the backend-free
// local app (client/src/localApp/pricing.ts) so both issue identically
// formatted ticket numbers. The backend's starting point is seeded in
// drizzle/migrations/0008_add_prd_ticketing_model.sql (lastNumber =
// STARTING_TICKET_NUMBER - 1) and must be kept in sync with this constant.
export const STARTING_TICKET_NUMBER = 17843;

// Group Booking has no meaningful business limit on party size, but a single
// purchase inserts one row per ticket in one multi-row SQL statement
// (server/ticketingDb.ts's createPrdTicketPurchase) — mysql2's placeholder
// ceiling is 65535 and each ticket line binds 12 columns, so ~5461 rows is
// the hard technical wall. This stays comfortably under that while still
// being far beyond any real resort group (previously an arbitrary 500).
export const MAX_TICKETS_PER_PURCHASE = 2000;
export function formatPrdTicketNumber(sequenceNumber: number) {
  return String(sequenceNumber);
}

// PRD Section 2 (Events Hall Booking): a facility or add-on's rate times its
// quantity — hours, days, or people, depending on that item's own pricing
// method. "Fixed" pricing methods pass quantity 1 from the caller; the math
// is identical either way, only what "quantity" means to the user differs.
export function calculateFacilityLineAmount(rate: string, quantity: number) {
  if (!isPositiveMoney(rate)) throw new Error("Enter a positive OMR rate with up to three decimals");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be a positive number");
  return minorToMoney(Math.round(moneyToMinor(rate) * quantity));
}

// PRD Round 4, Section 5: a partner entity's per-facility discount rule
// applies only to the facility line itself, never to add-ons — the "Applies
// To" dropdown only ever offers "Ticket Type" or "Facility", not "Add-on".
export function applyFacilityDiscount(facilityAmount: string, discountPercentage: string | null | undefined) {
  if (!discountPercentage) return { discountedAmount: facilityAmount, discountAmount: "0.000" };
  const basisPoints = percentageToBasisPoints(discountPercentage);
  const fullMinor = moneyToMinor(facilityAmount);
  const discountMinor = Math.round((fullMinor * basisPoints) / 10_000);
  return { discountedAmount: minorToMoney(fullMinor - discountMinor), discountAmount: minorToMoney(discountMinor) };
}

export function calculateOperationalNet(revenue: number, expenses: number) {
  return Number(revenue) - Number(expenses);
}

export type TicketLifecycleStatus = "paid" | "voided" | "checked_in" | "expired";
export type GateDecision = { allowed: boolean; reason?: "voided" | "expired" | "already_checked_in" | "not_paid" };

export function extractTicketToken(value: string) {
  const candidate = value.trim();
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    const marker = "/ticket/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length).split("/")[0]);
  } catch {
    // The scanner may return the opaque token directly instead of a full URL.
  }
  return candidate.replace(/^.*\/ticket\//, "").split(/[?#/]/)[0];
}

export function decideGateEntry(status: TicketLifecycleStatus, visitDate: string, today: string): GateDecision {
  if (status === "voided") return { allowed: false, reason: "voided" };
  if (status === "checked_in") return { allowed: false, reason: "already_checked_in" };
  if (status === "expired" || visitDate < today) return { allowed: false, reason: "expired" };
  if (status !== "paid") return { allowed: false, reason: "not_paid" };
  if (visitDate > today) return { allowed: false, reason: "expired" };
  return { allowed: true };
}
