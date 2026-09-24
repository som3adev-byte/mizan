"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "@/components/icons";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const device = (): Theme => (matchMedia(DARK_QUERY).matches ? "dark" : "light");

/** Re-render on an explicit change (html[data-theme]) or a device change while nothing is chosen. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}
const current = (): Theme => {
  const chosen = document.documentElement.dataset.theme;
  return chosen === "dark" || chosen === "light" ? chosen : device();
};

/**
 * Header icon button: moon in light, sun in dark. The choice is a cookie the
 * server renders from; choosing the device's own setting clears it.
 */
export function ThemeToggle() {
  const t = useTranslations("Theme");
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "light");
  const label = theme === "dark" ? t("toLight") : t("toDark");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const html = document.documentElement;
    if (next === device()) {
      // Back to the device's own setting: forget the choice and follow the device again.
      delete html.dataset.theme;
      document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      html.dataset.theme = next;
      document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }

  const icon =
    "col-start-1 row-start-1 size-5 transition-[transform,opacity,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]";
  const hidden = "rotate-[-45deg] scale-90 opacity-0 blur-[2px]";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-pill border border-line bg-surface text-text transition-transform duration-150 ease-out
                 active:scale-[0.97] [@media(hover:hover)]:hover:bg-surface-2"
    >
      {/* Shown by CSS (the dark: variant), so the icon is right from the first paint. */}
      <IconMoon aria-hidden="true" className={`${icon} dark:rotate-[-45deg] dark:scale-90 dark:opacity-0 dark:blur-[2px]`} />
      <IconSun aria-hidden="true" className={`${icon} ${hidden} dark:rotate-0 dark:scale-100 dark:opacity-100 dark:blur-none`} />
    </button>
  );
}
