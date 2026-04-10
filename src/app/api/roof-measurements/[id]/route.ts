export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function getId(context: RouteContext) {
  const resolved = await context.params;
  return resolved.id;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = await getId(context);

    const supabase = getRouteSupabaseClient(request);
    const [{ data: measurement, error: measurementError }, { data: polygons }, { data: segments }] = await Promise.all([
      supabase.from("roof_measurements").select("*").eq("id", id).eq("rep_id", userId).maybeSingle(),
      supabase.from("roof_measurement_polygons").select("*").eq("measurement_id", id).eq("rep_id", userId),
      supabase.from("roof_measurement_segments").select("*").eq("measurement_id", id).eq("rep_id", userId),
    ]);

    if (measurementError) throw new Error(measurementError.message);
    if (!measurement) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ measurement, polygons: polygons ?? [], segments: segments ?? [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load roof measurement." }, { status: 500 });
  }
}
