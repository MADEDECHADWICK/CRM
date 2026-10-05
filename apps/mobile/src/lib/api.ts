import { Platform } from "react-native";

/**
 * Where the API lives, resolved per platform.
 *
 * A hardcoded LAN address in .env is the obvious approach and it is wrong
 * constantly. This machine's address has already moved 192.168.1.31 ->
 * 192.168.1.91 -> 192.168.1.141 during development, and every stale value
 * fails identically and unhelpfully as ERR_CONNECTION_TIMED_OUT, which looks
 * like a server problem rather than a DHCP lease that rolled over.
 *
 * On web there is no address to configure at all. Metro serves the bundle from
 * the very machine running the API, so the page's own hostname *is* that
 * machine's address, and deriving the API URL from it stays correct no matter
 * how the adapter gets renumbered. As a bonus it keeps browser testing on
 * loopback, where no firewall rule is involved.
 *
 * On a device there is genuinely no such hint available — the phone has no way
 * to know which machine is hosting the API — so EXPO_PUBLIC_API_URL is the only
 * option and has to be kept current by hand. Note that EXPO_PUBLIC_* values are
 * inlined at build time rather than read at runtime, so after editing .env the
 * bundler must be restarted with `npx expo start --clear`, or it keeps serving
 * the previous value and the change appears to do nothing.
 */
function resolveApiUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    return `http://${window.location.hostname}:4000`;
  }

  return process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
}

export const API_URL = resolveApiUrl();