/**
 * Returns the current date and time as an ISO 8601 formatted string. This is roughly equivalent to
 * `time.Now()` in Golang.
 */
export function getCurrentDatetime(): string {
  const now = new Date();
  return now.toISOString();
}
