import type { ComplianceStatus } from '../generated/prisma/enums.js';

export const STATUSES: ComplianceStatus[] = ['COMPLIANT', 'PARTIAL', 'NON_COMPLIANT', 'NOT_APPLICABLE', 'NOT_STARTED'];

export type StatusCounts = Record<ComplianceStatus, number>;

export interface Summary {
  total: number;
  counts: StatusCounts;
  /**
   * Internal score, 0-100, or null when nothing applies. Not the NCA's
   * methodology: compliant counts 1, partial 0.5, everything else 0, and
   * not-applicable controls are left out of the denominator.
   */
  score: number | null;
}

export function summarize(statuses: ComplianceStatus[]): Summary {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as StatusCounts;
  for (const s of statuses) counts[s] += 1;
  const applicable = statuses.length - counts.NOT_APPLICABLE;
  const score = applicable === 0 ? null : Math.round(((counts.COMPLIANT + counts.PARTIAL / 2) / applicable) * 100);
  return { total: statuses.length, counts, score };
}
