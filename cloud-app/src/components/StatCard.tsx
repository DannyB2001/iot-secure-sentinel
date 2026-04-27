import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TONE, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  subtitle,
  tone,
  icon: Icon,
  href,
}: {
  title: string;
  value: number | string;
  subtitle: string;
  tone: Tone;
  icon: LucideIcon;
  href?: string;
}) {
  const style = TONE[tone];
  const inner = (
    <Card className="relative overflow-hidden transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r",
          style.bar,
        )}
      />
      <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", style.iconWrap)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className={cn("text-3xl font-semibold tabular-nums", style.value)}>{value}</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{subtitle}</span>
          {href ? (
            <span className="inline-flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              View <ArrowRight className="h-3 w-3" />
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  if (!href) return inner;
  return (
    <Link
      href={href}
      className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {inner}
    </Link>
  );
}
