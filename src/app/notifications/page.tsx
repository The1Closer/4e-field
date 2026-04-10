"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { crmApi } from "@/lib/crm-api";
import { formatDate, notificationText, taskLabel } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { JsonRecord, NotificationRecord, TaskRecord } from "@/types/models";

type FieldNotificationRow = JsonRecord & {
  id: string;
  rep_id?: string | null;
  title?: string | null;
  message?: string | null;
  category?: string | null;
  payload?: Record<string, unknown> | null;
  is_read?: boolean | null;
  created_at?: string | null;
};

export default function NotificationsPage() {
  const router = useRouter();
  const {
    user,
    loading,
    role,
    signOut,
    accessToken,
    error: authError,
    profileImageUrl,
    fullName,
  } = useAuthSession();
  const supabase = getSupabaseBrowserClient();

  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [fieldItems, setFieldItems] = useState<FieldNotificationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingFieldItems, setLoadingFieldItems] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = async () => {
    if (!accessToken) return;

    setLoadingItems(true);
    setError(null);

    try {
      const payload = await crmApi.listNotifications(accessToken);
      setItems((payload.notifications ?? []) as NotificationRecord[]);
    } catch (notificationError) {
      setItems([]);
      const message =
        notificationError instanceof Error
          ? notificationError.message
          : "Failed to load notifications.";
      setError(
        `Notifications read failed: ${message}. If this includes "Failed to fetch", refresh and open /api/crm/api/notifications once.`,
      );
    } finally {
      setLoadingItems(false);
    }
  };

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

  const loadFieldNotifications = async () => {
    if (!user) return;
    setLoadingFieldItems(true);
    try {
      const { data, error: fieldError } = await supabase
        .from("notifications")
        .select("id,rep_id,title,message,category,payload,is_read,created_at")
        .or(`rep_id.eq.${user.id},rep_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (fieldError) {
        const lower = fieldError.message.toLowerCase();
        if (lower.includes("does not exist") || lower.includes("relation")) {
          setFieldItems([]);
          return;
        }
        throw fieldError;
      }

      setFieldItems((data ?? []) as FieldNotificationRow[]);
    } catch (fieldLoadError) {
      const message =
        fieldLoadError instanceof Error ? fieldLoadError.message : "Failed to load field notifications.";
      setError((previous) => (previous ? `${previous} | ${message}` : message));
      setFieldItems([]);
    } finally {
      setLoadingFieldItems(false);
    }
  };

  useEffect(() => {
    if (!user || !accessToken) return;
    void Promise.all([loadNotifications(), loadTasks(), loadFieldNotifications()]);
  }, [accessToken, user]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/notifications");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!loading && user && !accessToken) {
      setLoadingItems(false);
      setLoadingTasks(false);
      setLoadingFieldItems(false);
      setError("Session token missing. Please sign out and sign in again.");
    }
  }, [accessToken, loading, user]);

  const markRead = async (id: string) => {
    if (!accessToken) return;
    setBusyId(id);
    setError(null);
    try {
      await crmApi.markNotificationRead(id, accessToken);
      await loadNotifications();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Failed to mark notification read.");
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    if (!accessToken) return;
    setMarkingAll(true);
    setError(null);
    try {
      await crmApi.markAllNotificationsRead(accessToken);
      await loadNotifications();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Failed to mark all read.");
    } finally {
      setMarkingAll(false);
    }
  };

  const updateTaskStatus = async (task: TaskRecord, status: "open" | "completed") => {
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
      profileName={fullName}
      profileImageUrl={profileImageUrl}
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
          <h2 style={{ margin: 0 }}>Activity</h2>
          <button className="secondary" disabled={markingAll} onClick={markAllRead}>
            {markingAll ? "Updating..." : "Mark all read"}
          </button>
        </div>
        <p className="hint">Read + write: CRM `/api/notifications` and `/api/tasks`.</p>
        {error ? <p className="error">{error}</p> : null}
        {loadingItems ? <p className="hint">Loading notifications...</p> : null}
        {loadingTasks ? <p className="hint">Loading tasks...</p> : null}

        <div className="row" style={{ marginTop: 10 }}>
          <h3 style={{ margin: 0 }}>Notifications</h3>
          <p className="hint">{items.length} loaded</p>
        </div>
        <div className="grid">
          {items.map((item) => {
            const read = Boolean(item.is_read || item.read_at);
            const isBusy = busyId === item.id;

            return (
              <article key={item.id} className="job-card">
                <div className="row">
                  <strong>{notificationText(item)}</strong>
                  <StatusPill value={read ? "read" : "unread"} />
                </div>
                <p className="hint">{formatDate(item.created_at)}</p>
                <button
                  className="secondary"
                  disabled={read || isBusy}
                  onClick={() => markRead(item.id)}
                >
                  {isBusy ? "Updating..." : "Mark read"}
                </button>
              </article>
            );
          })}
          {!loadingItems && items.length === 0 ? (
            <p className="hint">No notifications available.</p>
          ) : null}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <h3 style={{ margin: 0 }}>Field Reports + Sync</h3>
          <p className="hint">{fieldItems.length} loaded</p>
        </div>
        {loadingFieldItems ? <p className="hint">Loading field notifications...</p> : null}
        <div className="grid">
          {fieldItems.map((item) => (
            <article key={item.id} className="job-card">
              <div className="row">
                <strong>{item.title || item.message || "Field Notification"}</strong>
                <StatusPill value={item.is_read ? "read" : "unread"} />
              </div>
              <p className="hint">
                {item.category ? `Category: ${item.category}` : "Category: uncategorized"}
              </p>
              <p className="hint">{formatDate(item.created_at ?? undefined)}</p>
              {item.payload ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    fontSize: "0.75rem",
                    margin: 0,
                  }}
                >
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
              ) : null}
            </article>
          ))}
          {!loadingFieldItems && fieldItems.length === 0 ? (
            <p className="hint">No field report/sync notifications yet.</p>
          ) : null}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <h3 style={{ margin: 0 }}>Tasks</h3>
          <p className="hint">{tasks.length} loaded</p>
        </div>
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
                    onClick={() => updateTaskStatus(task, "open")}
                  >
                    Reopen
                  </button>
                  <button
                    disabled={isBusy || status === "completed"}
                    onClick={() => updateTaskStatus(task, "completed")}
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
