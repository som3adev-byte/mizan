"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Link } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import { Field, FormError, SubmitButton } from "./fields";

export function InviteForm({ token }: { token: string }) {
  const t = useTranslations("Auth");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError(t("passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await postJson<{ email: string }>("/auth/invitations/accept", { token, name: form.get("name"), password });
    if (res.ok) {
      setDoneEmail(res.data.email);
      return;
    }
    setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
    setBusy(false);
  }

  if (doneEmail) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-badge bg-status-compliant-bg px-3 py-2 text-body-sm text-status-compliant-text">
          {t("inviteDone")} <bdi dir="ltr">{doneEmail}</bdi>
        </p>
        <Link href="/login" className="flex h-11 items-center justify-center rounded-control bg-ink text-body-sm font-semibold text-on-ink no-underline hover:bg-ink-2">
          {t("inviteDoneAction")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-body-sm text-muted">{t("inviteHint")}</p>
      <Field id="name" autoComplete="name" required label={t("name")} />
      <Field id="password" type="password" autoComplete="new-password" minLength={12} required label={t("newPassword")} />
      <Field id="confirm" type="password" autoComplete="new-password" minLength={12} required label={t("confirmPassword")} />
      <FormError>{error}</FormError>
      <SubmitButton busy={busy} busyLabel={t("working")}>
        {t("inviteSubmit")}
      </SubmitButton>
    </form>
  );
}
