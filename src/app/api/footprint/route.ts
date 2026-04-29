export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/server-supabase";
import { getBuildingFootprint } from "@/lib/footprint/fetch";
import { geocodeAddress } from "@/lib/imagery/google-imagery";

export async function POST(request: NextRequest) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      address?: unknown;
      lat?: unknown;
      lng?: unknown;
    };

    const address = typeof body.address === "string" ? body.address.trim() : "";

    // Prefer address (specific to the homeowner's house), fall back to lat/lng
    // (the rep's current GPS — only useful when address isn't known yet).
    let resolvedLat: number | null = null;
    let resolvedLng: number | null = null;

    if (address.length > 0) {
      const geocoded = await geocodeAddress(address);
      if (geocoded) {
        resolvedLat = geocoded.lat;
        resolvedLng = geocoded.lng;
      }
    }

    if (resolvedLat === null) {
      const rawLat = typeof body.lat === "number" ? body.lat : Number(body.lat);
      const rawLng = typeof body.lng === "number" ? body.lng : Number(body.lng);
      if (Number.isFinite(rawLat) && Number.isFinite(rawLng)) {
        resolvedLat = rawLat;
        resolvedLng = rawLng;
      }
    }

    if (resolvedLat === null || resolvedLng === null) {
      return NextResponse.json({ error: "No usable address or coords" }, { status: 400 });
    }

    const footprint = await getBuildingFootprint(resolvedLat, resolvedLng);
    return NextResponse.json({ footprint }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Footprint lookup failed." },
      { status: 500 },
    );
  }
}
