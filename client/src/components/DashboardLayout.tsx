import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useLocation } from "wouter";
import {
  CalendarDays, ClipboardCheck, Droplets, Gauge, LayoutDashboard, LogOut,
  Package, Settings, ShieldCheck, Sparkles, Ticket, Users, Wrench,
} from "lucide-react";
import { Button } from "./ui/button";

type Role = "staff" | "manager" | "admin";
type NavItem = { label: string; path: string; icon: any; roles: Role[] };

const items: NavItem[] = [
  { label: "Command Center", path: "/", icon: LayoutDashboard, roles: ["staff", "manager", "admin"] },
  { label: "Reservations", path: "/reservations", icon: CalendarDays, roles: ["staff", "manager", "admin"] },
  { label: "Aqua Park", path: "/aqua-park", icon: Droplets, roles: ["staff", "manager", "admin"] },
  { label: "Guest Stays", path: "/guest-stays", icon: Users, roles: ["staff", "manager", "admin"] },
  { label: "Housekeeping", path: "/housekeeping", icon: ClipboardCheck, roles: ["staff", "manager", "admin"] },
  { label: "Maintenance", path: "/maintenance", icon: Wrench, roles: ["staff", "manager", "admin"] },
  { label: "Inventory", path: "/inventory", icon: Package, roles: ["manager", "admin"] },
  { label: "Team & Shifts", path: "/team", icon: Users, roles: ["manager", "admin"] },
  { label: "Revenue", path: "/revenue", icon: Gauge, roles: ["manager", "admin"] },
  { label: "Management Reports", path: "/reports", icon: Ticket, roles: ["manager", "admin"] },
  { label: "Access & Property", path: "/administration", icon: ShieldCheck, roles: ["admin"] },
];

export function permittedPath(path: string, role?: string) {
  const item = items.find((entry) => entry.path === path);
  return !item || (role ? item.roles.includes(role as Role) : false);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  if (loading) return <div className="min-h-screen bg-[#f6f2ea] grid place-items-center text-[#657168]"><div className="animate-pulse text-sm tracking-[.18em] uppercase">Preparing the resort desk</div></div>;
  if (!user) return <div className="min-h-screen bg-[#173c3d] grid place-items-center p-6"><div className="max-w-md rounded-[28px] bg-[#fffdf9] p-10 text-center shadow-2xl"><Sparkles className="mx-auto mb-5 h-9 w-9 text-[#c28d4e]"/><h1 className="font-serif text-3xl text-[#173c3d]">Marasi Alsawadi</h1><p className="mt-3 text-sm leading-6 text-[#657168]">Sign in to access the resort and aqua park operations platform.</p><Button onClick={() => startLogin()} className="mt-7 w-full bg-[#173c3d] hover:bg-[#255557]">Sign in securely</Button></div></div>;
  const role = user.role as Role;
  const demoMode = Boolean((user as any).isDemo);
  const visible = items.filter((entry) => entry.roles.includes(role));
  return <div className="min-h-screen bg-[#f6f2ea] text-[#173c3d] md:flex">
    <aside className="hidden w-[276px] shrink-0 flex-col bg-[#173c3d] px-4 py-6 text-white md:flex">
      <button onClick={() => setLocation("/")} className="mb-10 flex items-center gap-3 px-3 text-left"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#c28d4e] text-[#173c3d]"><Sparkles size={19}/></div><div><div className="font-serif text-xl leading-5">Marasi</div><div className="text-[10px] uppercase tracking-[.2em] text-[#b5c8c3]">Alsawadi Resort</div></div></button>
      <div className="mb-3 px-3 text-[10px] uppercase tracking-[.18em] text-[#93aaa4]">Operations</div>
      <nav className="space-y-1">{visible.map((entry) => { const active = location === entry.path; const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? "bg-[#fffdf9] text-[#173c3d] shadow" : "text-[#d7e2dd] hover:bg-white/10"}`}><Icon size={17}/><span>{entry.label}</span></button>; })}</nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-3"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#dce7e1] text-sm font-semibold text-[#173c3d]">{(user.name || "M").slice(0,1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm">{user.name || "Marasi user"}</div><div className="capitalize text-xs text-[#b5c8c3]">{demoMode ? "interactive demo" : role}</div></div></div><button onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-[#b5c8c3] hover:text-white"><LogOut size={14}/>{demoMode ? "Reset demo" : "Sign out"}</button></div>
    </aside>
    <main className="min-w-0 flex-1"><header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[#e6dfd3] bg-[#f6f2ea]/95 px-5 backdrop-blur md:px-9"><button onClick={() => setLocation("/")} className="font-serif text-lg md:hidden">Marasi</button><div className="hidden text-xs uppercase tracking-[.16em] text-[#71817a] md:block">Resort operations system</div><div className="flex items-center gap-3"><span className="hidden rounded-full bg-[#e3efe8] px-3 py-1 text-xs font-medium capitalize text-[#326553] sm:inline">{role} access</span><div className="grid h-8 w-8 place-items-center rounded-full bg-[#173c3d] text-xs font-semibold text-white">{(user.name || "M").slice(0,1).toUpperCase()}</div></div></header>
      <div className="mx-auto max-w-[1540px] p-4 pb-24 md:p-9">{demoMode && <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#efd6ad] bg-[#fff8ea] px-4 py-2 text-xs text-[#785a2d]"><Sparkles size={14}/> Public interactive demo — changes stay in this browser and are never saved.</div>}{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-[#e6dfd3] bg-[#fffdf9] px-2 py-2 md:hidden">{visible.slice(0,7).map((entry) => { const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={`min-w-[78px] flex-1 rounded-lg py-1 text-[10px] ${location === entry.path ? "bg-[#e3efe8] text-[#173c3d]" : "text-[#657168]"}`}><Icon className="mx-auto mb-1" size={16}/>{entry.label.split(" ")[0]}</button> })}</nav>
    </main>
  </div>;
}
