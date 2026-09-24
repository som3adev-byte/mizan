import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/auth/AuthShell";
import { Link } from "@/i18n/navigation";

/** Localized 404 inside the app's own frame, with a way back. */
export default function NotFound() {
  const t = useTranslations("NotFound");
  return (
    <AuthShell title={t("title")}>
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-muted">{t("body")}</p>
        <Link href="/" className="inline-flex h-11 items-center justify-center rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink no-underline hover:bg-ink-2">
          {t("home")}
        </Link>
      </div>
    </AuthShell>
  );
}
