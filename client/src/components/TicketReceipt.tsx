import { createPortal } from "react-dom";
import { cx } from "@/components/MarasiUI";

// Matches the client-supplied ticket mockup exactly: a fixed bilingual
// (Arabic + English, always both, not toggled) thermal-receipt layout.
// The logo below is a placeholder — the client's note on the mockup says
// the real logo will be "a simplified black & white line version"; swap
// <LogoMark/> for the real artwork once that file is supplied.

export type TicketReceiptLine = {
  ticketNumber: string;
  ticketType: "waterpark" | "companion";
  freeEntryCategory: "under_two" | "person_of_determination" | "senior" | null;
  basePrice: string;
  discountAmount: string;
  vatAmount: string;
  totalAmount: string;
};

export type TicketReceiptData = {
  customerName: string;
  customerPhone: string;
  visitDate: string;
  lines: TicketReceiptLine[];
  baseSubtotal: string;
  discountAmount: string;
  vatAmount: string;
  totalAmount: string;
};

const arabicIndicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicIndic = (value: number) => String(value).split("").map((digit) => arabicIndicDigits[Number(digit)] ?? digit).join("");

const freeEntryLabels: Record<NonNullable<TicketReceiptLine["freeEntryCategory"]>, { ar: string; en: string }> = {
  under_two: { ar: "طفل أقل من سنتين", en: "Child under 2 — Free" },
  person_of_determination: { ar: "من ذوي الهمم", en: "Person of Determination — Free" },
  senior: { ar: "متقاعد / كبار السن", en: "Senior Citizen — Free" },
};
const ticketTypeLabels: Record<TicketReceiptLine["ticketType"], { ar: string; en: string }> = {
  waterpark: { ar: "تذكرة رئيسية", en: "Main Ticket — Waterpark" },
  companion: { ar: "تذكرة مرافق", en: "Companion Ticket" },
};

function lineLabel(line: Pick<TicketReceiptLine, "ticketType" | "freeEntryCategory">) {
  return line.freeEntryCategory ? freeEntryLabels[line.freeEntryCategory] : ticketTypeLabels[line.ticketType];
}

type ReceiptLineGroup = {
  ticketType: TicketReceiptLine["ticketType"];
  freeEntryCategory: TicketReceiptLine["freeEntryCategory"];
  ticketNumbers: string[];
  basePrice: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
};

// Group Booking purchases issue one ticket per person, so a 10-visitor group
// line still produces 10 individual line records. Collapsing consecutive
// same-type lines into a single printed row with a ticket-number range keeps
// the receipt short instead of listing every ticket separately, while
// individual (non-group) purchases pass through unchanged since runs of 1
// print exactly as before.
function groupReceiptLines(lines: TicketReceiptLine[]): ReceiptLineGroup[] {
  const groups: ReceiptLineGroup[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.ticketType === line.ticketType && last.freeEntryCategory === line.freeEntryCategory) {
      last.ticketNumbers.push(line.ticketNumber);
      last.basePrice += Number(line.basePrice || 0);
      last.discountAmount += Number(line.discountAmount || 0);
      last.vatAmount += Number(line.vatAmount || 0);
      last.totalAmount += Number(line.totalAmount || 0);
    } else {
      groups.push({
        ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory, ticketNumbers: [line.ticketNumber],
        basePrice: Number(line.basePrice || 0), discountAmount: Number(line.discountAmount || 0),
        vatAmount: Number(line.vatAmount || 0), totalAmount: Number(line.totalAmount || 0),
      });
    }
  }
  return groups;
}

function ticketRangeLabel(ticketNumbers: string[]) {
  return ticketNumbers.length > 1 ? `#${ticketNumbers[0]}–#${ticketNumbers[ticketNumbers.length - 1]} (×${ticketNumbers.length})` : `#${ticketNumbers[0]}`;
}

function omr(value: unknown) {
  return `${Number(value || 0).toFixed(3)} OMR`;
}

function dayMonthYear(value: unknown) {
  if (!value) return "—";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function LogoMark() {
  return <svg viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
    <g fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 40V21"/>
      <path d="M32 23c-4-6-12-6-16-2 5 3 9 2 16 2Z"/>
      <path d="M32 23c4-6 12-6 16-2-5 3-9 2-16 2Z"/>
      <path d="M32 27c-3-5-9-6-13-3 4 4 8 3 13 3Z"/>
      <path d="M32 27c3-5 9-6 13-3-4 4-8 3-13 3Z"/>
      <path d="M6 47c4-3 8-3 12 0s8 3 12 0 8-3 12 0 8 3 12 0"/>
    </g>
  </svg>;
}

/** Just the `.ticket` markup, with no print-dialog visibility wrapper — reused by both the live window.print() path and the standalone print-agent HTML serializer (client/src/components/ticketReceiptHtml.ts). */
export function TicketReceiptTicket({ data }: { data: TicketReceiptData }) {
  return <div className="ticket" dir="rtl">
      <div className="center logo"><LogoMark/></div>
      <div className="center brand-ar">مراسي السوادي</div>
      <div className="center brand-en">MARASI ALSAWADI</div>
      <div className="center sub">RESORT &amp; AQUA PARK</div>

      <div className="divider"/>

      <div className="center title-ar">تذكرة دخول — الحديقة المائية</div>
      <div className="center title-en">WATERPARK ADMISSION TICKET</div>

      <div className="divider"/>

      <table><tbody>
        <tr><td className="label">الاسم / Name</td><td className="value">{data.customerName || "—"}</td></tr>
        <tr><td className="label">التاريخ / Date</td><td className="value">{dayMonthYear(data.visitDate)}</td></tr>
      </tbody></table>

      <div className="divider"/>

      <table><tbody><tr><td className="label" style={{ fontWeight: 700, paddingBottom: 6 }}>تفاصيل التذاكر / Ticket Details</td></tr></tbody></table>

      {groupReceiptLines(data.lines).map((group, index, groups) => {
        const label = lineLabel(group);
        return <div key={group.ticketNumbers[0]}>
          <table style={{ marginBottom: 6 }}><tbody>
            <tr><td className="label" style={{ fontWeight: 700 }}>{toArabicIndic(index + 1)}) {label.ar}{group.ticketNumbers.length > 1 ? ` ×${group.ticketNumbers.length}` : ""}<br/><span style={{ fontWeight: 400, fontSize: 10 }}>{label.en}{group.ticketNumbers.length > 1 ? ` ×${group.ticketNumbers.length}` : ""}</span></td><td className="value">{ticketRangeLabel(group.ticketNumbers)}</td></tr>
            <tr><td className="label" style={{ fontSize: 10 }}>السعر الأساسي / Base</td><td className="value" style={{ fontSize: 10 }}>{omr(group.basePrice)}</td></tr>
            {group.discountAmount > 0 && <tr><td className="label" style={{ fontSize: 10 }}>الخصم / Discount</td><td className="value" style={{ fontSize: 10 }}>−{omr(group.discountAmount)}</td></tr>}
            <tr><td className="label" style={{ fontSize: 10 }}>ضريبة ٥٪ / VAT 5%</td><td className="value" style={{ fontSize: 10 }}>{omr(group.vatAmount)}</td></tr>
            <tr><td className="label" style={{ fontWeight: 700 }}>الإجمالي / Line Total</td><td className="value" style={{ fontWeight: 700 }}>{omr(group.totalAmount)}{group.freeEntryCategory ? " — FREE" : ""}</td></tr>
          </tbody></table>
          {index < groups.length - 1 && <div style={{ borderTop: "1px dotted #ccc", margin: "6px 0" }}/>}
        </div>;
      })}

      <div className="divider"/>

      <table><tbody>
        <tr><td className="label">المجموع قبل الضريبة / Subtotal</td><td className="value">{omr(data.baseSubtotal)}</td></tr>
        {Number(data.discountAmount) > 0 && <tr><td className="label">الخصم / Discount</td><td className="value">−{omr(data.discountAmount)}</td></tr>}
        <tr><td className="label">إجمالي الضريبة / Total VAT (5%)</td><td className="value">{omr(data.vatAmount)}</td></tr>
      </tbody></table>

      <div className="center price" style={{ marginTop: 6 }}>{omr(data.totalAmount)}</div>
      <div className="center price-note">المبلغ الإجمالي المستحق / Total Amount Due</div>

      <div className="divider"/>

      <div className="center terms">
        بدخولكم الحديقة، فإنكم توافقون على الشروط والأحكام المعروضة عند بوابة الدخول<br/>
        By entering, you agree to the terms &amp; conditions displayed at the entrance
      </div>

      <div className="divider"/>

      <div className="center contact">
        📞 98044556 &nbsp;|&nbsp; 📷 marasisawadiresort<br/>
        ✉️ Sawadi.admin@gmail.com<br/>
        📍 Barka — Sultanate of Oman
      </div>
    </div>;
}

export function TicketReceipt({ data, width }: { data: TicketReceiptData; width: "80" | "58" }) {
  const printRoot = document.getElementById("print-root");
  const node = <div id="print-ticket" className={cx("print-ticket hidden", width === "58" ? "receipt-58" : "receipt-80")}>
    <TicketReceiptTicket data={data}/>
  </div>;
  // Portalled to a sibling of #root (see index.html) instead of rendering
  // inline in the page tree: the print CSS hides every other element under
  // <body>, and a display:none ancestor collapses its whole subtree to a
  // zero-size box even when the descendant's own display is "block" — so a
  // receipt rendered deep inside the dashboard layout would print blank.
  return printRoot ? createPortal(node, printRoot) : node;
}
