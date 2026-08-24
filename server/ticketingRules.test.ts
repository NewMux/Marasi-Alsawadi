import { describe, expect, it } from "vitest";
import { calculateOperationalNet, calculateTicketTotal, decideGateEntry, extractTicketToken, formatTicketNumber, isPositiveMoney } from "./ticketingRules";

describe("ticketing business rules", () => {
  it("formats a standard, year-based sequential transaction number", () => {
    expect(formatTicketNumber(2026, 7)).toBe("MAS-2026-000007");
    expect(formatTicketNumber(2027, 1)).toBe("MAS-2027-000001");
  });

  it("accepts only positive two-decimal monetary values and rounds sale totals", () => {
    expect(isPositiveMoney("18.50")).toBe(true);
    expect(isPositiveMoney("0")).toBe(false);
    expect(isPositiveMoney("-2")).toBe(false);
    expect(calculateTicketTotal("18.50", 3)).toBe(55.5);
    expect(() => calculateTicketTotal("0", 1)).toThrow("positive");
  });

  it("calculates the simple revenue-versus-expenses net result", () => {
    expect(calculateOperationalNet(1250.75, 499.2)).toBeCloseTo(751.55);
  });

  it("extracts an opaque token from either a full public URL or scanner text", () => {
    expect(extractTicketToken("https://erp.example.om/ticket/abc123?source=whatsapp")).toBe("abc123");
    expect(extractTicketToken("abc123")).toBe("abc123");
  });

  it("allows a paid ticket only on its visit date and denies reuse", () => {
    expect(decideGateEntry("paid", "2026-08-24", "2026-08-24")).toEqual({ allowed: true });
    expect(decideGateEntry("checked_in", "2026-08-24", "2026-08-24")).toEqual({ allowed: false, reason: "already_checked_in" });
    expect(decideGateEntry("paid", "2026-08-23", "2026-08-24")).toEqual({ allowed: false, reason: "expired" });
    expect(decideGateEntry("voided", "2026-08-24", "2026-08-24")).toEqual({ allowed: false, reason: "voided" });
  });
});
