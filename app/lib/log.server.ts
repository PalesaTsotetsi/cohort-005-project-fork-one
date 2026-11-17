/**
 * Logs a failure that the caller swallows as one structured JSON line:
 * the event, the caller's fields, and the error's message.
 */
export function logFailure(
  event: string,
  fields: Record<string, unknown>,
  error: unknown
): void {
  console.error(
    JSON.stringify({
      event,
      ...fields,
      error: error instanceof Error ? error.message : String(error),
    })
  );
}
