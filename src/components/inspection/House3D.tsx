"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, PresentationControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { BuildingFootprint, HubSectionKey } from "@/types/inspection";
import { useThemeIsLight } from "@/lib/use-webgl-support";
import HouseScene from "@/lib/three/HouseScene";
import { paletteForTheme } from "@/lib/three/theme-palette";
import { HouseControlsCtx, SECTION_ANGLES } from "@/lib/three/useHouseControls";
import { footprintToHouseGeometry } from "@/lib/footprint/footprint-to-mesh";
import type { HotspotInfo } from "./StructureHotspot";
import ImageryBadge from "./ImageryBadge";

type ImageryStatus = "idle" | "loading" | "ready" | "partial" | "failed";

type Props = {
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  onAddDetached?: () => void;
  suggestedNext?: HubSectionKey | null;
  labelsVisible?: boolean;
  imageryStatus?: ImageryStatus;
  satelliteUrl?: string | null;
  streetViewUrl?: string | null;
  /** Homeowner address (preferred input — geocoded server-side). */
  address?: string | null;
  /** Rep GPS — fallback when address isn't known. */
  lat?: number | null;
  lng?: number | null;
  /** Pre-cached footprint from inspection metadata — skips re-fetch when present. */
  cachedFootprint?: BuildingFootprint | null;
  /** Called when a fresh footprint is fetched, so the parent can persist it. */
  onFootprintFetched?: (footprint: BuildingFootprint | null) => void;
};

function useRemoteTexture(url: string | null | undefined): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    let created: THREE.Texture | null = null;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (tex) => {
        if (cancelled) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        created = tex;
        setTexture(tex);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      },
    );
    return () => {
      cancelled = true;
      if (created) created.dispose();
    };
  }, [url]);

  return texture;
}

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1.6;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function getInitialCamera(): { position: [number, number, number]; fov: number } {
  if (typeof window === "undefined") return { position: [15, 11, 15], fov: 36 };
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  return isMobile
    ? { position: [16, 12, 16], fov: 38 }
    : { position: [13, 10, 13], fov: 32 };
}

export default function House3D({
  hotspots,
  onTap,
  onAddDetached,
  suggestedNext,
  labelsVisible = true,
  imageryStatus = "idle",
  satelliteUrl,
  streetViewUrl,
  address,
  lat,
  lng,
  cachedFootprint,
  onFootprintFetched,
}: Props) {
  const isLight = useThemeIsLight();
  const palette = useMemo(() => paletteForTheme(isLight), [isLight]);
  const initialCamera = useMemo(() => getInitialCamera(), []);

  const satelliteTexture = useRemoteTexture(satelliteUrl);
  const streetViewTexture = useRemoteTexture(streetViewUrl);

  // Footprint state — start with the cached one if present, otherwise fetch.
  const [footprint, setFootprint] = useState<BuildingFootprint | null>(cachedFootprint ?? null);
  const fetchedKeyRef = useRef<string | null>(null);

  // Hold the latest onFootprintFetched in a ref so the effect doesn't re-run
  // (and tear down the in-flight fetch) every time the parent re-renders.
  const onFootprintFetchedRef = useRef(onFootprintFetched);
  useEffect(() => {
    onFootprintFetchedRef.current = onFootprintFetched;
  }, [onFootprintFetched]);

  useEffect(() => {
    if (cachedFootprint) {
      setFootprint(cachedFootprint);
      return;
    }

    const trimmedAddress = (address ?? "").trim();
    const hasAddress = trimmedAddress.length > 0;
    const hasCoords =
      typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);

    if (!hasAddress && !hasCoords) return;

    // Key the fetch by address (or coords) so switching inspections re-fires.
    const key = hasAddress
      ? `addr:${trimmedAddress}`
      : `gps:${(lat as number).toFixed(6)},${(lng as number).toFixed(6)}`;
    if (fetchedKeyRef.current === key) return;
    fetchedKeyRef.current = key;

    // Hard client-side timeout — never let the fetch hang forever.
    const controller = new AbortController();
    const hardTimeout = setTimeout(() => controller.abort(), 12000);

    (async () => {
      try {
        const payload: Record<string, unknown> = {};
        if (hasAddress) payload.address = trimmedAddress;
        if (hasCoords) {
          payload.lat = lat;
          payload.lng = lng;
        }
        const res = await fetch("/api/footprint", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(hardTimeout);
        if (!res.ok) return;
        const data = (await res.json()) as { footprint: BuildingFootprint | null };
        if (data.footprint) setFootprint(data.footprint);
        onFootprintFetchedRef.current?.(data.footprint);
      } catch {
        clearTimeout(hardTimeout);
        // Silent fallback to generic geometry.
      }
    })();
    // No cleanup — fetch is allowed to outlive parent re-renders.
  }, [address, lat, lng, cachedFootprint]);

  const footprintGeometry = useMemo(
    () => (footprint ? footprintToHouseGeometry(footprint) : null),
    [footprint],
  );

  const groupRef = useRef<THREE.Group | null>(null);
  const targetYRef = useRef<number | null>(null);
  const lastInteractionRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : 0);

  const requestSnap = useCallback((key: HubSectionKey) => {
    const angle = SECTION_ANGLES[key];
    if (typeof angle === "number") targetYRef.current = angle;
    lastInteractionRef.current = typeof performance !== "undefined" ? performance.now() : 0;
  }, []);

  const noteInteraction = useCallback(() => {
    targetYRef.current = null;
    lastInteractionRef.current = typeof performance !== "undefined" ? performance.now() : 0;
  }, []);

  const ctxValue = useMemo(
    () => ({ groupRef, targetYRef, lastInteractionRef, requestSnap, noteInteraction }),
    [requestSnap, noteInteraction],
  );

  const [zoomScale, setZoomScale] = useState(1);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      try { e.preventDefault(); } catch {/* passive listener — ignore */}
    }
    setZoomScale((s) => clamp(s - e.deltaY * 0.0008, ZOOM_MIN, ZOOM_MAX));
    noteInteraction();
  }, [noteInteraction]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchStartRef.current = { distance: Math.hypot(dx, dy), zoom: zoomScale };
    }
  }, [zoomScale]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartRef.current.distance;
      setZoomScale(clamp(pinchStartRef.current.zoom * ratio, ZOOM_MIN, ZOOM_MAX));
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
  }, []);

  // Watch viewport changes — if user rotates phone, recompute camera; PresentationControls
  // isn't re-mounted but the Canvas camera is set once at mount. We accept the initial value.
  useEffect(() => {
    return () => {
      pointersRef.current.clear();
      pinchStartRef.current = null;
    };
  }, []);

  const stepZoom = useCallback((delta: number) => {
    setZoomScale((s) => clamp(s + delta, ZOOM_MIN, ZOOM_MAX));
    noteInteraction();
  }, [noteInteraction]);

  return (
    <div className="hub-house-wrap h3d-canvas-wrap">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: initialCamera.position, fov: initialCamera.fov }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        shadows={false}
        style={{ width: "100%", height: "100%", borderRadius: 12 }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[8, 12, 6]} intensity={0.9} color="#fff5e0" />
        <Suspense fallback={null}>
          {isLight ? (
            <Sky sunPosition={[8, 4, 6]} turbidity={6} rayleigh={2} />
          ) : (
            <color attach="background" args={[palette.bg]} />
          )}
          <Environment preset={isLight ? "city" : "sunset"} background={false} />
          <HouseControlsCtx.Provider value={ctxValue}>
            <PresentationControls
              global
              cursor
              snap
              speed={1.4}
              polar={[-0.15, 0.5]}
              azimuth={[-Infinity, Infinity]}
              config={{ mass: 1, tension: 170, friction: 26 }}
            >
              <group scale={zoomScale}>
                <HouseScene
                  hotspots={hotspots}
                  onTap={onTap}
                  suggestedNext={suggestedNext}
                  palette={palette}
                  labelsVisible={labelsVisible}
                  satelliteTexture={satelliteTexture}
                  streetViewTexture={streetViewTexture}
                  footprintGeometry={footprintGeometry}
                />
              </group>
            </PresentationControls>
          </HouseControlsCtx.Provider>
        </Suspense>
        <ContactShadows position={[0, 0.01, 0]} opacity={0.55} blur={2.0} far={15} scale={20} resolution={512} />
      </Canvas>

      <ImageryBadge status={imageryStatus} />

      <div className="h3d-zoom-controls" aria-label="Zoom controls">
        <button type="button" className="h3d-zoom-btn" onClick={() => stepZoom(0.1)} aria-label="Zoom in">+</button>
        <button type="button" className="h3d-zoom-btn" onClick={() => stepZoom(-0.1)} aria-label="Zoom out">−</button>
        <button
          type="button"
          className="h3d-zoom-btn h3d-zoom-btn--reset"
          onClick={() => { setZoomScale(1); targetYRef.current = 0; }}
          aria-label="Reset view"
        >
          ⟳
        </button>
      </div>

      <button
        type="button"
        className="hub-detached-btn"
        onClick={onAddDetached}
        aria-label="Add detached building"
      >
        + Detached
      </button>
    </div>
  );
}
