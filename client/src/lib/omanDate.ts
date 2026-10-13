// PRD Round 18, item 5.1: the resort's commercial day is the calendar day in
// Oman (Asia/Muscat, UTC+4), starting at local midnight. A browser in another
// timezone — or `new Date().toISOString()`, which is UTC — would put a sale
// made between 00:00 and 04:00 Oman time on the previous day.
export const RESORT_TIME_ZONE = "Asia/Muscat";

export function omanToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: RESORT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// First day of the current month in Oman time, "YYYY-MM-01".
export function omanMonthStart(now = new Date()) {
  return `${omanToday(now).slice(0, 8)}01`;
}
