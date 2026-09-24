"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Code } from "@/components/controls/status";
import { IconCalendar, IconClock, IconUser } from "@/components/icons";
import { daysUntil } from "@/lib/controls";
import type { Task } from "@/lib/tasks";

type Props = {
  task: Task;
  today: string;
  canTick: boolean;
  canRemove: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  /** On the Tasks page each step also shows its control. */
  showControl?: boolean;
  onOpenControl?: () => void;
};

/** One remediation step: a done checkbox, the title, owner and due date. */
export function TaskItem({ task, today, canTick, canRemove, busy, onToggle, onRemove, showControl, onOpenControl }: Props) {
  const t = useTranslations("Tasks");
  const format = useFormatter();
  const left = task.dueDate ? daysUntil(today, task.dueDate) : null;
  const late = !task.done && left !== null && left < 0;

  return (
    <li className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <input
        type="checkbox"
        checked={task.done}
        disabled={!canTick || busy}
        onChange={onToggle}
        aria-label={task.done ? t("markOpen", { title: task.title }) : t("markDone", { title: task.title })}
        className="mt-1 size-4 shrink-0 accent-text disabled:opacity-50"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`text-body-sm font-medium ${task.done ? "text-muted line-through" : ""}`}>{task.title}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-muted">
          {showControl && (
            <button type="button" onClick={onOpenControl} className="hover:underline hover:underline-offset-4">
              <Code className="text-text">{task.controlCode}</Code>
            </button>
          )}
          <span className="inline-flex items-center gap-1">
            <IconUser className="size-3.5" />
            {task.owner?.name ?? t("unassigned")}
          </span>
          {task.dueDate && (
            <span className={`inline-flex items-center gap-1 ${late ? "font-semibold text-status-noncompliant" : ""}`}>
              {late ? <IconClock className="size-3.5" /> : <IconCalendar className="size-3.5" />}
              {late
                ? t("overdue", { count: -left!, n: -left! })
                : format.dateTime(new Date(`${task.dueDate}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", numberingSystem: "latn" })}
            </span>
          )}
        </span>
      </div>
      {canRemove && onRemove && (
        <button type="button" onClick={onRemove} disabled={busy} className="shrink-0 text-label text-muted hover:text-status-noncompliant">
          {t("remove")}
        </button>
      )}
    </li>
  );
}
