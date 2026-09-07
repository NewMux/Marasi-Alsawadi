import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { FacilityReceiptTicket, type FacilityReceiptData } from "./FacilityReceipt";
import { STANDALONE_RECEIPT_STYLES } from "./ticketReceiptHtml";

/** Renders a full, standalone HTML document containing just the `.ticket` markup — used by the local print agent to screenshot the receipt. */
export function renderFacilityReceiptHtml(data: FacilityReceiptData): string {
  const markup = renderToStaticMarkup(createElement(FacilityReceiptTicket, { data }));
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STANDALONE_RECEIPT_STYLES}</style></head><body>${markup}</body></html>`;
}
