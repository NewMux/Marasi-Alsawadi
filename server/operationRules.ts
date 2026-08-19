export function remainingAquaCapacity(maxCapacity: number, bookedQuantity: number) {
  return Math.max(0, maxCapacity - bookedQuantity);
}

export function canIssueAquaTickets(maxCapacity: number, bookedQuantity: number, requestedQuantity: number) {
  return requestedQuantity <= remainingAquaCapacity(maxCapacity, bookedQuantity);
}

export function housekeepingRoomLabel(entry: { u?: { code?: string | null; name?: string | null } | null }) {
  const code = entry.u?.code?.trim();
  const name = entry.u?.name?.trim();
  return code && name ? `${code} — ${name}` : code ?? name ?? "Unassigned room";
}
