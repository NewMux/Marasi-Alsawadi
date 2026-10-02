import { describe, expect, it } from "vitest";
import { businessToday } from "./ticketingDb";

// Round 16 follow-up: a balance payment's settlement date is the resort's
// own calendar day (Oman, UTC+4), not the server's UTC date.
describe("businessToday", () => {
  it("uses Oman time, so a payment just after midnight belongs to the new day", () => {
    expect(businessToday(new Date("2026-08-31T20:30:00Z"))).toBe("2026-09-01");
  });
  it("matches the UTC date during the Oman business day", () => {
    expect(businessToday(new Date("2026-08-31T08:00:00Z"))).toBe("2026-08-31");
  });
});
