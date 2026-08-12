"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const TRIGGER_DISTANCE = 72;
const MAX_PULL = 120;

/**
 * Pull-to-refresh for the recommendation feed.
 *
 * Only engages when the page is already scrolled to the top, so it never
 * competes with ordinary scrolling. Resistance is applied to the drag so the
 * indicator decelerates as it stretches, the way a rubber-banding native list
 * behaves.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}) {
  const pull = useMotionValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  const indicatorOpacity = useTransform(pull, [0, 30, TRIGGER_DISTANCE], [0, 0.6, 1]);
  const indicatorRotate = useTransform(pull, [0, MAX_PULL], [0, 300]);
  const indicatorScale = useTransform(pull, [0, TRIGGER_DISTANCE], [0.6, 1]);

  const settle = useCallback(() => {
    animate(pull, 0, { type: "spring", stiffness: 420, damping: 38 });
  }, [pull]);

  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    animate(pull, TRIGGER_DISTANCE * 0.7, { type: "spring", stiffness: 420, damping: 38 });
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      settle();
    }
  }, [onRefresh, pull, settle]);

  const onTouchStart = (event: React.TouchEvent) => {
    if (window.scrollY > 2 || refreshing) {
      armed.current = false;
      return;
    }
    armed.current = true;
    startY.current = event.touches[0].clientY;
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (!armed.current || startY.current === null || refreshing) return;
    const delta = event.touches[0].clientY - startY.current;
    if (delta <= 0) {
      pull.set(0);
      return;
    }
    // Square-root resistance: easy to start, progressively harder to stretch.
    pull.set(Math.min(MAX_PULL, Math.sqrt(delta) * 7));
  };

  const onTouchEnd = () => {
    if (!armed.current || refreshing) return;
    armed.current = false;
    startY.current = null;
    if (pull.get() >= TRIGGER_DISTANCE) void runRefresh();
    else settle();
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={cn("relative", className)}
    >
      <motion.div
        style={{ opacity: indicatorOpacity, scale: indicatorScale, y: pull }}
        className="pointer-events-none absolute inset-x-0 -top-10 z-10 flex justify-center"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-secondary shadow-pill">
          <motion.div style={{ rotate: refreshing ? undefined : indicatorRotate }}>
            <ArrowsClockwise
              size={17}
              className={cn("text-accent", refreshing && "animate-spin")}
            />
          </motion.div>
        </div>
      </motion.div>

      <motion.div style={{ y: pull }}>{children}</motion.div>
    </div>
  );
}
