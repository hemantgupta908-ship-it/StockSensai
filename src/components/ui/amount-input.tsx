"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Backspace, Check } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/field";
import { evaluateExpression, isExpression } from "@/lib/budget/expression";

/**
 * Amount entry with the app's own keypad.
 *
 * The phone keyboard is the reason this exists. Android's numeric keyboard —
 * what `inputMode="decimal"` asks for — has no `+`, `-`, `*` or `/` key, so the
 * arithmetic the amount fields have always supported ("886.38-878", "1200/3")
 * was reachable on desktop and unreachable on the device where someone actually
 * splits a bill. Switching to the full alphabetic keyboard to hunt for a minus
 * sign is not an answer.
 *
 * So on touch devices the OS keyboard is suppressed entirely (`readOnly` plus
 * `inputMode="none"` — `readOnly` is what actually stops it; `inputMode` alone
 * is advisory) and a keypad of our own is presented instead, with the operators
 * on it. On a pointer device the field stays an ordinary text input you can
 * type into, with the keypad available from the affordance on its right, since
 * a hardware keyboard already has every key this needs.
 *
 * The value stays a *string* throughout, exactly as the amount fields already
 * treat it: the raw expression is what the field shows and what the caller
 * receives, and it is settled to its numeric result on dismissal and on blur,
 * so whatever a caller reads at submit time is a plain number string.
 */

/** Keys the pad can emit, beyond digits and `.`. */
const OPERATORS = ["÷", "×", "-", "+"] as const;

/**
 * True when this device wants the app keypad rather than the OS one.
 *
 * Coarse pointer rather than a width breakpoint: a narrow desktop window still
 * has a real keyboard, and a large tablet still does not. Resolved in an effect
 * so the server and the first client render agree (both `false`), then
 * corrected — a mismatch here would be a hydration error on every amount field.
 */
export function useAppKeypad(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return coarse;
}

/** Light tap feedback where the platform offers it; a no-op everywhere else. */
function tapFeedback() {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (nav && typeof nav.vibrate === "function") {
    try {
      nav.vibrate(8);
    } catch {
      /* Vibration is a nicety; a device that refuses it changes nothing. */
    }
  }
}

/**
 * Append a keystroke to the expression, keeping it well-formed as it is built.
 *
 * The rules are the ones a pocket calculator applies: an operator typed after
 * another operator replaces it rather than stacking, a second decimal point
 * inside the same number is dropped, and a lone leading zero is consumed by the
 * first real digit.
 */
export function applyKey(current: string, key: string): string {
  const text = current;

  if (key === ".") {
    // Only one point per number — look back to the start of the current one.
    const tail = text.split(/[+\-×÷()]/).pop() ?? "";
    if (tail.includes(".")) return text;
    return tail === "" ? `${text}0.` : `${text}.`;
  }

  if ((OPERATORS as readonly string[]).includes(key)) {
    if (text === "") return key === "-" ? "-" : text;
    const last = text.slice(-1);
    if ((OPERATORS as readonly string[]).includes(last)) return text.slice(0, -1) + key;
    if (last === "(") return key === "-" ? text + key : text;
    return text + key;
  }

  if (key === "(") {
    const last = text.slice(-1);
    // An implicit multiply reads better than silently refusing "2(3+4)".
    if (last && /[\d.)]/.test(last)) return `${text}×(`;
    return `${text}(`;
  }

  if (key === ")") {
    const opens = (text.match(/\(/g) ?? []).length;
    const closes = (text.match(/\)/g) ?? []).length;
    if (opens <= closes) return text;
    const last = text.slice(-1);
    if (!last || /[+\-×÷(]/.test(last)) return text;
    return `${text})`;
  }

  // A digit. Replace a lone leading zero rather than growing "007".
  if (/^\d$/.test(key)) {
    const tail = text.split(/[+\-×÷()]/).pop() ?? "";
    if (tail === "0") return text.slice(0, -1) + key;
    return text + key;
  }

  return text;
}

/** Flip the sign of the number currently being entered. */
export function toggleSign(text: string): string {
  if (text === "") return "-";
  // Find where the trailing number starts, so "12+5" negates only the 5.
  const match = text.match(/(\d[\d.]*)$/);
  if (!match) return text.startsWith("-") ? text.slice(1) : `-${text}`;
  const start = text.length - match[1].length;
  const before = text.slice(0, start);
  if (before.endsWith("-")) {
    const beforeSign = before.slice(0, -1);
    // "12-5" is a subtraction, not a negative 5; flip the operator instead.
    if (beforeSign && /[\d.)]$/.test(beforeSign)) return `${beforeSign}+${match[1]}`;
    return beforeSign + match[1];
  }
  if (before.endsWith("+")) return `${before.slice(0, -1)}-${match[1]}`;
  return `${before}-${match[1]}`;
}

/** Reduce the text to its numeric result when it is a complete expression. */
export function settle(text: string): string {
  if (!isExpression(text)) return text;
  const value = evaluateExpression(text);
  return value === null ? text : String(value);
}

function KeypadKey({
  label,
  onPress,
  variant = "digit",
  className,
  ariaLabel,
}: {
  label: React.ReactNode;
  onPress: () => void;
  variant?: "digit" | "operator" | "action" | "confirm";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      // Pointer-down, not click: the pad sits over a focused field, and a click
      // would first blur that field, settling the value mid-entry.
      onPointerDown={(event) => {
        event.preventDefault();
        tapFeedback();
        onPress();
      }}
      className={cn(
        "flex h-12 select-none items-center justify-center rounded-[14px] text-title3 font-medium",
        "transition-transform active:scale-95",
        variant === "digit" && "bg-fill/10 text-label active:bg-fill/20",
        variant === "operator" && "bg-fill/[0.07] text-accent active:bg-fill/20",
        variant === "action" && "bg-fill/[0.07] text-label-secondary active:bg-fill/20",
        variant === "confirm" && "bg-accent text-accent-fg active:brightness-95",
        className,
      )}
    >
      {label}
    </button>
  );
}

function Keypad({
  value,
  onChange,
  onClose,
  label,
  currencySymbol,
  allowNegative,
}: {
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  /** Shown above the keys so the running total is visible over the sheet. */
  label?: string;
  currencySymbol?: string;
  allowNegative: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Do not let the sheet underneath close too.
        event.stopPropagation();
        onClose();
      }
    };
    // Capture phase, so this runs before the host sheet's own Escape handler.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const preview = useMemo(() => evaluateExpression(value), [value]);
  const showPreview = isExpression(value);

  const press = useCallback((key: string) => onChange(applyKey(value, key)), [onChange, value]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close keypad"
        tabIndex={-1}
        onPointerDown={(event) => {
          event.preventDefault();
          onClose();
        }}
        className="flex-1 cursor-default"
      />

      <div
        role="group"
        aria-label="Amount keypad"
        className="material-thick relative z-10 rounded-t-sheet border-t border-separator/50 px-3 pt-3 shadow-sheet motion-safe:animate-sheet-in pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <span className="truncate text-caption font-semibold uppercase tracking-wider text-label-secondary/60">
            {label ?? "Amount"}
          </span>
          <span
            className={cn(
              "numeric truncate text-right text-title3 font-semibold",
              showPreview && preview === null ? "text-red" : "text-label",
            )}
          >
            {currencySymbol}
            {showPreview ? (preview === null ? "—" : preview) : value || "0"}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <KeypadKey label="C" ariaLabel="Clear" variant="action" onPress={() => onChange("")} />
          <KeypadKey label="(" variant="action" onPress={() => press("(")} />
          <KeypadKey label=")" variant="action" onPress={() => press(")")} />
          <KeypadKey
            label={<Backspace size={22} />}
            ariaLabel="Backspace"
            variant="action"
            onPress={() => onChange(value.slice(0, -1))}
          />

          {["7", "8", "9"].map((digit) => (
            <KeypadKey key={digit} label={digit} onPress={() => press(digit)} />
          ))}
          <KeypadKey label="÷" ariaLabel="Divide" variant="operator" onPress={() => press("÷")} />

          {["4", "5", "6"].map((digit) => (
            <KeypadKey key={digit} label={digit} onPress={() => press(digit)} />
          ))}
          <KeypadKey label="×" ariaLabel="Multiply" variant="operator" onPress={() => press("×")} />

          {["1", "2", "3"].map((digit) => (
            <KeypadKey key={digit} label={digit} onPress={() => press(digit)} />
          ))}
          <KeypadKey label="−" ariaLabel="Minus" variant="operator" onPress={() => press("-")} />

          <KeypadKey
            label={allowNegative ? "±" : "00"}
            ariaLabel={allowNegative ? "Toggle sign" : "Double zero"}
            variant="action"
            onPress={() =>
              onChange(allowNegative ? toggleSign(value) : applyKey(applyKey(value, "0"), "0"))
            }
          />
          <KeypadKey label="0" onPress={() => press("0")} />
          <KeypadKey label="." onPress={() => press(".")} />
          <KeypadKey label="+" ariaLabel="Plus" variant="operator" onPress={() => press("+")} />

          <KeypadKey
            label="="
            ariaLabel="Evaluate"
            variant="action"
            className="col-span-2"
            onPress={() => onChange(settle(value))}
          />
          <KeypadKey
            label={
              <span className="flex items-center gap-1.5 text-headline">
                <Check size={18} weight="bold" /> Done
              </span>
            }
            variant="confirm"
            className="col-span-2"
            onPress={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export interface AmountInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "inputMode"
  > {
  value: string;
  onChange: (next: string) => void;
  /** Prefix glyph rendered inside the field, e.g. a currency symbol. */
  prefix?: string;
  /** Caption shown on the keypad's running-total row. */
  keypadLabel?: string;
  /** Offer `±`. Off for fields that cannot be negative (quantities, prices). */
  allowNegative?: boolean;
  /** Show the `= result` line under the field while an expression is pending. */
  showPreview?: boolean;
  /** Formats the preview line. Defaults to the raw number. */
  formatPreview?: (value: number) => string;
}

/**
 * The amount field itself.
 *
 * Controlled on a string, because the text may legitimately be a half-built
 * expression that no number can represent. Read it with `amountValue` (or
 * `Number`, once settled) at submit time.
 */
export function AmountInput({
  value,
  onChange,
  prefix,
  keypadLabel,
  allowNegative = false,
  showPreview = true,
  formatPreview,
  className,
  onBlur,
  onFocus,
  autoFocus,
  ...rest
}: AmountInputProps) {
  const keypadMode = useAppKeypad();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const describedBy = useId();

  const openKeypad = useCallback(() => {
    setOpen(true);
    // The pad covers the lower half of the screen; make sure the field it
    // belongs to is not the thing underneath it.
    requestAnimationFrame(() => {
      inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  const closeKeypad = useCallback(() => {
    setOpen(false);
    onChange(settle(value));
  }, [onChange, value]);

  // A touch field asking for autofocus should bring up our pad, not sit there
  // looking focused with no keyboard — the OS one is suppressed.
  useEffect(() => {
    if (autoFocus && keypadMode) openKeypad();
  }, [autoFocus, keypadMode, openKeypad]);

  const numeric = useMemo(() => evaluateExpression(value), [value]);
  const pending = showPreview && isExpression(value);

  return (
    <>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-label-secondary/60">
            {prefix}
          </span>
        ) : null}

        <input
          {...rest}
          ref={inputRef}
          type="text"
          // `decimal` on a pointer device is harmless and helps nothing; on
          // touch we want no OS keyboard at all.
          inputMode={keypadMode ? "none" : "decimal"}
          readOnly={keypadMode}
          value={value}
          autoFocus={autoFocus && !keypadMode}
          aria-describedby={pending ? describedBy : undefined}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => {
            if (keypadMode) openKeypad();
            onFocus?.(event);
          }}
          onClick={() => {
            if (keypadMode) openKeypad();
          }}
          onBlur={(event) => {
            // Leave a pending expression alone while the pad is up: the pad is
            // what took focus away, and it settles on its own dismissal.
            if (!open) onChange(settle(value));
            onBlur?.(event);
          }}
          className={cn(
            inputClass,
            prefix && "pl-8",
            !keypadMode && "pr-10",
            open && "ring-2 ring-accent/40",
            className,
          )}
        />

        {!keypadMode ? (
          <button
            type="button"
            aria-label="Open calculator keypad"
            onClick={openKeypad}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[9px] text-label-secondary/50 transition-colors hover:bg-fill/15 hover:text-label"
          >
            <span aria-hidden className="text-footnote font-semibold">
              +−
            </span>
          </button>
        ) : null}
      </div>

      {pending ? (
        <p
          id={describedBy}
          className={cn(
            "mt-1 px-1 text-caption",
            numeric === null ? "text-red" : "text-label-secondary/70",
          )}
        >
          {numeric === null
            ? "Not a valid calculation"
            : `= ${formatPreview ? formatPreview(numeric) : numeric}`}
        </p>
      ) : null}

      {open ? (
        <Keypad
          value={value}
          onChange={onChange}
          onClose={closeKeypad}
          label={keypadLabel}
          currencySymbol={prefix}
          allowNegative={allowNegative}
        />
      ) : null}
    </>
  );
}
