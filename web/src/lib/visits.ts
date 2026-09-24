/** Shapes returned by /visits (see api/src/visits/visits.service.ts). */
export type Visit = { id: string; visitDate: string; notes: string | null; createdAt: string };
export type VisitsPayload = { upcoming: Visit[]; past: Visit[] };
