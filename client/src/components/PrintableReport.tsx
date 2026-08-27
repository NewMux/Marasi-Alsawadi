import type { ReactNode } from "react";
import marasiLogoFull from "@/assets/marasi-logo-full.webp";

export function printReport() { window.print(); }

/** A4 printable document root — hidden in the normal view, shown only under
 * `@media print` via the `#print-report` masking rule in index.css (a
 * separate print target from the 80mm ticket receipt). */
export function ReportDocument({ title, generatedByLabel, generatedBy, generatedLabel, children }: { title: string; generatedByLabel: string; generatedBy: string; generatedLabel: string; children: ReactNode }) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return <div id="print-report" className="hidden">
    <div className="report-header">
      <img src={marasiLogoFull} alt="Marasi Alsawadi Resort & Aqua Park" className="report-logo"/>
      <div className="report-heading">
        <div className="report-title">{title}</div>
        <div className="report-sub">{generatedLabel} {dateLabel}</div>
        <div className="report-sub">{generatedByLabel} {generatedBy}</div>
      </div>
    </div>
    {children}
  </div>;
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
