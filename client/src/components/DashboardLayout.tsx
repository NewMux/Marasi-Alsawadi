import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { BarChart3, Boxes, ClipboardList, DollarSign, FileSpreadsheet, Home, LogOut, ScanLine, Search, Settings, Sparkles, Ticket } from "lucide-react";

type Role = "staff" | "manager" | "admin" | "guard" | "super_admin";
type NavItem = { label: string; mobileLabel: string; path: string; icon: any; roles: Role[]; group: string };

const items: NavItem[] = [
  { label: "Command Center", mobileLabel: "Home", path: "/", icon: Home, roles: ["staff", "manager", "admin", "guard", "super_admin"], group: "Overview" },
  { label: "Ticket Desk", mobileLabel: "Tickets", path: "/tickets", icon: Ticket, roles: ["staff", "manager", "admin", "super_admin"], group: "Front office" },
  { label: "Customer Directory", mobileLabel: "Customers", path: "/customers", icon: Search, roles: ["staff", "manager", "admin", "super_admin"], group: "Front office" },
  { label: "Gate Scanner", mobileLabel: "Gate", path: "/gate", icon: ScanLine, roles: ["guard", "manager", "admin", "super_admin"], group: "Operations" },
  { label: "Operations Workspace", mobileLabel: "Operations", path: "/operations", icon: ClipboardList, roles: ["manager", "admin", "super_admin"], group: "Operations" },
  { label: "Finance Control", mobileLabel: "Finance", path: "/finance", icon: DollarSign, roles: ["manager", "admin", "super_admin"], group: "Finance" },
  { label: "Management Reports", mobileLabel: "Reports", path: "/reports", icon: BarChart3, roles: ["manager", "admin", "super_admin"], group: "Finance" },
  { label: "Master Data Hub", mobileLabel: "Master data", path: "/master-data", icon: Boxes, roles: ["manager", "admin", "super_admin"], group: "Governance" },
  { label: "Commercial Settings", mobileLabel: "Settings", path: "/settings", icon: Settings, roles: ["super_admin"], group: "Governance" },
  { label: "Workbook Migration", mobileLabel: "Migration", path: "/migration", icon: FileSpreadsheet, roles: ["super_admin"], group: "Governance" },
];

export function permittedPath(path: string, role?: string) {
  const normalized = path.split("?")[0];
  const item = items.find((entry) => entry.path === normalized);
  return Boolean(item && role && item.roles.includes(role as Role));
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  if (!user) return null;
  const role = user.role as Role;
  const demoMode = Boolean((user as any).isDemo);
  const visible = items.filter((entry) => entry.roles.includes(role));
  const groups = Array.from(new Set(visible.map((entry) => entry.group)));
  const activePath = location.split("?")[0];

  return <div className="min-h-screen bg-canvas text-ink md:flex">
    <aside className="hidden w-[264px] shrink-0 flex-col border-r border-black/[.06] bg-white/75 px-3 py-6 backdrop-blur-2xl md:flex">
      <button onClick={() => setLocation("/")} className="mb-8 flex items-center gap-3 px-3 text-left"><div className="grid h-10 w-10 place-items-center rounded-[14px] bg-accent text-white shadow-[0_7px_16px_rgba(0,113,227,.24)]"><Sparkles size={18}/></div><div><div className="font-serif text-[20px] leading-5 tracking-[-.04em]">Marasi</div><div className="mt-1 text-[10px] font-medium tracking-wide text-muted">ALSawadi Resort</div></div></button>
      <div className="mb-3 px-3 text-[11px] font-medium text-subtle">Workspace</div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">{groups.map((group) => <div key={group}><div className="mb-1 px-3 text-[9px] font-semibold uppercase tracking-[.16em] text-faint">{group}</div><div className="space-y-0.5">{visible.filter((entry) => entry.group === group).map((entry) => { const active = activePath === entry.path; const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${active ? "bg-white text-ink shadow-[0_4px_15px_rgba(0,0,0,.08)]" : "text-body hover:bg-black/[.04]"}`}><Icon size={16} className={active ? "text-accent" : "text-subtle"}/><span className="font-medium">{entry.label}</span></button>; })}</div></div>)}</nav>
      <div className="mt-5 rounded-2xl border border-black/[.06] bg-white/80 p-3.5 shadow-[0_4px_14px_rgba(0,0,0,.04)]"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f1fe] text-sm font-semibold text-accent">{(user.name || "M").slice(0,1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{user.name || "Marasi user"}</div><div className="mt-0.5 capitalize text-[11px] text-subtle">{demoMode ? "Interactive demo" : `${role} access`}</div></div></div><button onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-muted hover:text-ink"><LogOut size={14}/>{demoMode ? "Reset demo" : "Sign out"}</button></div>
    </aside>
    <main className="min-w-0 flex-1"><header className="sticky top-0 z-10 flex h-[64px] items-center justify-between border-b border-black/[.06] bg-white/75 px-5 backdrop-blur-2xl md:px-10"><button onClick={() => setLocation("/")} className="flex items-center gap-2 font-serif text-lg tracking-[-.03em] md:hidden"><span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-white"><Sparkles size={14}/></span>Marasi</button><div className="hidden md:block"><div className="text-[13px] font-medium text-ink">Marasi Operations</div><div className="mt-0.5 text-[11px] text-subtle">One system for the resort day</div></div><div className="flex items-center gap-3"><span className="hidden rounded-full bg-fill px-3 py-1.5 text-[11px] font-medium capitalize text-body sm:inline">{demoMode ? "Interactive demo" : `${role} access`}</span><div className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{(user.name || "M").slice(0,1).toUpperCase()}</div></div></header>
      <div className="mx-auto max-w-[1440px] p-4 pb-24 md:p-8 lg:p-10">{demoMode && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[#cce5ff] bg-[#f0f7ff] px-4 py-3 text-xs font-medium text-[#0066cc]"><Sparkles size={14}/> Browser-local presentation data — changes stay in this browser and never touch Marasi records.</div>}{children}</div>
      <nav aria-label="Mobile operations navigation" className="fixed inset-x-3 bottom-3 z-20 flex gap-1 overflow-x-auto rounded-[18px] border border-black/[.06] bg-white/90 px-2 py-2 shadow-[0_10px_28px_rgba(0,0,0,.13)] backdrop-blur-2xl md:hidden">{visible.map((entry) => { const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={`flex min-w-[70px] flex-1 flex-col items-center rounded-xl px-2 py-2 text-[10px] font-medium leading-3 transition ${activePath === entry.path ? "bg-accent text-white" : "text-muted"}`}><Icon className="mb-1" size={16}/><span className="w-full truncate">{entry.mobileLabel}</span></button> })}</nav>
    </main>
  </div>;
}
