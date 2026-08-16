"use client";

/**
 * Icon + colour picker, shared by categories, accounts, goals and policies.
 *
 * Opens as a popover/accordion rather than a nested sheet: these pickers are used from
 * inside an editor sheet, and stacking a second sheet on top makes it unclear
 * which one the close button dismisses.
 */

import { useState, useEffect } from "react";
import { Check, MagnifyingGlass, X } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { getIcon, searchIcons, ICON_COUNT } from "@/lib/budget/icons";
import { COLOUR_FAMILIES, COLOUR_FAMILY_INDEX } from "@/lib/budget/defaults";

/** The chosen icon on a coloured disc/squircle — the standard way records are shown. */
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
  // `react-hooks/static-components` flags this as creating a component during
  // render. It is not: `getIcon` is a lookup in a module-level Map, so the same
  // name always yields the same component reference and React reconciles it
  // without remounting. Restructuring to satisfy the rule would add indirection
  // and change nothing at runtime.
  // eslint-disable-next-line react-hooks/static-components
  const Icon = getIcon(iconName);

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-2xl font-semibold text-white shadow-sm transition-all"
      style={{ width: size, height: size, backgroundColor: colour ?? "#8E8E93", fontSize: size * 0.42 }}
      aria-hidden
    >
      {Icon ? (
        // eslint-disable-next-line react-hooks/static-components
        <Icon size={size * 0.55} weight="fill" />
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
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-footnote font-semibold text-label-secondary">{label}</span>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-2xl border border-separator/40 bg-fill/5 px-3.5 py-2.5 text-left transition-all hover:bg-fill/10 active:scale-[0.99]"
      >
        <IconBadge iconName={value} colour={colour} size={32} fallback="?" />
        <span className="flex-1 text-subhead font-medium text-label capitalize">
          {value ? value.replace(/-/g, " ") : "Choose an icon"}
        </span>
        <span className="text-caption font-semibold text-brand">{open ? "Done" : "Change"}</span>
      </button>

      {open ? (
        <div className="mt-2.5 rounded-2xl border border-separator/40 dark:border-white/10 bg-bg-secondary p-3 shadow-lg animate-in fade-in zoom-in-95 duration-150">
          <div className="relative mb-2.5">
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-label-secondary/50"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${ICON_COUNT} icons...`}
              className="w-full rounded-xl bg-fill/10 py-2 pl-8 pr-8 text-footnote text-label outline-none placeholder:text-label-secondary/40 focus:ring-2 focus:ring-brand/30"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-label-secondary/60 hover:bg-fill/15"
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <div className="max-h-[220px] overflow-y-auto pr-1">
            {total === 0 ? (
              <p className="py-6 text-center text-caption text-label-secondary/50">
                No icons match “{query}”.
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.title} className="mb-3">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-label-secondary/50">
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
                            "flex aspect-square items-center justify-center rounded-xl transition-all",
                            selected
                              ? "bg-brand text-brand-fg shadow-sm scale-105"
                              : "bg-fill/10 text-label-secondary hover:bg-fill/20 hover:text-label active:scale-95",
                          )}
                        >
                          <Icon size={18} weight="fill" />
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
              className="mt-2 w-full rounded-xl bg-fill/10 py-2 text-caption font-semibold text-label-secondary hover:bg-fill/15 active:scale-95 transition-all"
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
  const [savedColours, setSavedColours] = useState<string[]>([]);
  
  // Load saved colours on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("budget_custom_colours");
      if (stored) {
        setSavedColours(JSON.parse(stored));
      }
    } catch (e) {}
  }, []);

  const handleSaveColour = () => {
    if (!value || savedColours.includes(value)) return;
    const nextSaved = [value, ...savedColours].slice(0, 8); // Keep max 8
    setSavedColours(nextSaved);
    localStorage.setItem("budget_custom_colours", JSON.stringify(nextSaved));
  };

  // Find family of current value
  const familyOfValue = value
    ? COLOUR_FAMILIES.findIndex((f) => f.shades.includes(value))
    : -1;
  const [family, setFamily] = useState(familyOfValue >= 0 ? familyOfValue : 0);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (familyOfValue >= 0 && familyOfValue !== family) setFamily(familyOfValue);
  }

  // Curated 12 core primary families for instant top-level selection
  const curatedFamilies = COLOUR_FAMILIES.slice(0, 12);
  const currentFamilyObj = COLOUR_FAMILIES[family] || COLOUR_FAMILIES[0];
  const shades = currentFamilyObj?.shades ?? [];
  const isCustomActive = value && familyOfValue < 0 && !savedColours.includes(value);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-footnote font-semibold text-label-secondary">{label}</span>
        {isCustomActive ? (
          <button
            type="button"
            onClick={handleSaveColour}
            className="text-caption2 font-semibold text-brand hover:underline"
          >
            Save colour
          </button>
        ) : null}
      </div>
      
      {/* Primary Curated Palette Grid: 6 columns × 2 rows */}
      <div className="grid grid-cols-6 gap-2.5 sm:gap-3">
        {curatedFamilies.map((f, i) => {
          const mainColor = f.shades[COLOUR_FAMILY_INDEX];
          const isSelectedFamily = i === family;
          const isExactMatch = value === mainColor;

          return (
            <button
              key={f.name}
              type="button"
              onClick={() => {
                setFamily(i);
                onChange(mainColor);
              }}
              aria-label={f.name}
              title={f.name}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-2xl transition-all active:scale-90 hover:scale-105 shadow-sm",
                isSelectedFamily
                  ? "ring-2 ring-label ring-offset-2 ring-offset-bg-secondary dark:ring-offset-bg"
                  : "ring-1 ring-black/10 dark:ring-white/10 opacity-90 hover:opacity-100",
              )}
              style={{ backgroundColor: mainColor }}
            >
              {isExactMatch ? (
                <Check size={16} weight="bold" className="text-white drop-shadow-sm" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tonal Shades Row + Custom Color Picker */}
      <div className="flex items-center justify-between gap-1.5 pt-1">
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto py-1">
          {shades.map((c) => {
            const isSelected = value === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                aria-label={`${currentFamilyObj.name} shade ${c}`}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 hover:scale-110",
                  isSelected
                    ? "ring-2 ring-label ring-offset-1 ring-offset-bg-secondary"
                    : "ring-1 ring-black/10 dark:ring-white/10"
                )}
                style={{ backgroundColor: c }}
              >
                {isSelected ? <Check size={13} weight="bold" className="text-white drop-shadow-sm" /> : null}
              </button>
            );
          })}
        </div>

        {/* Custom Rainbow Color Picker Input */}
        <label 
          className={cn(
            "relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-90 shadow-sm ring-1 ring-black/10 dark:ring-white/10 ml-2",
            isCustomActive ? "ring-2 ring-label ring-offset-1 ring-offset-bg-secondary" : ""
          )}
          style={{
            background: 'conic-gradient(from 180deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0000ff, #8000ff, #ff00ff, #ff0000)'
          }}
          title="Pick a custom colour"
        >
          <input 
            type="color"
            value={value && value.startsWith('#') ? value : "#007AFF"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          {isCustomActive ? (
            <Check size={13} weight="bold" className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
          ) : null}
        </label>
      </div>

      {savedColours.length > 0 && (
        <div className="pt-2 border-t border-separator/30">
          <span className="mb-1.5 block text-caption2 font-semibold uppercase tracking-wider text-label-secondary/60">Saved Custom Colours</span>
          <div className="flex flex-wrap gap-2">
            {savedColours.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(c)}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-90 ring-1 ring-black/10 dark:ring-white/10"
                style={{ backgroundColor: c }}
              >
                {value === c ? <Check size={13} weight="bold" className="text-white drop-shadow-sm" /> : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
