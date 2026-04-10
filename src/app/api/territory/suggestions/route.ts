export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

function toIsoDaysAgo(days: number) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now.toISOString();
}

function dayKeyLocal(now = new Date()) {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getRouteSupabaseClient(request);
    const snapshotDate = dayKeyLocal();

    const { data: existing } = await supabase
      .from("territory_suggestion_snapshots")
      .select("area_key,center_lat,center_lng,zip,score,rank,reasons")
      .eq("snapshot_date", snapshotDate)
      .or(`rep_id.eq.${userId},rep_id.is.null`)
      .order("rank", { ascending: true })
      .limit(6);

    if ((existing ?? []).length > 0) {
      return NextResponse.json({ snapshotDate, suggestions: existing }, { status: 200 });
    }

    const since = toIsoDaysAgo(30);
    const { data: events, error } = await supabase
      .from("knock_events")
      .select("latitude,longitude,knocks_delta,talks_delta,inspections_delta,contingencies_delta")
      .gte("created_at", since)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(10000);

    if (error) throw new Error(error.message);

    const bucket = new Map<
      string,
      { centerLat: number; centerLng: number; knocks: number; talks: number; inspections: number; contingencies: number }
    >();

    (events ?? []).forEach((row) => {
      const lat = Number((row as any).latitude);
      const lng = Number((row as any).longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const centerLat = Number(lat.toFixed(2));
      const centerLng = Number(lng.toFixed(2));
      const areaKey = `${centerLat}:${centerLng}`;
      const current = bucket.get(areaKey) ?? {
        centerLat,
        centerLng,
        knocks: 0,
        talks: 0,
        inspections: 0,
        contingencies: 0,
      };

      current.knocks += asNumber((row as any).knocks_delta);
      current.talks += asNumber((row as any).talks_delta);
      current.inspections += asNumber((row as any).inspections_delta);
      current.contingencies += asNumber((row as any).contingencies_delta);

      bucket.set(areaKey, current);
    });

    const ranked = Array.from(bucket.entries())
      .map(([areaKey, value]) => {
        const talkRate = value.knocks > 0 ? value.talks / value.knocks : 0;
        const inspectionRate = value.knocks > 0 ? value.inspections / value.knocks : 0;
        const contingencyRate = value.knocks > 0 ? value.contingencies / value.knocks : 0;

        const score =
          contingencyRate * 0.5 +
          inspectionRate * 0.3 +
          talkRate * 0.15 +
          Math.min(value.knocks / 50, 1) * 0.05;

        return {
          areaKey,
          centerLat: value.centerLat,
          centerLng: value.centerLng,
          zip: null,
          score,
          reasons: [
            `Talk rate ${(talkRate * 100).toFixed(1)}%`,
            `Inspection rate ${(inspectionRate * 100).toFixed(1)}%`,
            `Contingency rate ${(contingencyRate * 100).toFixed(1)}%`,
          ],
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((row, index) => ({ ...row, rank: index + 1 }));

    if (ranked.length > 0) {
      await supabase.from("territory_suggestion_snapshots").insert(
        ranked.map((row) => ({
          snapshot_date: snapshotDate,
          rep_id: userId,
          area_key: row.areaKey,
          center_lat: row.centerLat,
          center_lng: row.centerLng,
          zip: row.zip,
          score: row.score,
          rank: row.rank,
          reasons: row.reasons,
        })),
      );
    }

    return NextResponse.json({ snapshotDate, suggestions: ranked }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to compute territory suggestions." }, { status: 500 });
  }
}
