"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/auth/fields";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import type { Role } from "@/lib/session";
import { ROLE_OPTIONS } from "./roles";

type User = { id: string; name: string; email: string; role: Role; status: "ACTIVE" | "DISABLED"; mfaEnabled: boolean };
type Invitation = { id: string; email: string; role: Role; expiresAt: string; expired: boolean };
export type UsersPayload = { users: User[]; invitations: Invitation[] };

export function UsersList({ data, meId, canEdit }: { data: UsersPayload; meId: string; canEdit: boolean }) {
  const t = useTranslations("Users");
  const roles = useTranslations("Roles");
  const format = useFormatter();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, path: string, body: object, success: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    const res = await postJson(path, body);
    setBusyId(null);
    setConfirmId(null);
    if (!res.ok) {
      setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
      return;
    }
    setNotice(success);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div aria-live="polite" className="flex flex-col gap-2">
        {notice && <p className="rounded-badge bg-status-compliant-bg px-3 py-2 text-body-sm text-status-compliant-text">{notice}</p>}
        <FormError>{error}</FormError>
      </div>

      <section aria-labelledby="users-title" className="overflow-hidden rounded-panel border border-line bg-surface">
        <h2 id="users-title" className="sr-only">
          {t("title")}
        </h2>
        <table className="w-full border-collapse text-body-sm">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-line text-start text-label text-muted">
              <th className="px-4 py-3 text-start font-medium">{t("colName")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("colEmail")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("colRole")}</th>
              <th className="px-4 py-3 text-start font-medium">{t("colStatus")}</th>
              {canEdit && <th className="px-4 py-3 text-start font-medium">{t("colActions")}</th>}
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => {
              const self = u.id === meId;
              const disabled = u.status === "DISABLED";
              return (
                <tr key={u.id} className="flex flex-col gap-2 border-b border-line px-4 py-4 last:border-b-0 md:table-row md:px-0 md:py-0">
                  <td className="font-semibold md:px-4 md:py-3">
                    {u.name}
                    {self && <span className="ms-2 rounded-badge bg-surface-2 px-2 text-badge font-medium text-muted">{t("you")}</span>}
                  </td>
                  <td className="md:px-4 md:py-3">
                    <bdi dir="ltr" className="text-muted">
                      {u.email}
                    </bdi>
                  </td>
                  <td className="md:px-4 md:py-3">
                    {canEdit && !self ? (
                      <select
                        aria-label={`${t("colRole")}: ${u.name}`}
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => act(u.id, `/users/${u.id}/role`, { role: e.target.value }, t("roleChanged"))}
                        className="h-9 rounded-control border border-line bg-surface px-2 text-body-sm hover:border-line-2 focus:border-text"
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {roles(r)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      roles(u.role)
                    )}
                  </td>
                  <td className="md:px-4 md:py-3">
                    <span className={`inline-flex items-center gap-2 ${disabled ? "text-muted" : ""}`}>
                      <span aria-hidden="true" className={`size-2 rounded-pill ${disabled ? "border border-muted" : "bg-ink"}`} />
                      {disabled ? t("disabled") : t("active")}
                    </span>
                    {!u.mfaEnabled && !disabled && <span className="block text-badge text-muted">{t("mfaOff")}</span>}
                  </td>
                  {canEdit && (
                    <td className="md:px-4 md:py-3">
                      {self ? null : disabled ? (
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => act(u.id, `/users/${u.id}/enable`, {}, t("userEnabled"))}
                          className="h-9 rounded-control border border-line bg-surface px-3 text-label hover:border-text"
                        >
                          {t("enable")}
                        </button>
                      ) : confirmId === u.id ? (
                        <span className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => act(u.id, `/users/${u.id}/disable`, {}, t("userDisabled"))}
                            className="h-9 rounded-control bg-danger-fill px-3 text-label font-semibold text-on-rail"
                          >
                            {t("confirmDisable")}
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)} className="h-9 rounded-control px-3 text-label text-muted hover:text-text">
                            {t("cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmId(u.id)}
                          className="h-9 rounded-control border border-line bg-surface px-3 text-label hover:border-status-noncompliant hover:text-status-noncompliant"
                        >
                          {t("disable")}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="pending-title" className="flex flex-col gap-3">
        <h2 id="pending-title" className="text-headline font-bold">
          {t("pendingTitle")}
        </h2>
        {data.invitations.length === 0 ? (
          <p className="text-body-sm text-muted">{t("pendingEmpty")}</p>
        ) : (
          <ul className="overflow-hidden rounded-panel border border-line bg-surface">
            {data.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 text-body-sm last:border-b-0">
                <bdi dir="ltr" className="font-medium">
                  {inv.email}
                </bdi>
                <span className="text-muted">{roles(inv.role)}</span>
                <span className="text-muted">
                  {inv.expired ? t("expired") : `${t("expires")} ${format.dateTime(new Date(inv.expiresAt), { day: "numeric", month: "long", numberingSystem: "latn" })}`}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    disabled={busyId === inv.id}
                    onClick={() => act(inv.id, `/users/invitations/${inv.id}/revoke`, {}, t("invitationRevoked"))}
                    className="ms-auto h-9 rounded-control border border-line bg-surface px-3 text-label hover:border-text"
                  >
                    {t("revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
