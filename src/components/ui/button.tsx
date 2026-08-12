"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "plain" | "destructive" | "tinted";
type Size = "sm" | "md" | "lg";

/**
 * Accent-driven rather than hardcoded blue.
 *
 * The default accent is `#007AFF`, which is exactly light-mode `--sys-blue`, so
 * this changes nothing until the user picks a different accent — at which point
 * the stock side follows it too, which is the point of having one app-wide
 * accent rather than two environments with separate skins.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-pill active:bg-accent/90",
  secondary:
    "bg-fill/[0.12] text-label active:bg-fill/[0.2] dark:bg-white/[0.10] dark:active:bg-white/[0.16]",
  tinted: "bg-accent/[0.14] text-accent active:bg-accent/[0.22]",
  plain: "bg-transparent text-accent active:opacity-60",
  destructive: "bg-red/[0.14] text-red active:bg-red/[0.22]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-footnote rounded-[10px]",
  md: "h-11 px-5 text-subhead rounded-[12px]",
  lg: "h-[52px] px-6 text-body rounded-[14px]",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

/**
 * The scale-down on press is the whole point — it's what makes a tap feel like
 * it registered on a touchscreen where there's no hover state to rely on.
 */
export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 600, damping: 28 }}
      disabled={disabled}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 font-semibold",
        "transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}

/** Circular icon button used in nav bars. */
export function IconButton({
  className,
  children,
  label,
  ...props
}: ButtonProps & { label: string }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 600, damping: 28 }}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full",
        "bg-fill/[0.10] text-label active:bg-fill/[0.18]",
        "dark:bg-white/[0.10] dark:active:bg-white/[0.16]",
        "transition-colors duration-150",
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
}
