import { describe, expect, it } from "vitest";
import { isValidDateRange } from "./db";

describe("lightweight HR controls", () => {
  it("accepts a same-day or forward leave range and rejects a reversed one", () => {
    expect(isValidDateRange("2026-08-19", "2026-08-19")).toBe(true);
    expect(isValidDateRange("2026-08-19", "2026-08-22")).toBe(true);
    expect(isValidDateRange("2026-08-22", "2026-08-19")).toBe(false);
  });
});
