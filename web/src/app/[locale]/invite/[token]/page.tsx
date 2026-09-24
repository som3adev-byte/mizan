import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { InviteForm } from "@/components/auth/InviteForm";
import { titleFrom } from "@/lib/metadata";

export const generateMetadata = titleFrom("Auth", "inviteTitle");

export default async function InvitePage({ params }: PageProps<"/[locale]/invite/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");
  return (
    <AuthShell title={t("inviteTitle")}>
      <InviteForm token={token} />
    </AuthShell>
  );
}
