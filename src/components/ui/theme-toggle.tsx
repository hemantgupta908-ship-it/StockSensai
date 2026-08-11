"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun, SunHorizon } from "@phosphor-icons/react";

import { useTheme, type ThemePreference } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const ORDER: ThemePreference[] = ["light", "dark", "system"];

const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "Match system",
};

/**
 * Quick theme cycle: light → dark → system.
 *
 * Settings still holds the explicit three-way control; this exists because a
 * theme switch buried two taps deep may as well not be there.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useTheme();

  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : SunHorizon;

  const handleToggle = () => {
    setPreference(next);
    try {
      const raw = localStorage.getItem("cashew.settings");
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.theme = next;
      localStorage.setItem("cashew.settings", JSON.stringify(parsed));
      window.dispatchEvent(new Event("cashew-settings-updated"));
    } catch {}
  };

  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", stiffness: 600, damping: 24 }}
      onClick={handleToggle}
      aria-label={`Theme: ${LABELS[preference]}. Switch to ${LABELS[next].toLowerCase()}.`}
      title={`Theme: ${LABELS[preference]} — tap for ${LABELS[next].toLowerCase()}`}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full",
        "bg-fill/[0.10] text-label-secondary/70 transition-colors active:bg-fill/[0.18]",
        "dark:bg-white/[0.09] dark:active:bg-white/[0.16]",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={preference}
          initial={{ y: 14, opacity: 0, rotate: -30 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 30 }}
          transition={{ duration: 0.18 }}
          className="flex"
        >
          <Icon size={17} />
        </motion.span>
      </AnimatePresence>

      {/* Dot marks "system", where the icon alone is ambiguous. */}
      {preference === "system" && (
        <span
          className={cn(
            "absolute bottom-[5px] right-[5px] h-[5px] w-[5px] rounded-full",
            resolved === "dark" ? "bg-blue" : "bg-amber",
          )}
        />
      )}
    </motion.button>
  );
}
