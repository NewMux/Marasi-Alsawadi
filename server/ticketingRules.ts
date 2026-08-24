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
