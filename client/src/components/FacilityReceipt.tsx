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
  // The already-discounted facility line amount (unchanged meaning —
  // other pricing logic elsewhere already reads this as the discounted
  // figure). The receipt itself now shows the pre-discount base price by
  // adding discountAmount back, since a receipt should show what
  // discount was actually applied rather than just its percentage.
  facilityAmount: string;
  addons: FacilityReceiptAddonLine[];
  notes?: string | null;
  partnerEntityName?: string | null;
  discountPercentage?: string | null;
  discountAmount?: string;
  // PRD Round 10, Sections 1-2 and 4: facility bookings had no VAT or fee
  // concept at all before this round — fees are one aggregate total (not
  // itemized per fee, unlike ticket purchases), on the facility line only.
  vatAmount?: string;
  vatPercentage?: string;
  feeAmount?: string;
  totalAmount: string;
  // PRD Round 14, Section 5: a booking now prints one of two receipts
  // depending on stage — Stage 1 ("booking") shows the amount still owed,
  // Stage 2 ("confirmed") shows PAID. Omitted entirely for a pre-Round-14
  // reprint of pricing that predates this field, which prints unchanged.
  paymentStatus?: "booking" | "confirmed";
  // PRD Round 14, Section 6: only present when paymentMethod is "mixed" —
  // same exact Cash/Card/Bank split shown on the ticket receipt.
  paymentMethod?: "cash" | "card" | "bank" | "mixed";
  cashAmount?: string | null;
  cardAmount?: string | null;
  bankAmount?: string | null;
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

      {/* PRD Round 12 (client feedback, 16/9): the facility line here shows
          its pre-discount base price — the actual discount (named, with its
          own amount) and the resulting subtotal are broken out below, the
          same consistent Base → Discount → Subtotal → Fees → VAT → Total
          order used on every receipt. */}
      <table style={{ marginBottom: 6 }}><tbody>
        <tr><td className="label" style={{ fontWeight: 700 }}>{data.facilityName}</td><td className="value">{omr(Number(data.facilityAmount) + Number(data.discountAmount || 0))}</td></tr>
        {data.addons.map((addon, index) => <tr key={index}><td className="label" style={{ fontSize: 10 }}>{addon.name} ×{addon.quantity}</td><td className="value" style={{ fontSize: 10 }}>{omr(addon.amount)}</td></tr>)}
      </tbody></table>

      {data.notes && <><div className="divider"/><table><tbody><tr><td className="label" style={{ fontSize: 10 }}>ملاحظات / Notes</td><td className="value" style={{ fontSize: 10, whiteSpace: "normal" }}>{data.notes}</td></tr></tbody></table></>}

      <div className="divider"/>

      <table><tbody>
        {Number(data.discountAmount || 0) > 0 && <>
          <tr><td className="label" style={{ fontSize: 10 }}>{data.partnerEntityName ? `خصم الشريك: ${data.partnerEntityName} (${Number(data.discountPercentage || 0).toFixed(0)}%) / Partner Discount: ${data.partnerEntityName} (${Number(data.discountPercentage || 0).toFixed(0)}%)` : `الخصم (${Number(data.discountPercentage || 0).toFixed(0)}%) / Discount (${Number(data.discountPercentage || 0).toFixed(0)}%)`}</td><td className="value" style={{ fontSize: 10 }}>−{omr(data.discountAmount)}</td></tr>
          <tr><td className="label" style={{ fontSize: 10 }}>المجموع بعد الخصم / Subtotal (After Discount)</td><td className="value" style={{ fontSize: 10 }}>{omr(Number(data.facilityAmount) + data.addons.reduce((sum, addon) => sum + Number(addon.amount || 0), 0))}</td></tr>
        </>}
        {Number(data.feeAmount || 0) > 0 && <tr><td className="label" style={{ fontSize: 10 }}>رسوم / Fees</td><td className="value" style={{ fontSize: 10 }}>{omr(data.feeAmount)}</td></tr>}
        {Number(data.vatAmount || 0) > 0 && <tr><td className="label" style={{ fontSize: 10 }}>ضريبة {Number(data.vatPercentage || 0)}٪ / VAT {Number(data.vatPercentage || 0)}%</td><td className="value" style={{ fontSize: 10 }}>{omr(data.vatAmount)}</td></tr>}
      </tbody></table>

      {data.paymentStatus && <>
        <div className="center price-note" style={{ fontWeight: 700 }}>
          {data.paymentStatus === "booking" ? "الحالة: حجز - بانتظار الدفع / Status: Booking – Awaiting Payment" : "الحالة: مؤكد - مدفوع / Status: Confirmed – Paid"}
        </div>
      </>}
      <div className="center price" style={{ marginTop: 6 }}>{omr(data.totalAmount)}</div>
      <div className="center price-note">
        {data.paymentStatus === "confirmed" ? "مدفوع بالكامل / PAID" : "المبلغ الإجمالي المستحق / Total Amount Due"}
      </div>

      {data.paymentMethod === "mixed" && (Number(data.cashAmount || 0) + Number(data.cardAmount || 0) + Number(data.bankAmount || 0)) > 0 && <>
        <div className="divider"/>
        <table><tbody>
          <tr><td className="label" style={{ fontWeight: 700, paddingBottom: 4 }} colSpan={2}>طريقة الدفع / Payment Breakdown</td></tr>
          {Number(data.cashAmount || 0) > 0 && <tr><td className="label" style={{ fontSize: 10 }}>نقدًا / Cash</td><td className="value" style={{ fontSize: 10 }}>{omr(data.cashAmount)}</td></tr>}
          {Number(data.cardAmount || 0) > 0 && <tr><td className="label" style={{ fontSize: 10 }}>بطاقة / Card</td><td className="value" style={{ fontSize: 10 }}>{omr(data.cardAmount)}</td></tr>}
          {Number(data.bankAmount || 0) > 0 && <tr><td className="label" style={{ fontSize: 10 }}>تحويل بنكي / Bank Transfer</td><td className="value" style={{ fontSize: 10 }}>{omr(data.bankAmount)}</td></tr>}
        </tbody></table>
      </>}

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
