export function isDemoHostname(hostname: string) {
  return hostname.endsWith(".vercel.app");
}

export function isPublicDemoMode() {
  if (typeof window === "undefined") return false;
  return import.meta.env.VITE_PUBLIC_DEMO_MODE === "true" || isDemoHostname(window.location.hostname);
}
