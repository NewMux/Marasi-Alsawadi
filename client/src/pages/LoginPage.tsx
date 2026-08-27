import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import marasiLogoFull from "@/assets/marasi-logo-full.webp";

function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10 text-ink"><div className="w-full max-w-[440px]"><div className="mb-6 flex justify-center"><img src={marasiLogoFull} alt="Marasi Alsawadi Resort &amp; Aqua Park" className="h-32 w-auto"/></div><section className="rounded-[28px] border border-white bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,.10)] sm:p-8"><div className="text-[11px] font-semibold uppercase tracking-[.13em] text-accent">{eyebrow}</div><h1 className="mt-3 font-serif text-[34px] leading-[1.05] tracking-[-.05em]">{title}</h1><p className="mt-3 text-sm leading-6 text-muted">{description}</p><div className="mt-7">{children}</div></section><p className="mt-5 text-center text-[11px] text-subtle">Authorized resort personnel only.</p></div></main>;
}

export default function LoginPage() {
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ username: "", password: "" });
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.assign("/");
    },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => {
    if (isAuthenticated) window.location.assign(user?.mustChangePassword ? "/change-password" : "/");
  }, [isAuthenticated, user?.mustChangePassword]);
  if (isAuthenticated) return null;
  return <AuthShell eyebrow="Secure operations" title="Sign in to continue." description="Use the staff account provided by the Super Admin. Pricing and configuration remain restricted by role."><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); login.mutate(form); }}><label className="grid gap-2 text-xs font-medium text-body">Username<Input autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })}/></label><label className="grid gap-2 text-xs font-medium text-body">Password<Input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}/></label><Button className="mt-2 h-12 rounded-full bg-accent text-white hover:bg-accent-hover" disabled={login.isPending} type="submit">{login.isPending ? <><Loader2 size={16} className="animate-spin"/>Signing in…</> : <><KeyRound size={16}/>Sign in</>}</Button></form></AuthShell>;
}

export function ChangePasswordPage() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => { toast.success("Password updated. Sign in again."); window.location.assign("/login"); },
    onError: (error) => toast.error(error.message),
  });
  return <AuthShell eyebrow="Account protection" title="Choose a new password." description="Your temporary password must be replaced before this account can access resort operations."><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (form.newPassword !== form.confirmPassword) return toast.error("New passwords do not match"); change.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword }); }}><label className="grid gap-2 text-xs font-medium text-body">Temporary password<Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}/></label><label className="grid gap-2 text-xs font-medium text-body">New password<Input type="password" autoComplete="new-password" minLength={12} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })}/><span className="text-[11px] font-normal text-subtle">Use at least 12 characters.</span></label><label className="grid gap-2 text-xs font-medium text-body">Confirm new password<Input type="password" autoComplete="new-password" minLength={12} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}/></label><Button className="mt-2 h-12 rounded-full bg-accent text-white hover:bg-accent-hover" disabled={change.isPending} type="submit">{change.isPending ? <><Loader2 size={16} className="animate-spin"/>Updating…</> : <><ShieldCheck size={16}/>Update password</>}</Button></form></AuthShell>;
}
