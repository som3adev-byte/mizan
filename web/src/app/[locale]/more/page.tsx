import { getTranslations, setRequestLocale } from "next-intl/server";
import { IconCog, IconLog, IconReport, IconTask } from "@/components/icons";
import { AppShell } from "@/components/shell/AppShell";
import { Link } from "@/i18n/navigation";
import { requireSignedIn } from "@/lib/require-session";
import { titleFrom } from "@/lib/metadata";

/** Mobile only in practice: the rail items that do not fit the bottom tab bar. */
const ITEMS = [
  { key: "tasks", href: "/tasks", Icon: IconTask },
  { key: "reports", href: "/reports", Icon: IconReport },
  { key: "auditLog", href: "/audit-log", Icon: IconLog },
  { key: "settings", href: "/settings", Icon: IconCog },
] as const;

export const generateMetadata = titleFrom("Nav", "more");

export default async function MorePage({ params }: PageProps<"/[locale]/more">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("Nav");

  return (
    <AppShell me={me} current="more">
      <h1 className="text-page-title font-bold">{t("more")}</h1>
      <ul className="overflow-hidden rounded-panel border border-line bg-surface">
        {ITEMS.map(({ key, href, Icon }) => (
          <li key={key} className="border-b border-line last:border-b-0">
            <Link href={href} className="flex h-14 items-center gap-3 px-4 text-body text-text no-underline hover:bg-surface-2">
              <Icon className="size-5 text-muted" />
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
