import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { markWhatsAppWebhookEvent, updateWhatsAppStatus } from "./ticketingDb";
import { ENV } from "./_core/env";

const allowedStatuses = new Set(["sent", "delivered", "read", "failed"] as const);
type WhatsAppStatus = "sent" | "delivered" | "read" | "failed";

type StatusEvent = {
  id: string;
  status: WhatsAppStatus;
  errorMessage?: string;
  timestamp?: string;
};

export function isWhatsAppConfigured() {
  return Boolean(ENV.whatsappAccessToken && ENV.whatsappPhoneNumberId && ENV.whatsappAppSecret);
}

export function publicTicketUrl(publicToken: string, baseUrl?: string) {
  const base = (baseUrl || ENV.publicAppUrl || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/ticket/${encodeURIComponent(publicToken)}`;
}

export function requestOrigin(req: Request) {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProto || req.protocol}://${req.get("host")}`;
}

function normalizePhone(phone: string) {
  return phone.replace(/[^0-9]/g, "");
}

export async function sendWhatsAppTicket(input: {
  phone: string;
  customerName: string;
  ticketNumber: string;
  visitDate: string;
  publicToken: string;
  publicUrl?: string;
  templateName?: string;
}) {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp is not configured. Add the WhatsApp Cloud API credentials before sending messages.");
  }

  const templateName = input.templateName || ENV.whatsappTemplateName || "marasi_ticket";
  const response = await fetch(`https://graph.facebook.com/${ENV.whatsappGraphVersion}/${ENV.whatsappPhoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.whatsappAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizePhone(input.phone),
      type: "template",
      template: {
        name: templateName,
        language: { code: ENV.whatsappTemplateLanguage },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: input.customerName },
            { type: "text", text: input.ticketNumber },
            { type: "text", text: input.visitDate },
            { type: "text", text: input.publicUrl || publicTicketUrl(input.publicToken) },
          ],
        }],
      },
    }),
  });

  const body = await response.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(body.error?.message || `WhatsApp request failed with status ${response.status}`);
  }
  const providerMessageId = body.messages?.[0]?.id;
  if (!providerMessageId) throw new Error("WhatsApp accepted no message identifier");
  return { provider: "meta", providerMessageId, templateName } as const;
}

function rawRequestBody(req: Request) {
  return (req as Request & { rawBody?: Buffer }).rawBody;
}

function verifySignature(req: Request) {
  if (!ENV.whatsappAppSecret) return false;
  const signature = req.header("x-hub-signature-256");
  const rawBody = rawRequestBody(req);
  if (!signature || !rawBody) return false;
  const expected = `sha256=${createHmac("sha256", ENV.whatsappAppSecret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function statusEvents(payload: any): StatusEvent[] {
  const statuses = payload?.entry?.flatMap((entry: any) => entry?.changes?.flatMap((change: any) => change?.value?.statuses || []) || []) || [];
  return statuses.flatMap((status: any) => {
    if (!status?.id || !allowedStatuses.has(status.status)) return [];
    const error = status.errors?.[0];
    return [{
      id: String(status.id),
      status: status.status as WhatsAppStatus,
      timestamp: status.timestamp ? String(status.timestamp) : undefined,
      errorMessage: error?.title || error?.message,
    }];
  });
}

export async function processWhatsAppWebhook(payload: unknown) {
  const events = statusEvents(payload);
  let processed = 0;
  for (const event of events) {
    const payloadText = JSON.stringify({ event, payload });
    const eventKey = createHash("sha256").update(payloadText).digest("hex");
    const accepted = await markWhatsAppWebhookEvent(eventKey, payloadText);
    if (!accepted) continue;
    await updateWhatsAppStatus(event.id, event.status, event.errorMessage);
    processed += 1;
  }
  return { received: events.length, processed };
}

export function registerWhatsAppRoutes(app: Express) {
  app.get("/api/whatsapp/webhook", (req: Request, res: Response) => {
    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");
    if (mode === "subscribe" && ENV.whatsappVerifyToken && token === ENV.whatsappVerifyToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Webhook verification failed");
  });

  app.post("/api/whatsapp/webhook", async (req: Request, res: Response) => {
    if (!verifySignature(req)) return res.status(401).send("Invalid webhook signature");
    try {
      const result = await processWhatsAppWebhook(req.body);
      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      console.error("[WhatsApp] Webhook processing failed", error);
      return res.status(500).json({ ok: false });
    }
  });
}
