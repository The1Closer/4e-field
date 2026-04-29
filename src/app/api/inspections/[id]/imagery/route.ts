export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";
import { fetchPropertyImagery, geocodeAddress } from "@/lib/imagery/google-imagery";
import {
  hashAddress,
  type ImageryAssetRecord,
  type ImageryRecord,
} from "@/lib/imagery/types";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 1 week — refreshed on every read

async function getInspectionId(context: RouteContext) {
  const resolved = await context.params;
  return resolved.id;
}

function nowIso() {
  return new Date().toISOString();
}

function expiryIsoFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function refreshSignedUrl(
  supabase: ReturnType<typeof getRouteSupabaseClient>,
  asset: ImageryAssetRecord | null,
): Promise<ImageryAssetRecord | null> {
  if (!asset) return null;
  // If the existing URL is still valid for at least 10 minutes, keep it.
  const expiresAt = asset.expiresAt ? Date.parse(asset.expiresAt) : 0;
  if (expiresAt - Date.now() > 10 * 60 * 1000 && asset.signedUrl) return asset;
  const fresh = await supabase.storage
    .from("inspection-media")
    .createSignedUrl(asset.path, SIGNED_URL_TTL_SECONDS);
  if (fresh.error || !fresh.data?.signedUrl) return asset;
  return {
    ...asset,
    signedUrl: fresh.data.signedUrl,
    expiresAt: expiryIsoFromNow(SIGNED_URL_TTL_SECONDS),
  };
}

async function loadInspectionMetadata(
  supabase: ReturnType<typeof getRouteSupabaseClient>,
  inspectionId: string,
  userId: string,
): Promise<{ metadata: Record<string, unknown> } | null> {
  const { data, error } = await supabase
    .from("inspections")
    .select("metadata")
    .eq("id", inspectionId)
    .eq("rep_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  return { metadata: meta };
}

async function persistImagery(
  supabase: ReturnType<typeof getRouteSupabaseClient>,
  inspectionId: string,
  userId: string,
  imagery: ImageryRecord,
) {
  const existing = await loadInspectionMetadata(supabase, inspectionId, userId);
  const nextMeta = {
    ...(existing?.metadata ?? {}),
    imagery,
  };
  await supabase
    .from("inspections")
    .update({ metadata: nextMeta })
    .eq("id", inspectionId)
    .eq("rep_id", userId);
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const inspectionId = await getInspectionId(context);
    const supabase = getRouteSupabaseClient(request);
    const loaded = await loadInspectionMetadata(supabase, inspectionId, userId);
    if (!loaded) return NextResponse.json({ imagery: null });
    const cached = (loaded.metadata.imagery as ImageryRecord | undefined) ?? null;
    if (!cached) return NextResponse.json({ imagery: null });

    // Refresh signed URLs lazily so the cached imagery stays usable indefinitely.
    const satellite = await refreshSignedUrl(supabase, cached.satellite);
    const streetView = cached.streetView
      ? ((await refreshSignedUrl(supabase, cached.streetView)) as ImageryRecord["streetView"])
      : null;

    let needsWriteback = false;
    if (satellite && satellite.signedUrl !== cached.satellite?.signedUrl) needsWriteback = true;
    if (streetView && streetView.signedUrl !== cached.streetView?.signedUrl) needsWriteback = true;

    const refreshed: ImageryRecord = {
      ...cached,
      satellite: satellite ?? null,
      streetView: streetView ?? null,
    };

    if (needsWriteback) {
      await persistImagery(supabase, inspectionId, userId, refreshed);
    }

    return NextResponse.json({ imagery: refreshed });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      route: "/api/inspections/[id]/imagery GET",
      message: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ imagery: null, error: "Failed to load imagery." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const inspectionId = await getInspectionId(context).catch(() => null);
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!inspectionId) return NextResponse.json({ error: "Missing inspection id" }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      address?: string;
      lat?: number | null;
      lng?: number | null;
      forceRefresh?: boolean;
    };
    const address = (body.address ?? "").trim();
    const supabase = getRouteSupabaseClient(request);

    // Resolve target lat/lng. Prefer client-supplied coords (fresh GPS).
    let target: { lat: number; lng: number } | null = null;
    if (typeof body.lat === "number" && typeof body.lng === "number" && Number.isFinite(body.lat) && Number.isFinite(body.lng)) {
      target = { lat: body.lat, lng: body.lng };
    } else if (address) {
      target = await geocodeAddress(address);
    }

    if (!target) {
      const failed: ImageryRecord = {
        status: "failed",
        addressHash: hashAddress(address, body.lat ?? null, body.lng ?? null),
        fetchedAt: nowIso(),
        lat: null,
        lng: null,
        satellite: null,
        streetView: null,
        error: "Could not resolve address or coordinates.",
      };
      await persistImagery(supabase, inspectionId, userId, failed);
      return NextResponse.json({ imagery: failed }, { status: 200 });
    }

    // Fetch satellite + street view in parallel.
    const fetched = await fetchPropertyImagery(target);

    let satelliteAsset: ImageryAssetRecord | null = null;
    let streetViewAsset:
      | (ImageryAssetRecord & { heading: number; panoLat: number; panoLng: number })
      | null = null;

    if (fetched.satellite) {
      const path = `${userId}/imagery/${inspectionId}/satellite-${Date.now()}.jpg`;
      const upload = await supabase.storage
        .from("inspection-media")
        .upload(path, fetched.satellite.bytes, {
          contentType: "image/jpeg",
          upsert: true,
          cacheControl: "604800",
        });
      if (!upload.error) {
        const signed = await supabase.storage
          .from("inspection-media")
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (signed.data?.signedUrl) {
          satelliteAsset = {
            path,
            signedUrl: signed.data.signedUrl,
            expiresAt: expiryIsoFromNow(SIGNED_URL_TTL_SECONDS),
            width: fetched.satellite.width,
            height: fetched.satellite.height,
          };
        }
      }
    }

    if (fetched.streetView) {
      const path = `${userId}/imagery/${inspectionId}/streetview-${Date.now()}.jpg`;
      const upload = await supabase.storage
        .from("inspection-media")
        .upload(path, fetched.streetView.bytes, {
          contentType: "image/jpeg",
          upsert: true,
          cacheControl: "604800",
        });
      if (!upload.error) {
        const signed = await supabase.storage
          .from("inspection-media")
          .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (signed.data?.signedUrl) {
          streetViewAsset = {
            path,
            signedUrl: signed.data.signedUrl,
            expiresAt: expiryIsoFromNow(SIGNED_URL_TTL_SECONDS),
            width: fetched.streetView.width,
            height: fetched.streetView.height,
            heading: fetched.streetView.heading,
            panoLat: fetched.streetView.panoLat,
            panoLng: fetched.streetView.panoLng,
          };
        }
      }
    }

    const status: ImageryRecord["status"] = satelliteAsset && streetViewAsset
      ? "ready"
      : satelliteAsset || streetViewAsset
        ? "partial"
        : "failed";

    const imagery: ImageryRecord = {
      status,
      addressHash: hashAddress(address, target.lat, target.lng),
      fetchedAt: nowIso(),
      lat: target.lat,
      lng: target.lng,
      satellite: satelliteAsset,
      streetView: streetViewAsset,
    };

    await persistImagery(supabase, inspectionId, userId, imagery);

    return NextResponse.json({ imagery }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch imagery.";
    console.error(JSON.stringify({
      level: "error",
      route: "/api/inspections/[id]/imagery POST",
      inspectionId,
      message,
    }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
