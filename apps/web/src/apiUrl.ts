/**
 * Where the browser should look for the API.
 *
 * A browser has no LAN address to configure. Metro and any dev/static server
 * serve the bundle from the very machine running the API, so the page's own
 * hostname *is* that machine's address. Deriving the URL from it stays correct
 * however the adapter gets renumbered, and it keeps ordinary browser testing on
 * loopback, where no firewall rule is involved.
 *
 * A phone genuinely has no such hint available — it cannot know which machine is
 * hosting the API — so apps/mobile falls back to EXPO_PUBLIC_API_URL instead.
 *
 * EXPO_PUBLIC_API_URL wins when set, because a deployed bundle is served from a
 * static host whose hostname is not the API. Note EXPO_PUBLIC_* values are
 * inlined at build time rather than read at runtime, so after editing .env the
 * app has to be rebuilt with `pnpm --filter web build`.
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;

  if (configured) return configured;

  if (typeof window !== "undefined" && window.location?.hostname) {
    // Use 127.0.0.1 rather than "localhost": on some machines `localhost`
    // resolves to ::1 (IPv6) first, and the API listens on IPv4, so the
    // browser would get "Failed to fetch" against an unreachable address.
    const host =
      window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname;
    return `http://${host}:4000`;
  }

  return "http://127.0.0.1:4000";
}

export const API_URL = resolveApiUrl();