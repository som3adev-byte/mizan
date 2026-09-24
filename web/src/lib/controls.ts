/** Shapes returned by GET /controls (see api/src/controls/controls.service.ts). */

export type ComplianceStatus = "COMPLIANT" | "PARTIAL" | "NON_COMPLIANT" | "NOT_APPLICABLE" | "NOT_STARTED";

export const STATUS_ORDER: ComplianceStatus[] = ["COMPLIANT", "PARTIAL", "NON_COMPLIANT", "NOT_STARTED", "NOT_APPLICABLE"];

export type Summary = { total: number; counts: Record<ComplianceStatus, number>; score: number | null };

export type Subcontrol = { code: string; textAr: string; textEn: string | null };

export type Control = {
  code: string;
  textAr: string;
  textEn: string | null;
  status: ComplianceStatus;
  owner: { id: string; name: string } | null;
  dueDate: string | null;
  updatedAt: string | null;
  evidenceCount: number;
  subcontrols: Subcontrol[];
};

export type Subdomain = {
  code: string;
  nameAr: string;
  nameEn: string;
  objectiveAr: string;
  objectiveEn: string | null;
  summary: Summary;
  controls: Control[];
};

export type Domain = { code: string; nameAr: string; nameEn: string; summary: Summary; subdomains: Subdomain[] };

export type ControlsPayload = {
  framework: string;
  /** The entity's answer to "do you use cloud services?"; null until an Admin answers. */
  usesCloud: boolean | null;
  summary: Summary;
  domains: Domain[];
};

/** ECC-2:2024 subdomain 4-2 applies only to entities that use cloud computing or hosting. */
export const CLOUD_SUBDOMAIN = "4-2";

/** A person who can own controls (for the Admin's assign list). */
export type Assignee = { id: string; name: string };

export type AttentionKind = "overdue" | "gap" | "dueSoon";

export type AttentionItem = {
  kind: AttentionKind;
  /** Days late (overdue) or days left (dueSoon); null for a gap with no date. */
  days: number | null;
  control: Control;
  subdomain: Subdomain;
};

const DUE_SOON_DAYS = 14;

/**
 * What needs attention, most urgent first: overdue controls, then
 * non-compliant ones, then those due within two weeks. Done or
 * not-applicable controls never appear. `today` is YYYY-MM-DD.
 */
export function attentionItems(domains: Domain[], today: string, onlyOwnerId?: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const d of domains) {
    for (const s of d.subdomains) {
      for (const c of s.controls) {
        if (c.status === "COMPLIANT" || c.status === "NOT_APPLICABLE") continue;
        if (onlyOwnerId && c.owner?.id !== onlyOwnerId) continue;
        const left = c.dueDate ? daysUntil(today, c.dueDate) : null;
        if (left !== null && left < 0) items.push({ kind: "overdue", days: -left, control: c, subdomain: s });
        else if (c.status === "NON_COMPLIANT") items.push({ kind: "gap", days: left, control: c, subdomain: s });
        else if (left !== null && left <= DUE_SOON_DAYS) items.push({ kind: "dueSoon", days: left, control: c, subdomain: s });
      }
    }
  }
  const rank: Record<AttentionKind, number> = { overdue: 0, gap: 1, dueSoon: 2 };
  return items.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      (a.kind === "overdue" ? (b.days ?? 0) - (a.days ?? 0) : (a.days ?? Infinity) - (b.days ?? Infinity)),
  );
}

/** Today's date in Riyadh, as YYYY-MM-DD. */
export function todayInRiyadh(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(now);
}

/** Loose Arabic matching for search: no diacritics, one alef, ه for ة, ي for ى. */
export function normalizeSearch(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysUntil(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}
