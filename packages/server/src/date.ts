/**
 * Returns the current date and time as an ISO 8601 formatted string. This is roughly equivalent to
 * `time.Now()` in Golang.
 *
 * For example: "2023-12-29T18:21:43.812446Z"
 */
export function getCurrentDatetime(): string {
  const now = new Date();
  return now.toISOString();
}
