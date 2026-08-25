import { describe, expect, it } from "vitest";
import { calculateOperationalNet, calculatePrdPurchasePricing, calculateTicketPricing, calculateTicketTotal, decideGateEntry, extractTicketToken, formatTicketNumber, isPositiveMoney } from "./ticketingRules";

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

  it("creates an itemized, decimal-safe total from base price and configurable fees", () => {
    const pricing = calculateTicketPricing({
      unitPrice: "10.00", quantity: 3, rateName: "Aqua day pass", rateCode: "AQUA-DAY",
      fees: [
        { id: 2, name: "Municipality", code: "MUNI", calculationType: "percentage", value: "5.0000", applicationBasis: "per_transaction", displayOrder: 20 },
        { id: 1, name: "Wristband", code: "WRIST", calculationType: "fixed", value: "0.5000", applicationBasis: "per_ticket", displayOrder: 10 },
        { id: 3, name: "Booking fee", code: "BOOK", calculationType: "fixed", value: "1.0000", applicationBasis: "per_transaction", displayOrder: 30 },
      ],
    });
    expect(pricing).toMatchObject({ baseSubtotal: "30.00", feeTotal: "4.00", totalAmount: "34.00" });
    expect(pricing.lines.map((line) => [line.code, line.quantity, line.lineAmount])).toEqual([
      ["AQUA-DAY", 3, "30.00"], ["WRIST", 3, "1.50"], ["MUNI", 1, "1.50"], ["BOOK", 1, "1.00"],
    ]);
  });

  it("rounds percentage fees to the nearest OMR baisa without floating-point drift", () => {
    const pricing = calculateTicketPricing({
      unitPrice: "0.10", quantity: 3, rateName: "Test", rateCode: "TEST",
      fees: [{ id: 1, name: "Five percent", code: "P5", calculationType: "percentage", value: "5", applicationBasis: "per_transaction", displayOrder: 1 }],
    });
    expect(pricing.baseSubtotal).toBe("0.30");
    expect(pricing.feeTotal).toBe("0.02");
    expect(pricing.totalAmount).toBe("0.32");
  });

  it("applies group discount to chargeable lines, excludes free entry, then calculates 5% VAT", () => {
    const pricing = calculatePrdPurchasePricing({
      lines: [
        { rate: { id: 1, name: "Waterpark", code: "WATERPARK", ticketType: "waterpark", unitPrice: "10.00" }, ticketType: "waterpark" },
        { rate: { id: 1, name: "Waterpark", code: "WATERPARK", ticketType: "waterpark", unitPrice: "10.00" }, ticketType: "waterpark" },
        { rate: { id: 2, name: "Companion", code: "COMPANION", ticketType: "companion", unitPrice: "4.00" }, ticketType: "companion" },
        { rate: { id: 1, name: "Waterpark", code: "WATERPARK", ticketType: "waterpark", unitPrice: "10.00" }, ticketType: "waterpark", freeEntryCategory: "under_two" },
      ],
      discountTiers: [{ id: 1, minTickets: 3, maxTickets: null, percentage: "10.00" }], fees: [],
    });
    expect(pricing.chargeableTicketCount).toBe(3);
    expect(pricing.discountPercentage).toBe("10.00");
    expect(pricing.baseSubtotal).toBe("24.00");
    expect(pricing.discountAmount).toBe("2.40");
    expect(pricing.vatAmount).toBe("1.08");
    expect(pricing.feeTotal).toBe("0.00");
    expect(pricing.totalAmount).toBe("22.68");
    expect(pricing.lines[3].totalAmount).toBe("0.00");
  });

  it("does not apply the discount tier when only free-entry lines exist", () => {
    const pricing = calculatePrdPurchasePricing({
      lines: [{ rate: { id: 1, name: "Waterpark", code: "WATERPARK", ticketType: "waterpark", unitPrice: "10.00" }, ticketType: "waterpark", freeEntryCategory: "senior" }],
      discountTiers: [{ id: 1, minTickets: 1, maxTickets: null, percentage: "50.00" }], fees: [],
    });
    expect(pricing.chargeableTicketCount).toBe(0);
    expect(pricing.discountPercentage).toBe("0.00");
    expect(pricing.totalAmount).toBe("0.00");
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
