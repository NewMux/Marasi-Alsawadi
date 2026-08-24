import { describe, expect, it } from "vitest";
import { createApp } from "./_core/index";

describe("production health endpoint", () => {
  it("registers the health endpoint without starting a listener", () => {
    const app = createApp();
    const healthRoute = (app as any)._router.stack.find((layer: any) => layer.route?.path === "/healthz");

    expect(healthRoute?.route?.methods?.get).toBe(true);
  });
});
