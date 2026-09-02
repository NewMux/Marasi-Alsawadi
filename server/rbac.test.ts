import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const request = { ip: "127.0.0.1", headers: {} } as any;
const response = {} as any;
const callerFor = (user: any) => appRouter.createCaller({ req: request, res: response, user });

const staff = { id: 1, role: "staff", name: "Cashier", passwordHash: null };
const manager = { id: 2, role: "manager", name: "Manager", passwordHash: null };
const admin = { id: 3, role: "admin", name: "Admin", passwordHash: null };
const guard = { id: 4, role: "guard", name: "Guard", passwordHash: null };

const rateInput = { name: "Adult pass", code: "ADULT", department: "aqua_park" as const, unitPrice: "5.00" };
const feeInput = { name: "Municipality", code: "MUNI", calculationType: "fixed" as const, value: "0.50", applicationBasis: "per_transaction" as const, appliesGlobally: true, displayOrder: 1, rateIds: [] };
const categoryInput = { name: "Utilities", code: "UTIL" };

async function expectForbidden(action: Promise<unknown>) {
  await expect(action).rejects.toMatchObject({ code: "FORBIDDEN" });
}

describe("Super Admin configuration boundary", () => {
  it("denies price, fee, category, and account mutations to non-Super Admin roles", async () => {
    for (const user of [staff, manager, admin, guard]) {
      const caller = callerFor(user);
      await expectForbidden(caller.platform.rates.create(rateInput));
      await expectForbidden(caller.platform.fees.create(feeInput));
      await expectForbidden(caller.platform.finance.expenseCategories.create(categoryInput));
      await expectForbidden(caller.platform.admin.listUsers());
    }
  });

  it("allows a Super Admin to reach the account settings procedure", async () => {
    const caller = callerFor({ id: 9, role: "super_admin", name: "Owner", passwordHash: null });
    await expect(caller.platform.admin.listUsers()).resolves.toEqual([]);
  });

  it("denies protected operating APIs without a session", async () => {
    const caller = callerFor(null);
    await expect(caller.platform.tickets.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.platform.finance.expenseCategories.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("Petty cash custodian boundary", () => {
  const custodian = { id: 5, role: "petty_cash", name: "Custodian", passwordHash: null };

  it("denies a petty cash custodian from manager-only fund actions", async () => {
    const caller = callerFor(custodian);
    await expectForbidden(caller.platform.finance.pettyCashFunds.list());
    await expectForbidden(caller.platform.finance.pettyCashFunds.createCustodian({ username: "new", name: "New Person", temporaryPassword: "temporary-password-123", fixedAmount: "50.000" }));
    await expectForbidden(caller.platform.finance.pettyCashFunds.updateAmount({ id: 1, fixedAmount: "999.000" }));
  });

  it("denies non-custodian roles from logging petty cash spending", async () => {
    for (const user of [staff, manager, admin, guard]) {
      const caller = callerFor(user);
      await expectForbidden(caller.platform.finance.pettyCashFunds.spend({ businessDate: "2026-01-01", amount: "5.000", description: "Test" }));
    }
  });

  it("returns null/empty for a custodian's own fund query rather than another account's data", async () => {
    const caller = callerFor(staff);
    await expect(caller.platform.finance.pettyCashFunds.mine()).resolves.toBeNull();
    await expect(caller.platform.finance.pettyCashFunds.mineSpends()).resolves.toEqual([]);
  });
});
