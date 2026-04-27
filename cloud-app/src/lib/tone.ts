export type Tone = "neutral" | "primary" | "success" | "warning" | "destructive" | "info";

export type ToneClasses = {
  /** Background + foreground for an icon medallion. */
  iconWrap: string;
  /** Foreground color for a primary value (number, label). */
  value: string;
  /** Gradient stop classes for a card top-bar accent. */
  bar: string;
  /** Wrap + ring color for a panel/empty-state container. */
  panel: string;
};

export const TONE: Record<Tone, ToneClasses> = {
  neutral: {
    iconWrap: "bg-muted text-muted-foreground",
    value: "text-foreground",
    bar: "from-muted-foreground/30 to-transparent",
    panel: "bg-card ring-border",
  },
  primary: {
    iconWrap: "bg-primary-soft text-primary",
    value: "text-foreground",
    bar: "from-primary/40 to-transparent",
    panel: "bg-primary-soft ring-primary/20",
  },
  success: {
    iconWrap: "bg-success-soft text-success",
    value: "text-foreground",
    bar: "from-success/40 to-transparent",
    panel: "bg-success-soft ring-success/20",
  },
  warning: {
    iconWrap: "bg-warning-soft text-warning",
    value: "text-foreground",
    bar: "from-warning/40 to-transparent",
    panel: "bg-warning-soft ring-warning/20",
  },
  destructive: {
    iconWrap: "bg-destructive-soft text-destructive",
    value: "text-destructive",
    bar: "from-destructive/40 to-transparent",
    panel: "bg-destructive-soft ring-destructive/20",
  },
  info: {
    iconWrap: "bg-info-soft text-info",
    value: "text-foreground",
    bar: "from-info/40 to-transparent",
    panel: "bg-info-soft ring-info/20",
  },
};
