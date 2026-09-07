import { CalendarIcon, Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { COUNTRIES } from "@/lib/countries";

export const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow: string; title: string; description: string; actions?: ReactNode; children?: ReactNode }) {
  return <header className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
    <div className="max-w-3xl">
      <div className="text-[11px] font-semibold uppercase tracking-[.18em] text-accent">{eyebrow}</div>
      <h1 className="mt-2 font-serif text-[38px] leading-[1.02] tracking-[-.06em] text-ink md:text-[52px]">{title}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-6 text-muted">{description}</p>
      {children}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function Surface({ children, className = "", tone = "plain" }: { children: ReactNode; className?: string; tone?: "plain" | "tinted" | "dark" }) {
  const tones = { plain: "bg-white", tinted: "bg-[#f1fbfc] border-[#cdedf2]", dark: "bg-navy text-white border-navy" };
  return <section className={cx("rounded-[24px] border border-black/[.06] p-5 shadow-[0_10px_30px_rgba(0,0,0,.045)] md:p-6", tones[tone], className)}>{children}</section>;
}

export function SectionHeader({ title, description, action, eyebrow, tone = "light" }: { title: string; description?: string; action?: ReactNode; eyebrow?: string; tone?: "light" | "dark" }) {
  return <div className="mb-5 flex items-start justify-between gap-4"><div>{eyebrow && <div className={cx("mb-1 text-[10px] font-semibold uppercase tracking-[.16em]", tone === "dark" ? "text-teal-tint" : "text-accent")}>{eyebrow}</div>}<h2 className={cx("font-serif text-[23px] leading-tight tracking-[-.04em]", tone === "dark" ? "text-white" : "text-ink")}>{title}</h2>{description && <p className={cx("mt-1.5 max-w-2xl text-[13px] leading-5", tone === "dark" ? "text-[#c5c5ca]" : "text-muted")}>{description}</p>}</div>{action}</div>;
}

export function Field({ label, description, hint, error, children }: { label: string; description?: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="grid gap-2 text-[12px] font-medium text-body"><span>{label}</span>{children}{(description || hint) && <span className="text-[11px] font-normal leading-4 text-subtle">{description || hint}</span>}{error && <span className="text-[11px] font-medium text-danger">{error}</span>}</label>;
}

export function TextField(props: InputHTMLAttributes<HTMLInputElement>) { return <Input {...props} className={cx("h-11 rounded-xl border-line bg-well text-sm shadow-none focus:border-accent focus:ring-4 focus:ring-accent/10", props.className)} />; }
export function SelectField(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={cx("h-11 w-full min-w-0 rounded-xl border border-line bg-well px-3.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10", props.className)} />; }

// A searchable country picker (the plain <select> of 100+ countries is slow
// to scan by eye and doesn't support typing to filter) — same trigger/panel
// pattern as DateField, backed by cmdk for the search-as-you-type list.
export function CountryField({ value, onChange, placeholder = "Select country", className, disabled }: { value: string; onChange: (country: string) => void; placeholder?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} className={cx("flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-well px-3.5 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-60", value ? "text-ink" : "text-muted", className)}>
        <span className="truncate">{value || placeholder}</span>
        <ChevronsUpDown size={15} className="shrink-0 text-muted"/>
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-[280px] p-0" align="start">
      <Command>
        <CommandInput placeholder="Search countries…"/>
        <CommandList>
          <CommandEmpty>No country found.</CommandEmpty>
          <CommandGroup>
            {COUNTRIES.map((country) => <CommandItem key={country} value={country} onSelect={() => { onChange(country); setOpen(false); }}>
              <Check size={14} className={cx("mr-2 shrink-0", value === country ? "opacity-100" : "opacity-0")}/>
              {country}
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}

// ISO ("YYYY-MM-DD") <-> local-date-safe Date conversions, and a DD/MM/YYYY
// date picker that renders the same on every browser/OS regardless of the
// device's own locale — a native <input type="date"> shows MM/DD/YYYY or
// DD/MM/YYYY purely based on OS region settings, which we can't control
// (notably Safari/iPadOS ignores the page's lang attribute for this).
// Accepts a plain "YYYY-MM-DD" string (client form state) or a Date object
// (the mysql2 driver returns DATE columns as JS Date objects, not strings,
// when a tRPC query result is rendered directly — see CommandCenterPage's
// toIsoDate for the same driver quirk). Both are normalized through
// toISOString() first so a Date built at UTC midnight always reads back the
// same calendar date it was written as, regardless of the browser's own
// timezone.
export function toIsoDateString(value: string | Date | undefined | null): string {
  if (!value) return "";
  return value instanceof Date ? (Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10)) : value;
}
export function parseIsoDateLocal(value: string | Date | undefined | null): Date | undefined {
  const iso = toIsoDateString(value);
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
export function toIsoDateLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function formatDateDmy(value: string | Date | undefined | null): string {
  const date = parseIsoDateLocal(value);
  return date ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}` : "";
}

export function DateField({ value, onChange, min, max, placeholder = "DD/MM/YYYY", className, disabled }: { value: string; onChange: (iso: string) => void; min?: string; max?: string; placeholder?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = parseIsoDateLocal(value);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" disabled={disabled} className={cx("flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-line bg-well px-3.5 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-60", selected ? "text-ink" : "text-muted", className)}>
        <span>{selected ? formatDateDmy(value) : placeholder}</span>
        <CalendarIcon size={15} className="shrink-0 text-muted"/>
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start">
      <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(date) => { if (date) { onChange(toIsoDateLocal(date)); setOpen(false); } }} disabled={(date) => (min ? toIsoDateLocal(date) < min : false) || (max ? toIsoDateLocal(date) > max : false)} autoFocus/>
    </PopoverContent>
  </Popover>;
}

export function PrimaryButton({ children, pending, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean }) { return <Button {...props} disabled={pending || props.disabled} className={cx("h-11 rounded-full bg-accent px-5 font-medium text-white shadow-[0_7px_18px_rgba(14,116,144,.2)] hover:bg-accent-hover", className)}>{pending ? <><Loader2 size={15} className="mr-2 animate-spin"/>Saving…</> : children}</Button>; }
export function SecondaryButton({ children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <Button {...props} variant="outline" className={cx("h-10 rounded-full border-line bg-white px-4 text-xs font-medium text-ink hover:bg-fill", className)}>{children}</Button>; }

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "neutral" | "info" }) { const colors = { success: "bg-success-bg text-success", warning: "bg-warning-bg text-warning", danger: "bg-danger-bg text-danger", neutral: "bg-fill text-body", info: "bg-[#e3f4f7] text-accent" }; return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize", colors[tone])}>{children}</span>; }

export function MetricCard({ label, value, detail, tone = "blue", icon: Icon }: { label: string; value: string; detail: string; tone?: "blue" | "green" | "amber" | "red"; icon?: any }) { const colors = { blue: "bg-[#e3f4f7] text-accent", green: "bg-success-bg text-success", amber: "bg-warning-bg text-warning", red: "bg-danger-bg text-danger" }; return <Surface><div className="flex items-start justify-between gap-3"><div><div className="text-[11px] font-medium text-subtle">{label}</div><div className="mt-2 font-serif text-[30px] leading-none tracking-[-.045em] text-ink">{value}</div><div className="mt-2 text-[11px] leading-4 text-subtle">{detail}</div></div>{Icon && <span className={cx("rounded-2xl p-2.5", colors[tone])}><Icon size={18}/></span>}</div></Surface>; }

export function EmptyState({ title, description, action, icon: Icon = Search }: { title: string; description: string; action?: ReactNode; icon?: any }) { return <div className="grid min-h-[190px] place-items-center rounded-2xl border border-dashed border-line bg-well p-8 text-center"><div><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-fill text-subtle"><Icon size={19}/></div><h3 className="mt-3 font-serif text-xl tracking-[-.03em] text-ink">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-5 text-muted">{description}</p>{action && <div className="mt-4">{action}</div>}</div></div>; }
export function LoadingState({ label = "Loading…" }: { label?: string }) { return <div className="flex min-h-[140px] items-center justify-center gap-2 rounded-2xl bg-well text-sm text-muted"><Loader2 size={17} className="animate-spin text-accent"/>{label}</div>; }
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <div className="relative"><Search size={17} aria-hidden="true" className="absolute left-3.5 top-3.5 text-subtle"/><TextField aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="pl-10" /></div>; }

export function TableFrame({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={cx("overflow-x-auto rounded-2xl border border-divider", className)}>{children}</div>; }
export function TableHeader({ children }: { children: ReactNode }) { return <div className="grid gap-3 bg-well px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[.12em] text-subtle">{children}</div>; }
export function TableRow({ children, className = "" }: { children: ReactNode; className?: string }) { return <div className={cx("grid items-center gap-3 border-t border-divider px-4 py-3 text-sm", className)}>{children}</div>; }
