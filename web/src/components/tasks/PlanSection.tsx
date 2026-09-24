"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/auth/fields";
import { TaskItem } from "@/components/tasks/TaskItem";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";
import type { Assignee } from "@/lib/controls";
import type { Role } from "@/lib/session";
import { type Task, canPlan, canTick } from "@/lib/tasks";

type Props = {
  controlCode: string;
  controlOwnerId: string | null;
  today: string;
  me: { id: string; role: Role };
  /** People a step can be assigned to. */
  people: Assignee[];
};

/** The remediation plan inside the control drawer: its steps and a form to add one. */
export function PlanSection({ controlCode, controlOwnerId, today, me, people }: Props) {
  const t = useTranslations("Tasks");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const planner = canPlan(me, controlOwnerId);

  useEffect(() => {
    let alive = true;
    fetch(`/api/tasks?control=${encodeURIComponent(controlCode)}`, { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Task[]>) : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!alive) return;
        setTasks(data);
        setLoadFailed(false);
      })
      .catch(() => alive && setLoadFailed(true));
    return () => {
      alive = false;
    };
  }, [controlCode, version]);

  async function run(id: string, path: string, body: object) {
    setBusyId(id);
    setError(null);
    const res = await postJson(path, body);
    setBusyId(null);
    if (!res.ok) {
      setError(t.has(`errors.${res.code}`) ? t(`errors.${res.code}`) : t("errors.unknown"));
      return false;
    }
    setVersion((v) => v + 1);
    router.refresh();
    return true;
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (title.length < 2) return setError(t("errors.invalid_input"));
    const ok = await run("new", "/tasks", {
      controlCode,
      title,
      ownerId: (form.get("ownerId") as string) || null,
      dueDate: (form.get("dueDate") as string) || null,
    });
    if (ok) formRef.current?.reset();
  }

  const open = tasks?.filter((x) => !x.done).length ?? 0;
  const field = "h-10 w-full rounded-control border border-line bg-surface px-3 text-body-sm outline-none hover:border-line-2 focus:border-text";

  return (
    <section aria-labelledby="drawer-plan" className="flex flex-col gap-3">
      <h3 id="drawer-plan" className="flex items-baseline gap-2 text-headline font-bold">
        {t("planTitle")}
        {tasks && tasks.length > 0 && (
          <span className="text-label font-medium text-muted">{t("openOf", { open, total: tasks.length })}</span>
        )}
      </h3>

      {loadFailed ? (
        <p className="rounded-panel bg-surface-2 p-4 text-body-sm text-muted">{t("loadFailed")}</p>
      ) : tasks === null ? (
        <p className="text-body-sm text-muted">{t("loading")}</p>
      ) : tasks.length === 0 ? (
        <p className="rounded-panel bg-surface-2 p-4 text-body-sm text-muted">{planner ? t("emptyPlanner") : t("empty")}</p>
      ) : (
        <ul className="rounded-panel border border-line px-4">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              today={today}
              busy={busyId === task.id}
              canTick={canTick(me, task, controlOwnerId)}
              canRemove={planner}
              onToggle={() => run(task.id, `/tasks/${task.id}`, { done: !task.done })}
              onRemove={() => run(task.id, `/tasks/${task.id}/remove`, {})}
            />
          ))}
        </ul>
      )}

      {planner && (
        <form ref={formRef} onSubmit={onAdd} className="flex flex-col gap-3 rounded-panel border border-line p-4" noValidate>
          <label className="flex flex-col gap-2 text-label font-medium">
            {t("stepTitle")}
            <input name="title" required minLength={2} maxLength={300} placeholder={t("stepPlaceholder")} className={field} />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-label font-medium">
              {t("owner")}
              <select name="ownerId" defaultValue={controlOwnerId ?? ""} className={field}>
                <option value="">{t("unassigned")}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-label font-medium">
              {t("dueDate")}
              <input name="dueDate" type="date" dir="ltr" className={`${field} text-start`} />
            </label>
          </div>
          <button type="submit" disabled={busyId === "new"} className="h-10 rounded-control bg-ink px-4 text-body-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-70">
            {t("addStep")}
          </button>
        </form>
      )}
      <FormError>{error}</FormError>
    </section>
  );
}
