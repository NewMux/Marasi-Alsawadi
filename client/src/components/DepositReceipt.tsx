import { createPortal } from "react-dom";
import { cx } from "@/components/MarasiUI";
import { marasiLogoIconDataUri } from "@/assets/marasiLogoIconDataUri";

// PRD Round 18, item 7.1: the security-deposit receipts — one when the
// deposit is taken, one when it is settled (returned, returned with a
// deduction, or forfeited). Same thermal layout and #print-ticket classes as
// the facility booking receipt.

export type DepositReceiptData = {
  kind: "received" | "settled";
  bookingId: number;
  facilityName: string;
  customerName: string | null;
  date: string;
  amount: string;
  paymentMethod: "cash" | "card";
  status: "held" | "returned" | "returned_partial" | "forfeited";
  refundAmount?: string | null;
  refundMethod?: "cash" | "card" | null;
  deductionAmount?: string | null;
  deductionReason?: string | null;
};

const omr = (value: unknown) => `${Number(value || 0).toFixed(3)} OMR`;
const method = (value: unknown) => value === "card" ? "بطاقة / Card" : "نقدًا / Cash";
const dayMonthYear = (value: string) => { const [y, m, d] = value.split("-"); return d && m && y ? `${d}/${m}/${y}` : value; };
const STATUS: Record<DepositReceiptData["status"], string> = {
  held: "محتجز / Held",
  returned: "مُرجع بالكامل / Returned in full",
  returned_partial: "مُرجع مع خصم / Returned with deduction",
  forfeited: "مصادر / Forfeited",
};

export function DepositReceiptTicket({ data }: { data: DepositReceiptData }) {
  return <div className="ticket" dir="rtl">
    <div className="center logo"><img src={marasiLogoIconDataUri} alt="" width="46" height="46"/></div>
    <div className="center brand-ar">مراسي السوادي</div>
    <div className="center brand-en">MARASI ALSAWADI</div>
    <div className="center sub">RESORT &amp; WATER PARK</div>
    <div className="divider"/>
    <div className="center title-ar">{data.kind === "received" ? "إيصال تأمين" : "إيصال تسوية التأمين"}</div>
    <div className="center title-en">{data.kind === "received" ? "SECURITY DEPOSIT RECEIPT" : "DEPOSIT SETTLEMENT RECEIPT"}</div>
    <div className="divider"/>
    <table><tbody>
      <tr><td className="label">الاسم / Name</td><td className="value">{data.customerName || "—"}</td></tr>
      <tr><td className="label">التاريخ / Date</td><td className="value">{dayMonthYear(data.date)}</td></tr>
      <tr><td className="label">المرفق / Facility</td><td className="value">{data.facilityName}</td></tr>
      <tr><td className="label">رقم الحجز / Booking</td><td className="value">#{data.bookingId}</td></tr>
    </tbody></table>
    <div className="divider"/>
    <table><tbody>
      <tr><td className="label">مبلغ التأمين / Deposit</td><td className="value">{omr(data.amount)}</td></tr>
      <tr><td className="label" style={{ fontSize: 10 }}>طريقة الدفع / Paid by</td><td className="value" style={{ fontSize: 10 }}>{method(data.paymentMethod)}</td></tr>
      {data.kind === "settled" && Number(data.deductionAmount || 0) > 0 && <tr><td className="label" style={{ fontSize: 10 }}>الخصم / Deduction</td><td className="value" style={{ fontSize: 10 }}>−{omr(data.deductionAmount)}</td></tr>}
      {data.kind === "settled" && data.deductionReason && <tr><td className="label" style={{ fontSize: 10 }}>السبب / Reason</td><td className="value" style={{ fontSize: 10, whiteSpace: "normal" }}>{data.deductionReason}</td></tr>}
      {data.kind === "settled" && Number(data.refundAmount || 0) > 0 && <tr><td className="label" style={{ fontSize: 10 }}>طريقة الإرجاع / Refunded by</td><td className="value" style={{ fontSize: 10 }}>{method(data.refundMethod)}</td></tr>}
    </tbody></table>
    <div className="center price-note" style={{ fontWeight: 700, marginTop: 6 }}>الحالة / Status: {STATUS[data.status]}</div>
    <div className="center price" style={{ marginTop: 6 }}>{omr(data.kind === "received" ? data.amount : data.refundAmount)}</div>
    <div className="center price-note">{data.kind === "received" ? "تأمين مستلم (مسترد) / Deposit received (refundable)" : "المبلغ المُرجع / Amount refunded"}</div>
    <div className="divider"/>
    <div className="center terms">
      {data.kind === "received" ? <>يُرد التأمين عند إعادة المفتاح في الوقت المحدد ودون أضرار — التأمين ليس رسوماً<br/>Refundable when the key is returned on time and nothing is damaged — a deposit is not a charge</> : <>تمت تسوية التأمين<br/>The deposit has been settled</>}
    </div>
    <div className="divider"/>
    <div className="center contact" dir="ltr">
      Tel: +968-98044556<br/>
      info@marasiresort.com<br/>
      Alsawadi, Oman<br/>
      Instagram: @marasiwaterpark
    </div>
  </div>;
}

export function DepositReceipt({ data, width }: { data: DepositReceiptData; width: "80" | "58" }) {
  const printRoot = document.getElementById("print-root");
  const node = <div id="print-ticket" className={cx("print-ticket hidden", width === "58" ? "receipt-58" : "receipt-80")}>
    <DepositReceiptTicket data={data}/>
  </div>;
  return printRoot ? createPortal(node, printRoot) : node;
}
