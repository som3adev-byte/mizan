"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { FormError } from "@/components/auth/fields";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";

/** The entity profile's cloud question. Admins answer; everyone else reads the answer. */
export function CloudQuestion({ usesCloud, canEdit }: { usesCloud: boolean | null; canEdit: boolean }) {
  const t = useTranslations("Entity");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const answer = new FormData(e.currentTarget).get("usesCloud");
    if (answer !== "yes" && answer !== "no") return setError(t("errors.pick"));
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await postJson("/entity/cloud", { usesCloud: answer === "yes" });
    setBusy(false);
    if (!res.ok) return setError(t("errors.unknown"));
    setNotice(answer === "yes" ? t("savedYes") : t("savedNo"));
    router.refresh();
  }

  const current = usesCloud === null ? t("unanswered") : usesCloud ? t("yes") : t("no");

  return (
    <section aria-labelledby="entity-title" className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6">
      <h2 id="entity-title" className="text-headline font-bold">{t("title")}</h2>
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{t("cloudQuestion")}</p>
        <p className="max-w-[70ch] text-body-sm text-muted">{t("cloudHelp")}</p>
      </div>
      {canEdit ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="sr-only">{t("cloudQuestion")}</legend>
            {(["yes", "no"] as const).map((v) => (
              <label
                key={v}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-control border border-line px-4 text-body-sm has-checked:border-saffron has-checked:bg-saffron-bg"
              >
                <input type="radio" name="usesCloud" value={v} defaultChecked={usesCloud === (v === "yes")} className="accent-text" />
                {t(v === "yes" ? "yesLong" : "noLong")}
              </label>
            ))}
          </fieldset>
          <div aria-live="polite" className="flex flex-col gap-2">
            {notice && <p className="rounded-badge bg-status-compliant-bg px-3 py-2 text-body-sm text-status-compliant-text">{notice}</p>}
            <FormError>{error}</FormError>
          </div>
          <button type="submit" disabled={busy} className="h-10 self-start rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-70">
            {t("save")}
          </button>
        </form>
      ) : (
        <p className="text-body-sm">
          <span className="text-muted">{t("answer")}:</span> {current}
        </p>
      )}
    </section>
  );
}
