import { useEffect, useState } from "react";
import { isLocalMode } from "@/lib/localMode";

const CHECK_INTERVAL_MS = 20000;
const CHECK_TIMEOUT_MS = 5000;

/** True network reachability: `navigator.onLine` in the browser-free local
 * app, and a live `/healthz` ping against the backend otherwise — a laptop
 * can report `navigator.onLine: true` on a Wi-Fi network that has no route
 * to the server, so the backend mode needs the extra round trip. */
export function useConnectionStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    if (isLocalMode()) {
      const goOnline = () => setOnline(true);
      const goOffline = () => setOnline(false);
      window.addEventListener("online", goOnline);
      window.addEventListener("offline", goOffline);
      return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
    }

    let cancelled = false;
    const check = async () => {
      if (!navigator.onLine) { if (!cancelled) setOnline(false); return; }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
        await fetch("/healthz", { method: "GET", cache: "no-store", signal: controller.signal });
        clearTimeout(timer);
        if (!cancelled) setOnline(true);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => { cancelled = true; clearInterval(interval); window.removeEventListener("online", check); window.removeEventListener("offline", check); };
  }, []);

  return online;
}
