export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

export async function GET(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = getRouteSupabaseClient(request);
    const { data, error } = await supabase
      .from("roof_measurements")
      .select("*")
      .eq("rep_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);
    return NextResponse.json({ measurements: data ?? [] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list roof measurements." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      inspectionId?: string | null;
      linkedJobId?: string | null;
      status?: "draft" | "completed" | "archived";
      totalAreaSqft?: number;
      totalSquares?: number;
      ridgeFeet?: number;
      hipFeet?: number;
      valleyFeet?: number;
      rakeFeet?: number;
      eaveFeet?: number;
      starterFeet?: number;
      metadata?: Record<string, unknown>;
      polygons?: Array<{ polygonIndex: number; points: Array<{ lat: number; lng: number }>; areaSqft?: number }>;
      segments?: Array<{ segmentType: string; points: Array<{ lat: number; lng: number }>; lengthFeet?: number }>;
    };

    const supabase = getRouteSupabaseClient(request);

    const { data, error } = await supabase
      .from("roof_measurements")
      .insert({
        rep_id: userId,
        inspection_id: body.inspectionId ?? null,
        linked_job_id: body.linkedJobId ?? null,
        status: body.status ?? "completed",
        total_area_sqft: Number(body.totalAreaSqft ?? 0),
        total_squares: Number(body.totalSquares ?? 0),
        ridge_feet: Number(body.ridgeFeet ?? 0),
        hip_feet: Number(body.hipFeet ?? 0),
        valley_feet: Number(body.valleyFeet ?? 0),
        rake_feet: Number(body.rakeFeet ?? 0),
        eave_feet: Number(body.eaveFeet ?? 0),
        starter_feet: Number(body.starterFeet ?? 0),
        metadata: body.metadata ?? {},
      })
      .select("*")
      .single();

    if (error || !data) throw new Error(error?.message || "Failed to create roof measurement.");

    if (Array.isArray(body.polygons) && body.polygons.length > 0) {
      await supabase.from("roof_measurement_polygons").insert(
        body.polygons.map((polygon, index) => ({
          measurement_id: data.id,
          rep_id: userId,
          polygon_index: Number.isFinite(Number(polygon.polygonIndex)) ? Number(polygon.polygonIndex) : index,
          points: polygon.points ?? [],
          area_sqft: Number(polygon.areaSqft ?? 0),
        })),
      );
    }

    if (Array.isArray(body.segments) && body.segments.length > 0) {
      await supabase.from("roof_measurement_segments").insert(
        body.segments.map((segment) => ({
          measurement_id: data.id,
          rep_id: userId,
          segment_type: segment.segmentType,
          points: segment.points ?? [],
          length_feet: Number(segment.lengthFeet ?? 0),
        })),
      );
    }

    return NextResponse.json({ measurement: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create roof measurement." }, { status: 500 });
  }
}
