import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const request = { ip: "127.0.0.1", headers: {} } as any;
const response = {} as any;
const callerFor = (user: any) => appRouter.createCaller({ req: request, res: response, user });

const staff = { id: 1, role: "staff", name: "Cashier", passwordHash: null };
const manager = { id: 2, role: "manager", name: "Manager", passwordHash: null };
const admin = { id: 3, role: "admin", name: "Admin", passwordHash: null };
const guard = { id: 4, role: "guard", name: "Guard", passwordHash: null };
const cashier = { id: 6, role: "cashier", name: "Cashier", passwordHash: null };

const ticketTypeInput = { name: "Festival Entry", code: "FESTIVAL", ticketGroup: "other_tickets" as const };
const feeInput = { name: "Municipality", code: "MUNI", calculationType: "fixed" as const, value: "0.50", applicationBasis: "per_transaction" as const, appliesGlobally: true, displayOrder: 1, ticketTypeIds: [] };
const categoryInput = { name: "Utilities", code: "UTIL" };

async function expectForbidden(action: Promise<unknown>) {
  await expect(action).rejects.toMatchObject({ code: "FORBIDDEN" });
}

describe("Commercial Settings configuration boundary", () => {
  // PRD Round 16, item 12: Admin Operations now reaches Commercial Settings
  // too; every other non-Super-Admin role is still kept out.
  it("denies price, fee, category, and account mutations to roles below Admin Operations", async () => {
    for (const user of [staff, manager, guard, cashier]) {
      const caller = callerFor(user);
      await expectForbidden(caller.platform.ticketTypes.create(ticketTypeInput));
      await expectForbidden(caller.platform.fees.create(feeInput));
      await expectForbidden(caller.platform.finance.expenseCategories.create(categoryInput));
      await expectForbidden(caller.platform.admin.listUsers());
    }
  });

  it("keeps Audit Activity and the Danger Zone reset Super-Admin-only, even for Admin Operations", async () => {
    const caller = callerFor(admin);
    await expectForbidden(caller.platform.admin.activityLog({ limit: 10 }));
    await expectForbidden(caller.platform.settings.systemReset.get());
    await expectForbidden(caller.platform.settings.systemReset.execute({ confirmationPhrase: "RESET" }));
  });

  // PRD Round 17, item 5.4: restore requests are Super-Admin-only to file,
  // and only NewMux support accounts may change their status — never the
  // client's own Super Admin.
  it("keeps Backup & Restore requests to Super Admins and status changes to NewMux support", async () => {
    for (const user of [staff, manager, admin, guard, cashier]) {
      const caller = callerFor(user);
      await expectForbidden(caller.platform.settings.dataRestore.list());
      await expectForbidden(caller.platform.settings.dataRestore.create({ restorePoint: "2026-01-01T09:00", reason: "Wrong records deleted" }));
    }
    const clientSuperAdmin = callerFor({ id: 7, role: "super_admin", name: "Owner", username: "owner", passwordHash: null });
    await expectForbidden(clientSuperAdmin.platform.settings.dataRestore.updateStatus({ id: 1, status: "completed" }));
  });

  it("never lets Admin Operations create a Super Admin account", async () => {
    const caller = callerFor(admin);
    await expectForbidden(caller.platform.admin.createUser({ username: "owner2", name: "Second Owner", role: "super_admin", temporaryPassword: "temporary-password-123" }));
  });

  it("keeps a Cashier out of Finance Control", async () => {
    const caller = callerFor(cashier);
    await expectForbidden(caller.platform.finance.expenses.list());
    await expectForbidden(caller.platform.finance.revenues.list());
    await expectForbidden(caller.platform.finance.payables());
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
    for (const user of [staff, manager, admin, guard, cashier]) {
      const caller = callerFor(user);
      await expectForbidden(caller.platform.finance.pettyCashFunds.spend({ businessDate: "2026-01-01", amount: "5.000", description: "Test" }));
    }
  });

  it("returns null/empty for a custodian's own fund query rather than another account's data", async () => {
    const caller = callerFor(staff);
    await expect(caller.platform.finance.pettyCashFunds.mine()).resolves.toBeNull();
    await expect(caller.platform.finance.pettyCashFunds.mineSpends()).resolves.toEqual([]);
  });

  // PRD Section 3 limited petty cash top-ups to the Super Admin; Round 16
  // (item 12) extends that to Admin Operations, but a manager (allowed to
  // view the funds list) still can't create a custodian or change its amount.
  it("denies managers from creating custodians or changing their fixed amount", async () => {
    for (const user of [manager]) {
      const caller = callerFor(user);
      await expectForbidden(caller.platform.finance.pettyCashFunds.createCustodian({ username: "new2", name: "New Person Two", temporaryPassword: "temporary-password-123", fixedAmount: "50.000" }));
      await expectForbidden(caller.platform.finance.pettyCashFunds.updateAmount({ id: 1, fixedAmount: "999.000" }));
    }
  });
});
