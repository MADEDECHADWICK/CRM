export type ApiResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: {
        code: string;
        message?: string;
      };
    };

export function createApiClient(baseUrl: string) {
  return async function apiFetch<T = unknown>(
    path: string,
    token: string | null,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
        ...options.headers,
      },
    });

    const contentType =
      response.headers.get("content-type") ?? "";

    const responseText = await response.text();

    if (!contentType.includes("application/json")) {
      console.error("Expected JSON but received:", {
        url,
        status: response.status,
        contentType,
        responseText: responseText.slice(0, 300),
      });

      throw new Error(
        `API returned a non-JSON response (${response.status})`
      );
    }

    let body: ApiResponse<T>;

    try {
      body = JSON.parse(responseText) as ApiResponse<T>;
    } catch {
      throw new Error(
        `API returned invalid JSON (${response.status})`
      );
    }

    if (!response.ok || !body.success) {
      throw new Error(
        body.success
          ? `Request failed with status ${response.status}`
          : body.error?.message ||
              body.error?.code ||
              "Request failed"
      );
    }

    return body.data;
  };
}