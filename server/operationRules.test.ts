import { describe, expect, it } from "vitest";
import { settlementVariance } from "./db";
import { canIssueAquaTickets, housekeepingRoomLabel, remainingAquaCapacity } from "./operationRules";

describe("resort operational safeguards", () => {
  it("rejects Aqua Park issuance that exceeds the server-calculated remaining capacity", () => {
    expect(remainingAquaCapacity(150, 149)).toBe(1);
    expect(canIssueAquaTickets(150, 149, 1)).toBe(true);
    expect(canIssueAquaTickets(150, 149, 2)).toBe(false);
  });

  it("retains the property code and name on a joined housekeeping task", () => {
    expect(housekeepingRoomLabel({ u: { code: "QA-101", name: "QA Garden Room" } })).toBe("QA-101 — QA Garden Room");
    expect(housekeepingRoomLabel({ u: null })).toBe("Unassigned room");
  });

  it("calculates the net tender variance used for manager settlement review", () => {
    expect(settlementVariance({ expectedAmount: "100", cashAmount: "40", bankAmount: "35", cardAmount: "30", bankCharges: "2" })).toBe(3);
  });
});
