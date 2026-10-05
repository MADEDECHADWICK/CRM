import type { StoredSession } from "./sessionStorage.types";

/**
 * In-memory session, used on native.
 *
 * Deliberately not persisted. Keeping the JWT out of device storage means an
 * unlocked phone that someone else picks up does not hand over a live session,
 * and it matches what this app did before the web client existed.
 */
let session: StoredSession | null = null;

export function loadSession(): StoredSession | null {
  return session;
}

export function saveSession(next: StoredSession) {
  session = next;
}

export function clearSession() {
  session = null;
}