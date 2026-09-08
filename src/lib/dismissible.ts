"use client";

import { useEffect, useRef } from "react";

/**
 * What Android's hardware back button should close before it navigates.
 *
 * A sheet, a keypad or a confirmation dialog is drawn *over* the page rather
 * than being a page of its own, so the router knows nothing about it. Back was
 * therefore handled as an ordinary navigation: opening "Add transaction" from
 * the transactions list and pressing back popped that list off the history and
 * landed on the home screen, sheet and all.
 *
 * So overlays announce themselves here while they are on screen, and the back
 * handler closes the topmost one instead. Escape already does this on the web;
 * this is the same rule for the button Android users actually have.
 *
 * A plain module-level array rather than context: `NativeShell` sits above the
 * router and every overlay is a portal somewhere below it, so there is no
 * provider both sides could share, and nothing here needs to re-render.
 */

interface Overlay {
  dismiss: () => void;
}

/** Innermost last — a keypad opened over a sheet is dismissed first. */
const stack: Overlay[] = [];

/**
 * Close the topmost overlay. Returns `false` when nothing was open, which is
 * the caller's cue to navigate.
 *
 * The entry is left on the stack for the overlay's own cleanup to remove when
 * it actually goes, rather than being popped here. An overlay is allowed to
 * answer a dismissal with a question instead of closing — the add-transaction
 * form asks before throwing away a half-typed entry — and popping would drop
 * the form from the stack while it was still on screen, so a later back press
 * would navigate out from under it. That is the original bug, one press
 * further along.
 */
export function dismissTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.dismiss();
  return true;
}

/** How many overlays are registered. For tests. */
export function openOverlayCount(): number {
  return stack.length;
}

/**
 * Register an overlay as dismissible for as long as `open` holds.
 *
 * The contract: `onDismiss` either closes this overlay or puts something else
 * dismissible on screen. One that does neither makes the back button inert.
 *
 * `onDismiss` is read through a ref, so a handler rebuilt on every render — the
 * common case, since these are usually arrow functions in JSX — does not churn
 * the stack and reorder it underneath a nested overlay.
 */
export function useDismissible(open: boolean, onDismiss: () => void) {
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });

  useEffect(() => {
    if (!open) return;
    const entry: Overlay = { dismiss: () => latest.current() };
    stack.push(entry);
    return () => {
      const at = stack.lastIndexOf(entry);
      if (at !== -1) stack.splice(at, 1);
    };
  }, [open]);
}
