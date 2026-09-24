"use client";

import { useTranslations } from "next-intl";

/** The browser's print dialog, where "Save as PDF" is always available. */
export function PrintButton() {
  const t = useTranslations("Reports");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="h-10 rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink hover:bg-ink-2 print:hidden"
    >
      {t("print")}
    </button>
  );
}
