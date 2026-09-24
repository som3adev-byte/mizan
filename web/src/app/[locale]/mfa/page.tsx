import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { MfaForm } from "@/components/auth/MfaForm";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/session";
import { titleFrom } from "@/lib/metadata";

export const generateMetadata = titleFrom("Auth", "verifyTitle");

export default async function MfaPage({ params, searchParams }: PageProps<"/[locale]/mfa">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (session.status === "signed-in") redirect({ href: "/", locale });
  if (session.status === "signed-out") redirect({ href: "/login", locale });

  const setup = (await searchParams).setup === "1";
  const t = await getTranslations("Auth");
  return (
    <AuthShell title={setup ? t("enrollTitle") : t("verifyTitle")}>
      <MfaForm setup={setup} />
    </AuthShell>
  );
}
