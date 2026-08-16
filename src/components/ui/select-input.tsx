"use client";

import React, { Children, isValidElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { inputClass } from "./field";

/**
 * Styled dropdown that accepts the same children as a native `<select>`.
 *
 * The `<option>` / `<optgroup>` API is load-bearing: ~68 call sites use this as
 * a drop-in replacement, and `props.onChange` is handed a change-event shape so
 * those handlers keep working unchanged.
 *
 * Keyboard and ARIA were added when this moved into the shared kit — it was
 * previously a `<button>` and a `<div>` of buttons with no roles, no Escape and
 * no arrow keys, which is fine to ship in one screen and not fine to make the
 * app's standard select. Focus deliberately stays on the trigger and the active
 * option is tracked with `aria-activedescendant`, which is the pattern that
 * survives a portal-free popup without focus-trapping gymnastics.
 */

interface ParsedOption {
  value: string;
  label: string;
  group?: string;
}

/** Flatten `<option>` / `<optgroup>` children into a list we can index. */
function parseOptions(children: React.ReactNode): ParsedOption[] {
  const options: ParsedOption[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;

    if (child.type === "option") {
      const element = child as React.ReactElement<any>;
      options.push({ value: element.props.value as string, label: element.props.children as string });
      return;
    }

    if (child.type === "optgroup") {
      const groupElement = child as React.ReactElement<any>;
      const groupLabel = groupElement.props.label as string;
      Children.forEach(groupElement.props.children, (groupChild) => {
        if (!isValidElement(groupChild) || groupChild.type !== "option") return;
        const element = groupChild as React.ReactElement<any>;
        options.push({
          value: element.props.value as string,
          label: element.props.children as string,
          group: groupLabel,
        });
      });
    }
  });

  return options;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const options = useMemo(() => parseOptions(props.children), [props.children]);
  const selectedIndex = options.findIndex((o) => o.value === props.value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : (props.value as string);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep the highlighted row visible when arrowing past the edge of the list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function commit(option: ParsedOption) {
    props.onChange?.({
      target: { value: option.value },
      currentTarget: { value: option.value },
    } as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function openList() {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (props.disabled) return;

    if (!open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      case "Tab":
        // Let focus leave, but don't leave a popup hanging over the next field.
        setOpen(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (options[activeIndex]) commit(options[activeIndex]);
        break;
    }
  }

  return (
    <div className={cn("relative w-full", open && "z-50", props.className)} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
        disabled={props.disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center justify-between text-left transition-all rounded-2xl border border-separator/40 bg-fill/5 hover:bg-fill/10 px-3.5 py-2.5 text-subhead font-medium text-label active:scale-[0.99]",
          open && "border-brand ring-2 ring-brand/20 bg-fill/10",
        )}
      >
        <span className="truncate">{selectedLabel || "Select..."}</span>
        <CaretDown
          size={16}
          weight="bold"
          className={cn("shrink-0 text-label-secondary/60 transition-transform duration-200", open && "rotate-180 text-brand")}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-2xl border border-separator/40 dark:border-white/10 bg-bg-secondary/95 backdrop-blur-xl p-1.5 shadow-2xl"
          >
            <div ref={listRef} id={listId} role="listbox" className="max-h-56 space-y-1 overflow-y-auto overscroll-contain py-0.5 px-0.5">
              {options.map((option, index) => {
                const showGroup =
                  option.group && (index === 0 || options[index - 1].group !== option.group);
                const selected = props.value === option.value;
                return (
                  <React.Fragment key={`${option.group ?? ""}:${option.value}`}>
                    {showGroup && (
                      <div
                        role="presentation"
                        className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-label-secondary/50"
                      >
                        {option.group}
                      </div>
                    )}
                    <button
                      type="button"
                      id={`${listId}-opt-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      onClick={() => commit(option)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-subhead transition-all",
                        index === activeIndex ? "bg-fill/15" : "hover:bg-fill/10",
                        selected ? "font-semibold text-brand bg-brand/10" : "text-label font-normal",
                      )}
                    >
                      <span className="truncate">{option.label}</span>
                      {selected && <Check size={16} weight="bold" className="shrink-0 text-brand" aria-hidden />}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
