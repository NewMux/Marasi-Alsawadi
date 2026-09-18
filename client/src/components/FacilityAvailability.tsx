import { useMemo, useState } from "react";
import { cx, StatusPill } from "@/components/MarasiUI";
import { useT, type TranslationKey } from "@/lib/i18n";

// PRD Round 14 follow-up, item 2: the visual availability calendar/timeline
// on the New Booking screen — both daily and hourly — read from the same
// `facilityBookings.listForFacility` list the server builds directly on top
// of the conflict-check's own data, so what's highlighted here can never
// disagree with what the conflict warning below the form says.
export type FacilityAvailabilityBooking = {
  referenceNumber: number; start: string; end: string; startTime: string | null;
  quantity: string; customerName: string | null; status: "booking" | "confirmed" | "cancelled";
  hoursRemaining: number | null;
};

function isoDatesBetween(start: string, end: string) {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  // Defensive cap — a facility booking spanning more than a year is not a
  // real case this calendar needs to render, and guards against looping
  // forever on bad data.
  for (let i = 0; i < 366 && cursor.getTime() <= last.getTime(); i++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Daily facilities: expands every booking's [start, end] into a lookup by ISO date, plus the Date[] the calendar's `modifiers` prop needs. */
export function useDailyAvailability(bookings: FacilityAvailabilityBooking[]) {
  return useMemo(() => {
    const byDate = new Map<string, FacilityAvailabilityBooking[]>();
    for (const booking of bookings) {
      for (const iso of isoDatesBetween(booking.start, booking.end)) {
        const existing = byDate.get(iso) || [];
        existing.push(booking);
        byDate.set(iso, existing);
      }
    }
    const bookedDates = Array.from(byDate.keys()).map((iso) => new Date(`${iso}T00:00:00`));
    return { byDate, bookedDates };
  }, [bookings]);
}

const statusPillKey: Record<FacilityAvailabilityBooking["status"], TranslationKey> = {
  booking: "facility.statusBookingPill", confirmed: "facility.statusConfirmedPill", cancelled: "facility.statusCancelledPill",
};

export function BookingInfoList({ bookings }: { bookings: FacilityAvailabilityBooking[] }) {
  const t = useT();
  return <div className="max-w-xs p-3">
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-subtle">{t("facility.existingBookingsOnDay")}</div>
    <div className="grid gap-2">
      {bookings.map((booking) => <div key={booking.referenceNumber} className="rounded-xl bg-well p-2.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <b>{t("facility.conflictReference")} #{booking.referenceNumber}</b>
          <StatusPill tone={booking.status === "confirmed" ? "success" : "warning"}>{t(statusPillKey[booking.status])}</StatusPill>
        </div>
        <div className="mt-1 text-muted">{booking.customerName || t("facility.noCustomerName")}</div>
      </div>)}
    </div>
  </div>;
}

/** Hourly facilities: a horizontal 08:00–22:00 timeline for one specific day, with booked segments highlighted and click-to-view details. */
export function HourlyAvailabilityTimeline({ bookings, date }: { bookings: FacilityAvailabilityBooking[]; date: string }) {
  const t = useT();
  const [selected, setSelected] = useState<FacilityAvailabilityBooking | null>(null);
  const openHour = 8; const closeHour = 22; const totalHours = closeHour - openHour;
  const dayBookings = bookings.filter((booking) => booking.start === date && booking.startTime);
  const hourMarks = Array.from({ length: totalHours + 1 }, (_, i) => openHour + i);
  return <div className="rounded-2xl border border-divider bg-well p-4">
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-subtle">{t("facility.timelineTitle")}</div>
    <div className="relative h-10 rounded-lg bg-white">
      {dayBookings.map((booking) => {
        const [hh, mm] = (booking.startTime || "0:0").split(":").map(Number);
        const startFraction = Math.max(0, (hh + mm / 60 - openHour) / totalHours);
        const widthFraction = Math.min(1 - startFraction, Number(booking.quantity) / totalHours);
        if (widthFraction <= 0) return null;
        return <button
          key={booking.referenceNumber} type="button"
          onClick={() => setSelected(selected?.referenceNumber === booking.referenceNumber ? null : booking)}
          className={cx(booking.status === "confirmed" ? "bg-danger/70" : "bg-warning/70", "absolute top-0 h-full rounded-md text-[10px] font-semibold text-white transition hover:brightness-95")}
          style={{ left: `${startFraction * 100}%`, width: `${widthFraction * 100}%` }}
        >
          #{booking.referenceNumber}
        </button>;
      })}
    </div>
    <div className="mt-1 flex justify-between text-[10px] text-subtle">{hourMarks.filter((_, i) => i % 2 === 0).map((hour) => <span key={hour}>{String(hour).padStart(2, "0")}:00</span>)}</div>
    {!dayBookings.length && <p className="mt-2 text-[11px] text-subtle">{t("facility.noBookingsToday")}</p>}
    {selected && <div className="mt-3 border-t border-divider pt-3"><BookingInfoList bookings={[selected]}/></div>}
  </div>;
}
