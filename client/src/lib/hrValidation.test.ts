import { describe, expect, it } from "vitest";
import { missingStaffMessage, runAttendanceStaffAction, runLeaveStaffAction } from "./hrValidation";

describe("missingStaffMessage", () => {
  it("requires a staff member before a Simple HR workflow can continue", () => {
    expect(missingStaffMessage("")).toBe("Select a staff member before continuing");
  });

  it("allows a selected staff member to proceed", () => {
    expect(missingStaffMessage("42")).toBeNull();
  });

  it("blocks an attendance mutation until a staff member is selected", () => {
    let calls = 0;
    expect(runAttendanceStaffAction("", () => { calls += 1; })).toBe("Select a staff member before continuing");
    expect(calls).toBe(0);
    expect(runAttendanceStaffAction("42", () => { calls += 1; })).toBeNull();
    expect(calls).toBe(1);
  });

  it("blocks a leave mutation until a staff member is selected", () => {
    let calls = 0;
    expect(runLeaveStaffAction("", () => { calls += 1; })).toBe("Select a staff member before continuing");
    expect(calls).toBe(0);
    expect(runLeaveStaffAction("42", () => { calls += 1; })).toBeNull();
    expect(calls).toBe(1);
  });
});
