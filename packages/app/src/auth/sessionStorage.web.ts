import type { StoredSession } from "./sessionStorage.types";

const KEY = "crm.session";

/**
 * Reads the `exp` claim out of a JWT without verifying it.
 *
 * The server is still the only thing that verifies the signature; this only
 * decides whether a persisted session is worth restoring. An expired token in
 * localStorage previously started the app as "logged in" and then failed every
 * request, so it is treated as no session at all.
 */
function isExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { exp?: number };
    return typeof claims.exp === "number" && claims.exp * 1000 <= Date.now();
  } catch {
    // Undecodable token: do not trust it.
    return true;
  }
}

/**
 * Persists the session to localStorage.
 *
 * A browser has no equivalent of "the app process was never restarted" — a
 * refresh tears down every piece of JS state, so an in-memory session would log
 * the user out on every page reload and make the web client feel broken next to
 * the phone, which simply stays logged in.
 *
 * Worth being explicit about the trade-off: localStorage is readable by any
 * script on the origin, so a successful XSS can lift the JWT. The stronger
 * option is an httpOnly cookie, which JavaScript cannot touch — but that needs
 * the API to set the cookie and stop returning the token in the login body,
 * which changes the contract for the mobile client too. localStorage keeps both
 * clients on one API contract for now; if this ever holds real prospect data it
 * should move to a cookie plus a CSRF token.
 */
function read(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;

    if (typeof parsed?.token !== "string" || !parsed.user) return null;

    if (isExpired(parsed.token)) return null;

    return { token: parsed.token, user: parsed.user } as StoredSession;
  } catch {
    // A corrupt or unreadable entry should log the user out quietly rather than
    // leave the app stuck on a broken session.
    return null;
  }
}

export function loadSession(): StoredSession | null {
  return typeof window === "undefined" ? null : read();
}

export function saveSession(next: StoredSession) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing modes and full quotas both throw here. Staying signed in
    // for this page view is better than failing the login outright.
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the in-memory copy is cleared regardless.
  }
}