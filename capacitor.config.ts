import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell configuration.
 *
 * `webDir` is the Next.js static export produced by `npm run build:mobile`.
 * Nothing here points at a development server: the APK must be a complete,
 * offline-capable app, and a config that quietly depends on a laptop being on
 * the same network is the classic way to ship one that only works on the
 * machine it was built on. To develop against a live reload server, pass
 * `--live-reload` to the Capacitor CLI rather than committing a `server.url`.
 */
const config: CapacitorConfig = {
  appId: "com.wealthsensei.app",
  appName: "WealthSensei",
  webDir: "out",

  android: {
    // Kept off so the app cannot be pointed at plaintext HTTP by a hostile
    // network. Everything it talks to — Supabase, a Vercel deployment, Yahoo —
    // is HTTPS.
    allowMixedContent: false,
    // Lets `chrome://inspect` attach to the running app from a USB-connected
    // desktop, which is the only way to see a console error or an empty store
    // from inside a WebView. Turn this off before shipping a release build — it
    // exposes the page to anyone with physical access and adb.
    webContentsDebuggingEnabled: true,
  },

  server: {
    // Serving from `https://localhost` rather than `file://` gives the WebView a
    // secure origin, which is what localStorage, IndexedDB, Web Workers and the
    // Supabase client all require. Under `file://` the app would boot with no
    // storage and no engine worker.
    androidScheme: "https",
    hostname: "localhost",
  },

  plugins: {
    SplashScreen: {
      // The router's first move is a redirect off `/`, and hiding the splash on
      // its own timer would show a blank frame in the middle of it. `NativeShell`
      // hides it once the destination has painted.
      launchAutoHide: false,
      backgroundColor: "#F2F2F7",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      // The system insets the WebView below the status bar rather than the page
      // drawing under it. Android never fills in `env(safe-area-inset-top)` for
      // the status bar, so an overlaying page has nothing to reserve the space
      // with and renders its header under the clock. `NativeShell` re-applies
      // this and repaints the bar whenever the resolved theme changes.
      overlaysWebView: false,
      style: "DEFAULT",
    },
    Keyboard: {
      // The transaction and trade forms sit near the bottom of the screen; the
      // default behaviour hides the field being typed into behind the keyboard.
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
