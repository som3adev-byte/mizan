"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar across the very top that appears the instant a navigation starts
 * and clears once the new route commits. App Router keeps the old page on
 * screen while the next one loads, so without this a click feels like nothing
 * happened. It reads on both the navy rail and the white header (amber-on-ink),
 * spans the safe-area, and is hidden in print. Reduced motion holds it steady
 * (globals.css stops the sweep) so it still signals "loading".
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  // Start the bar on an internal, same-tab link click or a back/forward move.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // Same page (hash-only or identical) is not a navigation.
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
    }
    const onPop = () => setActive(true);
    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // The route actually changed: the new page is here, so clear the bar.
  useEffect(() => {
    setActive(false);
  }, [pathname, search]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-[100] h-[2px] overflow-hidden print:hidden"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="h-full w-full origin-[left_center] animate-[mizan-progress_1.1s_ease-in-out_infinite] rounded-pill bg-amber-on-ink" />
    </div>
  );
}
