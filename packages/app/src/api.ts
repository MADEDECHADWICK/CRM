import { createApiClient } from "@crm/core";

/**
 * The one HTTP client the whole app shares.
 *
 * Previously every screen built its own from a module-level constant, which
 * meant nine separate clients and — once a second app existed — nine chances
 * for the phone and the browser to end up talking to different origins. A
 * single client configured at startup is both simpler and the thing that makes
 * "the same account sees the same data on either device" checkable rather than
 * aspirational.
 */
let baseUrl = "http://localhost:4000";

/**
 * Called once by each app before first render. Kept as a setter rather than a
 * prop threaded through every screen, so no screen can accidentally construct
 * a second client pointed somewhere else.
 */
export function setApiUrl(url: string) {
  baseUrl = url.replace(/\/+$/, "");
}

export function getApiUrl() {
  return baseUrl;
}

export const apiFetch = createApiClient(() => baseUrl);