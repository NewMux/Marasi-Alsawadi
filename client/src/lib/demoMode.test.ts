import { describe, expect, it } from "vitest";
import { isDemoHostname, isDemoPreviewSearch } from "./demoMode";

describe("public demo host detection", () => {
  it("enables the no-authentication presentation mode only for Vercel deployment hosts", () => {
    expect(isDemoHostname("marasi-alsawadi-platform.vercel.app")).toBe(true);
    expect(isDemoHostname("3000-preview.manus.computer")).toBe(false);
    expect(isDemoHostname("marasi-alsawadi.example.com")).toBe(false);
  });

  it("enables the explicit local preview only for demo=1", () => {
    expect(isDemoPreviewSearch("?demo=1")).toBe(true);
    expect(isDemoPreviewSearch("?demo=0")).toBe(false);
    expect(isDemoPreviewSearch("?view=demo")).toBe(false);
  });
});
