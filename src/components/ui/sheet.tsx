"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Pinned below the scrolling body — action rows that must stay reachable. */
  footer?: React.ReactNode;
  /** Tailwind max-width class for the panel, e.g. `sm:max-w-lg`. */
  maxWidth?: string;
  className?: string;
  /**
   * `bottom` keeps the panel on the bottom edge at every width. `auto` lifts it
   * into a centred dialog from `sm` up, which is what a form with a fixed
   * footer wants on a desktop screen.
   *
   * Two placements rather than one because the two environments genuinely want
   * different things here, and quietly changing either would have been a visual
   * regression dressed up as a refactor. Unify deliberately, not by accident.
   */
  placement?: "bottom" | "auto";
}

/**
 * The app's one bottom sheet / modal.
 *
 * Merged from two implementations. From the stock side: the body-scroll lock
 * and Escape handling. From the budget side: the portal, the explicit close
 * button, the pinned footer with safe-area padding, centring on wider screens,
 * and its CSS entry animation.
 *
 * The budget side's animation approach won over the stock side's
 * `AnimatePresence` + drag-to-dismiss for one reason: **it degrades correctly
 * when animations do not run.** `animate-sheet-in` has `fill-mode: none`, so
 * the resting state is the final position and the transform exists only while
 * the keyframe plays. Under `prefers-reduced-motion`, in a background tab, or
 * anywhere frames are not composited, the panel is simply in the right place.
 * The framer version drives an inline transform instead, so the same conditions
 * leave it parked at its `initial` offset — one full height below the fold.
 *
 * The cost is losing flick-to-dismiss, which only ever applied to the five
 * stock sheets. Backdrop, Escape and an explicit close button all remain.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-2xl",
  className,
  placement = "bottom",
}: SheetProps) {
  // Portalling has to wait for the client; `document` does not exist on the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex justify-center",
        placement === "auto" ? "items-end sm:items-center" : "items-end",
      )}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px] motion-safe:animate-fade-in"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden",
          "material-thick rounded-t-sheet shadow-sheet motion-safe:animate-sheet-in",
          placement === "auto" && "sm:rounded-sheet",
          maxWidth,
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
          {title ? (
            <h2 className="min-w-0 truncate text-title3 font-bold tracking-tight text-label">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-label-secondary/60 transition-colors hover:bg-fill/15"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-separator/50 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
