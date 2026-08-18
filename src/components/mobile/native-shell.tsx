"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { IS_MOBILE } from "@/lib/mobile/config";
import { deepLinkToPath } from "@/lib/auth/callback-url";
import { useTheme } from "@/components/theme-provider";
import { useAppPathname } from "@/lib/use-app-pathname";

/**
 * The page background, as `#rrggbb`, for the status bar to match.
 *
 * Read off the live `<body>` rather than from a table of theme names, so a
 * theme added later is picked up without touching this file. Falls back to the
 * app's light background if the computed value is not an `rgb()` triple —
 * `transparent` computes to `rgba(0, 0, 0, 0)`, which would paint a black band
 * on a light theme.
 */
function readThemeBackground(): string {
  const computed = getComputedStyle(document.body).backgroundColor;
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(computed);
  if (!match) return "#F2F2F7";
  if (match[4] !== undefined && Number(match[4]) === 0) return "#F2F2F7";

  const hex = (value: string) => Number(value).toString(16).padStart(2, "0");
  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
}

/**
 * Everything that makes the WebView behave like an Android app.
 *
 * Renders nothing. Mounted once from the root layout, above the router, so the
 * hardware back button and the deep-link handler are live on every screen
 * including the sign-in one.
 *
 * All the Capacitor imports are dynamic and guarded by `IS_MOBILE`, so the web
 * bundle never loads a plugin whose native half does not exist. Each block also
 * swallows its own failure: a missing plugin should cost the one behaviour it
 * provides, not the whole app.
 */
export function NativeShell() {
  const router = useRouter();
  const pathname = useAppPathname();
  const { resolved } = useTheme();

  // --- Hardware back button -------------------------------------------------
  useEffect(() => {
    if (!IS_MOBILE) return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          // Android's back button is a *navigation* control, not a close
          // button. Without this it exits the app from any screen, which reads
          // as a crash when it happens three taps into the budget section.
          if (canGoBack || window.history.length > 1) router.back();
          else void App.exitApp();
        });
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      } catch {
        // Not running under Capacitor — the browser's own back button applies.
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);

  // --- Deep links -----------------------------------------------------------
  useEffect(() => {
    if (!IS_MOBILE) return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", ({ url }) => {
          // Supabase sends the OAuth and password-reset callbacks to the custom
          // scheme registered in the manifest. The path is extracted textually
          // — see `deepLinkToPath` for why `new URL()` gets this wrong — and
          // handed to the router rather than reloading the WebView, which would
          // discard the session the callback page is about to create.
          const target = deepLinkToPath(url);
          if (target) router.replace(target);
        });
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      } catch {
        // No deep links outside the native shell.
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [router]);

  // --- Status bar -----------------------------------------------------------
  useEffect(() => {
    if (!IS_MOBILE) return;

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");

        // Do NOT overlay the WebView.
        //
        // Overlaying is the iOS arrangement: the page draws under the status
        // bar and reserves the space with `env(safe-area-inset-top)`. Android's
        // WebView does not populate that variable for the status bar — it stays
        // `0px` — so every `safe-top` header reserved nothing and rendered
        // underneath the clock and battery icons.
        //
        // Letting the system inset the WebView instead means the page starts
        // below the status bar, `safe-top` correctly resolves to zero, and the
        // headers sit where they are supposed to.
        await StatusBar.setOverlaysWebView({ overlay: false });

        // The bar then needs its own fill, because it is no longer showing the
        // page behind it. It is read from the live theme rather than hardcoded:
        // the app ships fourteen colour schemes, and a fixed black would show a
        // dark band above Sepia and Cream.
        await StatusBar.setBackgroundColor({ color: readThemeBackground() });
        await StatusBar.setStyle({ style: resolved === "dark" ? Style.Dark : Style.Light });
      } catch {
        // Older WebViews without the plugin keep the system default.
      }
    })();
  }, [resolved]);

  // --- Splash screen --------------------------------------------------------
  useEffect(() => {
    if (!IS_MOBILE) return;

    void (async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide();
      } catch {
        // Nothing to hide.
      }
    })();
    // Deliberately once, on mount. The splash is configured not to auto-hide so
    // it covers the router's first navigation off `/`; hiding it per route
    // change would instead flash it back on.
  }, []);

  // --- External links -------------------------------------------------------
  useEffect(() => {
    if (!IS_MOBILE) return;

    function onClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || !/^https?:/i.test(href)) return;
      if (anchor.origin === window.location.origin) return;

      // An external URL loaded into the WebView replaces the app with a web
      // page and strands the user there — the app's own chrome is gone and only
      // the back button gets them out. Hand it to the system browser instead.
      event.preventDefault();
      void import("@capacitor/browser")
        .then(({ Browser }) => Browser.open({ url: href }))
        .catch(() => window.open(href, "_blank", "noopener"));
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // --- Route-change side effects -------------------------------------------
  useEffect(() => {
    if (!IS_MOBILE) return;
    // The WebView keeps the previous screen's scroll offset across a
    // client-side navigation, so a fresh page can open halfway down.
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
