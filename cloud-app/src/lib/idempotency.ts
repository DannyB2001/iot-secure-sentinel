import { createHash } from "node:crypto";

const SEP = "|";
const NULL_SENTINEL = String.fromCharCode(0);

/**
 * Stable, collision-resistant idempotency key for event/create.
 *
 * Missing optional fields are encoded as a single NUL byte (U+0000), which
 * cannot legally appear in any of the user-supplied string inputs Zod accepts.
 * This guarantees that (value=undefined, message="x") and
 * (value=x, message=undefined) never hash to the same key.
 */
export function eventIdempotencyKey(parts: {
  deviceId: string;
  sensorKey: string;
  timestamp: string;
  value?: number;
  message?: string;
}): string {
  const fields = [
    parts.deviceId,
    parts.sensorKey,
    parts.timestamp,
    parts.value === undefined ? NULL_SENTINEL : String(parts.value),
    parts.message === undefined ? NULL_SENTINEL : parts.message,
  ];
  return createHash("sha256").update(fields.join(SEP), "utf8").digest("hex");
}
