"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormError } from "@/components/auth/fields";
import { ControlDrawer } from "@/components/controls/ControlDrawer";
import { TaskItem } from "@/components/tasks/TaskItem";
import { Link, useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import { type Assignee, type ControlsPayload, daysUntil } from "@/lib/controls";
import type { Role } from "@/lib/session";
import { type Task, canPlan, canTick, controlOwners } from "@/lib/tasks";

type Props = {
  tasks: Task[];
  controls: ControlsPayload;
  today: string;
  me: { id: string; role: Role };
  assignees: Assignee[] | null;
  mine: boolean;
};

/** Every remediation step in the entity, grouped by urgency. Control codes open the control drawer. */
export function TasksBoard({ tasks, controls, today, me, assignees, mine }: Props) {
  const t = useTranslations("Tasks");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCode, setOpenCode] = useState<string | null>(null);
  const owners = controlOwners(controls);

  async function run(id: string, path: string, body: object) {
    setBusyId(id);
    setError(null);
    const res = await postJson(path, body);
    setBusyId(null);
    if (!res.ok) return setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
    router.refresh();
  }

  const late = (x: Task) => !x.done && x.dueDate !== null && daysUntil(today, x.dueDate) < 0;
  const groups = [
    { key: "overdue", items: tasks.filter(late) },
    { key: "open", items: tasks.filter((x) => !x.done && !late(x)) },
    { key: "done", items: tasks.filter((x) => x.done) },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
        {[false, true].map((m) => (
          <Link
            key={String(m)}
            href={m ? "/tasks?mine=1" : "/tasks"}
            aria-current={m === mine ? "page" : undefined}
            className="inline-flex h-8 items-center rounded-control border border-transparent px-3 text-label text-muted no-underline hover:bg-surface-2
                       aria-[current=page]:border-saffron aria-[current=page]:bg-saffron-bg aria-[current=page]:text-text"
          >
            {m ? t("filterMine") : t("filterAll")}
          </Link>
        ))}
      </nav>
      <FormError>{error}</FormError>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-panel border border-line bg-surface p-6">
          <p className="max-w-[65ch] text-body-sm text-muted">{mine ? t("emptyMine") : t("emptyPage")}</p>
          {!mine && (
            <Link href="/controls?status=NON_COMPLIANT,PARTIAL" className="inline-flex h-10 items-center rounded-control bg-ink px-4 text-label font-semibold text-on-ink no-underline hover:bg-ink-2">
              {t("openGaps")}
            </Link>
          )}
        </div>
      ) : (
        groups.map(({ key, items }) =>
          items.length === 0 ? null : (
            <section key={key} aria-labelledby={`tasks-${key}`} className="flex flex-col gap-3">
              <h2 id={`tasks-${key}`} className={`flex items-baseline gap-2 text-headline font-bold ${key === "overdue" ? "text-status-noncompliant" : ""}`}>
                {t(`group.${key}`)} <span className="num text-body font-medium text-muted">({items.length})</span>
              </h2>
              <ul className="rounded-panel border border-line bg-surface px-4">
                {items.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    today={today}
                    busy={busyId === task.id}
                    canTick={canTick(me, task, owners.get(task.controlCode))}
                    canRemove={canPlan(me, owners.get(task.controlCode))}
                    onToggle={() => run(task.id, `/tasks/${task.id}`, { done: !task.done })}
                    onRemove={() => run(task.id, `/tasks/${task.id}/remove`, {})}
                    showControl
                    onOpenControl={() => setOpenCode(task.controlCode)}
                  />
                ))}
              </ul>
            </section>
          ),
        )
      )}

      <ControlDrawer data={controls} code={openCode} onClose={() => setOpenCode(null)} me={me} assignees={assignees} today={today} />
    </div>
  );
}
