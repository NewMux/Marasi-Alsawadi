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
