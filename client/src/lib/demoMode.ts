const DEMO_SESSION_KEY = "marasi-public-demo";

export function isDemoHostname(hostname: string) {
  return hostname.endsWith(".vercel.app");
}

export function isDemoPreviewSearch(search: string) {
  return new URLSearchParams(search).get("demo") === "1";
}

export function clearPublicDemoMode() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch {}
}

export function isPublicDemoMode() {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_PUBLIC_DEMO_MODE === "true" || isDemoHostname(window.location.hostname)) return true;
  if (isDemoPreviewSearch(window.location.search)) {
    try { window.sessionStorage.setItem(DEMO_SESSION_KEY, "1"); } catch {}
    return true;
  }
  try { return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "1"; } catch { return false; }
}
