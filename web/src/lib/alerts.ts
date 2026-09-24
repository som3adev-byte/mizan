/** Shape returned by GET /alerts (see api/src/alerts/alerts.service.ts). */
export type AlertKind =
  | "control_overdue"
  | "control_gap"
  | "control_due_soon"
  | "task_overdue"
  | "task_due_soon"
  | "evidence_expired"
  | "evidence_expiring"
  | "audit_visit";

export type Alert = {
  id: string;
  kind: AlertKind;
  severity: "high" | "medium";
  /** Null for entity-wide alerts (the auditor visit). */
  controlCode: string | null;
  days: number | null;
  title: string | null;
  owner: { id: string; name: string } | null;
  /** audit_visit only. */
  openGaps?: number;
};

export type AlertsPayload = { alerts: Alert[]; high: number };
