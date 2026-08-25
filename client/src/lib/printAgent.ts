import { renderTicketReceiptHtml } from "@/components/ticketReceiptHtml";
import type { TicketReceiptData } from "@/components/TicketReceipt";

// The local print agent (see /print-agent in the repo) runs on the same PC
// as the browser and listens on localhost only — that's what lets an HTTPS
// page call it without a mixed-content block. If nothing is listening (the
// agent isn't installed/running yet), this fails fast and the caller should
// fall back to window.print().
const AGENT_URL = "http://127.0.0.1:7777";

export async function printViaAgent(data: TicketReceiptData, options?: { cut?: boolean; openDrawer?: boolean }): Promise<boolean> {
  try {
    const html = renderTicketReceiptHtml(data);
    const response = await fetch(`${AGENT_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, cut: options?.cut ?? true, openDrawer: options?.openDrawer ?? false }),
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return Boolean(result.ok);
  } catch {
    return false;
  }
}
