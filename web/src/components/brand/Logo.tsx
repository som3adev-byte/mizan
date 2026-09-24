import type { SVGProps } from "react";

/**
 * The Mizan mark: a balance scale (ميزان = balance), drawn on one baseline.
 * A central post, a beam, two pans hanging level, and a base. currentColor,
 * so it takes the surrounding text colour (Ink on light, near-white on the rail).
 */
export function LogoMark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" role={title ? "img" : "presentation"} aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      {/* Central post and the level beam */}
      <path d="M16 5.5v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 9h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="5" r="1.6" fill="currentColor" />
      {/* The two pans, hung from the beam ends by hangers, drawn as shallow bowls */}
      <path d="M5 9l-3 5.5a4 4 0 0 0 6 0z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M27 9l-3 5.5a4 4 0 0 0 6 0z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      {/* Base */}
      <path d="M11 24.5h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Mark plus the Arabic wordmark, used in headers and sign-in. Size scales both. */
export function Logo({ className = "", markClassName = "size-8" }: { className?: string; markClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span lang="ar" dir="rtl" className="text-page-title font-bold leading-none tracking-tight">
        ميزان
      </span>
    </span>
  );
}
