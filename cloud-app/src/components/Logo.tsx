import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("h-7 w-7", className)}
    >
      <defs>
        <linearGradient id="iris-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(263 90% 65%)" />
          <stop offset="60%" stopColor="hsl(280 85% 55%)" />
          <stop offset="100%" stopColor="hsl(220 90% 55%)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#iris-grad)" />
      <path
        d="M16 9 L19 14 L24 16 L19 18 L16 23 L13 18 L8 16 L13 14 Z"
        fill="hsl(0 0% 100% / 0.95)"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-base font-semibold tracking-tight">Iris Gateway</span>
    </span>
  );
}
