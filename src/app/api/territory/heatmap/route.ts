export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";
import type { HeatmapLayer } from "@/types/field-intelligence";

type EventRow = {
  rep_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  knocks_delta?: number | null;
  talks_delta?: number | null;
  inspections_delta?: number | null;
  contingencies_delta?: number | null;
  created_at?: string | null;
};

type PotentialLeadRow = {
  rep_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
};

type JobRow = {
  id: string;
  stage_id?: number | null;
  homeowners?:
    | {
        address?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
      }
    | Array<{
        address?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
      }>
    | null;
};

type JobRepRow = {
  job_id: string;
};

type ProfileRow = {
  role?: string | null;
};

type StageRow = {
  id: number;
  sort_order?: number | null;
  name?: string | null;
};

type JobGeocodeCacheRow = {
  job_id: string;
  address_hash?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  lookup_status?: string | null;
  updated_at?: string | null;
};

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildHexKey(lat: number, lng: number) {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

function toIsoDaysAgo(days: number) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isManagerLikeRole(role: string | null | undefined) {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "sales_manager" ||
    role === "production_manager" ||
    role === "social_media_coordinator"
  );
}

function hashAddress(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildJobAddress(job: JobRow) {
  const homeowner = Array.isArray(job.homeowners)
    ? job.homeowners[0] ?? null
    : job.homeowners ?? null;
  const street = typeof homeowner?.address === "string" ? homeowner.address.trim() : "";
  const city = typeof homeowner?.city === "string" ? homeowner.city.trim() : "";
  const state = typeof homeowner?.state === "string" ? homeowner.state.trim() : "";
  const zip = typeof homeowner?.zip === "string" ? homeowner.zip.trim() : "";
  const cityStateZip = [city, state, zip].filter(Boolean).join(" ");
  const full = [street, cityStateZip].filter(Boolean).join(", ").trim();
  return full.length > 0 ? full : null;
}

async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!apiKey.trim()) return null;
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&key=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) {
    throw new Error(`Geocode request failed (${response.status}).`);
  }
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };
  if (payload.status !== "OK") return null;
  const location = payload.results?.[0]?.geometry?.location;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const layer = (url.searchParams.get("layer") ?? "conversions") as HeatmapLayer;
    const daysRaw = Number(url.searchParams.get("days") ?? 30);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 365) : 30;
    const since = toIsoDaysAgo(days);

    const supabase = getRouteSupabaseClient(request);
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const managerView = isManagerLikeRole((profileData as ProfileRow | null)?.role ?? null);

    const eventsQuery = supabase
      .from("knock_events")
      .select("rep_id,latitude,longitude,knocks_delta,talks_delta,inspections_delta,contingencies_delta,created_at")
      .gte("created_at", since)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(10000);
    if (!managerView) {
      eventsQuery.eq("rep_id", userId);
    }

    const leadsQuery = supabase
      .from("knock_potential_leads")
      .select("rep_id,latitude,longitude,created_at")
      .gte("created_at", since)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(10000);
    if (!managerView) {
      leadsQuery.eq("rep_id", userId);
    }

    const [eventsResult, leadsResult, stagesResult] = await Promise.all([
      eventsQuery,
      leadsQuery,
      supabase.from("pipeline_stages").select("id,sort_order,name"),
    ]);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (leadsResult.error) throw new Error(leadsResult.error.message);
    if (stagesResult.error) throw new Error(stagesResult.error.message);

    const eventRows = (eventsResult.data ?? []) as EventRow[];
    const leadRows = (leadsResult.data ?? []) as PotentialLeadRow[];
    const stages = (stagesResult.data ?? []) as StageRow[];

    const approvedSortOrder =
      stages.find((row) => String(row.name ?? "").toLowerCase() === "approved")?.sort_order ?? 5;

    const stageSortById = new Map<number, number>();
    stages.forEach((row) => {
      const id = asNumber(row.id);
      const sortOrder = asNumber(row.sort_order);
      if (id > 0) {
        stageSortById.set(id, sortOrder);
      }
    });

    let jobs: JobRow[] = [];
    if (managerView) {
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("jobs")
          .select(
            "id,stage_id,homeowners(address,city,state,zip)",
          )
          .order("created_at", { ascending: false })
          .range(from, to);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as JobRow[];
        jobs.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
    } else {
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("job_reps")
        .select("job_id")
        .eq("profile_id", userId);
      if (assignmentsError) throw new Error(assignmentsError.message);
      const assignedJobIds = Array.from(
        new Set(
          ((assignmentsData ?? []) as JobRepRow[])
            .map((row) => (typeof row.job_id === "string" ? row.job_id : null))
            .filter((value): value is string => Boolean(value)),
        ),
      );

      for (let index = 0; index < assignedJobIds.length; index += 200) {
        const jobIdChunk = assignedJobIds.slice(index, index + 200);
        const { data, error } = await supabase
          .from("jobs")
          .select(
            "id,stage_id,homeowners(address,city,state,zip)",
          )
          .in("id", jobIdChunk);
        if (error) throw new Error(error.message);
        jobs.push(...((data ?? []) as JobRow[]));
      }
    }

    const aggregates = new Map<
      string,
      {
        centerLat: number;
        centerLng: number;
        knocks: number;
        talks: number;
        inspections: number;
        contingencies: number;
        potentialLeads: number;
        crmJobs: number;
        conversions: number;
        approvals: number;
        jobsTotal: number;
      }
    >();

    eventRows.forEach((row) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const centerLat = Number(lat.toFixed(2));
      const centerLng = Number(lng.toFixed(2));
      const key = buildHexKey(centerLat, centerLng);

      const current =
        aggregates.get(key) ??
        {
          centerLat,
          centerLng,
          knocks: 0,
          talks: 0,
          inspections: 0,
          contingencies: 0,
          potentialLeads: 0,
          crmJobs: 0,
          conversions: 0,
          approvals: 0,
          jobsTotal: 0,
        };

      const knocks = asNumber(row.knocks_delta);
      const talks = asNumber(row.talks_delta);
      const inspections = asNumber(row.inspections_delta);
      const contingencies = asNumber(row.contingencies_delta);

      current.knocks += knocks;
      current.talks += talks;
      current.inspections += inspections;
      current.contingencies += contingencies;
      if (contingencies > 0) {
        current.conversions += 1;
      }

      aggregates.set(key, current);
    });

    leadRows.forEach((row) => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const centerLat = Number(lat.toFixed(2));
      const centerLng = Number(lng.toFixed(2));
      const key = buildHexKey(centerLat, centerLng);

      const current =
        aggregates.get(key) ??
        {
          centerLat,
          centerLng,
          knocks: 0,
          talks: 0,
          inspections: 0,
          contingencies: 0,
          potentialLeads: 0,
          crmJobs: 0,
          conversions: 0,
          approvals: 0,
          jobsTotal: 0,
        };

      current.potentialLeads += 1;
      current.conversions += 1;
      aggregates.set(key, current);
    });

    const jobWithAddress = jobs
      .map((job) => {
        const address = buildJobAddress(job);
        return address ? { job, address, addressHash: hashAddress(normalizeText(address)) } : null;
      })
      .filter(
        (
          row,
        ): row is { job: JobRow; address: string; addressHash: string } =>
          Boolean(row),
      );

    const cacheByJobId = new Map<string, JobGeocodeCacheRow>();
    if (jobWithAddress.length > 0) {
      try {
        for (let index = 0; index < jobWithAddress.length; index += 200) {
          const jobIdChunk = jobWithAddress
            .slice(index, index + 200)
            .map((row) => row.job.id);
          const { data, error } = await supabase
            .from("job_geocode_cache")
            .select("job_id,address_hash,latitude,longitude,lookup_status,updated_at")
            .in("job_id", jobIdChunk);
          if (error) throw error;
          ((data ?? []) as JobGeocodeCacheRow[]).forEach((row) => {
            if (row.job_id) cacheByJobId.set(row.job_id, row);
          });
        }
      } catch {
        // Cache table might not exist yet; continue with uncached geocoding.
      }
    }

    const geocodeApiKey =
      process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
    const staleThresholdMs = 1000 * 60 * 60 * 24 * 30;
    const geocodedPointByJobId = new Map<string, { lat: number; lng: number }>();
    const cacheUpserts: Array<{
      job_id: string;
      address: string;
      address_hash: string;
      latitude: number | null;
      longitude: number | null;
      lookup_status: string;
      geocoded_at: string | null;
      updated_at: string;
    }> = [];

    const toGeocode: Array<{ jobId: string; address: string; addressHash: string }> = [];
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    jobWithAddress.forEach(({ job, address, addressHash }) => {
      const cached = cacheByJobId.get(job.id);
      const cachedLat = Number(cached?.latitude);
      const cachedLng = Number(cached?.longitude);
      const cacheAgeMs = cached?.updated_at
        ? nowMs - new Date(cached.updated_at).getTime()
        : Number.POSITIVE_INFINITY;
      const hashMatches = cached?.address_hash === addressHash;
      const cacheFresh = hashMatches && cacheAgeMs <= staleThresholdMs;

      if (
        cacheFresh &&
        Number.isFinite(cachedLat) &&
        Number.isFinite(cachedLng) &&
        cachedLat !== 0 &&
        cachedLng !== 0
      ) {
        geocodedPointByJobId.set(job.id, { lat: cachedLat, lng: cachedLng });
        return;
      }

      if (cacheFresh && cached?.lookup_status === "not_found") {
        return;
      }

      toGeocode.push({ jobId: job.id, address, addressHash });
    });

    for (let index = 0; index < toGeocode.length; index += 8) {
      const batch = toGeocode.slice(index, index + 8);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            const point = await geocodeAddress(item.address, geocodeApiKey);
            return { item, point, status: point ? "ok" : "not_found" };
          } catch {
            return { item, point: null, status: "error" };
          }
        }),
      );

      batchResults.forEach(({ item, point, status }) => {
        if (point) {
          geocodedPointByJobId.set(item.jobId, point);
        }
        cacheUpserts.push({
          job_id: item.jobId,
          address: item.address,
          address_hash: item.addressHash,
          latitude: point?.lat ?? null,
          longitude: point?.lng ?? null,
          lookup_status: status,
          geocoded_at: point ? nowIso : null,
          updated_at: nowIso,
        });
      });
    }

    if (cacheUpserts.length > 0) {
      try {
        await supabase
          .from("job_geocode_cache")
          .upsert(cacheUpserts, { onConflict: "job_id" });
      } catch {
        // Cache writes are best-effort and should not fail heatmap responses.
      }
    }

    jobWithAddress.forEach(({ job }) => {
      const point = geocodedPointByJobId.get(job.id);
      if (!point) return;
      const centerLat = Number(point.lat.toFixed(2));
      const centerLng = Number(point.lng.toFixed(2));
      const key = buildHexKey(centerLat, centerLng);

      const current =
        aggregates.get(key) ??
        {
          centerLat,
          centerLng,
          knocks: 0,
          talks: 0,
          inspections: 0,
          contingencies: 0,
          potentialLeads: 0,
          crmJobs: 0,
          conversions: 0,
          approvals: 0,
          jobsTotal: 0,
        };

      const stageId = Number(job.stage_id);
      const stageSort = Number.isFinite(stageId) ? stageSortById.get(stageId) ?? 0 : 0;
      current.crmJobs += 1;
      current.jobsTotal += 1;
      current.conversions += 1;
      if (stageSort >= asNumber(approvedSortOrder)) {
        current.approvals += 1;
      }
      aggregates.set(key, current);
    });

    const cells = Array.from(aggregates.entries()).map(([hexKey, value]) => {
      let metricValue = 0;
      switch (layer) {
        case "approval_rate":
          metricValue = value.jobsTotal > 0 ? value.approvals / value.jobsTotal : 0;
          break;
        case "knock_density":
          metricValue = value.knocks;
          break;
        case "inspection_rate":
          metricValue = value.knocks > 0 ? value.inspections / value.knocks : 0;
          break;
        case "contingency_close":
          metricValue = value.knocks > 0 ? value.contingencies / value.knocks : 0;
          break;
        case "conversions":
        default:
          metricValue = value.conversions;
          break;
      }

      return {
        hexKey,
        centerLat: value.centerLat,
        centerLng: value.centerLng,
        value: metricValue,
        knocks: value.knocks,
        talks: value.talks,
        inspections: value.inspections,
        contingencies: value.contingencies,
        conversions: value.conversions,
        approvals: value.approvals,
        jobsTotal: value.jobsTotal,
        potentialLeads: value.potentialLeads,
        crmJobs: value.crmJobs,
      };
    });

    return NextResponse.json({ layer, days, cells }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to compute heatmap." }, { status: 500 });
  }
}
