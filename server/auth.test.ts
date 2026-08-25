import { describe, expect, it } from "vitest";
import { hashPassword, hashSessionToken, publicUser, verifyPassword } from "./auth";

describe("local authentication primitives", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const encoded = await hashPassword("Correct-Horse-Battery-2026");
    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain("Correct-Horse-Battery-2026");
    await expect(verifyPassword("Correct-Horse-Battery-2026", encoded)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", encoded)).resolves.toBe(false);
  });

  it("hashes session tokens deterministically without exposing the token", () => {
    const token = "private-session-token";
    const hash = hashSessionToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashSessionToken(token));
    expect(hash).not.toContain(token);
  });

  it("removes password hashes from client-facing user records", () => {
    const safe = publicUser({
      id: 1, openId: "local:owner", username: "owner", passwordHash: "secret",
      mustChangePassword: false, isActive: true, name: "Owner", email: null,
      loginMethod: "local", role: "super_admin", createdAt: new Date(),
      updatedAt: new Date(), lastSignedIn: new Date(),
    });
    expect(safe).not.toHaveProperty("passwordHash");
    expect(safe?.role).toBe("super_admin");
  });
});
