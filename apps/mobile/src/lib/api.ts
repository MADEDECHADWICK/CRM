import { NativeModules, Platform } from "react-native";

/**
 * Where the API lives, resolved per platform.
 *
 * A hardcoded LAN address in .env is the obvious approach and it is wrong
 * constantly: this machine's address has already moved several times during
 * development, and every stale value fails identically and unhelpfully as
 * ERR_CONNECTION_TIMED_OUT, which looks like a server problem rather than a
 * DHCP lease that rolled over.
 *
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL, when set — the only correct answer for a deployed
 *      build (a static host whose address is not the API). Inlined at build
 *      time, so editing .env needs a rebuild / `expo start --clear`.
 *   2. Web: the page's own hostname is the machine serving the bundle, which
 *      is the machine running the API.
 *   3. Native dev: the host the JS bundle was loaded from — i.e. the machine
 *      running `expo start`. A phone on the same Wi-Fi therefore reaches the
 *      API with no hardcoded IP to keep current.
 *   4. Fallback: localhost (only correct on a simulator).
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured;

  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    return `http://${window.location.hostname}:4000`;
  }

  // The dev bundle URL looks like "http://192.168.1.5:8081/index.bundle?...".
  const scriptURL = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode
    ?.scriptURL;
  const host = scriptURL?.split("://")[1]?.split(":")[0];
  if (host) return `http://${host}:4000`;

  return "http://localhost:4000";
}

export const API_URL = resolveApiUrl();
