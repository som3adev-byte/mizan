import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import { LocaleSwitch } from "@/components/shell/LocaleSwitch";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

/** Centered card on the page ground, used by every sign-in step. */
export async function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const footer = await getTranslations("Footer");

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex items-center gap-4 px-4 py-4 md:px-8">
        <Logo markClassName="size-8" />
        <div className="ms-auto flex items-center gap-2">
          <ThemeToggle />
          <LocaleSwitch />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 md:items-center md:pt-0">
        <section className="w-full max-w-[420px] rounded-panel border border-line bg-surface p-6 md:p-8">
          <h1 className="mb-6 text-page-title font-bold">{title}</h1>
          {children}
        </section>
      </main>

      <footer className="px-4 pb-6 text-center text-badge text-muted md:px-8">{footer("independence")}</footer>
    </div>
  );
}
