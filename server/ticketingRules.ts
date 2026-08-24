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
  return Math.round(Number(unitPrice) * quantity * 100) / 100;
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
