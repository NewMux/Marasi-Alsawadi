export function isDemoHostname(hostname: string) {
  return hostname.endsWith(".vercel.app");
}

export function isDemoPreviewSearch(search: string) {
  return new URLSearchParams(search).get("demo") === "1";
}

export function isPublicDemoMode() {
  if (typeof window === "undefined") return false;
  return import.meta.env.VITE_PUBLIC_DEMO_MODE === "true" || isDemoHostname(window.location.hostname) || isDemoPreviewSearch(window.location.search);
}
