"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { crmApi } from "@/lib/crm-api";
import { formatDate, taskLabel } from "@/lib/format";
import { useAuthSession } from "@/lib/use-auth-session";
import type { TaskRecord } from "@/types/models";

export default function TasksPage() {
  const router = useRouter();
  const { user, loading, role, signOut, accessToken, error: authError } = useAuthSession();

  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(true);

  const loadTasks = async () => {
    if (!accessToken) return;
    setLoadingTasks(true);
    setError(null);

    try {
      const payload = await crmApi.listTasks(accessToken);
      const taskRows = (payload.tasks ?? []) as TaskRecord[];
      setTasks(taskRows);
    } catch (loadError) {
      setTasks([]);
      const message =
        loadError instanceof Error ? loadError.message : "Failed to load tasks.";
      setError(
        `Tasks read failed: ${message}. If this includes "Failed to fetch", refresh and open /api/crm/api/tasks once.`,
      );
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (!user || !accessToken) return;
    loadTasks();
  }, [user, accessToken]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/tasks");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!loading && user && !accessToken) {
      setLoadingTasks(false);
      setError("Session token missing. Please sign out and sign in again.");
    }
  }, [accessToken, loading, user]);

  const updateStatus = async (task: TaskRecord, status: "open" | "completed") => {
    if (!accessToken) {
      setError("No session token found.");
      return;
    }

    setBusyTaskId(task.id);
    setError(null);

    const title = typeof task.title === "string" ? task.title.trim() : "";
    const scheduledFor =
      typeof task.scheduled_for === "string" && task.scheduled_for.length > 0
        ? task.scheduled_for
        : null;
    const dueAt = typeof task.due_at === "string" && task.due_at.length > 0 ? task.due_at : null;

    if (!title || (!scheduledFor && !dueAt)) {
      setError("Task is missing required title/date fields for CRM PATCH.");
      setBusyTaskId(null);
      return;
    }

    try {
      await crmApi.updateTaskStatus(
        {
          taskId: task.id,
          status,
          title,
          kind: typeof task.kind === "string" ? task.kind : "task",
          description: typeof task.description === "string" ? task.description : "",
          jobId: typeof task.job_id === "string" ? task.job_id : null,
          presetId: typeof task.preset_id === "string" ? task.preset_id : null,
          scheduledFor,
          dueAt,
          appointmentAddress:
            typeof task.appointment_address === "string" ? task.appointment_address : "",
          assigneeIds: Array.isArray(task.assignees)
            ? task.assignees
                .map((assignee) =>
                  typeof assignee === "object" && assignee && "id" in assignee
                    ? String((assignee as { id: string }).id)
                    : null,
                )
                .filter((value): value is string => Boolean(value))
            : [],
        },
        accessToken,
      );
      await loadTasks();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Failed to update task.");
    } finally {
      setBusyTaskId(null);
    }
  };

  if (loading) {
    return <main className="layout">Loading session...</main>;
  }

  if (!user) {
    return <main className="layout">Redirecting to sign in...</main>;
  }

  return (
    <AppShell
      role={role}
      onSignOut={signOut}
      debug={{
        userId: user.id,
        role,
        accessToken,
        authError,
      }}
    >
      <section className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Tasks</h2>
          <p className="hint">{tasks.length} loaded</p>
        </div>
        <p className="hint">Read + write: CRM `/api/tasks` and `/api/tasks/[taskId]`.</p>
        {error ? <p className="error">{error}</p> : null}
        {loadingTasks ? <p className="hint">Loading tasks...</p> : null}

        <div className="grid">
          {tasks.map((task) => {
            const status = String(task.status ?? "open");
            const isBusy = busyTaskId === task.id;

            return (
              <article key={task.id} className="job-card">
                <div className="row">
                  <strong>{taskLabel(task)}</strong>
                  <StatusPill value={status} />
                </div>
                <p className="muted">
                  {formatDate((task.scheduled_for as string | undefined) ?? (task.due_at as string | undefined))}
                </p>
                <div className="row">
                  <button
                    className="secondary"
                    disabled={isBusy || status === "open"}
                    onClick={() => updateStatus(task, "open")}
                  >
                    Reopen
                  </button>
                  <button
                    disabled={isBusy || status === "completed"}
                    onClick={() => updateStatus(task, "completed")}
                  >
                    Complete
                  </button>
                </div>
              </article>
            );
          })}
          {!loadingTasks && tasks.length === 0 ? <p className="hint">No tasks available.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
