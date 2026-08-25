export function formatTicketNumber(ticketYear: number, sequenceNumber: number) {
  return `MAS-${ticketYear}-${String(sequenceNumber).padStart(6, "0")}`;
}

export function isPositiveMoney(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && /^\d+(\.\d{1,2})?$/.test(value);
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

export function moneyToMinor(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Enter an OMR amount with up to two decimals");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function minorToMoney(value: number) {
  if (!Number.isSafeInteger(value)) throw new Error("Money value exceeds the supported range");
  return (value / 100).toFixed(2);
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
      const fixedMinor = moneyToMinor(Number(fee.value).toFixed(2));
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
export type PrdFreeEntryCategory = "under_two" | "person_of_determination" | "senior";
export type PrdTicketType = "waterpark" | "companion";
export type PrdRateInput = { id: number; name: string; code: string; ticketType: PrdTicketType; unitPrice: string };
export type PrdDiscountTierInput = { id: number; minTickets: number; maxTickets: number | null; percentage: string };
export type PrdTicketLineInput = { rate: PrdRateInput; ticketType: PrdTicketType; freeEntryCategory?: PrdFreeEntryCategory | null };

function percentageToBasisPoints(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) < 0 || Number(value) > 100) throw new Error("Discount percentages must be between 0 and 100");
  return Math.round(Number(value) * 100);
}

export function calculatePrdPurchasePricing(input: {
  lines: PrdTicketLineInput[];
  discountTiers: PrdDiscountTierInput[];
  fees: TicketFeeInput[];
}) {
  if (!input.lines.length) throw new Error("Add at least one ticket line");
  const chargeableTicketCount = input.lines.filter((line) => !line.freeEntryCategory).length;
  const tier = [...input.discountTiers]
    .filter((candidate) => candidate.minTickets <= chargeableTicketCount && (candidate.maxTickets === null || candidate.maxTickets >= chargeableTicketCount))
    .sort((a, b) => b.minTickets - a.minTickets || b.id - a.id)[0];
  const discountBasisPoints = tier ? percentageToBasisPoints(String(tier.percentage)) : 0;
  const discountPercentage = (discountBasisPoints / 100).toFixed(2);
  const baseSubtotalMinor = input.lines.reduce((sum, line) => sum + (line.freeEntryCategory ? 0 : moneyToMinor(String(line.rate.unitPrice))), 0);
  const discountMinorByLine = input.lines.map((line) => line.freeEntryCategory ? 0 : Math.round((moneyToMinor(String(line.rate.unitPrice)) * discountBasisPoints) / 10_000));
  const discountAmountMinor = discountMinorByLine.reduce((sum, value) => sum + value, 0);
  const discountedBaseMinorByLine = input.lines.map((line, index) => line.freeEntryCategory ? 0 : moneyToMinor(String(line.rate.unitPrice)) - discountMinorByLine[index]);
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
    const value = fee.calculationType === "percentage" ? Math.round((discountedBaseMinor * percentageToBasisPoints(String(fee.value))) / 10_000) : moneyToMinor(Number(fee.value).toFixed(2));
    const quantity = fee.applicationBasis === "per_ticket" ? chargeableTicketCount : 1;
    return { fee, amountMinor: value * quantity, quantity };
  });
  const feeTotalMinor = feeAmounts.reduce((sum, entry) => sum + entry.amountMinor, 0);
  const perTicketFeeMinor = feeAmounts.filter((entry) => entry.fee.applicationBasis === "per_ticket").reduce((sum, entry) => sum + Math.round(entry.amountMinor / Math.max(1, chargeableTicketCount)), 0);
  const lines = input.lines.map((line, index) => {
    const unitMinor = moneyToMinor(String(line.rate.unitPrice));
    const lineTotalMinor = line.freeEntryCategory ? 0 : unitMinor - discountMinorByLine[index] + vatMinorByLine[index] + perTicketFeeMinor;
    return {
      ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory || null, rateId: line.rate.id,
      label: line.rate.name, code: line.rate.code, basePrice: minorToMoney(line.freeEntryCategory ? 0 : unitMinor),
      discountPercentage, discountAmount: minorToMoney(discountMinorByLine[index]), vatAmount: minorToMoney(vatMinorByLine[index]),
      feeAmount: minorToMoney(line.freeEntryCategory ? 0 : perTicketFeeMinor), totalAmount: minorToMoney(lineTotalMinor),
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
export function formatPrdTicketNumber(sequenceNumber: number) {
  return String(sequenceNumber);
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
