"use client";

import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/auth/fields";
import { ValidityBadge, formatSize } from "@/components/evidence/parts";
import { IconFile } from "@/components/icons";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import { EVIDENCE_ACCEPT, type Evidence, MAX_EVIDENCE_MB, downloadUrl } from "@/lib/evidence";
import type { Role } from "@/lib/session";

type Props = {
  controlCode: string;
  today: string;
  me: { id: string; role: Role };
  /** Admins, or the control's owner. */
  canUpload: boolean;
};

/** The evidence list and upload form inside the control drawer. */
export function EvidenceSection({ controlCode, today, me, canUpload }: Props) {
  const t = useTranslations("Evidence");
  const format = useFormatter();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState<Evidence[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Bumped after an upload or removal to fetch the list again.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let alive = true;
    fetch(`/api/evidence?control=${encodeURIComponent(controlCode)}`, { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Evidence[]>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!alive) return;
        setItems(data);
        setLoadFailed(false);
      })
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [controlCode, version]);

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return setError(t("errors.no_file"));
    if (file.size > MAX_EVIDENCE_MB * 1024 * 1024) return setError(t("errors.too_large", { mb: MAX_EVIDENCE_MB }));
    form.set("controlCode", controlCode);
    if (!form.get("expiresOn")) form.delete("expiresOn");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/evidence", { method: "POST", body: form, credentials: "same-origin" });
      if (!res.ok) {
        const code = res.status === 413 ? "too_large" : (((await res.json().catch(() => null)) as { code?: string } | null)?.code ?? "unknown");
        setError(t.has(`errors.${code}`) ? t(`errors.${code}`, { mb: MAX_EVIDENCE_MB }) : t("errors.unknown"));
        return;
      }
      formRef.current?.reset();
      setNotice(t("uploaded"));
      reload();
      router.refresh();
    } catch {
      setError(t("errors.unknown"));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(item: Evidence) {
    setError(null);
    setNotice(null);
    setConfirmId(null);
    const res = await postJson(`/evidence/${item.id}/remove`);
    if (!res.ok) return setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`, { mb: MAX_EVIDENCE_MB }) : t("errors.unknown"));
    setNotice(t("removed"));
    reload();
    router.refresh();
  }

  const field = "h-11 w-full rounded-control border border-line bg-surface px-3 text-body outline-none hover:border-line-2 focus:border-text";

  return (
    <section aria-labelledby="drawer-evidence" className="flex flex-col gap-3">
      <h3 id="drawer-evidence" className="text-headline font-bold">
        {t("sectionTitle")}
      </h3>

      {loadFailed ? (
        <p className="rounded-panel bg-surface-2 p-4 text-body-sm text-muted">{t("loadFailed")}</p>
      ) : items === null ? (
        <p className="text-body-sm text-muted">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="rounded-panel bg-surface-2 p-4 text-body-sm text-muted">{canUpload ? t("emptyCanUpload") : t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 rounded-panel border border-line p-4">
              <div className="flex items-start gap-3">
                <IconFile className="mt-1 size-[18px] shrink-0 text-muted" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{item.title}</span>
                  <span className="truncate text-label text-muted">
                    <bdi>{item.fileName}</bdi> · <span className="num">{formatSize(item.size)}</span>
                  </span>
                  <span className="text-label text-muted">
                    {t("uploadedBy", {
                      name: item.uploadedBy.name,
                      date: format.dateTime(new Date(item.createdAt), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh", numberingSystem: "latn" }),
                    })}
                  </span>
                </div>
                <ValidityBadge expiresOn={item.expiresOn} today={today} />
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={downloadUrl(item.id)}
                  className="inline-flex h-8 items-center rounded-control bg-ink px-4 text-label font-semibold text-on-ink no-underline hover:bg-ink-2"
                >
                  {t("download")}
                </a>
                {(me.role === "ADMIN" || item.uploadedBy.id === me.id) &&
                  (confirmId === item.id ? (
                    <>
                      <button type="button" onClick={() => onRemove(item)} className="h-8 rounded-control bg-danger-fill px-3 text-label font-semibold text-on-rail">
                        {t("confirmRemove")}
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className="h-8 px-3 text-label text-muted hover:text-text">
                        {t("cancel")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(item.id)}
                      className="h-8 rounded-control border border-line bg-surface px-3 text-label hover:border-status-noncompliant hover:text-status-noncompliant"
                    >
                      {t("remove")}
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <form ref={formRef} onSubmit={onUpload} className="flex flex-col gap-3 rounded-panel border border-line p-4" noValidate>
          <h4 className="text-body font-bold">{t("uploadTitle")}</h4>
          <label className="flex flex-col gap-2 text-label font-medium">
            {t("title")}
            <input name="title" required minLength={2} maxLength={200} className={field} />
          </label>
          <label className="flex flex-col gap-2 text-label font-medium">
            {t("file")}
            <input
              name="file"
              type="file"
              required
              accept={EVIDENCE_ACCEPT}
              className="text-body-sm file:me-3 file:h-10 file:rounded-control file:border file:border-line file:bg-surface-2 file:px-3 file:text-label"
            />
            <span className="font-normal text-muted">{t("fileHint", { mb: MAX_EVIDENCE_MB })}</span>
          </label>
          <label className="flex flex-col gap-2 text-label font-medium">
            {t("expiresOn")}
            <input name="expiresOn" type="date" dir="ltr" className={`${field} text-start`} />
            <span className="font-normal text-muted">{t("expiresHint")}</span>
          </label>
          <div aria-live="polite" className="flex flex-col gap-2">
            {notice && <p className="rounded-badge bg-status-compliant-bg px-3 py-2 text-body-sm text-status-compliant-text">{notice}</p>}
            <FormError>{error}</FormError>
          </div>
          <button type="submit" disabled={busy} className="h-11 rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-70">
            {busy ? t("uploading") : t("submit")}
          </button>
        </form>
      )}
      {!canUpload && notice && <p className="text-body-sm text-status-compliant-text">{notice}</p>}
      {!canUpload && <FormError>{error}</FormError>}
    </section>
  );
}
