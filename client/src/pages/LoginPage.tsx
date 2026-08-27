import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import marasiLogoFull from "@/assets/marasi-logo-full.webp";
import { LanguageToggle } from "@/contexts/LanguageContext";
import { useT } from "@/lib/i18n";

function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  const t = useT();
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10 text-ink"><div className="w-full max-w-[440px]"><div className="mb-4 flex justify-end"><LanguageToggle/></div><div className="mb-6 flex justify-center"><img src={marasiLogoFull} alt="Marasi Alsawadi Resort &amp; Aqua Park" className="h-32 w-auto"/></div><section className="rounded-[28px] border border-white bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,.10)] sm:p-8"><div className="text-[11px] font-semibold uppercase tracking-[.13em] text-accent">{eyebrow}</div><h1 className="mt-3 font-serif text-[34px] leading-[1.05] tracking-[-.05em]">{title}</h1><p className="mt-3 text-sm leading-6 text-muted">{description}</p><div className="mt-7">{children}</div></section><p className="mt-5 text-center text-[11px] text-subtle">{t("login.footer")}</p></div></main>;
}

export default function LoginPage() {
  const t = useT();
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
  return <AuthShell eyebrow={t("login.eyebrowSecure")} title={t("login.title")} description={t("login.description")}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); login.mutate(form); }}><label className="grid gap-2 text-xs font-medium text-body">{t("login.username")}<Input autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })}/></label><label className="grid gap-2 text-xs font-medium text-body">{t("login.password")}<Input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}/></label><Button className="mt-2 h-12 rounded-full bg-accent text-white hover:bg-accent-hover" disabled={login.isPending} type="submit">{login.isPending ? <><Loader2 size={16} className="animate-spin"/>{t("login.signingIn")}</> : <><KeyRound size={16}/>{t("login.signIn")}</>}</Button></form></AuthShell>;
}

export function ChangePasswordPage() {
  const t = useT();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const change = trpc.auth.changePassword.useMutation({
    onSuccess: () => { toast.success(t("login.passwordUpdated")); window.location.assign("/login"); },
    onError: (error) => toast.error(error.message),
  });
  return <AuthShell eyebrow={t("login.eyebrowProtect")} title={t("login.changeTitle")} description={t("login.changeDescription")}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (form.newPassword !== form.confirmPassword) return toast.error(t("login.passwordMismatch")); change.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword }); }}><label className="grid gap-2 text-xs font-medium text-body">{t("login.tempPassword")}<Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}/></label><label className="grid gap-2 text-xs font-medium text-body">{t("login.newPassword")}<Input type="password" autoComplete="new-password" minLength={12} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })}/><span className="text-[11px] font-normal text-subtle">{t("login.newPasswordHint")}</span></label><label className="grid gap-2 text-xs font-medium text-body">{t("login.confirmPassword")}<Input type="password" autoComplete="new-password" minLength={12} value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}/></label><Button className="mt-2 h-12 rounded-full bg-accent text-white hover:bg-accent-hover" disabled={change.isPending} type="submit">{change.isPending ? <><Loader2 size={16} className="animate-spin"/>{t("login.updating")}</> : <><ShieldCheck size={16}/>{t("login.updatePassword")}</>}</Button></form></AuthShell>;
}
