// Building-footprint fetcher.
//
// Source: OpenStreetMap Overpass API. Public, free, returns building polygons
// near a lat/lng in real time. Coverage in populated TN is solid; rural new
// builds may not be mapped yet — caller MUST handle a null return as a silent
// fallback to the generic geometry.
//
// Plan originally specified Microsoft Global ML Building Footprints, but those
// are distributed as ~100MB tiles, infeasible for an on-demand serverless
// route. OSM is the practical equivalent.

import type { BuildingFootprint } from "@/types/inspection";

const OVERPASS_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

const SEARCH_RADIUS_M = 200;
const REQUEST_TIMEOUT_MS = 9000;
const MAX_POLYGON_VERTICES = 24;

type OverpassNode = { type: "node"; id: number; lat: number; lon: number };
type OverpassWay = {
  type: "way";
  id: number;
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};
type OverpassRelation = {
  type: "relation";
  id: number;
  members?: Array<{
    type: "way";
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
  tags?: Record<string, string>;
};
type OverpassResponse = { elements: Array<OverpassNode | OverpassWay | OverpassRelation> };

/**
 * Fetch the building polygon nearest a lat/lng. Returns null on miss / failure.
 */
export async function getBuildingFootprint(
  lat: number,
  lng: number,
): Promise<BuildingFootprint | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const query = `[out:json][timeout:8];(way["building"](around:${SEARCH_RADIUS_M},${lat},${lng});relation["building"](around:${SEARCH_RADIUS_M},${lat},${lng}););out geom;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, query, REQUEST_TIMEOUT_MS);
      if (!response.ok) continue;
      const data = (await response.json()) as OverpassResponse;
      const polygon = pickBestPolygon(data, lat, lng);
      if (!polygon) return null;
      return {
        polygon,
        centroid: polygonCentroid(polygon),
        source: "osm",
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      // try next endpoint
    }
  }
  return null;
}

async function fetchWithTimeout(endpoint: string, query: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // GET with explicit headers — POST with Node's default fetch headers gets
  // 406'd by some Overpass instances. GET + a real User-Agent is the safe path.
  const url = `${endpoint}?data=${encodeURIComponent(query)}`;
  try {
    return await Promise.race<Response>([
      fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "4e-field-app/1.0 (https://github.com/4elementsrenovations; contact: jacob@4elementsrenovations.com)",
        },
        signal: controller.signal,
        cache: "no-store",
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error(`fetch-timeout:${endpoint}`)), timeoutMs + 200),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pick the polygon containing the point if any, otherwise the nearest one.
 * Discards polygons whose nearest edge is > SEARCH_RADIUS_M from the point.
 */
function pickBestPolygon(
  data: OverpassResponse,
  lat: number,
  lng: number,
): Array<[number, number]> | null {
  const polygons: Array<Array<[number, number]>> = [];

  for (const el of data.elements ?? []) {
    if (el.type === "way" && el.geometry && el.geometry.length >= 4) {
      polygons.push(el.geometry.map((p) => [p.lon, p.lat] as [number, number]));
    } else if (el.type === "relation" && el.members) {
      const outer = el.members.find((m) => m.role === "outer" && m.geometry && m.geometry.length >= 4);
      if (outer?.geometry) {
        polygons.push(outer.geometry.map((p) => [p.lon, p.lat] as [number, number]));
      }
    }
  }

  if (polygons.length === 0) return null;

  let best: Array<[number, number]> | null = null;
  let bestDist = Infinity;

  for (const poly of polygons) {
    if (pointInPolygon(lng, lat, poly)) {
      best = poly;
      bestDist = 0;
      break;
    }
    const d = distanceToPolygonMeters(lat, lng, poly);
    if (d < bestDist) {
      bestDist = d;
      best = poly;
    }
  }

  if (!best || bestDist > SEARCH_RADIUS_M) return null;
  return simplifyPolygon(closeRing(best));
}

function closeRing(poly: Array<[number, number]>): Array<[number, number]> {
  if (poly.length < 3) return poly;
  const first = poly[0];
  const last = poly[poly.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return poly;
  return [...poly, [first[0], first[1]]];
}

/**
 * Crude even-odd ray cast in lon/lat space — fine at building scale.
 */
function pointInPolygon(x: number, y: number, poly: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToPolygonMeters(lat: number, lng: number, poly: Array<[number, number]>) {
  let min = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const [aLng, aLat] = poly[i];
    const [bLng, bLat] = poly[i + 1];
    const d = pointToSegmentMeters(lat, lng, aLat, aLng, bLat, bLng);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Distance from (pLat, pLng) to segment (aLat,aLng)–(bLat,bLng), in meters.
 * Uses an equirectangular approximation — accurate within ~1m at building scale.
 */
function pointToSegmentMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
) {
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const mPerDegLat = 111_111;
  const mPerDegLng = 111_111 * cosLat;

  const ax = (aLng - pLng) * mPerDegLng;
  const ay = (aLat - pLat) * mPerDegLat;
  const bx = (bLng - pLng) * mPerDegLng;
  const by = (bLat - pLat) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(ax, ay);

  let t = -(ax * dx + ay * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(cx, cy);
}

function polygonCentroid(poly: Array<[number, number]>): [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-12) {
    // Degenerate — return mean of points.
    let sx = 0;
    let sy = 0;
    for (const [x, y] of poly) {
      sx += x;
      sy += y;
    }
    return [sx / poly.length, sy / poly.length];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

/**
 * If the polygon has more than MAX_POLYGON_VERTICES vertices, simplify to its
 * minimum-area bounding rectangle. Keeps the visual silhouette honest without
 * making three.js choke on a 200-vertex extrusion.
 */
function simplifyPolygon(poly: Array<[number, number]>): Array<[number, number]> {
  if (poly.length <= MAX_POLYGON_VERTICES) return poly;
  return minAreaBoundingRect(poly);
}

function minAreaBoundingRect(poly: Array<[number, number]>): Array<[number, number]> {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of poly) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}
