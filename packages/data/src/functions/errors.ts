import type { z } from "zod";
import { apiErrorSchema } from "../generated/protocol";

export function validationErrorDetails(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      return `${path === "" ? "request" : path}: ${issue.message}`;
    })
    .join("; ");
}

export function errorDetails(error: unknown, operation: string): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message =
    error instanceof Error ? error.message : "No error details were provided.";
  if (message.startsWith(`${operation} failed`)) {
    return message;
  }
  const advice: Record<string, string> = {
    NotAllowedError: "Check browser permissions and retry from a button click.",
    SecurityError: "The browser's security policy blocked this operation.",
    NotReadableError:
      "The file or device cannot be read; check access and try selecting it again.",
    NotFoundError: "The requested file or device is no longer available.",
    NotSupportedError:
      "The browser does not support this resource or media format.",
    AbortError: "The operation was cancelled.",
    TimeoutError: "The operation exceeded its time limit.",
  };
  const hint = advice[name];
  return `${operation} failed (${name}): ${message}${hint === undefined ? "" : ` ${hint}`}`;
}

export async function httpError(
  response: Response,
  operation: string,
): Promise<Error> {
  const text = await response.text();
  const body = text.trim();
  let detail = body;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") && body !== "") {
    try {
      const parsed = apiErrorSchema.safeParse(JSON.parse(body));
      if (parsed.success) {
        detail = parsed.data.error;
      }
    } catch {
      detail = "The server returned an invalid JSON error response.";
    }
  } else if (contentType.includes("text/html")) {
    detail =
      "The server returned an HTML error page instead of the expected response.";
  }
  const reference = response.headers.get("x-error-id");
  const status = `${response.status}${response.statusText === "" ? "" : ` ${response.statusText}`}`;
  const explanation =
    detail === ""
      ? "The server returned no explanation."
      : detail.slice(0, 4096);
  const referenceText =
    reference === null || reference === "" || detail.includes(reference)
      ? ""
      : ` [Reference: ${reference}]`;
  return new Error(
    `${operation} failed (HTTP ${status}). ${explanation}${referenceText}`,
  );
}
