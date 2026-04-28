"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, PresentationControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { DetachedBuildingLabel, HubSectionKey } from "@/types/inspection";
import { useThemeIsLight } from "@/lib/use-webgl-support";
import OutbuildingScene from "@/lib/three/OutbuildingScene";
import { paletteForTheme } from "@/lib/three/theme-palette";
import { HouseControlsCtx, SECTION_ANGLES } from "@/lib/three/useHouseControls";
import type { HotspotInfo } from "./StructureHotspot";

type Props = {
  variant: DetachedBuildingLabel;
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  suggestedNext?: HubSectionKey | null;
  labelsVisible?: boolean;
};

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1.6;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function getInitialCamera(): { position: [number, number, number]; fov: number } {
  if (typeof window === "undefined") return { position: [12, 9, 12], fov: 38 };
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  return isMobile
    ? { position: [13, 10, 13], fov: 38 }
    : { position: [11, 8, 11], fov: 32 };
}

export default function Detached3D({ variant, hotspots, onTap, suggestedNext, labelsVisible = true }: Props) {
  const isLight = useThemeIsLight();
  const palette = useMemo(() => paletteForTheme(isLight), [isLight]);
  const initialCamera = useMemo(() => getInitialCamera(), []);

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
        <directionalLight position={[6, 10, 5]} intensity={0.9} color="#fff5e0" />
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
                <OutbuildingScene
                  variant={variant}
                  hotspots={hotspots}
                  onTap={onTap}
                  suggestedNext={suggestedNext}
                  palette={palette}
                  labelsVisible={labelsVisible}
                />
              </group>
            </PresentationControls>
          </HouseControlsCtx.Provider>
        </Suspense>
        <ContactShadows position={[0, 0.01, 0]} opacity={0.55} blur={2.0} far={12} scale={16} resolution={512} />
      </Canvas>

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
    </div>
  );
}
