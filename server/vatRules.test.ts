import { describe, expect, it } from "vitest";
import { netOfStoredVat, splitGrossVat } from "./ticketingRules";

// PRD Round 18, Section 8.1: VAT = round(gross - gross / 1.05, 3),
// NET = gross - VAT, so NET + VAT = GROSS on every line.
describe("splitGrossVat", () => {
  it("matches the PRD's examples", () => {
    expect(splitGrossVat("14.700", "5")).toEqual({ vatAmount: "0.700", netAmount: "14.000" });
    expect(splitGrossVat("91.575", "5")).toEqual({ vatAmount: "4.361", netAmount: "87.214" });
  });
  it("always adds back up to the gross amount", () => {
    for (const gross of ["0.001", "0.999", "3.150", "66.938", "105.000", "1234.567"]) {
      const { vatAmount, netAmount } = splitGrossVat(gross, "5");
      expect(Math.round((Number(vatAmount) + Number(netAmount)) * 1000)).toBe(Math.round(Number(gross) * 1000));
    }
  });
  it("carries no VAT at a zero rate", () => expect(splitGrossVat("10.000", "0")).toEqual({ vatAmount: "0.000", netAmount: "10.000" }));
});

describe("netOfStoredVat", () => {
  it("uses the VAT already stored on the sale", () => expect(netOfStoredVat("5.250", "0.250")).toEqual({ vatAmount: "0.250", netAmount: "5.000" }));
});

describe("VAT periods (Round 18, 8.5)", () => {
  it("uses calendar quarters by default", async () => {
    const { vatPeriodFor } = await import("./vat");
    expect(vatPeriodFor("2026-10-08", 1)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(vatPeriodFor("2027-02-28", 1)).toEqual({ from: "2027-01-01", to: "2027-03-31" });
  });
  it("follows a configured start month across the year end", async () => {
    const { vatPeriodFor } = await import("./vat");
    expect(vatPeriodFor("2026-10-08", 2)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
    expect(vatPeriodFor("2027-01-15", 2)).toEqual({ from: "2026-11-01", to: "2027-01-31" });
  });
  it("starts the first period on the VAT start date", async () => {
    const { listVatPeriodsBetween } = await import("./vat");
    const periods = listVatPeriodsBetween("2026-10-08", "2027-01-05", 1);
    expect(periods.map((period) => [period.from, period.to])).toEqual([["2027-01-01", "2027-03-31"], ["2026-10-08", "2026-12-31"]]);
  });
});
