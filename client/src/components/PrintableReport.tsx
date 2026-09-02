import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import marasiLogoFull from "@/assets/marasi-logo-full.webp";

export function printReport() { window.print(); }

/** CSV can't embed a logo image, but it can carry the same generated-by/date
 * metadata as the printed report — prepend these rows to a CSV export so
 * the exported file isn't just a bare data dump. */
export function csvReportHeaderRows(generatedLabel: string, generatedByLabel: string, generatedBy: string): string[][] {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return [["Marasi Alsawadi Resort & Waterpark"], [`${generatedLabel} ${dateLabel}`], [`${generatedByLabel} ${generatedBy}`], []];
}

/** A4 printable document root — hidden in the normal view, shown only under
 * `@media print` via the `#print-report` masking rule in index.css (a
 * separate print target from the 80mm ticket receipt). Portalled to a
 * sibling of #root (see index.html) rather than rendered inline in the
 * page: the print CSS hides every other element under <body>, and a
 * display:none ancestor collapses its whole subtree to a zero-size box
 * even when this element's own display is "block" — so a report rendered
 * deep inside the dashboard layout would print blank. */
export function ReportDocument({ title, generatedByLabel, generatedBy, generatedLabel, children }: { title: string; generatedByLabel: string; generatedBy: string; generatedLabel: string; children: ReactNode }) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const printRoot = document.getElementById("print-root");
  const node = <div id="print-report" className="hidden">
    <div className="report-header">
      <img src={marasiLogoFull} alt="Marasi Alsawadi Resort & Waterpark" className="report-logo"/>
      <div className="report-heading">
        <div className="report-title">{title}</div>
        <div className="report-sub">{generatedLabel} {dateLabel}</div>
        <div className="report-sub">{generatedByLabel} {generatedBy}</div>
      </div>
    </div>
    {children}
  </div>;
  return printRoot ? createPortal(node, printRoot) : node;
}

export function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return <div className="report-section"><div className="report-section-title">{title}</div>{children}</div>;
}

export function ReportStatGrid({ children }: { children: ReactNode }) {
  return <div className="report-stat-grid">{children}</div>;
}

export function ReportStat({ label, value }: { label: string; value: string }) {
  return <div className="report-stat"><div className="report-stat-label">{label}</div><div className="report-stat-value">{value}</div></div>;
}

export function ReportTable({ headers, rows }: { headers: Array<{ label: string; num?: boolean }>; rows: Array<Array<string>> }) {
  return <table><thead><tr>{headers.map((h, i) => <th key={i} className={h.num ? "num" : undefined}>{h.label}</th>)}</tr></thead><tbody>{rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} className={headers[ci]?.num ? "num" : undefined}>{cell}</td>)}</tr>)}</tbody></table>;
}
