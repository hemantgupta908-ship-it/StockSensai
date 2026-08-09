"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * iOS grouped list. Rows share a container with hairline separators between
 * them (inset from the left, as iOS does) rather than each row drawing its own
 * border, which would double up.
 */
export function ListGroup({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card bg-bg-secondary",
        "border border-separator/40 dark:border-white/[0.06]",
        "shadow-card dark:shadow-card-dark",
        "[&>*+*]:border-t [&>*+*]:border-separator/40 dark:[&>*+*]:border-white/[0.06]",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface RowProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
  className?: string;
  destructive?: boolean;
}

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  href,
  onClick,
  trailing,
  className,
  destructive,
}: RowProps) {
  const interactive = Boolean(href || onClick);

  const inner = (
    <div className={cn("flex w-full items-center gap-3 px-4 py-3", className)}>
      {icon && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-label-secondary/70">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1 text-left">
        <div
          className={cn(
            "truncate text-subhead font-medium",
            destructive ? "text-red" : "text-label",
          )}
        >
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 line-clamp-2 text-footnote text-label-secondary/60">{subtitle}</div>
        )}
      </div>
      {value && (
        <div className="numeric shrink-0 text-footnote text-label-secondary/60">{value}</div>
      )}
      {trailing}
      {interactive && !trailing && (
        <CaretRight size={17} className="shrink-0 text-label-quaternary/30" />
      )}
    </div>
  );

  if (href) {
    return (
      <motion.div whileTap={{ scale: 0.985 }} transition={{ type: "spring", stiffness: 600, damping: 30 }}>
        <Link href={href} className="block active:bg-fill/[0.06]">
          {inner}
        </Link>
      </motion.div>
    );
  }

  if (onClick) {
    return (
      <motion.button
        whileTap={{ scale: 0.985 }}
        transition={{ type: "spring", stiffness: 600, damping: 30 }}
        onClick={onClick}
        className="block w-full active:bg-fill/[0.06]"
      >
        {inner}
      </motion.button>
    );
  }

  return inner;
}

/** Explanatory text below a group, like iOS Settings footers. */
export function ListFooter({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-2 text-footnote leading-snug text-label-secondary/55">{children}</p>
  );
}
