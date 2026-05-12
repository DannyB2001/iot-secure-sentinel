import { alarmSeverityEnum, type AlarmSeverity } from "@/lib/validation/alarm";

/** Severity dropdown state, including the explicit "no filter" choice. */
export type SeverityFilter = "all" | AlarmSeverity;

/**
 * Decode the `severity` query param into a {@link SeverityFilter}.
 *
 * - Unknown values, null, and empty string fall back to "all" rather than
 *   throwing, so a stale or hand-edited URL never crashes the page.
 */
export function parseSeverityFilter(raw: string | null | undefined): SeverityFilter {
  if (raw == null) return "all";
  return alarmSeverityEnum.options.includes(raw as AlarmSeverity)
    ? (raw as AlarmSeverity)
    : "all";
}
