"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * iOS action-sheet style bottom sheet: springs up from the bottom edge, dims
 * and blurs what's behind it, and can be flicked down to dismiss.
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
  // Lock body scroll while presented, and restore exactly what was there before
  // rather than assuming it was "auto".
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              // Dismiss on a deliberate flick or a long drag, matching iOS.
              if (info.offset.y > 120 || info.velocity.y > 550) onClose();
            }}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] w-full max-w-2xl",
              "material-thick rounded-t-sheet shadow-sheet",
              "flex flex-col overflow-hidden",
              className,
            )}
          >
            <div className="flex shrink-0 cursor-grab justify-center pb-1 pt-2.5 active:cursor-grabbing">
              <div className="h-[5px] w-9 rounded-full bg-fill/40" />
            </div>
            {title && (
              <div className="shrink-0 px-5 pb-3 pt-1">
                <h2 className="text-title3 font-bold tracking-tight text-label">{title}</h2>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
