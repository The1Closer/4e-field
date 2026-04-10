export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";
import type { HeatmapLayer } from "@/types/field-intelligence";

type EventRow = {
  latitude?: number | null;
  longitude?: number | null;
  knocks_delta?: number | null;
  talks_delta?: number | null;
  inspections_delta?: number | null;
  contingencies_delta?: number | null;
  linked_job_id?: string | null;
  created_at?: string | null;
};

type JobRow = {
  id: string;
  stage_id?: number | null;
};

type JobApprovalRow = {
  job_id: string;
  is_insurance_approved?: boolean | null;
};

type StageRow = {
  id: number;
  sort_order?: number | null;
  name?: string | null;
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

    const { data: events, error: eventsError } = await supabase
      .from("knock_events")
      .select("latitude,longitude,knocks_delta,talks_delta,inspections_delta,contingencies_delta,linked_job_id,created_at")
      .gte("created_at", since)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(10000);

    if (eventsError) throw new Error(eventsError.message);

    const eventRows = (events ?? []) as EventRow[];
    const jobIds = Array.from(
      new Set(
        eventRows
          .map((row) => (typeof row.linked_job_id === "string" ? row.linked_job_id : null))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [jobsResult, stagesResult, approvalsViewResult] = await Promise.all([
      jobIds.length > 0
        ? supabase.from("jobs").select("id,stage_id").in("id", jobIds)
        : Promise.resolve({ data: [] as JobRow[], error: null }),
      supabase.from("pipeline_stages").select("id,sort_order,name"),
      jobIds.length > 0
        ? supabase
            .from("job_stage_approval_flags")
            .select("job_id,is_insurance_approved")
            .in("job_id", jobIds)
        : Promise.resolve({ data: [] as JobApprovalRow[], error: null }),
    ]);

    if (jobsResult.error) throw new Error(jobsResult.error.message);
    if (stagesResult.error) throw new Error(stagesResult.error.message);
    // View may not exist yet in older environments; fallback handled below.
    const approvalsViewRows = approvalsViewResult.error
      ? []
      : ((approvalsViewResult.data ?? []) as JobApprovalRow[]);

    const jobs = (jobsResult.data ?? []) as JobRow[];
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

    const stageIdByJobId = new Map<string, number>();
    jobs.forEach((row) => {
      stageIdByJobId.set(String(row.id), asNumber(row.stage_id));
    });

    const approvalByJobId = new Map<string, boolean>();
    approvalsViewRows.forEach((row) => {
      approvalByJobId.set(String(row.job_id), Boolean(row.is_insurance_approved));
    });

    const aggregates = new Map<
      string,
      {
        centerLat: number;
        centerLng: number;
        knocks: number;
        talks: number;
        inspections: number;
        contingencies: number;
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

      const linkedJobId = typeof row.linked_job_id === "string" ? row.linked_job_id : null;
      if (linkedJobId) {
        current.jobsTotal += 1;
        const approvedFromView = approvalByJobId.get(linkedJobId);
        if (typeof approvedFromView === "boolean") {
          if (approvedFromView) current.approvals += 1;
        } else {
          const stageId = stageIdByJobId.get(linkedJobId);
          if (typeof stageId === "number") {
            const sortOrder = stageSortById.get(stageId) ?? 0;
            if (sortOrder >= asNumber(approvedSortOrder)) {
              current.approvals += 1;
            }
          }
        }
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
      };
    });

    return NextResponse.json({ layer, days, cells }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to compute heatmap." }, { status: 500 });
  }
}
