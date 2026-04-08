"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { crmApi } from "@/lib/crm-api";
import { formatDate } from "@/lib/format";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { JobRecord, TaskRecord } from "@/types/models";

type DailyNumbers = {
  knocks: number;
  talks: number;
  inspections: number;
  contingencies: number;
  contracts_with_deposit: number;
  revenue_signed: number;
};

type Homeowner = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  [key: string]: unknown;
};

type NearbyJob = {
  id: string;
  homeownerName: string;
  phone: string | null;
  email: string | null;
  addressLine: string;
  distanceMiles: number;
};

const DEFAULT_DAILY_NUMBERS: DailyNumbers = {
  knocks: 0,
  talks: 0,
  inspections: 0,
  contingencies: 0,
  contracts_with_deposit: 0,
  revenue_signed: 0,
};

function toNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalDateKey(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getHomeowner(row: JobRecord) {
  const related = row.homeowners as Homeowner | Homeowner[] | null | undefined;
  if (!related) return null;
  return Array.isArray(related) ? related[0] ?? null : related;
}

function buildAddress(homeowner: Homeowner | null) {
  if (!homeowner) return "No address";
  const parts = [
    homeowner.address ?? "",
    [homeowner.city ?? "", homeowner.state ?? "", homeowner.zip ?? ""].filter(Boolean).join(" "),
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "No address";
}

function getCoordinateFromUnknown(row: Record<string, unknown>) {
  const latCandidates = ["latitude", "lat", "home_latitude", "home_lat"];
  const lngCandidates = ["longitude", "lng", "lon", "home_longitude", "home_lng", "home_lon"];

  const latitude = latCandidates
    .map((key) => Number(row[key]))
    .find((value) => Number.isFinite(value));
  const longitude = lngCandidates
    .map((key) => Number(row[key]))
    .find((value) => Number.isFinite(value));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: Number(latitude), lng: Number(longitude) };
}

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

export default function JobsPage() {
  const router = useRouter();
  const { user, loading, role, signOut, accessToken, error: authError } = useAuthSession();

  const [supabaseReady, setSupabaseReady] = useState(false);
  const [dailyNumbers, setDailyNumbers] = useState<DailyNumbers>(DEFAULT_DAILY_NUMBERS);
  const [nearbyJobs, setNearbyJobs] = useState<NearbyJob[]>([]);
  const [jobsForNearby, setJobsForNearby] = useState<JobRecord[]>([]);
  const [todaysTasks, setTodaysTasks] = useState<TaskRecord[]>([]);
  const [radiusMiles, setRadiusMiles] = useState(5);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [loadingHome, setLoadingHome] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const geocodeCache = useRef<Map<string, { lat: number; lng: number }>>(new Map());
  const geocodingKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  useEffect(() => {
    getSupabaseBrowserClient();
    setSupabaseReady(true);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/jobs");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!loading && user && !accessToken) {
      setLoadingHome(false);
      setLoadingNearby(false);
      setError("Session token missing. Please sign out and sign in again.");
    }
  }, [accessToken, loading, user]);

  useEffect(() => {
    if (!supabaseReady || !user || !accessToken) return;
    let active = true;

    const loadHome = async () => {
      setLoadingHome(true);
      setError(null);

      const supabase = getSupabaseBrowserClient();
      const todayLocal = getTodayLocalDate();

      try {
        const [numbersResult, jobsResult, tasksPayload] = await Promise.all([
          supabase
            .from("rep_daily_stats")
            .select(
              "knocks,talks,inspections,contingencies,contracts_with_deposit,revenue_signed",
            )
            .eq("rep_id", user.id)
            .eq("report_date", todayLocal)
            .maybeSingle(),
          supabase
            .from("jobs")
            .select(
              `
              id,
              created_at,
              homeowners (
                *
              )
            `,
            )
            .order("created_at", { ascending: false })
            .limit(80),
          crmApi.listTasks(accessToken),
        ]);

        if (!active) return;

        if (numbersResult.error) {
          setError(numbersResult.error.message);
        } else if (numbersResult.data) {
          setDailyNumbers({
            knocks: toNumber(numbersResult.data.knocks),
            talks: toNumber(numbersResult.data.talks),
            inspections: toNumber(numbersResult.data.inspections),
            contingencies: toNumber(numbersResult.data.contingencies),
            contracts_with_deposit: toNumber(numbersResult.data.contracts_with_deposit),
            revenue_signed: toNumber(numbersResult.data.revenue_signed),
          });
        } else {
          setDailyNumbers(DEFAULT_DAILY_NUMBERS);
        }

        if (jobsResult.error) {
          setError(jobsResult.error.message);
        } else {
          const rawJobs = (jobsResult.data ?? []) as JobRecord[];
          setJobsForNearby(rawJobs);
          setNearbyJobs([]);
          setNearbyError(null);
        }

        const todayTasks = ((tasksPayload.tasks ?? []) as TaskRecord[]).filter((task) => {
          const firstDate =
            (typeof task.scheduled_for === "string" ? task.scheduled_for : null) ??
            (typeof task.due_at === "string" ? task.due_at : null);
          return toLocalDateKey(firstDate) === todayLocal;
        });
        setTodaysTasks(todayTasks);

        if (!navigator.geolocation) {
          setLocationError("Location is not supported by this browser.");
          setLoadingHome(false);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!active) return;
            setLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
            setLocationError(null);
          },
          () => {
            if (!active) return;
            setLocationError("Allow location access to filter jobs by nearby range.");
          },
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 },
        );
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load home dashboard.");
      } finally {
        if (active) {
          setLoadingHome(false);
        }
      }
    };

    loadHome();

    return () => {
      active = false;
    };
  }, [accessToken, supabaseReady, user]);

  useEffect(() => {
    if (!user || !location) return;

    let active = true;

    const updateNearby = async () => {
      setLoadingNearby(true);
      setNearbyError(null);

      if (jobsForNearby.length === 0) {
        setNearbyJobs([]);
        setLoadingNearby(false);
        return;
      }

      const rows = jobsForNearby;
      const nextNearby: NearbyJob[] = [];
      const hasGeocodeKey = geocodingKey.trim().length > 0;
      let missingCoordinates = 0;
      let geocodeAttempts = 0;
      let geocodeFailures = 0;
      let lastGeocodeStatus: string | null = null;
      let lastGeocodeErrorMessage: string | null = null;

      for (const row of rows) {
        if (!active) return;

        const homeowner = getHomeowner(row);
        const addressLine = buildAddress(homeowner);
        const homeownerName = homeowner?.name?.trim() || "Unnamed homeowner";
        const phone = homeowner?.phone?.trim() || null;
        const email = homeowner?.email?.trim() || null;

        let coordinate =
          getCoordinateFromUnknown(row as Record<string, unknown>) ??
          getCoordinateFromUnknown((homeowner ?? {}) as Record<string, unknown>);

        if (!coordinate && homeowner?.address && hasGeocodeKey) {
          const cacheKey = addressLine.toLowerCase();
          coordinate = geocodeCache.current.get(cacheKey) ?? null;

          if (!coordinate) {
            geocodeAttempts += 1;
            try {
              const response = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
                  addressLine,
                )}&key=${encodeURIComponent(geocodingKey)}`,
              );
              const payload = (await response.json()) as {
                status?: string;
                error_message?: string;
                results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
              };
              const locationData = payload.results?.[0]?.geometry?.location;

              if (
                payload.status === "OK" &&
                locationData &&
                Number.isFinite(locationData.lat) &&
                Number.isFinite(locationData.lng)
              ) {
                coordinate = { lat: Number(locationData.lat), lng: Number(locationData.lng) };
                geocodeCache.current.set(cacheKey, coordinate);
              } else {
                geocodeFailures += 1;
                if (typeof payload.status === "string") {
                  lastGeocodeStatus = payload.status;
                }
                if (typeof payload.error_message === "string") {
                  lastGeocodeErrorMessage = payload.error_message;
                }
              }
            } catch {
              geocodeFailures += 1;
            }
          }
        }

        if (!coordinate) {
          missingCoordinates += 1;
          continue;
        }

        const miles = haversineMiles(location, coordinate);
        if (miles <= radiusMiles) {
          nextNearby.push({
            id: row.id,
            homeownerName,
            phone,
            email,
            addressLine,
            distanceMiles: miles,
          });
        }
      }

      nextNearby.sort((a, b) => a.distanceMiles - b.distanceMiles);
      setNearbyJobs(nextNearby);
      if (nextNearby.length === 0 && missingCoordinates > 0) {
        if (!hasGeocodeKey) {
          setNearbyError(
            "No latitude/longitude on homeowner records. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY or store lat/lng to enable nearby matching.",
          );
        } else if (lastGeocodeStatus === "REQUEST_DENIED" || lastGeocodeStatus === "OVER_DAILY_LIMIT") {
          const details =
            lastGeocodeErrorMessage && lastGeocodeErrorMessage.trim().length > 0
              ? ` (${lastGeocodeErrorMessage})`
              : "";
          setNearbyError(`Google Geocoding API denied requests${details}. Check key restrictions and billing.`);
        } else if (geocodeAttempts > 0 && geocodeFailures >= geocodeAttempts) {
          setNearbyError(
            "Could not geocode homeowner addresses yet. Verify the Google Geocoding API key and enabled APIs.",
          );
        }
      } else {
        setNearbyError(null);
      }
      setLoadingNearby(false);
    };

    updateNearby();

    return () => {
      active = false;
    };
  }, [geocodingKey, jobsForNearby, location, radiusMiles, user]);

  const statCards = useMemo(
    () => [
      { label: "Knocks", value: dailyNumbers.knocks },
      { label: "Talks", value: dailyNumbers.talks },
      { label: "Inspections", value: dailyNumbers.inspections },
      { label: "Contingencies", value: dailyNumbers.contingencies },
      { label: "Contracts", value: dailyNumbers.contracts_with_deposit },
      {
        label: "Revenue",
        value: `$${Math.round(dailyNumbers.revenue_signed).toLocaleString()}`,
      },
    ],
    [dailyNumbers],
  );

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
          <h2 style={{ margin: 0 }}>Today&apos;s Numbers</h2>
          <p className="hint">{getTodayLocalDate()}</p>
        </div>
        {loadingHome ? <p className="hint">Loading dashboard...</p> : null}
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          {statCards.map((item) => (
            <article key={item.label} className="job-card">
              <p className="hint" style={{ marginTop: 0 }}>
                {item.label}
              </p>
              <strong style={{ fontSize: "1.25rem" }}>{String(item.value)}</strong>
            </article>
          ))}
        </div>
      </section>

      <div className="jobs-home-columns">
        <section className="panel">
          <div className="row">
            <h2 style={{ margin: 0 }}>Nearby Jobs</h2>
            <p className="hint">{nearbyJobs.length} matches</p>
          </div>
          <div className="nearby-radius-control">
            <label htmlFor="nearby-radius-slider" className="hint nearby-radius-label">
              Radius: {radiusMiles} {radiusMiles === 1 ? "mile" : "miles"}
            </label>
            <input
              id="nearby-radius-slider"
              type="range"
              min={1}
              max={5}
              step={1}
              value={radiusMiles}
              onChange={(event) => setRadiusMiles(Number(event.target.value))}
              aria-label="Nearby jobs radius in miles"
            />
            <div className="nearby-radius-markers" aria-hidden="true">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
            </div>
          </div>
          <p className="hint">
            Showing jobs by homeowner address near your current location.
          </p>
          {locationError ? <p className="error">{locationError}</p> : null}
          {nearbyError ? <p className="error">{nearbyError}</p> : null}
          {loadingNearby ? <p className="hint">Finding nearby jobs...</p> : null}
          <div className="grid nearby-jobs-scroll">
            {nearbyJobs.map((job) => (
              <article key={job.id} className="job-card nearby-job-card">
                <div className="row">
                  <strong>{job.homeownerName}</strong>
                  <span className="hint">
                    {Number.isFinite(job.distanceMiles)
                      ? `${job.distanceMiles.toFixed(1)} mi`
                      : "Distance unavailable"}
                  </span>
                </div>
                <p className="muted">{job.addressLine}</p>
                <p className="hint">
                  {job.phone ? <a href={`tel:${job.phone}`}>{job.phone}</a> : "No phone"} |{" "}
                  {job.email ? <a href={`mailto:${job.email}`}>{job.email}</a> : "No email"}
                </p>
                <Link className="tab" href={`/jobs/${job.id}`}>
                  Open Job
                </Link>
              </article>
            ))}
            {!loadingNearby && nearbyJobs.length === 0 ? (
              <p className="hint">
                No jobs found in the selected range yet.
              </p>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="row">
            <h2 style={{ margin: 0 }}>Today&apos;s Tasks & Appointments</h2>
            <p className="hint">{todaysTasks.length} items</p>
          </div>
          <div className="grid">
            {todaysTasks.map((task) => {
              const status = typeof task.status === "string" ? task.status : "open";
              const date =
                (typeof task.scheduled_for === "string" ? task.scheduled_for : null) ??
                (typeof task.due_at === "string" ? task.due_at : null);
              const taskJob =
                typeof task.job === "object" && task.job ? (task.job as Record<string, unknown>) : null;
              const homeownerName =
                typeof taskJob?.homeowner_name === "string" && taskJob.homeowner_name.trim().length > 0
                  ? taskJob.homeowner_name
                  : "General task";
              const address =
                typeof taskJob?.address === "string" && taskJob.address.trim().length > 0
                  ? taskJob.address
                  : "No address";

              return (
                <article key={task.id} className="job-card">
                  <div className="row">
                    <strong>{task.title ? String(task.title) : "Untitled task"}</strong>
                    <StatusPill value={status} />
                  </div>
                  <p className="muted">
                    {homeownerName} | {address}
                  </p>
                  <p className="hint">{formatDate(date)}</p>
                </article>
              );
            })}
            {!loadingHome && todaysTasks.length === 0 ? (
              <p className="hint">No tasks or appointments scheduled for today.</p>
            ) : null}
          </div>
        </section>
      </div>

      {error ? <p className="error">{error}</p> : null}
    </AppShell>
  );
}
