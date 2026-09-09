import { createPortal } from "react-dom";
import { cx } from "@/components/MarasiUI";
import { marasiLogoIconDataUri } from "@/assets/marasiLogoIconDataUri";
import { instagramQrDataUri } from "@/assets/instagramQrDataUri";

// Same fixed bilingual thermal-receipt layout/markup as TicketReceipt.tsx
// (PRD Round 4, 4.1: "same design/format as the Waterpark entry ticket ...
// but with content reflecting the booking details instead of ticket
// details"), reusing the exact same #print-ticket CSS classes.

export type FacilityReceiptAddonLine = { name: string; quantity: string; amount: string };

export type FacilityReceiptData = {
  facilityName: string;
  customerName: string;
  bookingDate: string;
  durationLabel: string | null;
  facilityAmount: string;
  addons: FacilityReceiptAddonLine[];
  notes?: string | null;
  partnerEntityName?: string | null;
  discountPercentage?: string | null;
  totalAmount: string;
};

function omr(value: unknown) {
  return `${Number(value || 0).toFixed(3)} OMR`;
}

function dayMonthYear(value: unknown) {
  if (!value) return "—";
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return "—";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/** Just the `.ticket` markup, with no print-dialog visibility wrapper — reused by both the live window.print() path and the print-agent HTML serializer (client/src/components/facilityReceiptHtml.ts). */
export function FacilityReceiptTicket({ data }: { data: FacilityReceiptData }) {
  return <div className="ticket" dir="rtl">
      <div className="center logo"><img src={marasiLogoIconDataUri} alt="" width="46" height="46"/></div>
      <div className="center brand-ar">مراسي السوادي</div>
      <div className="center brand-en">MARASI ALSAWADI</div>
      <div className="center sub">RESORT &amp; WATER PARK</div>

      <div className="divider"/>

      <div className="center title-ar">إيصال حجز مرفق</div>
      <div className="center title-en">FACILITY BOOKING RECEIPT</div>

      <div className="divider"/>

      <table><tbody>
        <tr><td className="label">الاسم / Name</td><td className="value">{data.customerName || "—"}</td></tr>
        <tr><td className="label">التاريخ / Date</td><td className="value">{dayMonthYear(data.bookingDate)}</td></tr>
        <tr><td className="label">المرفق / Facility</td><td className="value">{data.facilityName}</td></tr>
        {data.durationLabel && <tr><td className="label">المدة / Duration</td><td className="value">{data.durationLabel}</td></tr>}
      </tbody></table>

      <div className="divider"/>

      <table><tbody><tr><td className="label" style={{ fontWeight: 700, paddingBottom: 6 }}>تفاصيل الحجز / Booking Details</td></tr></tbody></table>

      <table style={{ marginBottom: 6 }}><tbody>
        <tr><td className="label" style={{ fontWeight: 700 }}>{data.facilityName}</td><td className="value">{omr(data.facilityAmount)}</td></tr>
        {data.addons.map((addon, index) => <tr key={index}><td className="label" style={{ fontSize: 10 }}>{addon.name} ×{addon.quantity}</td><td className="value" style={{ fontSize: 10 }}>{omr(addon.amount)}</td></tr>)}
      </tbody></table>

      {data.notes && <><div className="divider"/><table><tbody><tr><td className="label" style={{ fontSize: 10 }}>ملاحظات / Notes</td><td className="value" style={{ fontSize: 10, whiteSpace: "normal" }}>{data.notes}</td></tr></tbody></table></>}

      <div className="divider"/>

      <table><tbody>
        {data.partnerEntityName && <tr><td className="label" style={{ fontSize: 10 }}>جهة شريكة / Partner</td><td className="value" style={{ fontSize: 10 }}>{data.partnerEntityName} ({Number(data.discountPercentage || 0).toFixed(0)}%)</td></tr>}
      </tbody></table>

      <div className="center price" style={{ marginTop: 6 }}>{omr(data.totalAmount)}</div>
      <div className="center price-note">المبلغ الإجمالي المستحق / Total Amount Due</div>

      <div className="divider"/>

      <div className="center terms">
        بحجزكم لهذا المرفق، فإنكم توافقون على الشروط والأحكام المعروضة عند الاستقبال<br/>
        By booking this facility, you agree to the terms &amp; conditions displayed at reception
      </div>

      <div className="divider"/>

      <div className="center contact" dir="ltr">
        📞 +968-98044556<br/>
        ✉️ info@marasiresort.com<br/>
        📍 Alsawadi, Oman<br/>
        📷 @marasiwaterpark
      </div>
      <img src={instagramQrDataUri} alt="" width="56" height="56" style={{ display: "block", margin: "2mm auto 0" }}/>
    </div>;
}

export function FacilityReceipt({ data, width }: { data: FacilityReceiptData; width: "80" | "58" }) {
  const printRoot = document.getElementById("print-root");
  const node = <div id="print-ticket" className={cx("print-ticket hidden", width === "58" ? "receipt-58" : "receipt-80")}>
    <FacilityReceiptTicket data={data}/>
  </div>;
  return printRoot ? createPortal(node, printRoot) : node;
}
