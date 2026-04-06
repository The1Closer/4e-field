"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { crmApi } from "@/lib/crm-api";
import {
  getEventDelta,
  getSessionElapsedSeconds,
  getTodayLocalDate,
  type KnockAction,
  type KnockOutcome,
  type NightlyDelta,
  type SessionStatus,
} from "@/lib/knocking";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { JsonRecord } from "@/types/models";

type KnockSessionRow = JsonRecord & {
  id: string;
  rep_id: string;
  status: SessionStatus;
  started_at: string;
  paused_at?: string | null;
  ended_at?: string | null;
  total_paused_seconds?: number | null;
  latest_latitude?: number | null;
  latest_longitude?: number | null;
  latest_address?: string | null;
  knocks?: number | null;
  talks?: number | null;
  inspections?: number | null;
  contingencies?: number | null;
};

type HomeownerIntake = {
  homeownerName: string;
  phone: string;
  email: string;
  address: string;
};

type SessionStep = "door" | "outcome" | "homeowner" | "follow_up" | "inspection";

const DEFAULT_INTAKE: HomeownerIntake = {
  homeownerName: "",
  phone: "",
  email: "",
  address: "",
};

const DEFAULT_CHECKLIST = {
  roofAge: "",
  visibleDamage: "",
  insuranceCarrier: "",
  notes: "",
  contingent: false,
};

function toNum(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toIsoFromLocalInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function parseError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function mergeNightlyDelta(base: NightlyDelta, delta: NightlyDelta): NightlyDelta {
  return {
    knocks: base.knocks + delta.knocks,
    talks: base.talks + delta.talks,
    inspections: base.inspections + delta.inspections,
    contingencies: base.contingencies + delta.contingencies,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

type KnockStageTarget = "lead" | "contingency";

const KNOCK_STAGE_ID_BY_TARGET: Record<KnockStageTarget, number> = {
  // Locked to your CRM stage table:
  // 1 = Lead, 2 = Contingency
  lead: 1,
  contingency: 2,
};

function resolveStageIdForTarget(target: KnockStageTarget) {
  return KNOCK_STAGE_ID_BY_TARGET[target];
}

async function reverseGeocode(lat: number, lng: number, apiKey: string) {
  if (!apiKey.trim()) return null;
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
      `${lat},${lng}`,
    )}&key=${encodeURIComponent(apiKey)}`,
  );
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{ formatted_address?: string }>;
  };
  if (payload.status !== "OK") return null;
  const address = payload.results?.[0]?.formatted_address;
  return typeof address === "string" && address.trim().length > 0 ? address : null;
}

export default function KnockingPage() {
  const router = useRouter();
  const {
    user,
    loading,
    role,
    signOut,
    accessToken,
    error: authError,
    fullName,
    includeInNightlyNumbers,
  } = useAuthSession();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<KnockSessionRow | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [todayTotals, setTodayTotals] = useState<NightlyDelta>({
    knocks: 0,
    talks: 0,
    inspections: 0,
    contingencies: 0,
  });

  const [step, setStep] = useState<SessionStep>("door");
  const [eventAction, setEventAction] = useState<KnockAction>("knock");
  const [eventOutcome, setEventOutcome] = useState<KnockOutcome>("no_answer");

  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [currentAddress, setCurrentAddress] = useState("");
  const [doorAddress, setDoorAddress] = useState("");

  const [homeownerIntake, setHomeownerIntake] = useState<HomeownerIntake>(DEFAULT_INTAKE);
  const [followUpAt, setFollowUpAt] = useState("");
  const [inspectionChecklist, setInspectionChecklist] = useState(DEFAULT_CHECKLIST);
  const [inspectionPhotos, setInspectionPhotos] = useState<File[]>([]);

  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const currentAddressRef = useRef("");
  const addressTouchedRef = useRef(false);

  const geocodeApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const canLog = Boolean(session && session.status === "active" && accessToken);
  const sessionStatusLabel = useMemo(() => {
    if (!session) return "NOT STARTED";
    return session.status.toUpperCase();
  }, [session]);

  useEffect(() => {
    currentAddressRef.current = currentAddress;
  }, [currentAddress]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/knocking");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadState = async () => {
      setError(null);

      const today = getTodayLocalDate();
      const [sessionResult, statsResult] = await Promise.all([
        supabase
          .from("knock_sessions")
          .select("*")
          .eq("rep_id", user.id)
          .in("status", ["active", "paused"])
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("rep_daily_stats")
          .select("knocks,talks,inspections,contingencies")
          .eq("rep_id", user.id)
          .eq("report_date", today)
          .maybeSingle(),
      ]);

      if (!active) return;

      if (sessionResult.error) {
        setError(sessionResult.error.message);
      } else {
        const loaded = (sessionResult.data as KnockSessionRow | null) ?? null;
        setSession(loaded);
        if (loaded?.latest_address && loaded.latest_address.trim()) {
          setCurrentAddress(loaded.latest_address);
          setDoorAddress(loaded.latest_address);
        }
      }

      if (statsResult.error) {
        setError(statsResult.error.message);
      } else {
        setTodayTotals({
          knocks: toNum(statsResult.data?.knocks),
          talks: toNum(statsResult.data?.talks),
          inspections: toNum(statsResult.data?.inspections),
          contingencies: toNum(statsResult.data?.contingencies),
        });
      }
    };

    void loadState();
    return () => {
      active = false;
    };
  }, [supabase, user]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      setSessionSeconds(
        getSessionElapsedSeconds({
          startedAt: String(session.started_at),
          pausedAt:
            typeof session.paused_at === "string" && session.paused_at.length > 0
              ? session.paused_at
              : null,
          totalPausedSeconds: toNum(session.total_paused_seconds),
        }),
      );
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [session]);

  useEffect(() => {
    if (!session || session.status !== "active") {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("Location tracking is not supported in this browser.");
      return;
    }

    let cancelled = false;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (cancelled) return;

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCurrentLat(lat);
        setCurrentLng(lng);
        setLocationError(null);

        let resolvedAddress: string | null = null;
        try {
          resolvedAddress = await reverseGeocode(lat, lng, geocodeApiKey);
        } catch {
          resolvedAddress = null;
        }

        if (resolvedAddress) {
          setCurrentAddress(resolvedAddress);
          if (!addressTouchedRef.current || !doorAddress.trim()) {
            setDoorAddress(resolvedAddress);
          }
        }

        const heartbeatAddress = resolvedAddress ?? currentAddressRef.current ?? "";
        await Promise.all([
          supabase
            .from("knock_sessions")
            .update({
              latest_latitude: lat,
              latest_longitude: lng,
              latest_address: heartbeatAddress || null,
              last_heartbeat_at: new Date().toISOString(),
            })
            .eq("id", session.id),
          supabase.from("knock_location_points").insert({
            session_id: session.id,
            rep_id: session.rep_id,
            latitude: lat,
            longitude: lng,
            address: heartbeatAddress || null,
            accuracy_meters: Number(position.coords.accuracy ?? 0),
            recorded_at: new Date().toISOString(),
          }),
        ]);
      },
      () => {
        if (!cancelled) {
          setLocationError("Allow location access to run knocking sessions.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );

    watchIdRef.current = watchId;
    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [doorAddress, geocodeApiKey, session, supabase]);

  async function fillAddressFromLocation() {
    if (!navigator.geolocation) {
      setLocationError("Location tracking is not supported on this browser.");
      return;
    }

    setLocating(true);
    setLocationError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setCurrentLat(lat);
      setCurrentLng(lng);

      const resolvedAddress = await reverseGeocode(lat, lng, geocodeApiKey);
      const nextAddress = resolvedAddress ?? doorAddress;
      if (nextAddress) {
        setCurrentAddress(nextAddress);
        setDoorAddress(nextAddress);
        addressTouchedRef.current = false;
      }
    } catch {
      setLocationError("Could not read your location right now.");
    } finally {
      setLocating(false);
    }
  }

  async function applyNightlyDelta(delta: NightlyDelta) {
    if (!user) return;
    const today = getTodayLocalDate();
    const { data: existing, error: readError } = await supabase
      .from("rep_daily_stats")
      .select("knocks,talks,inspections,contingencies")
      .eq("rep_id", user.id)
      .eq("report_date", today)
      .maybeSingle();

    if (readError) {
      throw new Error(readError.message);
    }

    const nextPayload = {
      rep_id: user.id,
      report_date: today,
      knocks: toNum(existing?.knocks) + delta.knocks,
      talks: toNum(existing?.talks) + delta.talks,
      inspections: toNum(existing?.inspections) + delta.inspections,
      contingencies: toNum(existing?.contingencies) + delta.contingencies,
    };

    const { error: writeError } = await supabase.from("rep_daily_stats").upsert(nextPayload, {
      onConflict: "rep_id,report_date",
    });

    if (writeError) {
      throw new Error(writeError.message);
    }

    setTodayTotals({
      knocks: nextPayload.knocks,
      talks: nextPayload.talks,
      inspections: nextPayload.inspections,
      contingencies: nextPayload.contingencies,
    });
  }

  async function startSession() {
    if (!user) return;
    setSaving(true);
    setMessage("");
    setError(null);

    try {
      const nowIso = new Date().toISOString();
      const payload = {
        rep_id: user.id,
        rep_name: fullName ?? user.email ?? "Rep",
        status: "active",
        started_at: nowIso,
        paused_at: null,
        ended_at: null,
        total_paused_seconds: 0,
        latest_latitude: currentLat,
        latest_longitude: currentLng,
        latest_address: doorAddress || currentAddress || null,
        last_heartbeat_at: nowIso,
        knocks: 0,
        talks: 0,
        inspections: 0,
        contingencies: 0,
      };

      const { data, error: insertError } = await supabase
        .from("knock_sessions")
        .insert(payload)
        .select("*")
        .single();

      if (insertError || !data) {
        throw new Error(insertError?.message || "Failed to start session.");
      }

      setSession(data as KnockSessionRow);
      setStep("door");
      setMessage("Knocking session started.");
    } catch (e) {
      setError(parseError(e, "Failed to start knocking session."));
    } finally {
      setSaving(false);
    }
  }

  async function pauseSession() {
    if (!session) return;
    setSaving(true);
    setError(null);

    try {
      const nowIso = new Date().toISOString();
      const { data, error: updateError } = await supabase
        .from("knock_sessions")
        .update({ status: "paused", paused_at: nowIso })
        .eq("id", session.id)
        .select("*")
        .single();

      if (updateError || !data) {
        throw new Error(updateError?.message || "Failed to pause session.");
      }

      setSession(data as KnockSessionRow);
      setMessage("Session paused.");
    } catch (e) {
      setError(parseError(e, "Failed to pause session."));
    } finally {
      setSaving(false);
    }
  }

  async function resumeSession() {
    if (!session) return;
    setSaving(true);
    setError(null);

    try {
      const now = Date.now();
      const pausedAtMs = session.paused_at ? new Date(String(session.paused_at)).getTime() : now;
      const pausedSeconds = Math.max(0, Math.floor((now - pausedAtMs) / 1000));

      const { data, error: updateError } = await supabase
        .from("knock_sessions")
        .update({
          status: "active",
          paused_at: null,
          total_paused_seconds: toNum(session.total_paused_seconds) + pausedSeconds,
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .select("*")
        .single();

      if (updateError || !data) {
        throw new Error(updateError?.message || "Failed to resume session.");
      }

      setSession(data as KnockSessionRow);
      setMessage("Session resumed.");
    } catch (e) {
      setError(parseError(e, "Failed to resume session."));
    } finally {
      setSaving(false);
    }
  }

  async function endSession() {
    if (!session) return;
    setSaving(true);
    setError(null);

    try {
      const endedAt = new Date().toISOString();
      const elapsed = getSessionElapsedSeconds({
        startedAt: session.started_at,
        pausedAt: session.paused_at ? String(session.paused_at) : null,
        totalPausedSeconds: toNum(session.total_paused_seconds),
      });

      const { error: updateError } = await supabase
        .from("knock_sessions")
        .update({ status: "ended", ended_at: endedAt, session_seconds: elapsed })
        .eq("id", session.id);

      if (updateError) throw new Error(updateError.message);

      setSession(null);
      setStep("door");
      setSessionSeconds(0);
      setMessage("Session ended.");
    } catch (e) {
      setError(parseError(e, "Failed to end session."));
    } finally {
      setSaving(false);
    }
  }

  async function logEvent(params: {
    action: KnockAction;
    outcome?: KnockOutcome | null;
    homeownerRequired?: boolean;
    contingentOverride?: boolean;
  }) {
    if (!session || !user || !accessToken) return;
    if (session.status !== "active") {
      setError("Session must be active to log events.");
      return;
    }

    if (params.homeownerRequired && !homeownerIntake.homeownerName.trim()) {
      setError("Homeowner name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage("");

    const postSaveWarnings: string[] = [];

    try {
      const eventAddress = homeownerIntake.address.trim() || doorAddress.trim() || currentAddress;
      const isInspection = params.action === "knock" && params.outcome === "inspection";
      const isSoftSet = params.action === "knock" && params.outcome === "soft_set";
      const isContingent = isInspection
        ? params.contingentOverride ?? inspectionChecklist.contingent
        : false;
      const inspectionSnapshot = isInspection ? { ...inspectionChecklist, contingent: isContingent } : null;
      const shouldMoveToContingency = isInspection && isContingent;
      const stageTarget: KnockStageTarget | null = shouldMoveToContingency
        ? "contingency"
        : isInspection || isSoftSet
          ? "lead"
          : null;

      let linkedJobId: string | null = null;
      let linkedTaskId: string | null = null;

      if (isSoftSet || isInspection) {
        const jobResult = await crmApi.createJob(
          {
            homeownerName: homeownerIntake.homeownerName.trim(),
            phone: homeownerIntake.phone.trim(),
            email: homeownerIntake.email.trim(),
            address: eventAddress,
          },
          accessToken,
        );

        if (!jobResult.jobId) {
          throw new Error(jobResult.error || "CRM did not return a job id.");
        }
        linkedJobId = jobResult.jobId;
      }

      if (linkedJobId && stageTarget) {
        try {
          const stageId = resolveStageIdForTarget(stageTarget);
          await crmApi.updateJobStage(linkedJobId, stageId, accessToken);
        } catch (stageError) {
          postSaveWarnings.push(
            `Job stage update failed (${stageTarget}): ${parseError(
              stageError,
              "Unknown stage update error.",
            )}`,
          );
        }
      }

      if (isSoftSet && linkedJobId) {
        const followUpIso = toIsoFromLocalInput(followUpAt);
        if (!followUpIso) {
          throw new Error("Soft Set requires a follow-up date/time.");
        }

        const taskResult = await crmApi.createTask(
          {
            jobId: linkedJobId,
            title: `Soft Set Follow-up: ${homeownerIntake.homeownerName.trim()}`,
            description: "Auto-created from field knocking session.",
            kind: "appointment",
            scheduledFor: followUpIso,
            dueAt: followUpIso,
            appointmentAddress: eventAddress,
          },
          accessToken,
        );

        linkedTaskId = typeof taskResult.taskId === "string" ? taskResult.taskId : null;
      }

      if (isInspection && linkedJobId) {
        for (const file of inspectionPhotos) {
          const init = await crmApi.initJobUpload(linkedJobId, accessToken, {
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            size: file.size,
          });

          const upload = init.upload;
          if (!upload?.filePath || !upload.token) {
            throw new Error("Could not initialize inspection photo upload.");
          }

          const uploadRes = await supabase.storage
            .from("job-files")
            .uploadToSignedUrl(upload.filePath, upload.token, file, {
              contentType: file.type || "application/octet-stream",
              upsert: false,
            });

          if (uploadRes.error) {
            throw new Error(uploadRes.error.message);
          }

          await crmApi.finalizeJobUpload(linkedJobId, accessToken, {
            fileName: file.name,
            filePath: upload.filePath,
            contentType: file.type || "application/octet-stream",
          });
        }

        const summary =
          `Inspection Intake\n` +
          `Homeowner: ${homeownerIntake.homeownerName}\n` +
          `Phone: ${homeownerIntake.phone || "-"}\n` +
          `Email: ${homeownerIntake.email || "-"}\n` +
          `Address: ${eventAddress || "-"}\n` +
          `Roof Age: ${inspectionSnapshot?.roofAge || "-"}\n` +
          `Visible Damage: ${inspectionSnapshot?.visibleDamage || "-"}\n` +
          `Carrier: ${inspectionSnapshot?.insuranceCarrier || "-"}\n` +
          `Contingent: ${isContingent ? "Yes" : "No"}\n` +
          `Notes: ${inspectionSnapshot?.notes || "-"}`;

        await crmApi.createJobNote(linkedJobId, accessToken, summary);
      }

      const delta = getEventDelta({
        action: params.action,
        outcome: params.action === "knock" ? params.outcome ?? "no_answer" : null,
        contingent: isContingent,
      });

      const eventPayload: JsonRecord = {
        session_id: session.id,
        rep_id: user.id,
        action: params.action,
        outcome: params.action === "knock" ? params.outcome ?? null : null,
        address: eventAddress || null,
        latitude: currentLat,
        longitude: currentLng,
        knocks_delta: delta.knocks,
        talks_delta: delta.talks,
        inspections_delta: delta.inspections,
        contingencies_delta: delta.contingencies,
        homeowner_name: homeownerIntake.homeownerName.trim() || null,
        homeowner_phone: homeownerIntake.phone.trim() || null,
        homeowner_email: homeownerIntake.email.trim() || null,
        linked_job_id: linkedJobId,
        linked_task_id: linkedTaskId,
        is_locked: Boolean(linkedJobId || linkedTaskId),
        metadata: isInspection
          ? {
              checklist: inspectionSnapshot,
              photo_count: inspectionPhotos.length,
            }
          : {},
      };

      const [{ error: insertError }, { data: updatedSession, error: sessionError }] = await Promise.all([
        supabase.from("knock_events").insert(eventPayload),
        supabase
          .from("knock_sessions")
          .update({
            latest_address: eventAddress || null,
            latest_latitude: currentLat,
            latest_longitude: currentLng,
            last_heartbeat_at: new Date().toISOString(),
            knocks: toNum(session.knocks) + delta.knocks,
            talks: toNum(session.talks) + delta.talks,
            inspections: toNum(session.inspections) + delta.inspections,
            contingencies: toNum(session.contingencies) + delta.contingencies,
          })
          .eq("id", session.id)
          .select("*")
          .single(),
      ]);

      if (insertError) throw new Error(insertError.message);
      if (sessionError) throw new Error(sessionError.message);
      if (updatedSession) {
        setSession(updatedSession as KnockSessionRow);
      }

      if (includeInNightlyNumbers) {
        setTodayTotals((previous) => mergeNightlyDelta(previous, delta));
        try {
          await withTimeout(applyNightlyDelta(delta), 7000, "Nightly numbers sync timed out.");
        } catch (nightlyError) {
          postSaveWarnings.push(
            `Nightly numbers sync delayed: ${parseError(nightlyError, "Unknown nightly sync error.")}`,
          );
        }
      }

      setHomeownerIntake({ ...DEFAULT_INTAKE, address: eventAddress || "" });
      setInspectionChecklist(DEFAULT_CHECKLIST);
      setInspectionPhotos([]);
      setFollowUpAt("");
      setStep("door");
      setEventAction("knock");
      setEventOutcome("no_answer");

      const baseMessage =
        includeInNightlyNumbers
          ? "Event logged and nightly numbers synced."
          : "Event logged. Nightly sync skipped (not on nightly roster).";

      setMessage(
        postSaveWarnings.length > 0
          ? `${baseMessage} Warning: ${postSaveWarnings.join(" ")}`
          : baseMessage,
      );
    } catch (e) {
      setError(parseError(e, "Failed to log door event."));
    } finally {
      setSaving(false);
    }
  }

  function startKnockFlow() {
    setError(null);
    setEventAction("knock");
    setStep("outcome");
  }

  async function onOutcomeSelect(outcome: KnockOutcome) {
    setEventOutcome(outcome);

    if (outcome === "no" || outcome === "no_answer") {
      await logEvent({ action: "knock", outcome });
      return;
    }

    setStep("homeowner");
  }

  async function onDoorHanger() {
    setEventAction("door_hanger");
    setEventOutcome("no_answer");
    await logEvent({ action: "door_hanger", outcome: null });
  }

  function onContinueHomeowner(event: FormEvent) {
    event.preventDefault();
    if (!homeownerIntake.homeownerName.trim()) {
      setError("Homeowner name is required.");
      return;
    }

    if (eventOutcome === "soft_set") {
      setStep("follow_up");
      return;
    }

    setStep("inspection");
  }

  if (loading) {
    return <main className="layout">Loading session...</main>;
  }

  if (!user) {
    return <main className="layout">Redirecting to sign in...</main>;
  }

  if (!session) {
    return (
      <AppShell role={role} onSignOut={signOut} debug={{ userId: user.id, role, accessToken, authError }}>
        <section className="panel">
          <h2 style={{ margin: 0 }}>Knocking</h2>
          <p className="hint">Start a session to enter full-screen mobile knocking mode.</p>
          <p className="hint">
            Today: K {todayTotals.knocks} | T {todayTotals.talks} | I {todayTotals.inspections} | C {" "}
            {todayTotals.contingencies}
          </p>
          {!includeInNightlyNumbers ? (
            <p className="error">You are not included on nightly numbers; events still log.</p>
          ) : null}
          <div className="row">
            <button onClick={startSession} disabled={saving}>
              {saving ? "Starting..." : "Start Session"}
            </button>
            <button className="secondary" onClick={() => router.push("/jobs")}>
              Back Home
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="hint">{message}</p> : null}
        </section>
      </AppShell>
    );
  }

  const isActive = session.status === "active";

  return (
    <main className="knock-screen">
      <header className="knock-header">
        <div>
          <h1>Knocking Session</h1>
          <p>
            {sessionStatusLabel} | {formatDuration(sessionSeconds)}
          </p>
        </div>
        <div className="knock-header-actions">
          <Link href="/jobs" className="knock-link-btn">
            Exit View
          </Link>
          {isActive ? (
            <button className="secondary" onClick={pauseSession} disabled={saving}>
              Pause
            </button>
          ) : (
            <button className="secondary" onClick={resumeSession} disabled={saving}>
              Resume
            </button>
          )}
          <button className="danger" onClick={endSession} disabled={saving}>
            End
          </button>
        </div>
      </header>

      <section className="knock-card">
        <p className="knock-rep">Rep: {fullName || user.email || user.id}</p>
        <p className="knock-rep">
          Today: K {todayTotals.knocks} | T {todayTotals.talks} | I {todayTotals.inspections} | C {" "}
          {todayTotals.contingencies}
        </p>

        {locationError ? <p className="error">{locationError}</p> : null}
        {message ? <p className="hint">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {!isActive ? (
          <div className="knock-step">
            <h2>Session Paused</h2>
            <p className="hint">Resume to keep logging doors.</p>
            <button onClick={resumeSession} disabled={saving}>
              Resume Session
            </button>
          </div>
        ) : null}

        {isActive && step === "door" ? (
          <div className="knock-step">
            <h2>At This Door</h2>
            <label className="stack">
              Address
              <input
                value={doorAddress}
                onChange={(e) => {
                  addressTouchedRef.current = true;
                  setDoorAddress(e.target.value);
                  setHomeownerIntake((prev) => ({ ...prev, address: e.target.value }));
                }}
                placeholder={currentAddress || "Tap location to fill"}
              />
            </label>
            <button className="secondary" onClick={fillAddressFromLocation} disabled={locating || saving}>
              {locating ? "Locating..." : "Use My Location"}
            </button>

            <div className="knock-cta-grid">
              <button onClick={startKnockFlow} disabled={!canLog || saving}>
                Knock
              </button>
              <button className="secondary" onClick={onDoorHanger} disabled={!canLog || saving}>
                Door Hanger
              </button>
            </div>
          </div>
        ) : null}

        {isActive && step === "outcome" ? (
          <div className="knock-step">
            <h2>Knock Outcome</h2>
            <div className="knock-cta-grid">
              <button className="secondary" onClick={() => void onOutcomeSelect("no_answer")} disabled={saving}>
                No Answer
              </button>
              <button className="secondary" onClick={() => void onOutcomeSelect("no")} disabled={saving}>
                No
              </button>
              <button onClick={() => void onOutcomeSelect("soft_set")} disabled={saving}>
                Soft Set
              </button>
              <button onClick={() => void onOutcomeSelect("inspection")} disabled={saving}>
                Inspection
              </button>
            </div>
            <button className="secondary" onClick={() => setStep("door")} disabled={saving}>
              Back
            </button>
          </div>
        ) : null}

        {isActive && step === "homeowner" ? (
          <form className="knock-step stack" onSubmit={onContinueHomeowner}>
            <h2>Homeowner Info</h2>
            <label className="stack">
              Name *
              <input
                value={homeownerIntake.homeownerName}
                onChange={(e) =>
                  setHomeownerIntake((prev) => ({ ...prev, homeownerName: e.target.value }))
                }
                required
              />
            </label>
            <label className="stack">
              Phone
              <input
                value={homeownerIntake.phone}
                onChange={(e) => setHomeownerIntake((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </label>
            <label className="stack">
              Email
              <input
                value={homeownerIntake.email}
                onChange={(e) => setHomeownerIntake((prev) => ({ ...prev, email: e.target.value }))}
              />
            </label>
            <label className="stack">
              Address
              <input
                value={homeownerIntake.address || doorAddress}
                onChange={(e) => setHomeownerIntake((prev) => ({ ...prev, address: e.target.value }))}
              />
            </label>
            <button type="submit">Continue</button>
            <button type="button" className="secondary" onClick={() => setStep("outcome")}>
              Back
            </button>
          </form>
        ) : null}

        {isActive && step === "follow_up" ? (
          <form
            className="knock-step stack"
            onSubmit={(e) => {
              e.preventDefault();
              void logEvent({ action: "knock", outcome: "soft_set", homeownerRequired: true });
            }}
          >
            <h2>Set Follow-Up</h2>
            <label className="stack">
              Date + time *
              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Soft Set"}
            </button>
            <button type="button" className="secondary" onClick={() => setStep("homeowner")}>Back</button>
          </form>
        ) : null}

        {isActive && step === "inspection" ? (
          <form
            className="knock-step stack"
            onSubmit={(e) => {
              e.preventDefault();
              const contingentInput = e.currentTarget.elements.namedItem("contingent");
              const contingentChecked =
                contingentInput instanceof HTMLInputElement ? contingentInput.checked : undefined;
              void logEvent({
                action: "knock",
                outcome: "inspection",
                homeownerRequired: true,
                contingentOverride: contingentChecked,
              });
            }}
          >
            <h2>Inspection Intake</h2>
            <label className="stack">
              Roof age / material notes
              <input
                value={inspectionChecklist.roofAge}
                onChange={(e) => setInspectionChecklist((prev) => ({ ...prev, roofAge: e.target.value }))}
              />
            </label>
            <label className="stack">
              Visible damage
              <textarea
                rows={3}
                value={inspectionChecklist.visibleDamage}
                onChange={(e) =>
                  setInspectionChecklist((prev) => ({ ...prev, visibleDamage: e.target.value }))
                }
              />
            </label>
            <label className="stack">
              Insurance carrier
              <input
                value={inspectionChecklist.insuranceCarrier}
                onChange={(e) =>
                  setInspectionChecklist((prev) => ({ ...prev, insuranceCarrier: e.target.value }))
                }
              />
            </label>
            <label className="row">
              <span>Contingency signed</span>
              <input
                type="checkbox"
                name="contingent"
                style={{ width: "auto" }}
                checked={inspectionChecklist.contingent}
                onChange={(e) =>
                  setInspectionChecklist((prev) => ({ ...prev, contingent: e.target.checked }))
                }
              />
            </label>
            <label className="stack">
              Extra notes
              <textarea
                rows={3}
                value={inspectionChecklist.notes}
                onChange={(e) => setInspectionChecklist((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </label>
            <label className="stack">
              Photos
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setInspectionPhotos(Array.from(e.target.files ?? []))}
              />
            </label>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Inspection"}
            </button>
            <button type="button" className="secondary" onClick={() => setStep("homeowner")}>Back</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
