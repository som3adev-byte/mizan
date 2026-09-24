"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { FormError } from "@/components/auth/fields";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import { ROLE_OPTIONS } from "./roles";

export function InviteUserForm() {
  const t = useTranslations("Users");
  const roles = useTranslations("Roles");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await postJson<{ token: string }>("/auth/invitations", { email: form.get("email"), role: form.get("role") });
    setBusy(false);
    if (!res.ok) {
      setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
      return;
    }
    setLink(`${window.location.origin}/${locale}/invite/${res.data.token}`);
    router.refresh();
  }

  return (
    <section aria-labelledby="invite-title" className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6">
      <h2 id="invite-title" className="text-headline font-bold">
        {link ? t("inviteLinkTitle") : t("inviteTitle")}
      </h2>

      {link ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-muted">{t("inviteLinkNote")}</p>
          <code dir="ltr" className="select-all break-all rounded-badge bg-surface-2 px-3 py-2 font-latin text-body-sm">
            {link}
          </code>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              }}
              className="h-10 rounded-control bg-ink px-4 text-label font-semibold text-on-ink hover:bg-ink-2"
            >
              {copied ? t("copied") : t("copy")}
            </button>
            <button
              type="button"
              onClick={() => {
                setLink(null);
                setCopied(false);
              }}
              className="h-10 rounded-control border border-line bg-surface px-4 text-label hover:border-line-2"
            >
              {t("inviteAnother")}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3 md:flex-row md:items-end" noValidate>
          <div className="flex flex-1 flex-col gap-2">
            <label htmlFor="invite-email" className="text-label font-medium">
              {t("inviteEmail")}
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              dir="ltr"
              required
              className="h-11 rounded-control border border-line bg-surface px-3 text-body outline-none hover:border-line-2 focus:border-text"
            />
          </div>
          <div className="flex flex-col gap-2 md:w-56">
            <label htmlFor="invite-role" className="text-label font-medium">
              {t("inviteRole")}
            </label>
            <select
              id="invite-role"
              name="role"
              defaultValue="CONTROL_OWNER"
              className="h-11 rounded-control border border-line bg-surface px-3 text-body outline-none hover:border-line-2 focus:border-text"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {roles(r)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-70"
          >
            {t("inviteSubmit")}
          </button>
        </form>
      )}
      <FormError>{error}</FormError>
    </section>
  );
}
