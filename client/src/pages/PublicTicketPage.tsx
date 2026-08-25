import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: unknown) => value ? new Date(`${String(value)}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—";
const statusLabel: Record<string, string> = { paid: "Ready for entry", checked_in: "Already admitted", voided: "Voided", expired: "Expired" };

export default function PublicTicketPage() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, isLoading, error } = trpc.platform.tickets.public.useQuery({ token }, { enabled: token.length >= 16, retry: false });
  const [qrCode, setQrCode] = useState("");

  useEffect(() => {
    if (!data) return;
    const url = `${window.location.origin}/ticket/${encodeURIComponent(data.ticket.publicToken)}`;
    QRCode.toDataURL(url, { width: 320, margin: 2, errorCorrectionLevel: "M", color: { dark: "#1d1d1f", light: "#ffffff" } })
      .then(setQrCode)
      .catch(() => setQrCode(""));
  }, [data]);

  if (isLoading) return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-muted"><div className="rounded-2xl bg-white px-5 py-4 text-sm shadow-sm">Loading ticket…</div></main>;
  if (error || !data) return <main className="grid min-h-screen place-items-center bg-canvas p-6 text-ink"><div className="w-full max-w-md rounded-[28px] bg-white p-8 text-center shadow-[0_18px_55px_rgba(0,0,0,.1)]"><div className="text-xs font-semibold uppercase tracking-[.16em] text-accent">Marasi Alsawadi</div><h1 className="mt-4 font-serif text-3xl tracking-[-.04em]">Ticket not found</h1><p className="mt-3 text-sm leading-6 text-muted">This ticket link is invalid, expired, or no longer available. Please contact the ticket desk for assistance.</p></div></main>;

  const { ticket, customer, rate, lines } = data;
  const customerTicketUrl = `${window.location.origin}/ticket/${encodeURIComponent(ticket.publicToken)}`;
  const canEnter = ticket.status === "paid";

  return <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-6 sm:py-12 print:bg-white print:p-0">
    <div className="mx-auto max-w-xl">
      <div className="mb-5 flex items-center justify-between print:hidden"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-accent">Marasi Alsawadi Resort</div><div className="mt-1 text-sm text-muted">Customer entry ticket</div></div><Button variant="outline" className="rounded-full" onClick={() => window.print()}>Print receipt</Button></div>
      <section id="print-ticket" className="overflow-hidden rounded-[30px] bg-white shadow-[0_18px_55px_rgba(0,0,0,.1)] print:rounded-none print:shadow-none">
        <div className="bg-ink px-7 py-8 text-white sm:px-10"><div className="text-xs font-semibold uppercase tracking-[.16em] text-faint">Transaction ticket</div><div className="mt-4 flex items-end justify-between gap-4"><h1 className="font-mono text-2xl tracking-[-.04em] sm:text-3xl">{ticket.ticketNumber}</h1><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${canEnter ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{statusLabel[ticket.status] || ticket.status}</span></div></div>
        <div className="grid gap-8 px-7 py-8 sm:grid-cols-[1fr_190px] sm:px-10">
          <div className="space-y-5"><div><div className="text-xs font-medium uppercase tracking-wide text-subtle">Customer</div><div className="mt-1 text-lg font-semibold">{customer.fullName}</div></div><div><div className="text-xs font-medium uppercase tracking-wide text-subtle">Visit date</div><div className="mt-1 text-lg font-medium">{dateLabel(ticket.visitDate)}</div></div><div className="grid grid-cols-2 gap-4"><div><div className="text-xs font-medium uppercase tracking-wide text-subtle">Quantity</div><div className="mt-1 text-base font-medium">{ticket.quantity}</div></div><div><div className="text-xs font-medium uppercase tracking-wide text-subtle">Service</div><div className="mt-1 text-base font-medium capitalize">{rate?.name || ticket.department.replace("_", " ")}</div></div></div><div className="border-t border-divider pt-5"><div className="mb-3 text-xs font-medium uppercase tracking-wide text-subtle">Price breakdown</div><div className="space-y-2">{lines.map((line: any) => <div key={`${line.lineType}-${line.code}`} className="flex items-center justify-between gap-4 text-sm"><span>{line.label}{line.quantity > 1 ? ` × ${line.quantity}` : ""}</span><b className="font-medium">{money(line.lineAmount)}</b></div>)}</div><div className="mt-4 border-t border-divider pt-4"><div className="text-xs font-medium uppercase tracking-wide text-subtle">Total paid</div><div className="mt-1 font-serif text-3xl tracking-[-.04em]">{money(ticket.totalAmount)}</div></div></div></div>
          <div className="text-center"><div className="mx-auto grid aspect-square w-[180px] place-items-center rounded-2xl border border-divider bg-white p-3">{qrCode ? <img src={qrCode} alt="Ticket QR code" className="h-full w-full"/> : <div className="text-xs text-subtle">Preparing QR code…</div>}</div><div className="mt-3 text-xs font-medium text-body">Scan at the entrance</div><div className="mt-1 break-all text-[10px] text-subtle">{customerTicketUrl}</div></div>
        </div>
        <div className="border-t border-divider bg-well px-7 py-5 text-xs leading-5 text-muted sm:px-10">Please present this QR code at the gate. This ticket is for the visit date shown above and may be used once.</div>
      </section>
    </div>
  </main>;
}
