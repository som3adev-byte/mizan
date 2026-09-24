import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * generateMetadata for a page whose tab title is one message. The root layout
 * adds " — <product name>" through its title template. The template does not
 * reach a page in the layout's own segment (the dashboard), so that one passes
 * `absolute: true` and builds the full title itself.
 */
export function titleFrom(namespace: string, key: string, { absolute = false } = {}) {
  return async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace });
    if (!absolute) return { title: t(key) };
    const meta = await getTranslations({ locale, namespace: "Meta" });
    return { title: { absolute: `${t(key)} — ${meta("name")}` } };
  };
}
