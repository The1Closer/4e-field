// Server-side Google Maps imagery fetchers. Lives in lib/ so it's never
// bundled to the browser (no "use client" + only invoked by the API route).

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
const STREET_VIEW_META_URL = "https://maps.googleapis.com/maps/api/streetview/metadata";
const STREET_VIEW_URL = "https://maps.googleapis.com/maps/api/streetview";

// Allow either a server-only key (preferred for Cloud-side restrictions) or
// fall back to the public key. The endpoints accept either.
function getKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(timer) };
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = getKey();
  if (!key || !address.trim()) return null;
  const { signal, cancel } = withTimeout(8000);
  try {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(address)}&key=${key}`;
    const res = await fetch(url, { signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    if (json.status !== "OK") return null;
    const loc = json.results?.[0]?.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

export async function fetchSatelliteTile(opts: {
  lat: number;
  lng: number;
  zoom?: number;
}): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const key = getKey();
  if (!key) return null;
  const zoom = opts.zoom ?? 20;
  // 640×640 with scale=2 returns 1280×1280 — looks great as a ground texture.
  const params = new URLSearchParams({
    center: `${opts.lat},${opts.lng}`,
    zoom: String(zoom),
    size: "640x640",
    scale: "2",
    maptype: "satellite",
    format: "jpg",
    key,
  });
  const { signal, cancel } = withTimeout(15000);
  try {
    const res = await fetch(`${STATIC_MAP_URL}?${params.toString()}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 512) return null; // tiny response = error PNG
    return { bytes: buf, width: 1280, height: 1280 };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

// Initial-bearing from p1 to p2 in degrees (0–360, 0=north).
function bearingDegrees(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(p1.lat);
  const φ2 = toRad(p2.lat);
  const λ1 = toRad(p1.lng);
  const λ2 = toRad(p2.lng);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

export async function fetchStreetViewMetadata(opts: {
  lat: number;
  lng: number;
  radius?: number;
}): Promise<{ panoId: string; panoLat: number; panoLng: number } | null> {
  const key = getKey();
  if (!key) return null;
  const params = new URLSearchParams({
    location: `${opts.lat},${opts.lng}`,
    radius: String(opts.radius ?? 80),
    source: "outdoor",
    key,
  });
  const { signal, cancel } = withTimeout(8000);
  try {
    const res = await fetch(`${STREET_VIEW_META_URL}?${params.toString()}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: string;
      pano_id?: string;
      location?: { lat: number; lng: number };
    };
    if (json.status !== "OK" || !json.location || !json.pano_id) return null;
    return { panoId: json.pano_id, panoLat: json.location.lat, panoLng: json.location.lng };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

export async function fetchStreetViewImage(opts: {
  panoId?: string;
  lat: number;
  lng: number;
  heading: number;
  fov?: number;
  pitch?: number;
}): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  const key = getKey();
  if (!key) return null;
  // 640×256 ≈ 2.5:1 — matches the procedural front-wall aspect (9.6:3.8).
  const params = new URLSearchParams({
    size: "640x256",
    heading: String(Math.round(opts.heading)),
    fov: String(opts.fov ?? 80),
    pitch: String(opts.pitch ?? 6),
    source: "outdoor",
    return_error_code: "true",
    key,
  });
  if (opts.panoId) params.set("pano", opts.panoId);
  else params.set("location", `${opts.lat},${opts.lng}`);
  const { signal, cancel } = withTimeout(15000);
  try {
    const res = await fetch(`${STREET_VIEW_URL}?${params.toString()}`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 512) return null;
    return { bytes: buf, width: 1280, height: 512 }; // 2× implicit via Google's high-DPI returns
  } catch {
    return null;
  } finally {
    cancel();
  }
}

// Top-level orchestrator: given a target lat/lng, return both texture buffers.
// Each piece can independently succeed or fail — caller handles "partial" status.
export async function fetchPropertyImagery(target: {
  lat: number;
  lng: number;
}): Promise<{
  satellite: { bytes: Uint8Array; width: number; height: number } | null;
  streetView:
    | { bytes: Uint8Array; width: number; height: number; heading: number; panoLat: number; panoLng: number }
    | null;
}> {
  const [satellite, panoMeta] = await Promise.all([
    fetchSatelliteTile({ lat: target.lat, lng: target.lng }),
    fetchStreetViewMetadata({ lat: target.lat, lng: target.lng, radius: 80 }),
  ]);

  let streetView:
    | { bytes: Uint8Array; width: number; height: number; heading: number; panoLat: number; panoLng: number }
    | null = null;
  if (panoMeta) {
    const heading = bearingDegrees({ lat: panoMeta.panoLat, lng: panoMeta.panoLng }, target);
    const img = await fetchStreetViewImage({
      panoId: panoMeta.panoId,
      lat: target.lat,
      lng: target.lng,
      heading,
    });
    if (img) {
      streetView = {
        bytes: img.bytes,
        width: img.width,
        height: img.height,
        heading,
        panoLat: panoMeta.panoLat,
        panoLng: panoMeta.panoLng,
      };
    }
  }

  return { satellite, streetView };
}
