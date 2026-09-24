"use client";

import { useTranslations } from "next-intl";

/** Shown when a page can't load, e.g. the API is down. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("Error");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-4">
      <section role="alert" className="flex w-full max-w-[420px] flex-col gap-3 rounded-panel border border-line bg-surface p-6">
        <h1 className="text-page-title font-bold">{t("title")}</h1>
        <p className="text-body-sm text-muted">{t("body")}</p>
        <button type="button" onClick={reset} className="h-11 rounded-control bg-ink text-body-sm font-semibold text-on-ink hover:bg-ink-2">
          {t("retry")}
        </button>
      </section>
    </main>
  );
}
