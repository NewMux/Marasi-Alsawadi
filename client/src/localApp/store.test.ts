import { beforeEach, describe, expect, it } from "vitest";
import { STARTING_TICKET_NUMBER } from "./pricing";
import {
  addDiscountTier, addExpense, addExpenseCategory, addFee, addRate, getSnapshot,
  issuePurchase, previewPurchase, removeExpense, resetStore, updateRate,
} from "./store";

describe("local app store", () => {
  beforeEach(() => resetStore());

  it("seeds the PRD default catalog on first run", () => {
    const state = getSnapshot();
    expect(state.rates.map((rate) => [rate.code, rate.unitPrice])).toEqual([["WATERPARK", "3.00"], ["COMPANION", "2.00"]]);
    expect(state.discountTiers.map((tier) => [tier.minTickets, tier.maxTickets, tier.percentage])).toEqual([
      [25, 29, "15.00"], [50, 99, "25.00"], [100, null, "50.00"],
    ]);
    expect(state.customers).toEqual([]);
    expect(state.purchases).toEqual([]);
    expect(state.nextTicketNumber).toBe(STARTING_TICKET_NUMBER);
  });

  it("seeds the client's accounting-sheet expense categories on first run", () => {
    const codes = getSnapshot().expenseCategories.map((category) => category.code);
    expect(codes).toEqual([
      "SALARIES", "UTILITIES", "MAINTENANCE", "COGS", "ADVERTISING_MARKETING",
      "OFFICE_SUPPLIES", "FIXTURE_FURNITURE", "TAX_VAT", "PETTY_CASH", "OTHER_EXPENSES",
    ]);
    expect(getSnapshot().expenseCategories.every((category) => category.active)).toBe(true);
  });

  it("issues a purchase using the real PRD pricing engine (free entry, discount, VAT)", () => {
    const waterpark = getSnapshot().rates.find((rate) => rate.code === "WATERPARK")!;
    const companion = getSnapshot().rates.find((rate) => rate.code === "COMPANION")!;
    // 25 chargeable waterpark tickets (hits the 25-29 -> 15% tier) plus one free-entry line.
    const lines = [
      ...Array.from({ length: 25 }, () => ({ rateId: waterpark.id, ticketType: "waterpark" as const, freeEntryCategory: null })),
      { rateId: companion.id, ticketType: "companion" as const, freeEntryCategory: "senior" as const },
    ];
    const preview = previewPurchase(lines)!;
    expect(preview.chargeableTicketCount).toBe(25);
    expect(preview.discountPercentage).toBe("15.00");
    expect(preview.baseSubtotal).toBe("75.00"); // 25 x 3.00
    expect(preview.discountAmount).toBe("11.25"); // 15% of 75.00
    expect(preview.vatAmount).toBe("3.19"); // 5% of (75.00 - 11.25) = 63.75, rounded
    expect(preview.totalAmount).toBe("66.94");

    const result = issuePurchase({ customerName: "Layla Al-Hinai", customerPhone: "+968 9214 7781", visitDate: "2026-08-25", lines, paymentMethod: "cash" });
    expect(result.customer).toMatchObject({ fullName: "Layla Al-Hinai", phone: "+968 9214 7781" });
    expect(result.purchase.lines).toHaveLength(26);
    expect(result.purchase.lines[25].freeEntryCategory).toBe("senior");
    expect(result.purchase.lines[25].totalAmount).toBe("0.00");
    expect(result.purchase.totalAmount).toBe("66.94");
  });

  it("allocates continuous, non-date ticket numbers across separate purchases", () => {
    const waterpark = getSnapshot().rates.find((rate) => rate.code === "WATERPARK")!;
    const first = issuePurchase({ customerName: "A", customerPhone: "1", visitDate: "2026-08-25", lines: [{ rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }], paymentMethod: "cash" });
    const second = issuePurchase({ customerName: "B", customerPhone: "2", visitDate: "2026-08-25", lines: [{ rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }, { rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }], paymentMethod: "cash" });
    expect(first.purchase.lines[0].ticketNumber).toBe(String(STARTING_TICKET_NUMBER));
    expect(second.purchase.lines.map((line) => line.ticketNumber)).toEqual([String(STARTING_TICKET_NUMBER + 1), String(STARTING_TICKET_NUMBER + 2)]);
    expect(first.purchase.lines[0].ticketNumber).not.toMatch(/2026/); // must not embed the visit date/year
  });

  it("reuses an existing customer instead of creating a duplicate", () => {
    const waterpark = getSnapshot().rates.find((rate) => rate.code === "WATERPARK")!;
    const first = issuePurchase({ customerName: "Sami Al-Balushi", customerPhone: "+968 9077 2654", visitDate: "2026-08-25", lines: [{ rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }], paymentMethod: "cash" });
    expect(first.customer.fullName).toBe("Sami Al-Balushi");
    expect(first.customer.phone).toBe("+968 9077 2654");
    const second = issuePurchase({ customerId: first.customer.id, visitDate: "2026-08-26", lines: [{ rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }], paymentMethod: "card" });
    expect(second.customer.id).toBe(first.customer.id);
    expect(getSnapshot().customers).toHaveLength(1);
  });

  it("rejects issuing a purchase against a retired price", () => {
    const waterpark = getSnapshot().rates.find((rate) => rate.code === "WATERPARK")!;
    updateRate(waterpark.id, { active: false });
    expect(previewPurchase([{ rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }])).toBeNull();
  });

  it("manages expense categories and expense records", () => {
    const category = addExpenseCategory({ name: "Pool chemicals", code: "POOL" });
    const expense = addExpense({ businessDate: "2026-08-25", categoryId: category.id, amount: "85.00", description: "Chlorine" });
    expect(getSnapshot().expenses).toContainEqual(expect.objectContaining({ id: expense.id, categoryName: "Pool chemicals" }));
    removeExpense(expense.id);
    expect(getSnapshot().expenses).toHaveLength(0);
  });

  it("records the receipt number and attachment on an expense entry", () => {
    const category = addExpenseCategory({ name: "Pool chemicals", code: "POOL" });
    const expense = addExpense({
      businessDate: "2026-08-25", categoryId: category.id, amount: "85.00", description: "Chlorine",
      receiptNumber: "RCPT-0042", attachmentDataUrl: "data:image/png;base64,abc123", attachmentName: "receipt.png",
    });
    expect(getSnapshot().expenses).toContainEqual(expect.objectContaining({
      id: expense.id, receiptNumber: "RCPT-0042", attachmentDataUrl: "data:image/png;base64,abc123", attachmentName: "receipt.png",
    }));
  });

  it("stores the customer's email alongside name and phone when issuing a ticket", () => {
    const waterpark = getSnapshot().rates.find((rate) => rate.code === "WATERPARK")!;
    const result = issuePurchase({
      customerName: "Fatma Al-Kindi", customerPhone: "+968 9911 2233", customerEmail: "fatma@example.com",
      visitDate: "2026-08-25", lines: [{ rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }], paymentMethod: "cash",
    });
    expect(result.customer).toMatchObject({ fullName: "Fatma Al-Kindi", phone: "+968 9911 2233", email: "fatma@example.com" });
  });

  it("supports adding custom prices and fee items beyond the PRD defaults", () => {
    const rate = addRate({ name: "Family group pass", code: "FAMILY", ticketType: "waterpark", unitPrice: "8.00" });
    const fee = addFee({ name: "Municipality fee", code: "MUNI", calculationType: "percentage", value: "2", applicationBasis: "per_transaction", displayOrder: 0 });
    const preview = previewPurchase([{ rateId: rate.id, ticketType: "waterpark", freeEntryCategory: null }])!;
    expect(preview.fees[0]).toMatchObject({ feeId: fee.id, label: "Municipality fee" });
  });

  it("applies no group discount below the lowest tier's ticket count", () => {
    const waterpark = getSnapshot().rates.find((rate) => rate.code === "WATERPARK")!;
    const preview = previewPurchase([{ rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }])!;
    expect(preview.discountPercentage).toBe("0.00");
  });

  it("lets a Super Admin add a custom discount tier that then applies", () => {
    const waterpark = getSnapshot().rates.find((rate) => rate.code === "WATERPARK")!;
    addDiscountTier({ minTickets: 1, maxTickets: 4, percentage: "5.00" });
    const preview = previewPurchase([{ rateId: waterpark.id, ticketType: "waterpark", freeEntryCategory: null }])!;
    expect(preview.discountPercentage).toBe("5.00");
  });
});
