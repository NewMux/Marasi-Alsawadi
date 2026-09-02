import { isLocalMode } from "@/lib/localMode";
import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";

type Role = "staff" | "manager" | "admin" | "guard" | "super_admin" | "petty_cash";
type LocalUser = { id: number; name: string; email: string; role: Role; mustChangePassword: boolean; isLocal: true };

export function useAuth() {
  const localMode = isLocalMode();
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { enabled: !localMode, retry: false, refetchOnWindowFocus: false });
  const logoutMutation = trpc.auth.logout.useMutation();

  const user = useMemo(() => {
    if (localMode) return { id: 0, name: "Marasi", email: "", role: "super_admin", mustChangePassword: false, isLocal: true } satisfies LocalUser;
    return meQuery.data ?? null;
  }, [localMode, meQuery.data]);

  const logout = useCallback(async () => {
    if (localMode) return;
    try { await logoutMutation.mutateAsync(); } finally {
      utils.auth.me.setData(undefined, null);
      window.location.assign("/login");
    }
  }, [localMode, logoutMutation, utils]);

  return {
    user,
    loading: localMode ? false : meQuery.isLoading || logoutMutation.isPending,
    error: localMode ? null : meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(user),
    refresh: () => meQuery.refetch(),
    logout,
  };
}
