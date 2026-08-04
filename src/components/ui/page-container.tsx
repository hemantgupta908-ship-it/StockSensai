import { cn } from "@/lib/utils";

/**
 * The app's single source of truth for content width.
 *
 * Widths are fluid with a generous cap rather than a fixed column: on a 1920px
 * display a 1024px centred column leaves roughly a third of the screen empty,
 * which is wasted space rather than restraint. The cap exists only so that
 * ultra-wide monitors don't stretch a card to an unreadable line length.
 *
 * The NavBar imports these too — the large title has to line up with the
 * content beneath it, so both must resolve to the same box.
 */
export const CONTAINER_WIDTHS = {
  /** Card grids and the stock detail — fills the viewport. */
  fluid: "w-full max-w-[1760px] px-4 sm:px-5 lg:px-8",
  /** Lists and forms, where full width would hurt scanability. */
  wide: "w-full max-w-[1180px] px-4 sm:px-5 lg:px-8",
  /** Long-form reading: explainers, disclaimer. */
  prose: "w-full max-w-[880px] px-4 sm:px-5 lg:px-8",
} as const;

export type ContainerWidth = keyof typeof CONTAINER_WIDTHS;

export function PageContainer({
  width = "fluid",
  className,
  children,
}: {
  width?: ContainerWidth;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("mx-auto", CONTAINER_WIDTHS[width], className)}>{children}</div>;
}
