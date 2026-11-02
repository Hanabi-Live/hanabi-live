export function getHTTPErrorStatus(error: unknown): number {
  const code =
    typeof error === "object" && error !== null && "statusCode" in error
      ? error.statusCode
      : undefined;
  return typeof code === "number"
    && Number.isSafeInteger(code)
    && code >= 400
    && code < 600
    ? code
    : 500;
}
