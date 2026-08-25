import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { BarChart3, DollarSign, Home, LogOut, Search, Settings, Sparkles, Ticket } from "lucide-react";
import { cx } from "@/components/MarasiUI";
import { LanguageToggle, useLanguage } from "@/contexts/LanguageContext";

type Role = "staff" | "manager" | "admin" | "guard" | "super_admin";
type NavItem = { label: string; arabicLabel: string; mobileLabel: string; path: string; icon: any; roles: Role[]; group: string };

const items: NavItem[] = [
  { label: "Command Center", arabicLabel: "لوحة التحكم", mobileLabel: "Home", path: "/", icon: Home, roles: ["staff", "manager", "admin", "guard", "super_admin"], group: "Overview" },
  { label: "Ticket Desk", arabicLabel: "التذاكر", mobileLabel: "Tickets", path: "/tickets", icon: Ticket, roles: ["staff", "manager", "admin", "super_admin"], group: "Front office" },
  { label: "Customer Directory", arabicLabel: "العملاء", mobileLabel: "Customers", path: "/customers", icon: Search, roles: ["staff", "manager", "admin", "super_admin"], group: "Front office" },
  { label: "Finance Control", arabicLabel: "المصروفات", mobileLabel: "Finance", path: "/finance", icon: DollarSign, roles: ["staff", "manager", "admin", "super_admin"], group: "Finance" },
  { label: "Revenue Report", arabicLabel: "التقرير المالي", mobileLabel: "Report", path: "/reports", icon: BarChart3, roles: ["manager", "admin", "super_admin"], group: "Finance" },
  { label: "Commercial Settings", arabicLabel: "الإعدادات", mobileLabel: "Settings", path: "/settings", icon: Settings, roles: ["super_admin"], group: "Admin" },
];

export function permittedPath(path: string, role?: string) { const normalized = path.split("?")[0]; const item = items.find((entry) => entry.path === normalized); return Boolean(item && role && item.roles.includes(role as Role)); }

function Brand({ onClick, mobile = false }: { onClick: () => void; mobile?: boolean }) { return <button onClick={onClick} className={cx("flex items-center gap-3 text-left", mobile ? "font-serif text-lg tracking-[-.03em] md:hidden" : "mb-9 px-3")}><span className={cx("grid place-items-center bg-accent text-white shadow-[0_8px_18px_rgba(0,113,227,.22)]", mobile ? "h-8 w-8 rounded-[10px]" : "h-10 w-10 rounded-[14px]")}><Sparkles size={mobile ? 14 : 18}/></span><span><span className={cx("block font-serif tracking-[-.04em]", mobile ? "text-lg leading-5" : "text-[20px] leading-5")}>Marasi</span>{!mobile && <span className="mt-1 block text-[10px] font-medium tracking-wide text-muted">ALSawadi Resort</span>}</span></button>; }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  if (!user) return null;
  const role = user.role as Role;
  const { isArabic } = useLanguage();
  const demoMode = Boolean((user as any).isDemo);
  const visible = items.filter((entry) => entry.roles.includes(role));
  const groups = Array.from(new Set(visible.map((entry) => entry.group)));
  const activePath = location.split("?")[0];
  const roleLabel = demoMode ? "Interactive demo" : role === "super_admin" ? "Super Admin" : `${role} access`;

  return <div className="min-h-screen bg-canvas text-ink md:flex"><aside className="hidden w-[264px] shrink-0 flex-col border-r border-black/[.06] bg-white/80 px-3 py-7 backdrop-blur-2xl md:flex"><Brand onClick={() => setLocation("/")}/><div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-subtle">Workspace</div><nav className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">{groups.map((group) => <div key={group}><div className="mb-2 px-3 text-[9px] font-semibold uppercase tracking-[.16em] text-faint">{group}</div><div className="space-y-1">{visible.filter((entry) => entry.group === group).map((entry) => { const Icon = entry.icon; const active = activePath === entry.path; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition", active ? "bg-[#f0f7ff] text-accent" : "text-body hover:bg-fill hover:text-ink")}><Icon size={16} className={active ? "text-accent" : "text-subtle"}/><span className="font-medium">{isArabic ? entry.arabicLabel : entry.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent"/>}</button>; })}</div></div>)}</nav><div className="mt-6 rounded-2xl border border-black/[.06] bg-white p-3.5 shadow-[0_4px_14px_rgba(0,0,0,.04)]"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f1fe] text-sm font-semibold text-accent">{(user.name || "M").slice(0, 1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{user.name || "Marasi user"}</div><div className="mt-0.5 truncate text-[11px] text-subtle">{roleLabel}</div></div></div><button onClick={logout} className="mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-xs text-muted hover:text-ink"><LogOut size={14}/>{demoMode ? "Reset demo" : "Sign out"}</button></div></aside><main className="min-w-0 flex-1"><header className="sticky top-0 z-10 flex h-[64px] items-center justify-between border-b border-black/[.06] bg-white/80 px-4 backdrop-blur-2xl md:px-10"><Brand mobile onClick={() => setLocation("/")}/><div className="hidden md:block"><div className="text-[13px] font-medium text-ink">Marasi Operations</div><div className="mt-0.5 text-[11px] text-subtle">Ticketing, customers, expenses and reports</div></div><div className="flex items-center gap-3"><LanguageToggle/><span className="hidden rounded-full bg-fill px-3 py-1.5 text-[11px] font-medium capitalize text-body sm:inline">{roleLabel}</span><div className="grid h-8 w-8 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{(user.name || "M").slice(0, 1).toUpperCase()}</div></div></header><div className="mx-auto max-w-[1440px] p-4 pb-24 md:p-8 lg:p-10">{demoMode && <div className="mb-6 flex items-center gap-2 rounded-2xl border border-[#cce5ff] bg-[#f0f7ff] px-4 py-3 text-xs font-medium text-[#0066cc]"><Sparkles size={14}/> Browser-local demo data. Nothing here changes production records.</div>}{children}</div><nav aria-label="Mobile operations navigation" className="fixed inset-x-3 bottom-3 z-20 flex gap-1 overflow-x-auto rounded-[18px] border border-black/[.06] bg-white/90 px-2 py-2 shadow-[0_10px_28px_rgba(0,0,0,.13)] backdrop-blur-2xl md:hidden">{visible.map((entry) => { const Icon = entry.icon; return <button key={entry.path} onClick={() => setLocation(entry.path)} className={cx("flex min-w-[70px] flex-1 flex-col items-center rounded-xl px-2 py-2 text-[10px] font-medium leading-3 transition", activePath === entry.path ? "bg-accent text-white" : "text-muted hover:bg-fill")}><Icon className="mb-1" size={16}/><span className="w-full truncate">{isArabic ? entry.arabicLabel : entry.mobileLabel}</span></button>; })}</nav></main></div>;
}
