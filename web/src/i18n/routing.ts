import { defineRouting } from "next-intl/routing";

// Arabic browsers land on Arabic; everything else lands on English.
// next-intl negotiates Accept-Language on first visit and remembers the
// user's choice in the NEXT_LOCALE cookie afterwards.
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "en",
  localeDetection: true,
});

export type Locale = (typeof routing.locales)[number];

export const directionOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");
