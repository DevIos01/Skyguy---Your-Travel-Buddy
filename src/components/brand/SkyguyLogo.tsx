import { cn } from "@/lib/utils";

/**
 * Skyguy — the brand mark.
 *
 * A cheeky little paper-plane character with a single dot eye and a tiny
 * speed line. Drawn with `currentColor` so it inherits the surrounding
 * text/icon color and works on any background (light card, dark card, or
 * the brand sky-gradient pill).
 *
 * Usage:
 *   <SkyguyLogo className="h-5 w-5" />
 */
export function SkyguyLogo({
  className,
  title = "Skyguy",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={cn("drop-shadow-sm", className)}
      fill="none"
    >
      <title>{title}</title>
      {/* Main paper-plane body — folded triangle */}
      <path
        d="M27.4 5.1 4.7 13.2c-.9.3-1 1.5-.2 2l6.6 3.6 2.7 6.8c.3.8 1.5.9 2 .1L27.4 5.1Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Inner fold — gives the plane its 3D crease */}
      <path
        d="m11.1 18.8 16.3-13.7-11.6 16.6"
        stroke="hsl(var(--primary) / 0.45)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Speed line — the "guy" zooming */}
      <path
        d="M3 22.5h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M5.5 26h3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* The eye — what makes it a "guy", not just a plane */}
      <circle cx="20" cy="11.4" r="1.35" fill="hsl(var(--background))" />
    </svg>
  );
}