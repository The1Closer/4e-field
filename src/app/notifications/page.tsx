"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { crmApi } from "@/lib/crm-api";
import { formatDate, notificationText } from "@/lib/format";
import { useAuthSession } from "@/lib/use-auth-session";
import type { NotificationRecord } from "@/types/models";

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading, role, signOut, accessToken, error: authError } = useAuthSession();

  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async () => {
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

  useEffect(() => {
    if (!user || !accessToken) return;
    load();
  }, [accessToken, user]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/notifications");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!loading && user && !accessToken) {
      setLoadingItems(false);
      setError("Session token missing. Please sign out and sign in again.");
    }
  }, [accessToken, loading, user]);

  const markRead = async (id: string) => {
    if (!accessToken) return;
    setBusyId(id);
    setError(null);
    try {
      await crmApi.markNotificationRead(id, accessToken);
      await load();
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
      await load();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Failed to mark all read.");
    } finally {
      setMarkingAll(false);
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
          <h2 style={{ margin: 0 }}>Notifications</h2>
          <button className="secondary" disabled={markingAll} onClick={markAllRead}>
            {markingAll ? "Updating..." : "Mark all read"}
          </button>
        </div>
        <p className="hint">Read + write: CRM `/api/notifications`.</p>
        {error ? <p className="error">{error}</p> : null}
        {loadingItems ? <p className="hint">Loading notifications...</p> : null}
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
      </section>
    </AppShell>
  );
}
