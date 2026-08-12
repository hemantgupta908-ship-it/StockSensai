/**
 * Brand mark and hero illustration for the sign-in screen.
 *
 * Drawn inline rather than shipped as an asset so both follow the theme and
 * cost no extra request. The line weight is uniform and the palette is limited
 * to white, black and the panel green — flat editorial line-art, which survives
 * being scaled from a 96px mobile band to a half-screen desktop panel.
 */

/** The chart-and-arrow mark used across the app, sized for the auth panel. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <path
        d="M5 22.5 12 14l5 5 9.5-11"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 8h6v6"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Growth still-life: a chart panel, candlesticks, a coin stack and a seedling.
 *
 * `aria-hidden` because it is pure decoration — the panel's heading already
 * carries the meaning, and describing it would only add noise to a screen
 * reader working through a login form.
 */
export function AuthArtwork({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 300"
      className={className}
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Chart panel */}
        <rect x="96" y="26" width="272" height="176" rx="18" />
        <path d="M96 62h272" />
        <circle cx="118" cy="44" r="4.5" fill="currentColor" stroke="none" />
        <circle cx="136" cy="44" r="4.5" />
        <circle cx="154" cy="44" r="4.5" />

        {/* Trend line with the brand's arrow head */}
        <path d="M124 172l44-38 34 26 40-52 44-30" />
        <path d="M262 78h24v24" />

        {/* Candlesticks along the baseline */}
        <path d="M140 186v-16M140 138v-12" />
        <rect x="130" y="138" width="20" height="32" rx="4" />
        <path d="M186 186v-10M186 128v-14" />
        <rect x="176" y="128" width="20" height="48" rx="4" fill="currentColor" stroke="none" />
        <rect x="176" y="128" width="20" height="48" rx="4" />
        <path d="M232 186v-22M232 116v-12" />
        <rect x="222" y="116" width="20" height="48" rx="4" />

        {/* Coin stack */}
        <ellipse cx="56" cy="206" rx="34" ry="12" />
        <path d="M22 206v20c0 6.6 15.2 12 34 12s34-5.4 34-12v-20" />
        <ellipse cx="56" cy="166" rx="34" ry="12" />
        <path d="M22 166v20c0 6.6 15.2 12 34 12s34-5.4 34-12v-20" />

        {/* Seedling */}
        <path d="M318 258v-42" />
        <path d="M318 232c-18 0-30-10-30-24 15-2 28 6 30 24z" />
        <path d="M318 240c16 0 28-9 28-22-14-2-26 5-28 22z" />

        {/* Ground */}
        <path d="M16 262h368" strokeWidth="4" />
      </g>
    </svg>
  );
}
