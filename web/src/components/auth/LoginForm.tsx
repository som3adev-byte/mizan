"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import { Field, FormError, SubmitButton } from "./fields";

export function LoginForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await postJson<{ next: "mfa_enroll" | "mfa_verify" }>("/auth/login", {
      email: form.get("email"),
      password: form.get("password"),
    });
    if (res.ok) {
      router.replace(res.data.next === "mfa_enroll" ? "/mfa?setup=1" : "/mfa");
      return;
    }
    setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field id="email" type="email" dir="ltr" autoComplete="username" required label={t("email")} />
      <Field id="password" type="password" autoComplete="current-password" required label={t("password")} />
      <FormError>{error}</FormError>
      <SubmitButton busy={busy} busyLabel={t("working")}>
        {t("loginSubmit")}
      </SubmitButton>
      <p className="text-body-sm text-muted">{t("loginHint")}</p>
    </form>
  );
}
