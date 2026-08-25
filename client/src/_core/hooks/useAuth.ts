import { clearPublicDemoMode, isPublicDemoMode } from "@/lib/demoMode";
import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";

type Role = "staff" | "manager" | "admin" | "guard" | "super_admin";
type DemoUser = { id: number; name: string; email: string; role: Role; mustChangePassword: boolean; isDemo: true };

export function useAuth() {
  const demoMode = isPublicDemoMode();
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { enabled: !demoMode, retry: false, refetchOnWindowFocus: false });
  const logoutMutation = trpc.auth.logout.useMutation();

  const user = useMemo(() => {
    if (demoMode) return { id: 0, name: "Client presentation", email: "demo@marasi.example", role: "super_admin", mustChangePassword: false, isDemo: true } satisfies DemoUser;
    return meQuery.data ?? null;
  }, [demoMode, meQuery.data]);

  const logout = useCallback(async () => {
    if (demoMode) {
      clearPublicDemoMode();
      window.location.assign("/");
      return;
    }
    try { await logoutMutation.mutateAsync(); } finally {
      utils.auth.me.setData(undefined, null);
      window.location.assign("/login");
    }
  }, [demoMode, logoutMutation, utils]);

  return {
    user,
    loading: demoMode ? false : meQuery.isLoading || logoutMutation.isPending,
    error: demoMode ? null : meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(user),
    refresh: () => meQuery.refetch(),
    logout,
  };
}
