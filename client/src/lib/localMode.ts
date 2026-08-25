// There is no database deployed yet, so the app runs entirely client-side by
// default: no login, everything saved to this browser's localStorage (see
// client/src/localApp/store.ts). The real login + tRPC/MySQL backend is
// fully built and untouched — set VITE_ENABLE_BACKEND_LOGIN=true at build
// time to switch back to it once a database is deployed.
export function isLocalMode() {
  return import.meta.env.VITE_ENABLE_BACKEND_LOGIN !== "true";
}
