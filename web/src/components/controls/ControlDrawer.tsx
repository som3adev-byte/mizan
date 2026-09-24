"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/auth/fields";
import { EvidenceSection } from "@/components/evidence/EvidenceSection";
import { PlanSection } from "@/components/tasks/PlanSection";
import { Code, StatusChip } from "@/components/controls/status";
import { IconClose } from "@/components/icons";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import { type Assignee, CLOUD_SUBDOMAIN, type ComplianceStatus, type ControlsPayload, STATUS_ORDER } from "@/lib/controls";
import type { Role } from "@/lib/session";

type Props = {
  data: ControlsPayload;
  code: string | null;
  onClose: () => void;
  me: { id: string; role: Role };
  assignees: Assignee[] | null;
  /** YYYY-MM-DD in Riyadh, for evidence validity. */
  today: string;
};

/** Side panel with one control: its official text, subcontrols, and (for editors) the update form. */
export function ControlDrawer({ data, code, onClose, me, assignees, today }: Props) {
  const t = useTranslations("Control");
  const st = useTranslations("Status");
  const format = useFormatter();
  const ar = useLocale() === "ar";
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const found = findControl(data, code);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (found && !dialog.open) {
      setError(null);
      setNotice(null);
      dialog.showModal();
    } else if (!found && dialog.open) dialog.close();
  }, [found]);

  const isAdmin = me.role === "ADMIN";
  const canEdit = !!found && (isAdmin || (me.role === "CONTROL_OWNER" && found.control.owner?.id === me.id));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!found) return;
    const form = new FormData(e.currentTarget);
    const body: Record<string, string | null> = { status: String(form.get("status")) };
    if (isAdmin) {
      body.ownerId = (form.get("ownerId") as string) || null;
      body.dueDate = (form.get("dueDate") as string) || null;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await postJson(`/controls/${found.control.code}`, body);
    setBusy(false);
    if (!res.ok) {
      setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
      return;
    }
    setNotice(t("updated"));
    router.refresh();
  }

  const text = (x: { textAr: string; textEn: string | null }) => (ar ? x.textAr : (x.textEn ?? x.textAr));
  // The official text is Arabic; in English it shows as-is until a translation exists.
  const arabicFallback = (x: { textEn: string | null }) => !ar && x.textEn === null;
  const date = (d: string) =>
    format.dateTime(new Date(`${d}T00:00:00Z`), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC", numberingSystem: "latn" });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="drawer-code"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current.close();
      }}
      className="m-0 ms-auto h-dvh max-h-dvh w-[min(440px,100vw)] max-w-none border-0 border-s border-line bg-surface p-0 text-text shadow-[0_0_32px_-12px_color-mix(in_srgb,var(--color-ink)_22%,transparent)] backdrop:bg-scrim"
    >
      {found && (
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-line p-6">
            <StatusChip status={found.control.status} />
            <h2 id="drawer-code" className="text-page-title font-bold">
              <Code>{found.control.code}</Code>
            </h2>
            <button
              type="button"
              aria-label={t("close")}
              onClick={() => dialogRef.current?.close()}
              className="ms-auto grid size-9 place-items-center rounded-pill border border-line bg-surface hover:border-line-2"
            >
              <IconClose />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
              <dt className="text-muted">{t("domain")}</dt>
              <dd className="font-medium">{ar ? found.domain.nameAr : found.domain.nameEn}</dd>
              <dt className="text-muted">{t("subdomain")}</dt>
              <dd className="font-medium">
                <Code>{found.subdomain.code}</Code> {ar ? found.subdomain.nameAr : found.subdomain.nameEn}
              </dd>
              <dt className="text-muted">{t("owner")}</dt>
              <dd className="font-medium">{found.control.owner?.name ?? <span className="text-muted">{t("unassigned")}</span>}</dd>
              <dt className="text-muted">{t("dueDate")}</dt>
              <dd className="font-medium">{found.control.dueDate ? date(found.control.dueDate) : <span className="text-muted">{t("noDueDate")}</span>}</dd>
            </dl>

            {found.subdomain.code === CLOUD_SUBDOMAIN && data.usesCloud !== true && (
              <p className="rounded-panel border border-line bg-surface-2 p-4 text-body-sm">
                {data.usesCloud === false ? t("cloudNotUsed") : t("cloudUnanswered")}
              </p>
            )}

            <section aria-labelledby="drawer-text" className="flex flex-col gap-3">
              <h3 id="drawer-text" className="text-headline font-bold">
                {t("textTitle")}
              </h3>
              {arabicFallback(found.control) && <p className="text-label text-muted">{t("arabicOnly")}</p>}
              <p lang={arabicFallback(found.control) ? "ar" : undefined} dir={arabicFallback(found.control) ? "rtl" : undefined} className="text-body">
                {text(found.control)}
              </p>
              {found.control.subcontrols.length > 0 && (
                <ul className="flex flex-col gap-2 border-s-2 border-line ps-4">
                  {found.control.subcontrols.map((s) => (
                    <li key={s.code} className="grid grid-cols-[auto_1fr] gap-3 text-body-sm">
                      <Code className="text-muted">{s.code}</Code>
                      <span lang={arabicFallback(s) ? "ar" : undefined} dir={arabicFallback(s) ? "rtl" : undefined}>
                        {text(s)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="drawer-objective" className="flex flex-col gap-2">
              <h3 id="drawer-objective" className="text-body font-bold">
                {t("objectiveTitle")}
              </h3>
              <p className="text-body-sm text-muted">{ar ? found.subdomain.objectiveAr : (found.subdomain.objectiveEn ?? found.subdomain.objectiveAr)}</p>
            </section>

            <PlanSection
              key={`plan-${found.control.code}`}
              controlCode={found.control.code}
              controlOwnerId={found.control.owner?.id ?? null}
              today={today}
              me={me}
              people={people(data, assignees)}
            />

            <EvidenceSection key={`evidence-${found.control.code}`} controlCode={found.control.code} today={today} me={me} canUpload={canEdit} />

            {canEdit ? (
              <form key={found.control.code} onSubmit={onSubmit} className="flex flex-col gap-4 rounded-panel border border-line p-4" noValidate>
                <h3 className="text-headline font-bold">{t("editTitle")}</h3>
                <Field id="control-status" label={t("status")}>
                  <select id="control-status" name="status" defaultValue={found.control.status} className={inputClass}>
                    {STATUS_ORDER.map((s: ComplianceStatus) => (
                      <option key={s} value={s}>
                        {st(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                {isAdmin && (
                  <>
                    <Field id="control-owner" label={t("owner")}>
                      <select id="control-owner" name="ownerId" defaultValue={found.control.owner?.id ?? ""} className={inputClass}>
                        <option value="">{t("unassigned")}</option>
                        {(assignees ?? []).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="control-due" label={t("dueDate")}>
                      <input id="control-due" name="dueDate" type="date" dir="ltr" defaultValue={found.control.dueDate ?? ""} className={`${inputClass} text-start`} />
                    </Field>
                  </>
                )}
                <div aria-live="polite" className="flex flex-col gap-2">
                  {notice && <p className="rounded-badge bg-status-compliant-bg px-3 py-2 text-body-sm text-status-compliant-text">{notice}</p>}
                  <FormError>{error}</FormError>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="h-11 rounded-control bg-ink px-5 text-body-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-70"
                >
                  {t("submit")}
                </button>
              </form>
            ) : (
              <p className="rounded-panel bg-surface-2 p-4 text-body-sm text-muted">{me.role === "CONTROL_OWNER" ? t("notYours") : t("readOnly")}</p>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

/**
 * Who a remediation step can go to. Admins get the full list from /users;
 * Control Owners, who cannot list users, pick among people who already own controls.
 */
function people(data: ControlsPayload, assignees: Assignee[] | null): Assignee[] {
  if (assignees) return assignees;
  const seen = new Map<string, string>();
  for (const d of data.domains) for (const s of d.subdomains) for (const c of s.controls) if (c.owner) seen.set(c.owner.id, c.owner.name);
  return [...seen].map(([id, name]) => ({ id, name }));
}

function findControl(data: ControlsPayload, code: string | null) {
  for (const domain of data.domains)
    for (const subdomain of domain.subdomains)
      for (const control of subdomain.controls) if (control.code === code) return { domain, subdomain, control };
  return null;
}

const inputClass = "h-11 w-full rounded-control border border-line bg-surface px-3 text-body outline-none hover:border-line-2 focus:border-text";

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
