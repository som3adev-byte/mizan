import type { SVGProps } from "react";

/**
 * A small activity spinner in currentColor, so it takes the button's text colour.
 * The track is the same stroke at low opacity; one arc turns. Under reduced
 * motion the ring simply holds still (globals.css stops the rotation).
 */
export function Spinner({ className = "size-4", ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="presentation"
      aria-hidden="true"
      className={`animate-[mizan-spin_0.7s_linear_infinite] ${className}`}
      {...props}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
