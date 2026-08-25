import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TicketReceiptTicket, type TicketReceiptData } from "./TicketReceipt";

// A standalone, always-visible copy of the print CSS in index.css's
// `@media print` block — that version is gated behind #print-ticket
// visibility tricks meant for the browser's print dialog, which don't apply
// here. Sizes are in px (not mm/pt) because the print agent renders this at
// a fixed pixel width (~8px/mm, ~2.8px/pt at 203dpi) rather than through an
// actual printer driver. Keep this visually in sync with index.css by eye
// if that design changes.
const STANDALONE_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; }
  .ticket { width: 100%; padding: 28px 32px; font-family: "Courier New", Courier, monospace; line-height: 1.35; color: #111; background: #fff; }
  .center { text-align: center; }
  .logo { margin-bottom: 8px; }
  .brand-ar { font-weight: 700; font-size: 30px; line-height: 1.5; }
  .brand-en { font-weight: 700; font-size: 24px; letter-spacing: .05em; }
  .sub { font-size: 18px; color: #333; margin-top: 4px; letter-spacing: .1em; }
  .divider { border-top: 2px dashed #999; margin: 18px 0; }
  .title-ar { font-weight: 700; font-size: 24px; }
  .title-en { font-weight: 700; font-size: 19px; letter-spacing: .04em; margin-top: 4px; }
  table { width: 100%; font-size: 20px; border-collapse: collapse; }
  td { padding: 6px 0; vertical-align: top; }
  td.label { color: #333; text-align: right; }
  td.value { text-align: left; font-weight: 700; direction: ltr; white-space: nowrap; }
  .price { font-size: 32px; font-weight: 700; }
  .price-note { font-size: 15px; color: #333; margin-top: 4px; }
  .terms { font-size: 14px; color: #444; line-height: 1.6; }
  .contact { font-size: 16px; color: #333; line-height: 1.7; }
`;

/** Renders a full, standalone HTML document containing just the `.ticket` markup — used by the local print agent to screenshot the receipt. */
export function renderTicketReceiptHtml(data: TicketReceiptData): string {
  const markup = renderToStaticMarkup(createElement(TicketReceiptTicket, { data }));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STANDALONE_STYLES}</style></head><body>${markup}</body></html>`;
}
