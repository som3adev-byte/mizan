"use client";

import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import { Field, FormError, SubmitButton } from "./fields";

type Enrollment = { secret: string; qr: string };

/**
 * setup=true: first sign-in. Asks the API for a new secret, shows it as a QR
 * code (drawn in the browser, never sent anywhere) and as text, then confirms.
 * setup=false: later sign-ins. Just the code.
 */
export function MfaForm({ setup }: { setup: boolean }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [mode, setMode] = useState<"setup" | "verify">(setup ? "setup" : "verify");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.unknown"));

  useEffect(() => {
    if (mode !== "setup" || enrollment) return;
    let cancelled = false;
    (async () => {
      const res = await postJson<{ secret: string; otpauthUrl: string }>("/auth/mfa/enroll");
      if (cancelled) return;
      if (!res.ok) {
        if (res.code === "not_signed_in") return router.replace("/login");
        if (res.code === "mfa_already_enabled") return setMode("verify");
        return setError(message(res.code));
      }
      const qr = await QRCode.toDataURL(res.data.otpauthUrl, { margin: 1, width: 200, errorCorrectionLevel: "M" });
      if (!cancelled) setEnrollment({ secret: res.data.secret, qr });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    setBusy(true);
    setError(null);
    const res = await postJson(mode === "setup" ? "/auth/mfa/enroll/confirm" : "/auth/mfa/verify", { code });
    if (res.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    if (res.code === "not_signed_in") return router.replace("/login");
    if (res.code === "mfa_not_started") setMode("setup");
    setError(message(res.code));
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {mode === "setup" ? (
        <>
          <p className="text-body-sm">{t("enrollStep1")}</p>
          <div className="flex justify-center rounded-panel border border-line bg-surface p-4">
            {enrollment ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={enrollment.qr} alt="" width={200} height={200} className="size-[200px]" />
            ) : (
              <div className="size-[200px] animate-pulse rounded-badge bg-surface-2" aria-hidden="true" />
            )}
          </div>
          {enrollment && (
            <div className="flex flex-col gap-1">
              <span className="text-label text-muted">{t("enrollManual")}</span>
              <code dir="ltr" className="select-all break-all rounded-badge bg-surface-2 px-3 py-2 font-latin text-body-sm tracking-wider">
                {enrollment.secret.match(/.{1,4}/g)?.join(" ")}
              </code>
            </div>
          )}
          <p className="text-body-sm">{t("enrollStep2")}</p>
        </>
      ) : (
        <p className="text-body-sm text-muted">{t("verifyHint")}</p>
      )}

      <Field
        id="code"
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        label={t("code")}
        className="num text-center text-headline tracking-[0.3em]"
      />
      <FormError>{error}</FormError>
      <SubmitButton busy={busy} busyLabel={t("working")}>
        {mode === "setup" ? t("enrollSubmit") : t("verifySubmit")}
      </SubmitButton>
    </form>
  );
}
