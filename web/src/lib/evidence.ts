/** Shape returned by GET /evidence (see api/src/evidence/evidence.service.ts). */
export type Evidence = {
  id: string;
  controlCode: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  expiresOn: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string };
};

export const MAX_EVIDENCE_MB = 20;
export const EVIDENCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.txt,.csv";
/** Evidence expiring within this many days counts as "expiring soon". */
export const EXPIRING_DAYS = 30;

export type Validity = { kind: "none" } | { kind: "valid" | "expiring"; days: number } | { kind: "expired"; days: number };

export function validity(expiresOn: string | null, today: string): Validity {
  if (!expiresOn) return { kind: "none" };
  const days = Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { kind: "expired", days: -days };
  return { kind: days <= EXPIRING_DAYS ? "expiring" : "valid", days };
}

export const downloadUrl = (id: string) => `/api/evidence/${id}/file`;
