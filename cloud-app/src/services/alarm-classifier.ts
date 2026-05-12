import type { EventCreateInput } from "@/lib/validation/event";
import type { AlarmCategory, AlarmSeverity } from "@/lib/validation/alarm";

export type AlarmDraft = {
  severity: AlarmSeverity;
  category: AlarmCategory;
  message: string;
};

export const THRESHOLDS = {
  tempWarnHigh: 35,
  tempCritHigh: 50,
  tempWarnLow: 5,
  batteryWarn: 3.0,
  batteryCrit: 2.7,
} as const;

export function classify(input: EventCreateInput): AlarmDraft | null {
  switch (input.type) {
    case "tamper":
      return {
        severity: "critical",
        category: "tamper",
        message: input.message ?? "Tamper detected on device.",
      };
    case "temperature": {
      if (input.value === undefined) return null;
      if (input.value >= THRESHOLDS.tempCritHigh) {
        return {
          severity: "critical",
          category: "temperature",
          message: `Temperature ${input.value.toFixed(1)} C above critical threshold.`,
        };
      }
      if (input.value >= THRESHOLDS.tempWarnHigh) {
        return {
          severity: "warning",
          category: "temperature",
          message: `Temperature ${input.value.toFixed(1)} C above warning threshold.`,
        };
      }
      if (input.value <= THRESHOLDS.tempWarnLow) {
        return {
          severity: "warning",
          category: "temperature",
          message: `Temperature ${input.value.toFixed(1)} C below warning threshold.`,
        };
      }
      return null;
    }
    case "battery": {
      if (input.value === undefined) return null;
      if (input.value <= THRESHOLDS.batteryCrit) {
        return {
          severity: "critical",
          category: "battery",
          message: `Battery ${input.value.toFixed(2)} V below critical threshold.`,
        };
      }
      if (input.value <= THRESHOLDS.batteryWarn) {
        return {
          severity: "warning",
          category: "battery",
          message: `Battery ${input.value.toFixed(2)} V below warning threshold.`,
        };
      }
      return null;
    }
    case "heartbeat":
      return null;
  }
}
