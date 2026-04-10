export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeekSunday(now = new Date()) {
  const value = new Date(now);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - value.getDay());
  return value;
}

function startOfMonth(now = new Date()) {
  const value = new Date(now);
  value.setHours(0, 0, 0, 0);
  value.setDate(1);
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const periodType = (url.searchParams.get("period") ?? "weekly") as "weekly" | "monthly";
    const persist = (url.searchParams.get("persist") ?? "true") !== "false";

    const now = new Date();
    const periodStart = periodType === "monthly" ? startOfMonth(now) : startOfWeekSunday(now);
    const periodEnd = now;

    const supabase = getRouteSupabaseClient(request);
    const { data: events, error } = await supabase
      .from("knock_events")
      .select("rep_id,knocks_delta,talks_delta,inspections_delta,contingencies_delta,created_at")
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString())
      .order("created_at", { ascending: false })
      .limit(10000);

    if (error) throw new Error(error.message);

    const rollups = new Map<string, { knocks: number; talks: number; inspections: number; contingencies: number }>();

    (events ?? []).forEach((row) => {
      const repId = String((row as any).rep_id ?? "");
      if (!repId) return;
      const current = rollups.get(repId) ?? { knocks: 0, talks: 0, inspections: 0, contingencies: 0 };
      current.knocks += asNumber((row as any).knocks_delta);
      current.talks += asNumber((row as any).talks_delta);
      current.inspections += asNumber((row as any).inspections_delta);
      current.contingencies += asNumber((row as any).contingencies_delta);
      rollups.set(repId, current);
    });

    const reports = Array.from(rollups.entries()).map(([repId, value]) => ({
      repId,
      periodType,
      periodStart: formatDateKey(periodStart),
      periodEnd: formatDateKey(periodEnd),
      timezone: "rep-local",
      weekStartDow: 0,
      metrics: {
        knocks: value.knocks,
        talks: value.talks,
        inspections: value.inspections,
        contingencies: value.contingencies,
        talkRate: value.knocks > 0 ? value.talks / value.knocks : 0,
        inspectionRate: value.knocks > 0 ? value.inspections / value.knocks : 0,
        contingencyRate: value.knocks > 0 ? value.contingencies / value.knocks : 0,
      },
    }));

    if (persist && reports.length > 0) {
      const rows = reports.map((report) => ({
        rep_id: report.repId,
        period_type: report.periodType,
        period_start: report.periodStart,
        period_end: report.periodEnd,
        timezone: report.timezone,
        week_start_dow: report.weekStartDow,
        metrics: report.metrics,
      }));

      await supabase.from("rep_performance_reports").upsert(rows, {
        onConflict: "rep_id,period_type,period_start,period_end",
      });
    }

    return NextResponse.json({ periodType, reports }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to build rep performance report." }, { status: 500 });
  }
}
