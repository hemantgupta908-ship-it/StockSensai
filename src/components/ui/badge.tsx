import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/lib/strategies/types";

type Tone = "neutral" | "green" | "amber" | "red" | "blue" | "purple";

const TONES: Record<Tone, string> = {
  neutral: "bg-fill/[0.12] text-label-secondary/80 dark:bg-white/[0.10]",
  green: "bg-green/[0.16] text-green",
  amber: "bg-amber/[0.18] text-amber",
  red: "bg-red/[0.16] text-red",
  blue: "bg-blue/[0.14] text-blue",
  purple: "bg-purple/[0.16] text-purple",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-[3px]",
        "text-caption2 font-semibold tracking-tight",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Green / amber / red, used sparingly so the colour still means something. */
export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const tone: Tone = level === "Low" ? "green" : level === "Medium" ? "amber" : "red";
  return (
    <Badge tone={tone} className={className}>
      {level} risk
    </Badge>
  );
}

export function ExchangeBadge({ exchange }: { exchange: string }) {
  return (
    <span className="rounded-[5px] bg-fill/[0.12] px-1.5 py-[1px] text-caption2 font-semibold uppercase tracking-wide text-label-secondary/60 dark:bg-white/[0.09]">
      {exchange}
    </span>
  );
}

/** Signed percentage in the market convention: green up, red down. */
export function ChangePill({ value, className }: { value: number; className?: string }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        "numeric text-footnote font-semibold",
        positive ? "text-green" : "text-red",
        className,
      )}
    >
      {positive ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}
