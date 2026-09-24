"use client";

import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { FormError } from "@/components/auth/fields";
import { IconCalendar } from "@/components/icons";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import { daysUntil } from "@/lib/controls";
import type { Visit, VisitsPayload } from "@/lib/visits";

/** Auditor visits in Settings: the Admin schedules and records notes; everyone else reads. */
export function VisitsSection({ data, today, canEdit }: { data: VisitsPayload; today: string; canEdit: boolean }) {
  const t = useTranslations("Visits");
  const format = useFormatter();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const long = (d: string) =>
    format.dateTime(new Date(`${d}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC", numberingSystem: "latn" });

  async function run(key: string, path: string, body: object, success: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const res = await postJson(path, body);
    setBusy(null);
    if (!res.ok) {
      setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
      return false;
    }
    setNotice(success);
    setEditing(null);
    setConfirmCancel(null);
    router.refresh();
    return true;
  }

  async function onSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const visitDate = String(form.get("visitDate") ?? "");
    if (!visitDate) return setError(t("errors.invalid_input"));
    if (daysUntil(today, visitDate) < 0) return setError(t("errors.past"));
    const ok = await run("new", "/visits", { visitDate, notes: String(form.get("notes") ?? "") || null }, t("scheduled"));
    if (ok) formRef.current?.reset();
  }

  const field = "h-11 w-full rounded-control border border-line bg-surface px-3 text-body outline-none hover:border-line-2 focus:border-text";

  const item = (v: Visit, upcoming: boolean) => {
    const left = daysUntil(today, v.visitDate);
    return (
      <li key={v.id} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold">{long(v.visitDate)}</span>
          {upcoming && (
            <span className="text-label text-status-partial-text">{left === 0 ? t("today") : t("inDays", { count: left, n: left })}</span>
          )}
        </div>
        {editing === v.id ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const notes = String(new FormData(e.currentTarget).get("notes") ?? "");
              void run(v.id, `/visits/${v.id}`, { notes: notes || null }, t("notesSaved"));
            }}
          >
            <label className="sr-only" htmlFor={`notes-${v.id}`}>
              {t("notes")}
            </label>
            <textarea id={`notes-${v.id}`} name="notes" defaultValue={v.notes ?? ""} rows={3} maxLength={2000} className={`${field} h-auto py-2`} />
            <div className="flex gap-2">
              <button type="submit" disabled={busy === v.id} className="h-9 rounded-control bg-ink px-4 text-label font-semibold text-on-ink hover:bg-ink-2">
                {t("saveNotes")}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="h-9 px-3 text-label text-muted hover:text-text">
                {t("cancel")}
              </button>
            </div>
          </form>
        ) : (
          v.notes && <p className="text-body-sm text-muted">{v.notes}</p>
        )}
        {canEdit && editing !== v.id && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(v.id)} className="h-8 rounded-control border border-line bg-surface px-3 text-label hover:border-text">
              {v.notes ? t("editNotes") : t("addNotes")}
            </button>
            {upcoming &&
              (confirmCancel === v.id ? (
                <>
                  <button
                    type="button"
                    disabled={busy === v.id}
                    onClick={() => run(v.id, `/visits/${v.id}/cancel`, {}, t("cancelled"))}
                    className="h-8 rounded-control bg-danger-fill px-3 text-label font-semibold text-on-rail"
                  >
                    {t("confirmCancel")}
                  </button>
                  <button type="button" onClick={() => setConfirmCancel(null)} className="h-8 px-3 text-label text-muted hover:text-text">
                    {t("keep")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(v.id)}
                  className="h-8 rounded-control border border-line bg-surface px-3 text-label hover:border-status-noncompliant hover:text-status-noncompliant"
                >
                  {t("cancelVisit")}
                </button>
              ))}
          </div>
        )}
      </li>
    );
  };

  return (
    <section id="visits" aria-labelledby="visits-title" className="flex scroll-mt-6 flex-col gap-4 rounded-panel border border-line bg-surface p-6">
      <h2 id="visits-title" className="flex items-center gap-2 text-headline font-bold">
        <IconCalendar className="size-5 text-muted" />
        {t("title")}
      </h2>
      <p className="max-w-[70ch] text-body-sm text-muted">{t("help")}</p>

      {canEdit && (
        <form ref={formRef} onSubmit={onSchedule} className="flex flex-col gap-3 md:flex-row md:items-end" noValidate>
          <label className="flex flex-col gap-2 text-label font-medium md:w-56">
            {t("date")}
            <input name="visitDate" type="date" dir="ltr" min={today} required className={`${field} text-start`} />
          </label>
          <label className="flex flex-1 flex-col gap-2 text-label font-medium">
            {t("notesOptional")}
            <input name="notes" maxLength={2000} placeholder={t("notesPlaceholder")} className={field} />
          </label>
          <button type="submit" disabled={busy === "new"} className="h-11 rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-70">
            {t("schedule")}
          </button>
        </form>
      )}

      <div aria-live="polite" className="flex flex-col gap-2">
        {notice && <p className="rounded-badge bg-status-compliant-bg px-3 py-2 text-body-sm text-status-compliant-text">{notice}</p>}
        <FormError>{error}</FormError>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-body font-bold">{t("upcoming")}</h3>
        {data.upcoming.length === 0 ? (
          <p className="text-body-sm text-muted">{canEdit ? t("noneUpcomingAdmin") : t("noneUpcoming")}</p>
        ) : (
          <ul>{data.upcoming.map((v) => item(v, true))}</ul>
        )}
      </div>

      {data.past.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-body font-bold">{t("past")}</h3>
          <ul>{data.past.map((v) => item(v, false))}</ul>
        </div>
      )}
    </section>
  );
}
