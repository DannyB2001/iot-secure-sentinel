/**
 * Extracts a human-readable error message from a uuApp-style error envelope.
 * The envelope shape is `{ uuAppErrorMap: { [code]: { type, message, params? } } }`.
 *
 * Returns the first error entry's message, or `undefined` if the body is not
 * a recognizable envelope. Callers should fall back to a static "Failed to ..."
 * message when this returns undefined.
 */
export function extractUuAppErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const map = (body as { uuAppErrorMap?: unknown }).uuAppErrorMap;
  if (!map || typeof map !== "object") return undefined;

  for (const entry of Object.values(map as Record<string, unknown>)) {
    if (entry && typeof entry === "object") {
      const message = (entry as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) {
        return message;
      }
    }
  }
  return undefined;
}
