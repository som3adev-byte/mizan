import { useTranslations } from "next-intl";
import { IconCalendar, IconClock } from "@/components/icons";
import { validity } from "@/lib/evidence";

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Expired and expiring evidence are called out; valid dates stay quiet. */
export function ValidityBadge({ expiresOn, today }: { expiresOn: string | null; today: string }) {
  const t = useTranslations("Evidence");
  const v = validity(expiresOn, today);
  if (v.kind === "none") return null;
  if (v.kind === "expired")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-badge bg-status-noncompliant-bg px-2 text-badge font-semibold leading-6 text-status-noncompliant">
        <IconClock className="size-3.5" />
        {t("expired", { count: v.days, n: v.days })}
      </span>
    );
  if (v.kind === "expiring")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-badge bg-status-partial-bg px-2 text-badge font-semibold leading-6 text-status-partial-text">
        <IconCalendar className="size-3.5" />
        {v.days === 0 ? t("expiresToday") : t("expiresIn", { count: v.days, n: v.days })}
      </span>
    );
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-badge text-muted">
      <IconCalendar className="size-3.5" />
      {t("validUntil")} <span className="num">{expiresOn}</span>
    </span>
  );
}
