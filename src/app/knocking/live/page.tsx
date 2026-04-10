"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { loadGoogleMaps } from "@/lib/google-maps";
import { getSessionElapsedSeconds, managerLike } from "@/lib/knocking";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { JsonRecord } from "@/types/models";

type LiveSessionRow = JsonRecord & {
  id: string;
  rep_id: string;
  rep_name?: string | null;
  status?: string | null;
  started_at?: string | null;
  latest_address?: string | null;
  latest_latitude?: number | null;
  latest_longitude?: number | null;
  last_heartbeat_at?: string | null;
  knocks?: number | null;
  talks?: number | null;
  inspections?: number | null;
  contingencies?: number | null;
};

type KnockEventSummaryRow = JsonRecord & {
  rep_id: string;
  knocks_delta?: number | null;
  created_at?: string | null;
};

type SessionHistoryRow = JsonRecord & {
  rep_id: string;
  rep_name?: string | null;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  paused_at?: string | null;
  total_paused_seconds?: number | null;
  session_seconds?: number | null;
};

type ProfileRow = JsonRecord & {
  id: string;
  full_name?: string | null;
};

type RepKnockSummary = {
  repId: string;
  repName: string;
  knocksToday: number;
  knocksWeek: number;
  lastKnockAt: string | null;
  sessionStatus: string | null;
  sessionAddress: string | null;
  sessionHeartbeat: string | null;
  sessionKnocks: number;
  sessionTalks: number;
  sessionInspections: number;
  sessionContingencies: number;
  knockSecondsToday: number;
  knockSecondsWeek: number;
};

type RepPerformanceApiRow = {
  repId: string;
  periodType: "weekly" | "monthly";
  periodStart: string;
  periodEnd: string;
  timezone: string;
  weekStartDow: number;
  metrics: {
    knocks: number;
    talks: number;
    inspections: number;
    contingencies: number;
    talkRate: number;
    inspectionRate: number;
    contingencyRate: number;
  };
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function statusLabel(value: string | null | undefined) {
  if (value === "paused") return "Paused";
  return "Active";
}

function getStartOfTodayLocal(now = new Date()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getStartOfWeekLocal(now = new Date()) {
  const date = getStartOfTodayLocal(now);
  const dayOfWeek = date.getDay();
  date.setDate(date.getDate() - dayOfWeek);
  return date;
}

function getSessionEffectiveEndMs(session: SessionHistoryRow, nowMs: number) {
  const status = String(session.status ?? "");
  if (status === "ended") {
    const endedAtMs = session.ended_at ? new Date(String(session.ended_at)).getTime() : Number.NaN;
    if (Number.isFinite(endedAtMs)) return endedAtMs;
  }

  if (status === "paused") {
    const pausedAtMs = session.paused_at ? new Date(String(session.paused_at)).getTime() : Number.NaN;
    if (Number.isFinite(pausedAtMs)) return pausedAtMs;
  }

  return nowMs;
}

function formatDurationHours(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const totalMinutes = Math.round(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export default function KnockingLivePage() {
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
  const [rows, setRows] = useState<LiveSessionRow[]>([]);
  const [events, setEvents] = useState<KnockEventSummaryRow[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryRow[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [liveError, setLiveError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<"weekly" | "monthly">("weekly");
  const [repPerformanceRows, setRepPerformanceRows] = useState<RepPerformanceApiRow[]>([]);
  const [loadingRepPerformance, setLoadingRepPerformance] = useState(false);
  const [repPerformanceError, setRepPerformanceError] = useState<string | null>(null);

  const supabase = getSupabaseBrowserClient();
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const timeoutSweepWarnedRef = useRef(false);

  async function runInactivityTimeoutSweep() {
    const { error: timeoutError } = await supabase.rpc("timeout_stale_knock_sessions", {
      inactivity_minutes: 30,
    });

    if (!timeoutError) return;

    const normalized = timeoutError.message.toLowerCase();
    const migrationMissing =
      (normalized.includes("function") && normalized.includes("does not exist")) ||
      normalized.includes("timeout_stale_knock_sessions");

    if (migrationMissing) {
      if (!timeoutSweepWarnedRef.current) {
        console.warn(
          "Knocking live: session timeout migration is not applied yet (timeout_stale_knock_sessions).",
        );
        timeoutSweepWarnedRef.current = true;
      }
      return;
    }

    console.warn("Knocking live: could not run session inactivity timeout sweep.", timeoutError);
  }

  const mappableRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          Number.isFinite(Number(row.latest_latitude)) && Number.isFinite(Number(row.latest_longitude)),
      ),
    [rows],
  );

  const error = useMemo(() => {
    const parts = [liveError, analyticsError].filter(Boolean);
    return parts.length > 0 ? parts.join(" | ") : null;
  }, [analyticsError, liveError]);

  const repKnockSummaries = useMemo(() => {
    const startOfTodayMs = getStartOfTodayLocal().getTime();
    const summaryByRep = new Map<string, RepKnockSummary>();

    const getOrCreate = (repId: string) => {
      const existing = summaryByRep.get(repId);
      if (existing) return existing;

      const created: RepKnockSummary = {
        repId,
        repName: profileNames[repId] || repId,
        knocksToday: 0,
        knocksWeek: 0,
        lastKnockAt: null,
        sessionStatus: null,
        sessionAddress: null,
        sessionHeartbeat: null,
        sessionKnocks: 0,
        sessionTalks: 0,
        sessionInspections: 0,
        sessionContingencies: 0,
        knockSecondsToday: 0,
        knockSecondsWeek: 0,
      };
      summaryByRep.set(repId, created);
      return created;
    };

    rows.forEach((row) => {
      const repId = String(row.rep_id ?? "");
      if (!repId) return;
      const summary = getOrCreate(repId);
      const sessionRepName = String(row.rep_name ?? "").trim();
      if (sessionRepName) {
        summary.repName = sessionRepName;
      }

      const candidateHeartbeatMs = row.last_heartbeat_at ? new Date(String(row.last_heartbeat_at)).getTime() : 0;
      const existingHeartbeatMs = summary.sessionHeartbeat
        ? new Date(summary.sessionHeartbeat).getTime()
        : -1;

      if (candidateHeartbeatMs >= existingHeartbeatMs) {
        summary.sessionStatus = String(row.status ?? "active");
        summary.sessionAddress = String(row.latest_address ?? "");
        summary.sessionHeartbeat = String(row.last_heartbeat_at ?? "");
        summary.sessionKnocks = toNumber(row.knocks);
        summary.sessionTalks = toNumber(row.talks);
        summary.sessionInspections = toNumber(row.inspections);
        summary.sessionContingencies = toNumber(row.contingencies);
      }
    });

    events.forEach((eventRow) => {
      const repId = String(eventRow.rep_id ?? "");
      if (!repId) return;

      const knocks = toNumber(eventRow.knocks_delta);
      if (knocks <= 0) return;

      const createdAt = typeof eventRow.created_at === "string" ? eventRow.created_at : null;
      const createdAtMs = createdAt ? new Date(createdAt).getTime() : Number.NaN;
      if (!Number.isFinite(createdAtMs)) return;

      const summary = getOrCreate(repId);
      summary.knocksWeek += knocks;
      if (createdAtMs >= startOfTodayMs) {
        summary.knocksToday += knocks;
      }
      if (!summary.lastKnockAt || createdAtMs > new Date(summary.lastKnockAt).getTime()) {
        summary.lastKnockAt = createdAt;
      }
    });

    const nowMs = Date.now();
    const startOfWeekMs = getStartOfWeekLocal().getTime();

    sessionHistory.forEach((session) => {
      const repId = String(session.rep_id ?? "");
      if (!repId) return;

      const startedAtMs = session.started_at ? new Date(String(session.started_at)).getTime() : Number.NaN;
      if (!Number.isFinite(startedAtMs)) return;

      const endedAtMs = getSessionEffectiveEndMs(session, nowMs);
      if (!Number.isFinite(endedAtMs)) return;

      const sessionEndMs = Math.max(startedAtMs, endedAtMs);
      const wallSeconds = Math.max(0, (sessionEndMs - startedAtMs) / 1000);
      if (wallSeconds <= 0) return;

      const status = String(session.status ?? "");
      const endedSessionSeconds = toNumber(session.session_seconds);
      const activeSeconds =
        status === "ended" && endedSessionSeconds > 0
          ? endedSessionSeconds
          : getSessionElapsedSeconds({
              startedAt: String(session.started_at),
              pausedAt: status === "paused" ? String(session.paused_at ?? "") : null,
              totalPausedSeconds: toNumber(session.total_paused_seconds),
              now: nowMs,
            });

      if (activeSeconds <= 0) return;

      const activeRatio = Math.min(1, activeSeconds / wallSeconds);
      const overlapWeekMs = Math.max(0, Math.min(sessionEndMs, nowMs) - Math.max(startedAtMs, startOfWeekMs));
      if (overlapWeekMs <= 0) return;

      const overlapTodayMs = Math.max(0, Math.min(sessionEndMs, nowMs) - Math.max(startedAtMs, startOfTodayMs));

      const summary = getOrCreate(repId);
      summary.knockSecondsWeek += (overlapWeekMs / 1000) * activeRatio;
      if (overlapTodayMs > 0) {
        summary.knockSecondsToday += (overlapTodayMs / 1000) * activeRatio;
      }
    });

    return Array.from(summaryByRep.values()).sort((a, b) => {
      if (b.knocksToday !== a.knocksToday) return b.knocksToday - a.knocksToday;
      if (b.knockSecondsToday !== a.knockSecondsToday) return b.knockSecondsToday - a.knockSecondsToday;
      if (b.knocksWeek !== a.knocksWeek) return b.knocksWeek - a.knocksWeek;
      if (b.knockSecondsWeek !== a.knockSecondsWeek) return b.knockSecondsWeek - a.knockSecondsWeek;
      return a.repName.localeCompare(b.repName);
    });
  }, [events, profileNames, rows, sessionHistory]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/knocking/live");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user || !managerLike(role)) return;
    let active = true;

    const loadProfiles = async () => {
      const { data, error: profilesError } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (!active) return;
      if (profilesError) {
        return;
      }

      const mapped = Object.fromEntries(
        ((data ?? []) as ProfileRow[]).map((profile) => [
          profile.id,
          String(profile.full_name ?? "").trim() || profile.id,
        ]),
      );
      setProfileNames(mapped);
    };

    void loadProfiles();

    return () => {
      active = false;
    };
  }, [role, supabase, user]);

  useEffect(() => {
    if (!user || !managerLike(role)) return;

    let active = true;
    let firstLoad = true;
    const loadLiveSessions = async () => {
      if (firstLoad) {
        setLoadingRows(true);
      }
      await runInactivityTimeoutSweep();

      const sessionsResult = await supabase
        .from("knock_sessions")
        .select("*")
        .in("status", ["active", "paused"])
        .order("last_heartbeat_at", { ascending: false });

      if (!active) return;

      if (sessionsResult.error) {
        setRows([]);
        setLiveError(sessionsResult.error.message);
      } else {
        setRows((sessionsResult.data ?? []) as LiveSessionRow[]);
        setLiveError(null);
      }

      if (firstLoad) {
        setLoadingRows(false);
        firstLoad = false;
      }
    };

    void loadLiveSessions();
    const intervalId = window.setInterval(() => {
      void loadLiveSessions();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [role, supabase, user]);

  useEffect(() => {
    if (!user || !managerLike(role)) return;
    let active = true;

    const loadRepPerformance = async () => {
      setLoadingRepPerformance(true);
      setRepPerformanceError(null);
      try {
        const response = await fetch(`/api/reports/rep-performance?period=${reportPeriod}`, {
          cache: "no-store",
          credentials: "include",
        });
        const payload = (await response.json()) as {
          error?: string;
          reports?: RepPerformanceApiRow[];
        };
        if (!response.ok) {
          throw new Error(payload.error || `Failed to load rep performance (${response.status})`);
        }
        if (!active) return;
        setRepPerformanceRows(Array.isArray(payload.reports) ? payload.reports : []);
      } catch (loadError) {
        if (!active) return;
        setRepPerformanceRows([]);
        setRepPerformanceError(
          loadError instanceof Error ? loadError.message : "Could not load rep performance reports.",
        );
      } finally {
        if (active) {
          setLoadingRepPerformance(false);
        }
      }
    };

    void loadRepPerformance();
    const intervalId = window.setInterval(() => {
      void loadRepPerformance();
    }, 120000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [reportPeriod, role, user]);

  useEffect(() => {
    if (!user || !managerLike(role)) return;
    let active = true;

    const loadAnalytics = async () => {
      const weekStartIso = getStartOfWeekLocal().toISOString();
      const nowIso = new Date().toISOString();
      const [eventsResult, sessionHistoryResult] = await Promise.all([
        supabase
          .from("knock_events")
          .select("rep_id,knocks_delta,created_at")
          .gte("created_at", weekStartIso)
          .order("created_at", { ascending: false })
          .range(0, 9999),
        supabase
          .from("knock_sessions")
          .select("rep_id,rep_name,status,started_at,ended_at,paused_at,total_paused_seconds,session_seconds")
          .lte("started_at", nowIso)
          .or(`ended_at.is.null,ended_at.gte.${weekStartIso}`)
          .order("started_at", { ascending: false })
          .range(0, 9999),
      ]);

      if (!active) return;

      const errors: string[] = [];
      if (eventsResult.error) {
        errors.push(eventsResult.error.message);
        setEvents([]);
      } else {
        setEvents((eventsResult.data ?? []) as KnockEventSummaryRow[]);
      }

      if (sessionHistoryResult.error) {
        errors.push(sessionHistoryResult.error.message);
        setSessionHistory([]);
      } else {
        setSessionHistory((sessionHistoryResult.data ?? []) as SessionHistoryRow[]);
      }

      setAnalyticsError(errors.length > 0 ? errors.join(" | ") : null);
    };

    void loadAnalytics();
    const intervalId = window.setInterval(() => {
      void loadAnalytics();
    }, 60000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [role, supabase, user]);

  useEffect(() => {
    if (!user || !managerLike(role)) return;
    if (!mapNodeRef.current) return;

    let active = true;

    const waitForMapNodeSize = async (node: HTMLDivElement) => {
      const deadline = Date.now() + 3000;
      while (active && Date.now() < deadline) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }
      return false;
    };

    const initMap = async () => {
      try {
        const maps = await loadGoogleMaps(googleKey);
        if (!active || !mapNodeRef.current) return;

        const hasSize = await waitForMapNodeSize(mapNodeRef.current);
        if (!active || !mapNodeRef.current) return;
        if (!hasSize) {
          throw new Error("Map container has zero size. Refresh and try again.");
        }

        const map = new maps.Map(mapNodeRef.current, {
          center: { lat: 39.8283, lng: -98.5795 },
          zoom: 4,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });

        mapRef.current = map;
        window.requestAnimationFrame(() => {
          maps.event.trigger(map, "resize");
        });
        setMapReady(true);
      } catch (mapError) {
        if (active) {
          setMapError(mapError instanceof Error ? mapError.message : "Could not load map.");
        }
      }
    };

    void initMap();

    return () => {
      active = false;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.clear();
    };
  }, [googleKey, role, user]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const maps = (window as Window & { google?: { maps?: any } }).google?.maps;
    if (!maps) return;

    const inRows = new Set(rows.map((row) => row.id));
    markersRef.current.forEach((marker, id) => {
      if (!inRows.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });

    mappableRows.forEach((row) => {
      const position = {
        lat: Number(row.latest_latitude),
        lng: Number(row.latest_longitude),
      };

      const label = String(row.rep_name ?? row.rep_id).slice(0, 2).toUpperCase();
      const title = `${String(row.rep_name ?? row.rep_id)} | ${statusLabel(row.status)}`;

      const existing = markersRef.current.get(row.id);
      if (existing) {
        existing.setPosition(position);
        existing.setTitle(title);
      } else {
        const marker = new maps.Marker({
          map: mapRef.current,
          position,
          title,
          label,
        });

        const infoHtml = `
          <div style="font-family: system-ui; min-width: 210px; color: var(--ink); background: var(--panel); padding: 4px 6px; border-radius: 8px;">
            <strong>${String(row.rep_name ?? row.rep_id)}</strong><br/>
            <span>${statusLabel(row.status)}</span><br/>
            <span>${String(row.latest_address ?? "No address")}</span><br/>
            <span>K ${toNumber(row.knocks)} | T ${toNumber(row.talks)} | I ${toNumber(
              row.inspections,
            )} | C ${toNumber(row.contingencies)}</span><br/>
            <span>Heartbeat: ${formatDateTime(String(row.last_heartbeat_at ?? ""))}</span>
          </div>
        `;
        const info = new maps.InfoWindow({ content: infoHtml });
        marker.addListener("click", () => info.open({ map: mapRef.current, anchor: marker }));
        markersRef.current.set(row.id, marker);
      }
    });

    if (mappableRows.length > 0) {
      const bounds = new maps.LatLngBounds();
      mappableRows.forEach((row) => {
        bounds.extend({ lat: Number(row.latest_latitude), lng: Number(row.latest_longitude) });
      });
      mapRef.current.fitBounds(bounds, 64);
    }
  }, [mapReady, mappableRows, rows]);

  if (loading) return <main className="layout">Loading session...</main>;
  if (!user) return <main className="layout">Redirecting to sign in...</main>;

  if (!managerLike(role)) {
    return (
      <AppShell
        role={role}
        profileName={fullName}
        profileImageUrl={profileImageUrl}
        onSignOut={signOut}
        debug={{ userId: user.id, role, accessToken, authError }}
      >
        <section className="panel">
          <h2 style={{ margin: 0 }}>Management</h2>
          <p className="error">Manager role required.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      role={role}
      profileName={fullName}
      profileImageUrl={profileImageUrl}
      onSignOut={signOut}
      debug={{ userId: user.id, role, accessToken, authError }}
    >
      <section className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Management</h2>
          <p className="hint">{rows.length} active/paused session(s)</p>
        </div>
        <p className="hint">
          Live rep location refreshes every 10s. Daily/weekly totals refresh every 60s.
        </p>
        {mapError ? <p className="error">{mapError}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {loadingRows ? <p className="hint">Loading live sessions...</p> : null}

        <div ref={mapNodeRef} className="live-map" />

        <details className="job-card" style={{ marginTop: 12 }}>
          <summary className="row" style={{ cursor: "pointer" }}>
            <strong>Rep Knock Totals</strong>
            <span className="hint">{repKnockSummaries.length} rep(s)</span>
          </summary>
          <p className="hint" style={{ marginTop: 10 }}>
            Today and this week (local time).
          </p>
          <div className="grid" style={{ marginTop: 10 }}>
            {repKnockSummaries.map((rep) => (
              <details key={rep.repId} className="job-card">
                <summary className="row" style={{ cursor: "pointer" }}>
                  <strong>{rep.repName}</strong>
                  <span className="hint">
                    Today {rep.knocksToday} knocks, {formatDurationHours(rep.knockSecondsToday)} | Week{" "}
                    {rep.knocksWeek} knocks, {formatDurationHours(rep.knockSecondsWeek)}
                  </span>
                </summary>
                <div className="stack" style={{ marginTop: 10 }}>
                  <p className="hint">Last knock: {formatDateTime(rep.lastKnockAt)}</p>
                  <p className="hint">
                    Knock Time: Today {formatDurationHours(rep.knockSecondsToday)} | Week{" "}
                    {formatDurationHours(rep.knockSecondsWeek)}
                  </p>
                  <p className="hint">Status: {rep.sessionStatus ? statusLabel(rep.sessionStatus) : "No active session"}</p>
                  {rep.sessionStatus ? (
                    <>
                      <p className="hint">Current door: {rep.sessionAddress || "Unknown"}</p>
                      <p className="hint">Heartbeat: {formatDateTime(rep.sessionHeartbeat)}</p>
                      <p className="hint">
                        Session: K {rep.sessionKnocks} | T {rep.sessionTalks} | I {rep.sessionInspections} | C{" "}
                        {rep.sessionContingencies}
                      </p>
                    </>
                  ) : null}
                </div>
              </details>
            ))}
            {!loadingRows && repKnockSummaries.length === 0 ? (
              <p className="hint">No knock totals available yet for this week.</p>
            ) : null}
          </div>
        </details>

        <details className="job-card" style={{ marginTop: 12 }}>
          <summary className="row" style={{ cursor: "pointer" }}>
            <strong>Rep Performance Reports</strong>
            <span className="hint">{repPerformanceRows.length} row(s)</span>
          </summary>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button
              type="button"
              className={reportPeriod === "weekly" ? "" : "secondary"}
              onClick={() => setReportPeriod("weekly")}
            >
              Weekly
            </button>
            <button
              type="button"
              className={reportPeriod === "monthly" ? "" : "secondary"}
              onClick={() => setReportPeriod("monthly")}
            >
              Monthly
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Sunday week start, rep-local timezone.
          </p>
          {loadingRepPerformance ? <p className="hint">Loading report snapshot...</p> : null}
          {repPerformanceError ? <p className="error">{repPerformanceError}</p> : null}
          <div className="grid" style={{ marginTop: 8 }}>
            {repPerformanceRows.map((report) => {
              const repName = profileNames[report.repId] || report.repId;
              return (
                <article key={`${report.repId}-${report.periodStart}-${report.periodEnd}`} className="job-card">
                  <div className="row">
                    <strong>{repName}</strong>
                    <span className="hint">
                      {report.periodStart} to {report.periodEnd}
                    </span>
                  </div>
                  <p className="hint">
                    K {toNumber(report.metrics.knocks)} | T {toNumber(report.metrics.talks)} | I{" "}
                    {toNumber(report.metrics.inspections)} | C {toNumber(report.metrics.contingencies)}
                  </p>
                  <p className="hint">
                    Talk {(toNumber(report.metrics.talkRate) * 100).toFixed(1)}% | Inspection{" "}
                    {(toNumber(report.metrics.inspectionRate) * 100).toFixed(1)}% | Contingency{" "}
                    {(toNumber(report.metrics.contingencyRate) * 100).toFixed(1)}%
                  </p>
                </article>
              );
            })}
            {!loadingRepPerformance && repPerformanceRows.length === 0 ? (
              <p className="hint">No report snapshots available for this period.</p>
            ) : null}
          </div>
        </details>

        <div className="grid" style={{ marginTop: 12 }}>
          {rows.map((row) => (
            <article key={String(row.id)} className="job-card">
              <div className="row">
                <strong>{String(row.rep_name ?? row.rep_id)}</strong>
                <span className="pill">{statusLabel(row.status)}</span>
              </div>
              <p className="hint">Address: {String(row.latest_address ?? "Unknown")}</p>
              <p className="hint">
                Lat/Lng: {toNumber(row.latest_latitude).toFixed(5)}, {toNumber(row.latest_longitude).toFixed(5)}
              </p>
              <p className="hint">Heartbeat: {formatDateTime(String(row.last_heartbeat_at ?? ""))}</p>
              <p className="hint">
                K {toNumber(row.knocks)} | T {toNumber(row.talks)} | I {toNumber(row.inspections)} | C{" "}
                {toNumber(row.contingencies)}
              </p>
            </article>
          ))}
          {!loadingRows && rows.length === 0 ? <p className="hint">No active knocking sessions.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
