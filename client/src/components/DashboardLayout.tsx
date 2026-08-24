import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useLocation } from "wouter";
import { BedDouble, ClipboardList, DollarSign, FileSpreadsheet, Gauge, Home, LogOut, Package, ScanLine, Search, Settings, Sparkles, Ticket, Users, Wrench } from "lucide-react";
import { Button } from "./ui/button";

type Role = "staff" | "manager" | "admin" | "guard";
type NavItem = { label: string; mobileLabel: string; path: string; icon: any; roles: Role[]; group: string };

const items: NavItem[] = [
  { label: "Command Center", mobileLabel: "Home", path: "/", icon: Home, roles: ["staff", "manager", "admin", "guard"], group: "Overview" },
  { label: "Ticket Desk", mobileLabel: "Tickets", path: "/tickets", icon: Ticket, roles: ["staff", "manager", "admin"], group: "Front office" },
  { label: "Reservations", mobileLabel: "Stays", path: "/reservations", icon: BedDouble, roles: ["staff", "manager", "admin"], group: "Front office" },
  { label: "Guest Stays", mobileLabel: "Guests", path: "/guest-stays", icon: Users, roles: ["staff", "manager", "admin"], group: "Front office" },
  { label: "Customer Directory", mobileLabel: "Customers", path: "/customers", icon: Search, roles: ["staff", "manager", "admin"], group: "Front office" },
  { label: "Aqua Park", mobileLabel: "Aqua", path: "/aqua-park", icon: Gauge, roles: ["staff", "manager", "admin"], group: "Operations" },
  { label: "Gate Scanner", mobileLabel: "Gate", path: "/gate", icon: ScanLine, roles: ["guard", "manager", "admin"], group: "Operations" },
  { label: "Housekeeping", mobileLabel: "Rooms", path: "/housekeeping", icon: ClipboardList, roles: ["staff", "manager", "admin"], group: "Operations" },
  { label: "Maintenance", mobileLabel: "Repairs", path: "/maintenance", icon: Wrench, roles: ["staff", "manager", "admin"], group: "Operations" },
  { label: "Inventory", mobileLabel: "Stock", path: "/inventory", icon: Package, roles: ["staff", "manager", "admin"], group: "Operations" },
  { label: "Team & Tasks", mobileLabel: "Team", path: "/team", icon: Users, roles: ["manager", "admin"], group: "Operations" },
  { label: "Finance Control", mobileLabel: "Finance", path: "/finance", icon: DollarSign, roles: ["manager", "admin"], group: "Finance" },
  { label: "Revenue Streams", mobileLabel: "Revenue", path: "/revenue", icon: DollarSign, roles: ["manager", "admin"], group: "Finance" },
  { label: "Management Reports", mobileLabel: "Reports", path: "/reports", icon: Gauge, roles: ["manager", "admin"], group: "Finance" },
  { label: "Administration", mobileLabel: "Admin", path: "/administration", icon: Settings, roles: ["admin"], group: "Governance" },
  { label: "Workbook Migration", mobileLabel: "Migration", path: "/migration", icon: FileSpreadsheet, roles: ["admin"], group: "Governance" },
];

export function permittedPath(path: string, role?: string) {
  const normalized = path.split("?")[0];
  const item = items.find((entry) => entry.path === normalized);
  return Boolean(item && role && item.roles.includes(role as Role));
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f5f5f7] text-[#6e6e73]"><div className="rounded-full bg-white px-5 py-3 text-xs font-semibold tracking-wide shadow-[0_5px_18px_rgba(0,0,0,.06)] animate-pulse">Preparing Marasi</div></div>;
  if (!user) return <div className="grid min-h-screen place-items-center overflow-hidden bg-[#f5f5f7] p-6 text-[#1d1d1f]"><div className="absolute h-[36rem] w-[36rem] rounded-full bg-[#d7eaff] blur-3xl"/><div className="relative w-full max-w-md rounded-[30px] border border-white/90 bg-white/80 p-9 text-center shadow-[0_24px_70px_rgba(0,0,0,.12)] backdrop-blur-2xl"><div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-[18px] bg-[#0071e3] text-white shadow-[0_10px_22px_rgba(0,113,227,.28)]"><Sparkles size={23}/></div><p className="text-[11px] font-semibold tracking-wide text-[#6e6e73]">Marasi Alsawadi</p><h1 className="mt-3 font-serif text-3xl tracking-[-.04em]">Operations made simple.</h1><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#6e6e73]">A single operating system for reservations, aqua park entry, rooms, finance, and customer service.</p><Button onClick={() => startLogin()} className="mt-8 h-11 w-full rounded-full bg-[#0071e3] font-semibold text-white hover:bg-[#0077ed]">Sign in</Button></div></div>;

  const role = user.role as Role;
  const demoMode = Boolean((user as any).isDemo);
  const visible = items.filter((entry) => entry.roles.includes(role));
  const groups = Array.from(new Set(visible.map((entry) => entry.group)));
  const activePath = location.split("?")[0];

  return <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] md:flex">
    <aside className="hidden w-[264px] shrink-0 flex-col border-r border-black/[.06] bg-white/75 px-3 py-6 backdrop-blur-2xl md:flex">
      <button onClick={() => setLocation("/")} className="mb-8 flex items-center gap-3 px-3 text-left"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#0071e3] text-white shadow-[0_7px_16px_rgba(0,113,227,.24)]"><Sparkles size={18}/></div><div><div className="font-serif text-[20px] leading-5 tracking-[-.04em]">Marasi</div><div className="mt-1 text-[10px] font-medium tracking-wide text-[#6e6e73]">ALSawadi Resort</div></div></button>
      <div className="mb-3 px-3 text-[11px] font-medium text-[#86868b]">Workspace</div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">{groups.map((group) => <div key={group}><div className="mb-1 px-3 text-[9px] font-semibold uppercase tracking-[.16em] text-[#a1a1a6]">{group}</div><div className="space-y-0.5">{visible.filter((entry) => entry.group === group).map((entry) => { const active = activePath === entry.path; const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${active ? "bg-white text-[#1d1d1f] shadow-[0_4px_15px_rgba(0,0,0,.08)]" : "text-[#515154] hover:bg-black/[.04]"}`}><Icon size={16} className={active ? "text-[#0071e3]" : "text-[#86868b]"}/><span className="font-medium">{entry.label}</span></button>; })}</div></div>)}</nav>
      <div className="mt-5 rounded-2xl border border-black/[.06] bg-white/80 p-3.5 shadow-[0_4px_14px_rgba(0,0,0,.04)]"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f1fe] text-sm font-semibold text-[#0071e3]">{(user.name || "M").slice(0,1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{user.name || "Marasi user"}</div><div className="mt-0.5 capitalize text-[11px] text-[#86868b]">{demoMode ? "Interactive demo" : `${role} access`}</div></div></div><button onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-[#6e6e73] hover:text-[#1d1d1f]"><LogOut size={14}/>{demoMode ? "Reset demo" : "Sign out"}</button></div>
    </aside>
    <main className="min-w-0 flex-1"><header className="sticky top-0 z-10 flex h-[64px] items-center justify-between border-b border-black/[.06] bg-white/75 px-5 backdrop-blur-2xl md:px-10"><button onClick={() => setLocation("/")} className="flex items-center gap-2 font-serif text-lg tracking-[-.03em] md:hidden"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[#0071e3] text-white"><Sparkles size={14}/></span>Marasi</button><div className="hidden md:block"><div className="text-[13px] font-medium text-[#1d1d1f]">Marasi Operations</div><div className="mt-0.5 text-[11px] text-[#86868b]">One system for the resort day</div></div><div className="flex items-center gap-3"><span className="hidden rounded-full bg-[#f2f2f7] px-3 py-1.5 text-[11px] font-medium capitalize text-[#515154] sm:inline">{demoMode ? "Interactive demo" : `${role} access`}</span><div className="grid h-8 w-8 place-items-center rounded-full bg-[#1d1d1f] text-xs font-semibold text-white">{(user.name || "M").slice(0,1).toUpperCase()}</div></div></header>
      <div className="mx-auto max-w-[1440px] p-4 pb-24 md:p-8 lg:p-10">{demoMode && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[#cce5ff] bg-[#f0f7ff] px-4 py-3 text-xs font-medium text-[#0066cc]"><Sparkles size={14}/> Browser-local presentation data — changes stay in this browser and never touch Marasi records.</div>}{children}</div>
      <nav aria-label="Mobile operations navigation" className="fixed inset-x-3 bottom-3 z-20 flex gap-1 overflow-x-auto rounded-[18px] border border-black/[.06] bg-white/90 px-2 py-2 shadow-[0_10px_28px_rgba(0,0,0,.13)] backdrop-blur-2xl md:hidden">{visible.map((entry) => { const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={`flex min-w-[70px] flex-1 flex-col items-center rounded-xl px-2 py-2 text-[10px] font-medium leading-3 transition ${activePath === entry.path ? "bg-[#0071e3] text-white" : "text-[#6e6e73]"}`}><Icon className="mb-1" size={16}/><span className="w-full truncate">{entry.mobileLabel}</span></button> })}</nav>
    </main>
  </div>;
}
