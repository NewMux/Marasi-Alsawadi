import { describe, expect, it } from "vitest";
import { firstMissingDemoField } from "./demoWorkflowRules";

describe("public demo workflow validation", () => {
  it("blocks an employee record with no name", () => {
    expect(firstMissingDemoField([["Employee name", ""], ["Role", "Front Desk Associate"]])).toBe("Employee name is required.");
  });

  it("blocks an employee record with no role", () => {
    expect(firstMissingDemoField([["Employee name", "Hamed Al-Balushi"], ["Role", "  "]])).toBe("Role is required.");
  });

  it("allows a complete browser-local employee record", () => {
    expect(firstMissingDemoField([["Employee name", "Hamed Al-Balushi"], ["Role", "Front Desk Associate"]])).toBeNull();
  });
});
