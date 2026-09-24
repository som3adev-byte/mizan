"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { IconGlobe } from "@/components/icons";

// Same page in the other language, filters in the query string included.
// next-intl stores the choice in the NEXT_LOCALE cookie, so the user's pick
// wins over the browser language.
export function LocaleSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Locale");
  const router = useRouter();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <Link
      href={pathname}
      locale={other}
      onClick={(e) => {
        // The query is read at click time (pages rewrite it as filters change).
        if (!window.location.search || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        router.replace(`${pathname}${window.location.search}`, { locale: other });
      }}
      lang={other}
      aria-label={t("switchLabel")}
      className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-label text-text no-underline hover:border-line-2"
    >
      <IconGlobe className="size-4 text-muted" />
      {t(other)}
    </Link>
  );
}
