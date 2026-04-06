"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { loadGoogleMaps } from "@/lib/google-maps";
import { managerLike } from "@/lib/knocking";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { JsonRecord } from "@/types/models";

type KnockEventRow = JsonRecord & {
  id: string;
  rep_id: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
  outcome?: string | null;
  homeowner_name?: string | null;
  contingencies_delta?: number | null;
  linked_job_id?: string | null;
};

type DoorPin = {
  address: string;
  lat: number | null;
  lng: number | null;
  knocks: number;
  lastKnockedAt: string | null;
  lastOutcome: string | null;
  lastHomeownerName: string | null;
  repCount: number;
};

type JobStageRow = {
  id: string;
  stage_id: number | null;
};

type DoorPinAggregate = DoorPin & {
  repIds: Set<string>;
  linkedJobIds: Set<string>;
  hasContingencyEvent: boolean;
};

const CONTINGENCY_STAGE_ID = 2;

function normalizeAddress(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await worker(items[currentIndex]);
      }
    }),
  );
}

async function geocodeAddress(address: string, apiKey: string) {
  if (!apiKey.trim()) return null;

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(
      apiKey,
    )}`,
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      geometry?: {
        location?: {
          lat?: number;
          lng?: number;
        };
      };
    }>;
  };

  if (payload.status !== "OK") return null;

  const location = payload.results?.[0]?.geometry?.location;
  if (!location) return null;

  const lat = toNumber(location.lat);
  const lng = toNumber(location.lng);
  if (lat === null || lng === null) return null;

  return { lat, lng };
}

export default function KnockingDoorsPage() {
  const router = useRouter();
  const { user, loading, role, signOut, accessToken, error: authError } = useAuthSession();
  const supabase = getSupabaseBrowserClient();

  const [pins, setPins] = useState<DoorPin[]>([]);
  const [loadingPins, setLoadingPins] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const geocodeCacheRef = useRef<Map<string, { lat: number; lng: number } | null>>(new Map());

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const managerView = managerLike(role);

  const locatedPins = useMemo(
    () => pins.filter((pin) => pin.lat !== null && pin.lng !== null),
    [pins],
  );

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/knocking/doors");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadPins = async () => {
      setLoadingPins(true);
      setDataError(null);

      const { data, error: queryError } = await supabase
        .from("knock_events")
        .select(
          "id,rep_id,address,latitude,longitude,created_at,outcome,homeowner_name,contingencies_delta,linked_job_id",
        )
        .not("address", "is", null)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (!active) return;

      if (queryError) {
        setDataError(queryError.message);
        setPins([]);
        setLoadingPins(false);
        return;
      }

      const grouped = new Map<string, DoorPinAggregate>();

      ((data ?? []) as KnockEventRow[]).forEach((row) => {
        const address = typeof row.address === "string" ? row.address.trim() : "";
        if (!address) return;

        const key = normalizeAddress(address);
        if (!key) return;

        const lat = toNumber(row.latitude);
        const lng = toNumber(row.longitude);
        const contingenciesDelta = Number(row.contingencies_delta ?? 0);
        const linkedJobId = toNonEmptyString(row.linked_job_id);

        const existing = grouped.get(key);
        if (!existing) {
          grouped.set(key, {
            address,
            lat,
            lng,
            knocks: 1,
            lastKnockedAt: typeof row.created_at === "string" ? row.created_at : null,
            lastOutcome: typeof row.outcome === "string" ? row.outcome : null,
            lastHomeownerName: typeof row.homeowner_name === "string" ? row.homeowner_name : null,
            repCount: 1,
            repIds: new Set([String(row.rep_id)]),
            linkedJobIds: linkedJobId ? new Set([linkedJobId]) : new Set<string>(),
            hasContingencyEvent: contingenciesDelta > 0,
          });
          return;
        }

        existing.knocks += 1;
        if (existing.lat === null && lat !== null) existing.lat = lat;
        if (existing.lng === null && lng !== null) existing.lng = lng;
        if (!existing.lastKnockedAt && typeof row.created_at === "string") {
          existing.lastKnockedAt = row.created_at;
        }
        if (!existing.lastOutcome && typeof row.outcome === "string") {
          existing.lastOutcome = row.outcome;
        }
        if (!existing.lastHomeownerName && typeof row.homeowner_name === "string") {
          existing.lastHomeownerName = row.homeowner_name;
        }

        existing.repIds.add(String(row.rep_id));
        existing.repCount = existing.repIds.size;
        if (linkedJobId) {
          existing.linkedJobIds.add(linkedJobId);
        }
        if (contingenciesDelta > 0) {
          existing.hasContingencyEvent = true;
        }
      });

      let contingencyJobIds = new Set<string>();
      const allLinkedJobIds = Array.from(
        new Set(
          Array.from(grouped.values()).flatMap((item) => Array.from(item.linkedJobIds)),
        ),
      );

      if (allLinkedJobIds.length > 0) {
        try {
          const rows: JobStageRow[] = [];
          for (const idsChunk of chunkArray(allLinkedJobIds, 200)) {
            const { data: jobsData, error: jobsError } = await supabase
              .from("jobs")
              .select("id,stage_id")
              .in("id", idsChunk);

            if (jobsError) {
              throw jobsError;
            }

            rows.push(...((jobsData ?? []) as JobStageRow[]));
          }

          contingencyJobIds = new Set(
            rows
              .filter((row) => Number(row.stage_id) === CONTINGENCY_STAGE_ID)
              .map((row) => row.id),
          );
        } catch (jobsLookupError) {
          console.warn(
            "Knocked doors map: could not apply job-stage contingency filter.",
            jobsLookupError,
          );
        }
      }

      const merged = Array.from(grouped.values())
        .filter((item) => {
          if (item.hasContingencyEvent) return false;
          for (const linkedJobId of item.linkedJobIds) {
            if (contingencyJobIds.has(linkedJobId)) return false;
          }
          return true;
        })
        .map(({ repIds: _repIds, linkedJobIds: _linkedJobIds, hasContingencyEvent: _hasContingencyEvent, ...rest }) => rest);

      // Fill missing coordinates from geocoding so every address can pin if possible.
      const missingCoords = merged
        .filter((item) => item.lat === null || item.lng === null)
        .slice(0, 160);

      await forEachWithConcurrency(missingCoords, 6, async (item) => {
          const key = normalizeAddress(item.address);

          if (geocodeCacheRef.current.has(key)) {
            const cached = geocodeCacheRef.current.get(key) ?? null;
            if (cached) {
              item.lat = cached.lat;
              item.lng = cached.lng;
            }
            return;
          }

          const coords = await geocodeAddress(item.address, googleKey);
          geocodeCacheRef.current.set(key, coords);

          if (coords) {
            item.lat = coords.lat;
            item.lng = coords.lng;
          }
      });

      setPins(merged);
      setLoadingPins(false);
    };

    void loadPins();

    return () => {
      active = false;
    };
  }, [googleKey, supabase, user]);

  useEffect(() => {
    if (!user) return;
    if (!mapNodeRef.current) return;
    let active = true;

    const waitForMapNodeSize = async (node: HTMLDivElement) => {
      const deadline = Date.now() + 3000;
      while (active && Date.now() < deadline) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }
      return false;
    };

    const initMap = async () => {
      try {
        const maps = await loadGoogleMaps(googleKey);
        if (!active || !mapNodeRef.current) return;

        const hasSize = await waitForMapNodeSize(mapNodeRef.current);
        if (!active || !mapNodeRef.current) return;
        if (!hasSize) {
          throw new Error("Map container has zero size. Refresh and try again.");
        }

        const map = new maps.Map(mapNodeRef.current, {
          center: { lat: 39.8283, lng: -98.5795 },
          zoom: 4,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });

        mapRef.current = map;
        window.requestAnimationFrame(() => {
          maps.event.trigger(map, "resize");
        });
        setMapReady(true);
      } catch (mapError) {
        if (active) {
          setMapError(mapError instanceof Error ? mapError.message : "Could not load map.");
        }
      }
    };

    void initMap();

    return () => {
      active = false;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.clear();
    };
  }, [googleKey, user]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const maps = (window as Window & { google?: { maps?: any } }).google?.maps;
    if (!maps) return;

    const nextIds = new Set(locatedPins.map((pin) => normalizeAddress(pin.address)));

    markersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });

    locatedPins.forEach((pin) => {
      if (pin.lat === null || pin.lng === null) return;

      const id = normalizeAddress(pin.address);
      const position = { lat: pin.lat, lng: pin.lng };

      const existing = markersRef.current.get(id);
      if (existing) {
        existing.setPosition(position);
        return;
      }

      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title: pin.address,
      });

      const info = new maps.InfoWindow({
        content: `
          <div style="font-family: system-ui; min-width: 220px;">
            <strong>${pin.address}</strong><br/>
            <span>Knocks: ${pin.knocks}</span><br/>
            <span>Last: ${formatDateTime(pin.lastKnockedAt)}</span><br/>
            <span>Outcome: ${pin.lastOutcome ?? "-"}</span><br/>
            <span>Homeowner: ${pin.lastHomeownerName ?? "-"}</span>
          </div>
        `,
      });

      marker.addListener("click", () => info.open({ map: mapRef.current, anchor: marker }));
      markersRef.current.set(id, marker);
    });

    if (locatedPins.length > 0) {
      const bounds = new maps.LatLngBounds();
      locatedPins.forEach((pin) => {
        if (pin.lat !== null && pin.lng !== null) {
          bounds.extend({ lat: pin.lat, lng: pin.lng });
        }
      });
      mapRef.current.fitBounds(bounds, 64);
    }
  }, [locatedPins, mapReady]);

  if (loading) return <main className="layout">Loading session...</main>;
  if (!user) return <main className="layout">Redirecting to sign in...</main>;

  return (
    <AppShell role={role} onSignOut={signOut} debug={{ userId: user.id, role, accessToken, authError }}>
      <section className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Knocked Doors Map</h2>
          <p className="hint">
            {pins.length} addresses | {locatedPins.length} pinned
          </p>
        </div>
        <p className="hint">
          {managerView
            ? "Manager view: all doors knocked through the app."
            : "Rep view: only doors you knocked through the app."}
        </p>

        {loadingPins ? <p className="hint">Loading knocked doors...</p> : null}
        {!mapReady && !mapError ? <p className="hint">Initializing map...</p> : null}
        {mapError ? <p className="error">{mapError}</p> : null}
        {dataError ? <p className="error">{dataError}</p> : null}

        <div ref={mapNodeRef} className="live-map" />

        {pins.length > 0 ? (
          <div className="jobs" style={{ marginTop: 12 }}>
            {pins.slice(0, 12).map((pin) => (
              <article key={normalizeAddress(pin.address)} className="job-card">
                <div className="row">
                  <strong>{pin.address}</strong>
                  <span className="hint">{pin.knocks} knock(s)</span>
                </div>
                <p className="hint">Last knock: {formatDateTime(pin.lastKnockedAt)}</p>
              </article>
            ))}
            {pins.length > 12 ? <p className="hint">Showing first 12 of {pins.length} addresses.</p> : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
