import { describe, expect, it } from "vitest";
import { isPositiveOmrRate, normalizeRateCode } from "./rateCatalogRules";

describe("Oman rate catalog rules", () => {
  it("normalizes staff-entered rate codes", () => {
    expect(normalizeRateCode("  aqua adult  ")).toBe("AQUA-ADULT");
  });

  it("accepts positive OMR money values up to two decimals", () => {
    expect(isPositiveOmrRate("12")).toBe(true);
    expect(isPositiveOmrRate("12.50")).toBe(true);
    expect(isPositiveOmrRate("0")).toBe(false);
    expect(isPositiveOmrRate("12.345")).toBe(false);
  });
});
