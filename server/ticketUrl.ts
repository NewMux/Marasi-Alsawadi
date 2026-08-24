import type { Request } from "express";
import { ENV } from "./_core/env";

export function publicTicketUrl(publicToken: string, baseUrl?: string) {
  const base = (baseUrl || ENV.publicAppUrl || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/ticket/${encodeURIComponent(publicToken)}`;
}

export function requestOrigin(req: Request) {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProto || req.protocol}://${req.get("host")}`;
}
