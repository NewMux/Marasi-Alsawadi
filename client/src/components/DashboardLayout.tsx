import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useLocation } from "wouter";
import { Gauge, LogOut, Sparkles, Ticket } from "lucide-react";
import { Button } from "./ui/button";

type Role = "staff" | "manager" | "admin";
type NavItem = { label: string; mobileLabel: string; path: string; icon: any; roles: Role[] };

const items: NavItem[] = [
  { label: "Ticket & Customers", mobileLabel: "Tickets", path: "/tickets", icon: Ticket, roles: ["staff", "manager", "admin"] },
  { label: "Expenses & Report", mobileLabel: "Finance", path: "/finance", icon: Gauge, roles: ["manager", "admin"] },
];

export function permittedPath(path: string, role?: string) {
  const item = items.find((entry) => entry.path === path);
  return Boolean(item && role && item.roles.includes(role as Role));
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#071626] text-white"><div className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-semibold uppercase tracking-[.24em] text-[#9be7db] animate-pulse">Preparing the Marasi desk</div></div>;
  if (!user) return <div className="grid min-h-screen place-items-center overflow-hidden bg-[#071626] p-6 text-white"><div className="absolute h-[38rem] w-[38rem] rounded-full bg-[#0d6f70]/30 blur-3xl"/><div className="relative w-full max-w-md rounded-[32px] border border-white/10 bg-white/[.08] p-9 text-center shadow-2xl backdrop-blur-xl"><div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[#33c9b7] text-[#071626] shadow-[0_12px_30px_rgba(51,201,183,.35)]"><Sparkles size={24}/></div><p className="text-[10px] font-bold uppercase tracking-[.28em] text-[#a4f1e6]">Marasi Alsawadi</p><h1 className="mt-3 font-serif text-4xl">Operations, refined.</h1><p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-[#c5d2db]">Secure counter sales and commercial control for the resort and aqua park.</p><Button onClick={() => startLogin()} className="mt-8 h-12 w-full rounded-xl bg-[#35c9b7] font-semibold text-[#071626] hover:bg-[#70e1d2]">Sign in securely</Button></div></div>;
  const role = user.role as Role;
  const demoMode = Boolean((user as any).isDemo);
  const visible = items.filter((entry) => entry.roles.includes(role));
  return <div className="min-h-screen bg-[#eef2f2] text-[#102237] md:flex">
    <aside className="relative hidden w-[272px] shrink-0 flex-col overflow-hidden bg-[#071626] px-4 py-6 text-white md:flex"><div className="absolute -right-16 top-[-40px] h-48 w-48 rounded-full bg-[#118d87]/25 blur-3xl"/>
      <button onClick={() => setLocation("/tickets")} className="relative mb-11 flex items-center gap-3 px-3 text-left"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#35c9b7] text-[#071626] shadow-[0_10px_28px_rgba(53,201,183,.32)]"><Sparkles size={20}/></div><div><div className="font-serif text-[22px] leading-5">Marasi</div><div className="mt-1 text-[9px] font-bold uppercase tracking-[.23em] text-[#92d9d0]">Alsawadi Resort</div></div></button>
      <div className="relative mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-[#6e9aaa]">Operations suite</div>
      <nav className="relative space-y-1.5">{visible.map((entry) => { const active = location === entry.path; const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${active ? "bg-white text-[#0d2740] shadow-[0_10px_24px_rgba(0,0,0,.18)]" : "text-[#aac2cd] hover:bg-white/[.08] hover:text-white"}`}><span className={`grid h-7 w-7 place-items-center rounded-lg ${active ? "bg-[#d7f5ef] text-[#087d76]" : "bg-white/[.06] text-[#7eddd0]"}`}><Icon size={15}/></span><span className="font-medium">{entry.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#25bdaa]"/>}</button>; })}</nav>
      <div className="relative mt-auto rounded-2xl border border-white/10 bg-white/[.06] p-3.5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#d7f5ef] text-sm font-bold text-[#0a3145]">{(user.name || "M").slice(0,1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{user.name || "Marasi user"}</div><div className="mt-0.5 capitalize text-[10px] font-semibold tracking-wide text-[#79bdb5]">{demoMode ? "interactive demo" : `${role} access`}</div></div></div><button onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-[#9ab6c1] hover:text-white"><LogOut size={14}/>{demoMode ? "Reset demo" : "Sign out"}</button></div>
    </aside>
    <main className="min-w-0 flex-1"><header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#dfe7e9] bg-[#f8fbfb]/80 px-5 backdrop-blur-xl md:px-10"><button onClick={() => setLocation("/tickets")} className="flex items-center gap-2 font-serif text-lg text-[#102237] md:hidden"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#0c2943] text-[#8ff3e4]"><Sparkles size={15}/></span>Marasi</button><div className="hidden md:block"><div className="text-[10px] font-bold uppercase tracking-[.22em] text-[#6d8693]">Marasi Command</div><div className="mt-1 text-sm font-medium text-[#18354b]">Ticketing & financial control</div></div><div className="flex items-center gap-3"><span className="hidden rounded-full border border-[#cde9e6] bg-[#ecfffb] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.13em] text-[#087d76] sm:inline">{role} access</span><div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0d2943] text-xs font-bold text-white">{(user.name || "M").slice(0,1).toUpperCase()}</div></div></header>
      <div className="mx-auto max-w-[1540px] p-4 pb-24 md:p-8 lg:p-10">{demoMode && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[#bceae3] bg-[#effdfa] px-4 py-3 text-xs font-medium text-[#0b716b]"><Sparkles size={14}/> Public interactive demo — changes are kept only in this browser session.</div>}{children}</div>
      <nav aria-label="Mobile operations navigation" className="fixed inset-x-3 bottom-3 z-20 flex justify-around rounded-2xl border border-white/10 bg-[#081827]/95 px-2 py-2 shadow-[0_14px_36px_rgba(4,18,32,.28)] backdrop-blur-xl md:hidden">{visible.map((entry) => { const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={`flex min-w-[92px] flex-col items-center rounded-xl px-3 py-2 text-[10px] font-semibold leading-3 transition ${location === entry.path ? "bg-[#35c9b7] text-[#061622]" : "text-[#a9c3cc]"}`}><Icon className="mb-1" size={16}/><span className="w-full truncate">{entry.mobileLabel}</span></button> })}</nav>
    </main>
  </div>;
}
