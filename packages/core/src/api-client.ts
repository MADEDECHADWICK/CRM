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
        /**
         * Present on BR-020 completeness rejections. Carried through so the
         * client can render a checklist instead of a bare sentence — a user
         * told "8 fields outstanding" with no list has no idea what to fix.
         */
        missingFields?: {
          field: string;
          message: string;
          scope: "ORGANIZATION" | "CONTACT";
        }[];
      };
    };

/**
 * A failed request, with the server's structured detail preserved.
 *
 * A plain `Error` would force every caller to re-parse the message string to
 * find out whether a rejection was a validation problem, a permission problem
 * or the completeness gate — which is exactly the kind of string matching that
 * silently breaks when someone rewords an error message.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly missingFields: NonNullable<
    Extract<ApiResponse<unknown>, { success: false }>["error"]["missingFields"]
  >;

  constructor(
    code: string,
    message: string,
    status: number,
    missingFields: ApiError["missingFields"] = []
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.missingFields = missingFields;
  }
}

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

      throw new ApiError(
        "NON_JSON_RESPONSE",
        `API returned a non-JSON response (${response.status})`,
        response.status
      );
    }

    let body: ApiResponse<T>;

    try {
      body = JSON.parse(responseText) as ApiResponse<T>;
    } catch {
      throw new ApiError(
        "INVALID_JSON",
        `API returned invalid JSON (${response.status})`,
        response.status
      );
    }

    if (!response.ok || !body.success) {
      if (body.success) {
        throw new ApiError(
          "REQUEST_FAILED",
          `Request failed with status ${response.status}`,
          response.status
        );
      }
      throw new ApiError(
        body.error?.code ?? "REQUEST_FAILED",
        body.error?.message ?? body.error?.code ?? "Request failed",
        response.status,
        body.error?.missingFields ?? []
      );
    }

    return body.data;
  };
}
