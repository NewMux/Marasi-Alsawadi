import { describe, expect, it } from "vitest";
import { bankFractionOf } from "./ticketingDb";

// PRD Round 17, item 5.1: card and bank transfer post to the Bank Account,
// cash to the Cash Account, and a mixed payment by its recorded split.
describe("bankFractionOf", () => {
  const base = { totalAmount: "10.000", cashAmount: null, cardAmount: null, bankAmount: null };
  it("posts cash entirely to the Cash Account", () => expect(bankFractionOf({ ...base, paymentMethod: "cash" })).toBe(0));
  it("posts card and bank transfer entirely to the Bank Account", () => {
    expect(bankFractionOf({ ...base, paymentMethod: "card" })).toBe(1);
    expect(bankFractionOf({ ...base, paymentMethod: "bank" })).toBe(1);
  });
  it("splits a mixed payment by its card + bank share", () => {
    expect(bankFractionOf({ paymentMethod: "mixed", totalAmount: "5.250", cashAmount: "2.000", cardAmount: "1.000", bankAmount: "2.250" })).toBeCloseTo(3.25 / 5.25, 10);
  });
  it("treats an unknown source as cash", () => expect(bankFractionOf(undefined)).toBe(0));
});
