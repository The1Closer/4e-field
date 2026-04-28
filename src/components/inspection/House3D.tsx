"use client";

import React, { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import type { HubSectionKey } from "@/types/inspection";
import { useThemeIsLight } from "@/lib/use-webgl-support";
import HouseScene from "@/lib/three/HouseScene";
import { paletteForTheme } from "@/lib/three/theme-palette";
import type { HotspotInfo } from "./StructureHotspot";

type Props = {
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  onAddDetached?: () => void;
  suggestedNext?: HubSectionKey | null;
};

export default function House3D({ hotspots, onTap, onAddDetached, suggestedNext }: Props) {
  const isLight = useThemeIsLight();
  const palette = useMemo(() => paletteForTheme(isLight), [isLight]);

  return (
    <div className="hub-house-wrap h3d-canvas-wrap">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [11, 9, 11], fov: 32 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        shadows={false}
        style={{ width: "100%", height: "100%", borderRadius: 12 }}
      >
        <color attach="background" args={[palette.bg]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[8, 12, 6]} intensity={0.95} color="#fff5e0" />
        <Suspense fallback={null}>
          <Environment preset="sunset" background={false} />
          <HouseScene hotspots={hotspots} onTap={onTap} suggestedNext={suggestedNext} palette={palette} />
        </Suspense>
        <ContactShadows position={[0, 0.01, 0]} opacity={0.35} blur={2.5} far={12} resolution={256} />
      </Canvas>

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
