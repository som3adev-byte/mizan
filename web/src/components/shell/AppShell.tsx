import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps, ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { LocaleSwitch } from "@/components/shell/LocaleSwitch";
import { type EvidenceSummary, Sidebar } from "@/components/shell/Sidebar";
import { daysUntil, todayInRiyadh } from "@/lib/controls";
import type { Visit } from "@/lib/visits";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import type { AlertsPayload } from "@/lib/alerts";
import { type Me, apiGet, entityName } from "@/lib/session";

/** Signed-in layout: sidebar (bottom tabs on mobile), header with entity and user, page body. */
export async function AppShell({
  me,
  current,
  children,
}: {
  me: Me;
  current: ComponentProps<typeof Sidebar>["current"];
  children: ReactNode;
}) {
  const roles = await getTranslations("Roles");
  const footer = await getTranslations("Footer");
  const locale = await getLocale();
  // The count is a hint, so a failed load just hides it.
  const [alerts, evidence, visits] = await Promise.all([
    apiGet<AlertsPayload>("/alerts").catch(() => null),
    apiGet<EvidenceSummary>("/evidence/summary").catch(() => null),
    apiGet<{ next: Visit | null }>("/visits/next").catch(() => null),
  ]);
  const next = visits?.ok ? visits.data.next : null;

  return (
    <div className="md:grid md:min-h-dvh md:grid-cols-[250px_1fr] print:block">
      <Sidebar current={current} alertCount={alerts?.ok ? alerts.data.high : 0} evidence={evidence?.ok ? evidence.data : null}
        visit={next ? { visitDate: next.visitDate, days: daysUntil(todayInRiyadh(), next.visitDate) } : null}
      />

      <div className="flex min-w-0 flex-col">
        <header className="flex flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-3 md:h-[72px] md:flex-nowrap md:px-8 md:py-0 print:hidden">
          <div className="min-w-0 leading-snug">
            <span className="block truncate text-headline font-bold">{entityName(me.entity, locale)}</span>
            <span className="text-badge text-muted">
              {me.name} · {roles(me.role)}
            </span>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <ThemeToggle />
            <LocaleSwitch />
            <LogoutButton />
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 px-4 pb-28 pt-6 md:p-8 print:p-0">
          {children}
          <footer className="mt-auto flex flex-col gap-1 text-badge text-muted print:hidden">
            <span>{footer("independence")}</span>
            <span>{footer("internalScore")}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
