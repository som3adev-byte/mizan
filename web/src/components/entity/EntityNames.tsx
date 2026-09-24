"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { FormError } from "@/components/auth/fields";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";

/** The entity's Arabic and (optional) English names. Admins edit; everyone else reads. */
export function EntityNames({ name, nameEn, canEdit }: { name: string; nameEn: string | null; canEdit: boolean }) {
  const t = useTranslations("Entity");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const ar = String(form.get("name") ?? "").trim();
    if (ar.length < 2) return setError(t("errors.nameRequired"));
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await postJson("/entity/names", { name: ar, nameEn: String(form.get("nameEn") ?? "").trim() || null });
    setBusy(false);
    if (!res.ok) return setError(res.code === "invalid_input" ? t("errors.nameRequired") : t("errors.unknown"));
    setNotice(t("namesSaved"));
    router.refresh();
  }

  const field = "h-11 w-full rounded-control border border-line bg-surface px-3 text-body outline-none hover:border-line-2 focus:border-text";

  return (
    <section aria-labelledby="entity-names" className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6">
      <h2 id="entity-names" className="text-headline font-bold">{t("namesTitle")}</h2>
      {canEdit ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-label font-medium">
              {t("nameAr")}
              <input name="name" dir="rtl" lang="ar" defaultValue={name} required minLength={2} maxLength={200} className={field} />
            </label>
            <label className="flex flex-col gap-2 text-label font-medium">
              {t("nameEn")}
              <input name="nameEn" dir="ltr" lang="en" defaultValue={nameEn ?? ""} maxLength={200} className={`${field} text-start`} />
              <span className="font-normal text-muted">{t("nameEnHint")}</span>
            </label>
          </div>
          <div aria-live="polite" className="flex flex-col gap-2">
            {notice && <p className="rounded-badge bg-status-compliant-bg px-3 py-2 text-body-sm text-status-compliant-text">{notice}</p>}
            <FormError>{error}</FormError>
          </div>
          <button type="submit" disabled={busy} className="h-10 self-start rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-70">
            {t("saveNames")}
          </button>
        </form>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
          <dt className="text-muted">{t("nameAr")}</dt>
          <dd lang="ar" dir="rtl" className="text-start">{name}</dd>
          <dt className="text-muted">{t("nameEn")}</dt>
          <dd lang="en" dir="ltr" className="text-start">{nameEn ?? <span className="text-muted">—</span>}</dd>
        </dl>
      )}
    </section>
  );
}
