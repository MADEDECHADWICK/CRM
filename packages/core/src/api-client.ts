// packages/core/src/api-client.ts
//
// Deliberately does NOT read process.env itself — Expo (EXPO_PUBLIC_*) and
// Next.js (NEXT_PUBLIC_*) use different env var prefixes for client-exposed
// variables, and this package doesn't know which bundler is consuming it.
// Each app resolves its own URL and passes it in.

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message?: string } };

export function createApiClient(baseUrl: string) {
  return async function apiFetch<T = unknown>(
    path: string,
    token: string | null,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const body: ApiResponse<T> = await res.json();

    // Matches your actual API's { success, data } / { success, error }
    // shape — callers get either real data back or a thrown error with a
    // real message, instead of having to check `.success` everywhere
    // they call this.
    if (!body.success) {
      throw new Error(body.error?.message || body.error?.code || "Request failed");
    }

    return body.data;
  };
}