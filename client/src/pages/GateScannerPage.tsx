import { Html5QrcodeScanner } from "html5-qrcode";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ScanLine, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

const reasonLabel: Record<string, string> = {
  not_found: "Ticket not found",
  expired: "Ticket is not valid for today",
  voided: "Ticket has been voided",
  already_checked_in: "Ticket has already been used",
  not_paid: "Ticket is not paid",
};

export default function GateScannerPage() {
  const { user } = useAuth();
  const [manualValue, setManualValue] = useState("");
  const [result, setResult] = useState<any>(null);
  const lastScan = useRef("");
  const lastScanAt = useRef(0);
  const utils = trpc.useUtils();
  const recent = trpc.platform.gate.recentScans.useQuery(undefined, { enabled: Boolean(user && ["guard", "manager", "admin"].includes(user.role)) });
  const scan = trpc.platform.gate.scan.useMutation({
    onSuccess: (response) => { setResult(response); utils.platform.gate.recentScans.invalidate(); },
    onError: (error) => { setResult({ allowed: false, reason: "error", error: error.message }); toast.error(error.message); },
  });

  useEffect(() => {
    if (!user || !["guard", "manager", "admin"].includes(user.role)) return;
    const reader = new Html5QrcodeScanner("ticket-reader", { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true }, false);
    const onScanSuccess = (decodedText: string) => {
      const now = Date.now();
      if (decodedText === lastScan.current && now - lastScanAt.current < 2500) return;
      lastScan.current = decodedText;
      lastScanAt.current = now;
      scan.mutate({ scannedValue: decodedText, requestKey: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${decodedText.slice(0, 20)}` });
    };
    reader.render(onScanSuccess, () => undefined);
    return () => { reader.clear().catch(() => undefined); };
  }, [user, scan]);

  if (!user || !["guard", "manager", "admin"].includes(user.role)) return <main className="grid min-h-[70vh] place-items-center"><div className="rounded-2xl bg-white p-8 text-center shadow-sm"><ShieldAlert className="mx-auto text-danger"/><h1 className="mt-3 font-serif text-2xl">Gate access required</h1><p className="mt-2 text-sm text-muted">Ask an administrator to assign the Gate guard role.</p></div></main>;

  const scanManual = () => {
    if (!manualValue.trim()) return toast.error("Scan a ticket or paste its ticket link");
    scan.mutate({ scannedValue: manualValue.trim(), requestKey: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${manualValue.trim().slice(0, 20)}` });
    setManualValue("");
  };

  return <main className="mx-auto max-w-5xl">
    <div className="mb-7 rounded-[28px] bg-ink px-6 py-8 text-white shadow-[0_16px_40px_rgba(0,0,0,.13)] md:px-10"><div className="text-xs font-semibold uppercase tracking-[.16em] text-faint">Entrance control</div><h1 className="mt-3 font-serif text-4xl tracking-[-.05em]">Gate scanner</h1><p className="mt-3 max-w-xl text-sm leading-6 text-line">Scan a customer’s QR code to validate the paid ticket, check the visit date, and record one secure entry.</p></div>
    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-[24px] bg-white p-5 shadow-[0_8px_25px_rgba(0,0,0,.06)] md:p-6"><div className="mb-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e8f2ff] text-accent"><ScanLine size={19}/></div><div><h2 className="font-serif text-2xl">Camera scanner</h2><p className="text-xs text-muted">Allow camera access when prompted.</p></div></div><div id="ticket-reader" className="overflow-hidden rounded-2xl border border-divider bg-well p-3"/><div className="mt-5 border-t border-divider pt-5"><div className="text-xs font-medium uppercase tracking-wide text-subtle">Manual / USB scanner fallback</div><div className="mt-2 flex gap-2"><Input autoFocus value={manualValue} placeholder="Paste ticket link or scan into this field" onChange={(event) => setManualValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") scanManual(); }}/><Button className="rounded-full bg-accent text-white hover:bg-accent-hover" disabled={scan.isPending} onClick={scanManual}>Validate</Button></div></div></section>
      <section className={`rounded-[24px] p-6 shadow-[0_8px_25px_rgba(0,0,0,.06)] ${result?.allowed ? "bg-success-bg" : result ? "bg-danger-bg" : "bg-white"}`}><div className="text-xs font-semibold uppercase tracking-[.16em] text-muted">Validation result</div>{result ? <div className="mt-7">{result.allowed ? <CheckCircle2 size={56} className="text-success"/> : <XCircle size={56} className="text-danger"/>}<div className="mt-5 font-serif text-4xl tracking-[-.05em]">{result.allowed ? "Entry allowed" : "Entry denied"}</div><p className="mt-3 text-sm leading-6 text-body">{result.allowed ? `${result.customer?.fullName || "Customer"} · ${result.ticket?.ticketNumber || "Ticket"}` : reasonLabel[result.reason] || result.error || "This ticket cannot be admitted."}</p>{result.ticket?.visitDate && <div className="mt-6 rounded-2xl bg-white/70 p-4 text-sm"><div className="font-medium">{result.ticket.ticketNumber}</div><div className="mt-1 text-xs text-muted">Visit date: {result.ticket.visitDate}</div></div>}</div> : <div className="mt-12 text-center"><ScanLine size={45} className="mx-auto text-subtle"/><div className="mt-4 font-serif text-2xl">Ready to scan</div><p className="mt-2 text-sm leading-6 text-muted">The result will appear here immediately after a QR code is read.</p></div>}</section>
    </div>
    <section className="mt-6 rounded-[24px] bg-white p-5 shadow-[0_8px_25px_rgba(0,0,0,.06)] md:p-6"><div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="font-serif text-2xl">Recent gate activity</h2><p className="mt-1 text-xs text-muted">The last scans processed by the system.</p></div><span className="text-xs text-subtle">{recent.data?.length || 0} records</span></div>{recent.data?.length ? <div className="divide-y divide-divider">{recent.data.slice(0, 10).map((entry: any) => <div key={entry.id} className="flex items-center justify-between gap-3 py-3"><div><div className="text-sm font-medium">{entry.result === "allowed" ? "Entry allowed" : "Entry denied"}</div><div className="mt-1 text-xs text-muted">{entry.denialReason ? reasonLabel[entry.denialReason] || entry.denialReason : "Ticket admitted"}</div></div><div className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${entry.result === "allowed" ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{entry.result}</div></div>)}</div> : <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">No gate scans have been recorded yet.</div>}</section>
  </main>;
}
