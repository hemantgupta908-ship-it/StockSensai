"use client";

/**
 * Icon + colour picker, shared by categories, accounts, goals and policies.
 *
 * Opens as a popover rather than a nested sheet: these pickers are used from
 * inside an editor sheet, and stacking a second sheet on top makes it unclear
 * which one the close button dismisses.
 */

import { useState } from "react";
import { Check, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { getIcon, searchIcons, ICON_COUNT } from "@/lib/budget/icons";
import { CATEGORY_COLOURS } from "@/lib/budget/defaults";

/** The chosen icon on a coloured disc — the standard way records are shown. */
export function IconBadge({
  iconName,
  colour,
  size = 34,
  fallback,
}: {
  iconName?: string | null;
  colour?: string | null;
  size?: number;
  /** Shown when no icon is set — normally the record's first letter. */
  fallback?: string;
}) {
  const Icon = getIcon(iconName);

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, backgroundColor: colour ?? "#8E8E93", fontSize: size * 0.42 }}
      aria-hidden
    >
      {Icon ? (
        <Icon size={size * 0.55} strokeWidth={2.1} />
      ) : (
        (fallback ?? "").slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function IconPicker({
  value,
  colour,
  onChange,
  label = "Icon",
}: {
  value: string | null;
  colour?: string | null;
  onChange: (iconName: string | null) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const groups = searchIcons(query);
  const total = groups.reduce((n, g) => n + g.icons.length, 0);

  return (
    <div className="mb-3">
      <span className="mb-1.5 block text-footnote font-medium text-label-secondary">{label}</span>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-ios border border-separator/50 bg-bg-elevated px-3 py-2.5 text-left transition-colors hover:border-green/50"
      >
        <IconBadge iconName={value} colour={colour} size={30} fallback="?" />
        <span className="flex-1 text-subhead text-label">
          {value ? value.replace(/-/g, " ") : "Choose an icon"}
        </span>
        <span className="text-caption text-label-secondary/50">{open ? "Close" : "Change"}</span>
      </button>

      {open ? (
        <div className="mt-2 rounded-card border border-separator/50 bg-bg-elevated p-3">
          <div className="relative mb-2">
            <Search
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-label-secondary/40"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${ICON_COUNT} icons — try "petrol" or "rent"`}
              className="w-full rounded-ios bg-fill/10 py-2 pl-8 pr-8 text-footnote text-label outline-none placeholder:text-label-secondary/40 focus:ring-2 focus:ring-green/40"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-label-secondary/50 hover:bg-fill/15"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <div className="max-h-[280px] overflow-y-auto pr-1">
            {total === 0 ? (
              <p className="py-6 text-center text-caption text-label-secondary/50">
                No icons match “{query}”.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.title} className="mb-3">
                  <p className="mb-1.5 text-caption2 font-semibold uppercase tracking-wide text-label-secondary/50">
                    {group.title}
                  </p>
                  <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
                    {group.icons.map((entry) => {
                      const Icon = entry.icon;
                      const selected = entry.name === value;
                      return (
                        <button
                          key={entry.name}
                          type="button"
                          title={entry.name.replace(/-/g, " ")}
                          onClick={() => {
                            onChange(selected ? null : entry.name);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex aspect-square items-center justify-center rounded-ios transition-colors",
                            selected
                              ? "bg-green text-white"
                              : "bg-fill/10 text-label-secondary hover:bg-fill/20 hover:text-label",
                          )}
                        >
                          <Icon size={17} strokeWidth={2} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="mt-1 w-full rounded-ios bg-fill/10 py-2 text-caption font-medium text-label-secondary"
            >
              Remove icon
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Colour swatches, paired with the icon picker wherever it appears. */
export function ColourPicker({
  value,
  onChange,
  label = "Colour",
}: {
  value: string | null;
  onChange: (colour: string) => void;
  label?: string;
}) {
  return (
    <div className="mb-3">
      <span className="mb-1.5 block text-footnote font-medium text-label-secondary">{label}</span>
      <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
        {CATEGORY_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Colour ${c}`}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-90"
            style={{ backgroundColor: c }}
          >
            {value === c ? <Check size={15} className="text-white" strokeWidth={3} /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
