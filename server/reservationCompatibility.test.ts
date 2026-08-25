import { describe, expect, it } from "vitest";
import { buildReservationValues, hasReservationOverlap, isQaReservationRecord } from "./db";
import { createApp } from "./_core/index";
import { recordFromJoin } from "./routers/platform";

describe("reservation compatibility values", () => {
  it("maps the booking form contract to the live reservation table fields", () => {
    const values = buildReservationValues({
      guestId: 9, unitId: 4, checkIn: "2026-08-19", checkOut: "2026-08-21",
      adults: 2, children: 1, ratePerNight: "800", totalAmount: "1600",
      status: "confirmed", source: "direct", notes: "QA-only reservation", createdBy: 1,
    }, "chalet");

    expect(values).toMatchObject({
      kind: "chalet", guestId: 9, unitId: 4, adults: 2, children: 1,
      unitRate: "800.00", totalAmount: "1600.00", status: "confirmed", source: "walk_in",
      notes: "QA-only reservation",
    });
    expect(values.reference).toMatch(/^MAS-[A-Z0-9]+-[A-Z0-9]+$/);
    expect(values.checkInAt.toISOString()).toBe("2026-08-19T12:00:00.000Z");
    expect(values.checkOutAt.toISOString()).toBe("2026-08-21T12:00:00.000Z");
  });

  it("only treats explicitly labelled records as reusable QA reservations", () => {
    expect(isQaReservationRecord({ notes: "QA-only reservation" })).toBe(true);
    expect(isQaReservationRecord({ notes: null })).toBe(false);
  });

  it("blocks same-unit active stays that overlap and permits adjacent stays", () => {
    const active = [{ r: { unitId: 4, status: "confirmed", checkInAt: new Date("2026-08-20T12:00:00Z"), checkOutAt: new Date("2026-08-22T12:00:00Z") } }];
    expect(hasReservationOverlap(active, 4, "2026-08-21", "2026-08-23")).toBe(true);
    expect(hasReservationOverlap(active, 4, "2026-08-22", "2026-08-24")).toBe(false);
    expect(hasReservationOverlap(active, 4, "2026-08-22", "2026-08-22")).toBe(true);
  });

  it("unwraps each joined operational record shape used by QA idempotence checks", () => {
    expect(recordFromJoin({ r: { id: 1 } })).toEqual({ id: 1 });
    expect(recordFromJoin({ t: { title: "QA opening readiness walk" } })).toEqual({ title: "QA opening readiness walk" });
    expect(recordFromJoin({ s: { staffId: 3 } })).toEqual({ staffId: 3 });
  });

  it("creates an Express app without starting a listener for Vercel functions", () => {
    expect(typeof createApp).toBe("function");
    expect(typeof createApp()).toBe("function");
  });
});
