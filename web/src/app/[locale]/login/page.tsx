import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { redirect } from "@/i18n/navigation";
import { getSession } from "@/lib/session";
import { titleFrom } from "@/lib/metadata";

export const generateMetadata = titleFrom("Auth", "loginTitle");

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (session.status === "signed-in") redirect({ href: "/", locale });
  if (session.status === "mfa-pending") redirect({ href: "/mfa", locale });

  const t = await getTranslations("Auth");
  return (
    <AuthShell title={t("loginTitle")}>
      <LoginForm />
    </AuthShell>
  );
}
