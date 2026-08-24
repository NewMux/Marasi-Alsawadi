import { clearPublicDemoMode, isPublicDemoMode } from "@/lib/demoMode";
import { useCallback, useMemo } from "react";

type Role = "staff" | "manager" | "admin" | "guard";

// This deployment runs without a login wall: the server treats every request
// as a single auto-provisioned system user, so the client mirrors that here
// instead of querying a session. Demo mode (a separate, browser-local
// presentation mode) is unaffected and still resets independently. Role is
// typed as the full union (not the literal "admin") so role-based branches
// elsewhere still type-check if a real per-user role is reintroduced later.
const SYSTEM_USER: { id: number; name: string; email: string | null; role: Role; isDemo: boolean } =
  { id: -1, name: "Marasi Operations", email: null, role: "admin", isDemo: false };

export function useAuth() {
  const demoMode = isPublicDemoMode();

  const logout = useCallback(async () => {
    if (!demoMode) return;
    clearPublicDemoMode();
    window.location.assign("/");
  }, [demoMode]);

  const user = useMemo(() => {
    if (demoMode) return { id: 0, name: "Client presentation", email: "demo@marasi.example", role: "admin" as Role, isDemo: true };
    return SYSTEM_USER;
  }, [demoMode]);

  return {
    user,
    loading: false,
    error: null,
    isAuthenticated: true,
    refresh: () => {},
    logout,
  };
}
