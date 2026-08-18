import { LoginForm } from "@/components/auth/login-form";
import { AuthArtwork, BrandMark } from "@/components/auth/auth-artwork";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * The sign-in screen's markup, shared by both builds.
 *
 * The two differ only in how they answer "is someone already signed in, and
 * where should they land" — the web page reads the server session and redirects
 * before rendering; the APK has no server session and resolves both from the
 * browser client. Everything below is identical either way, so it lives here
 * rather than being copied into each.
 */
export function LoginScreen({
  configured,
  next,
  initialError,
}: {
  configured: boolean;
  next: string;
  initialError: string | null;
}) {
  return (
    <main className="min-h-dvh bg-bg lg:grid lg:place-items-center lg:p-6">
      <div
        className="
          w-full overflow-hidden bg-bg
          lg:grid lg:max-w-[1060px] lg:grid-cols-2 lg:rounded-[32px]
          lg:bg-bg-secondary lg:shadow-[0_24px_80px_-32px_rgb(0_0_0/0.18)]
        "
      >
        {/*
          Brand panel. On a phone this is a compact banner the form sits under;
          from `lg` it becomes the full-height left half of the card.
        */}
        <aside
          className="
            relative flex flex-col justify-between overflow-hidden
            rounded-b-[28px] bg-brand bg-gradient-to-br from-[#1B7B50] to-[#105239]
            px-6 pb-7 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white
            lg:rounded-none lg:px-12 lg:pb-12 lg:pt-12
          "
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/15 backdrop-blur-sm">
              <BrandMark className="h-6 w-6 text-white" />
            </span>
            <span className="text-headline font-semibold tracking-tight lg:hidden">
              WealthSensei
            </span>
          </div>

          <div className="mt-5 lg:mt-0">
            <h2 className="text-title1 font-bold leading-tight tracking-tight lg:text-[40px] lg:leading-[1.1]">
              Hi there,
              <br />
              great to see you
            </h2>
          </div>

          <AuthArtwork className="mx-auto mt-10 hidden h-auto w-full max-w-[360px] text-white/90 lg:block" />

          {/* Soft glow behind the artwork, purely decorative. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-white/[0.07] blur-3xl"
          />
        </aside>

        {/* Form side */}
        <div className="relative flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-14 lg:py-14">
          <ThemeToggle className="absolute right-5 top-5 z-10 lg:right-6 lg:top-6" />

          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-largetitle font-bold tracking-tight text-label/90">Welcome back!</h1>

            <div className="mt-7">
              <LoginForm configured={configured} next={next} initialError={initialError} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * Reasons `/auth/callback` can bounce someone back to sign-in.
 *
 * Anything not in this map is ignored rather than echoed — the value arrives in
 * a query string, so rendering it verbatim would let a crafted link put
 * arbitrary text on the sign-in screen.
 */
export const CALLBACK_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled. Nothing has changed on your account.",
  provider: "Google couldn’t complete the sign-in. Try again, or use your email and password.",
  auth: "That sign-in link didn’t work — it may have already been used, or expired.",
};
