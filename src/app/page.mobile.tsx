"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/destination";

/**
 * The APK's entry point.
 *
 * The web build answers `/` with a server redirect, which a static export
 * cannot emit — there is no response to attach a `Location` to. The WebView
 * loads this shell instead and moves immediately, in the same client-side
 * router the rest of the app navigates with.
 *
 * `replace` rather than `push`, so the hardware back button from the first
 * screen exits the app rather than landing on a blank redirector.
 */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(DEFAULT_SIGNED_IN_PATH);
  }, [router]);

  // The splash screen is still up at this point — see `NativeShell`, which
  // dismisses it once the destination has painted.
  return null;
}
