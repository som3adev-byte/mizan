import type { ControlsPayload } from "@/lib/controls";
import type { Role } from "@/lib/session";

/** Shape returned by GET /tasks (see api/src/tasks/tasks.service.ts). */
export type Task = {
  id: string;
  controlCode: string;
  title: string;
  dueDate: string | null;
  done: boolean;
  doneAt: string | null;
  createdAt: string;
  owner: { id: string; name: string } | null;
};

type Me = { id: string; role: Role };

/** Admins, or the owner of the task's control, plan it (add, edit, remove). */
export function canPlan(me: Me, controlOwnerId: string | null | undefined) {
  return me.role === "ADMIN" || (me.role === "CONTROL_OWNER" && controlOwnerId === me.id);
}

/** Planners, plus the step's own owner, can tick it done. */
export function canTick(me: Me, task: Task, controlOwnerId: string | null | undefined) {
  return canPlan(me, controlOwnerId) || (me.role === "CONTROL_OWNER" && task.owner?.id === me.id);
}

/** code → owner id, from the controls listing. */
export function controlOwners(data: ControlsPayload) {
  const map = new Map<string, string | null>();
  for (const d of data.domains) for (const s of d.subdomains) for (const c of s.controls) map.set(c.code, c.owner?.id ?? null);
  return map;
}
