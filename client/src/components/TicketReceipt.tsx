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

function lineLabel(line: TicketReceiptLine) {
  return line.freeEntryCategory ? freeEntryLabels[line.freeEntryCategory] : ticketTypeLabels[line.ticketType];
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

      {data.lines.map((line, index) => {
        const label = lineLabel(line);
        return <div key={line.ticketNumber}>
          <table style={{ marginBottom: 6 }}><tbody>
            <tr><td className="label" style={{ fontWeight: 700 }}>{toArabicIndic(index + 1)}) {label.ar}<br/><span style={{ fontWeight: 400, fontSize: 10 }}>{label.en}</span></td><td className="value">#{line.ticketNumber}</td></tr>
            <tr><td className="label" style={{ fontSize: 10 }}>السعر الأساسي / Base</td><td className="value" style={{ fontSize: 10 }}>{omr(line.basePrice)}</td></tr>
            {Number(line.discountAmount) > 0 && <tr><td className="label" style={{ fontSize: 10 }}>الخصم / Discount</td><td className="value" style={{ fontSize: 10 }}>−{omr(line.discountAmount)}</td></tr>}
            <tr><td className="label" style={{ fontSize: 10 }}>ضريبة ٥٪ / VAT 5%</td><td className="value" style={{ fontSize: 10 }}>{omr(line.vatAmount)}</td></tr>
            <tr><td className="label" style={{ fontWeight: 700 }}>الإجمالي / Line Total</td><td className="value" style={{ fontWeight: 700 }}>{omr(line.totalAmount)}{line.freeEntryCategory ? " — FREE" : ""}</td></tr>
          </tbody></table>
          {index < data.lines.length - 1 && <div style={{ borderTop: "1px dotted #ccc", margin: "6px 0" }}/>}
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
  return <div id="print-ticket" className={cx("print-ticket hidden", width === "58" ? "receipt-58" : "receipt-80")}>
    <TicketReceiptTicket data={data}/>
  </div>;
}
