import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/shell/AppShell";
import { TasksBoard } from "@/components/tasks/TasksBoard";
import type { UsersPayload } from "@/components/users/UsersList";
import { type Assignee, type ControlsPayload, todayInRiyadh } from "@/lib/controls";
import { requireSignedIn } from "@/lib/require-session";
import { apiGet } from "@/lib/session";
import type { Task } from "@/lib/tasks";
import { titleFrom } from "@/lib/metadata";

export const generateMetadata = titleFrom("Tasks", "pageTitle");

export default async function TasksPage({ params, searchParams }: PageProps<"/[locale]/tasks">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireSignedIn(locale);
  const t = await getTranslations("Tasks");
  const mine = (await searchParams).mine === "1";

  const [tasks, controls, users] = await Promise.all([
    apiGet<Task[]>(`/tasks${mine ? "?mine=1" : ""}`),
    apiGet<ControlsPayload>("/controls"),
    me.role === "ADMIN" ? apiGet<UsersPayload>("/users") : null,
  ]);
  if (!tasks.ok) throw new Error(`GET /tasks failed with ${tasks.status}`);
  if (!controls.ok) throw new Error(`GET /controls failed with ${controls.status}`);
  const assignees: Assignee[] | null = users?.ok
    ? users.data.users.filter((u) => u.status === "ACTIVE" && (u.role === "ADMIN" || u.role === "CONTROL_OWNER")).map((u) => ({ id: u.id, name: u.name }))
    : null;

  return (
    <AppShell me={me} current="tasks">
      <div className="flex flex-col gap-1">
        <h1 className="text-page-title font-bold">{t("pageTitle")}</h1>
        <p className="text-body-sm text-muted">{t("pageSubtitle")}</p>
      </div>
      <TasksBoard tasks={tasks.data} controls={controls.data} today={todayInRiyadh()} me={{ id: me.id, role: me.role }} assignees={assignees} mine={mine} />
    </AppShell>
  );
}
