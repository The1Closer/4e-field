"use client";

import React, { useMemo, useRef } from "react";
import { Edges, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DetachedBuildingLabel, HubSectionKey } from "@/types/inspection";
import type { HotspotInfo } from "@/components/inspection/StructureHotspot";
import { hotspotColor, hotspotEmissive, type ScenePalette } from "./theme-palette";
import { shortestAngleDiff, useHouseControls } from "./useHouseControls";
import { useLawnTexture, useShingleTexture, useStuccoTexture } from "./procedural-textures";

type HotspotMeshProps = {
  hkey: HubSectionKey;
  position: [number, number, number];
  size: [number, number, number];
  hotspot: HotspotInfo | undefined;
  palette: ScenePalette;
  suggested: boolean;
  onTap: (key: HubSectionKey) => void;
  showLabel?: boolean;
  labelsVisible?: boolean;
  showArrow?: boolean;
};

function Hotspot({
  hkey,
  position,
  size,
  hotspot,
  palette,
  suggested,
  onTap,
  showLabel = true,
  labelsVisible = true,
  showArrow = false,
}: HotspotMeshProps) {
  const [hovered, setHovered] = React.useState(false);
  const pulseRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const ctx = useHouseControls();

  useFrame((_state, delta) => {
    if (suggested && pulseRef.current) {
      pulseRef.current.scale.x += delta * 0.6;
      pulseRef.current.scale.y += delta * 0.6;
      pulseRef.current.scale.z += delta * 0.6;
      const m = pulseRef.current.material as THREE.MeshBasicMaterial;
      m.opacity -= delta * 0.5;
      if (m.opacity <= 0) {
        pulseRef.current.scale.set(1, 1, 1);
        m.opacity = 0.7;
      }
    }
    if (showArrow && arrowRef.current) {
      const t = (performance.now() / 300) % (Math.PI * 2);
      arrowRef.current.style.transform = `translateY(${Math.sin(t) * 4}px)`;
    }
  });

  if (!hotspot) return null;
  const color = hotspotColor(hotspot.state, palette);
  const emissive = hotspotEmissive(hotspot.state) + (hovered ? 0.2 : 0);
  const isComplete = hotspot.state === "complete" || hotspot.state === "override_complete";
  const baseOpacity =
    hotspot.state === "untouched" ? 0.18 : isComplete ? 0.12 : 0.32;

  return (
    <group position={position}>
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation();
          ctx?.noteInteraction();
        }}
        onClick={(e) => {
          e.stopPropagation();
          ctx?.requestSnap(hkey);
          window.setTimeout(() => onTap(hkey), 220);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          if (typeof document !== "undefined") document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          if (typeof document !== "undefined") document.body.style.cursor = "auto";
        }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissive}
          transparent
          opacity={baseOpacity}
          depthWrite={false}
        />
        <Edges threshold={15} color={color} />
      </mesh>
      {suggested ? (
        <mesh ref={pulseRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -size[1] / 2 - 0.01, 0]}>
          <ringGeometry args={[Math.max(size[0], size[2]) * 0.55, Math.max(size[0], size[2]) * 0.7, 32]} />
          <meshBasicMaterial color={palette.brandPulse} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      ) : null}
      {labelsVisible && isComplete ? (
        <Html center distanceFactor={9} position={[0, size[1] / 2 + 0.4, 0]} zIndexRange={[40, 30]}>
          <div
            style={{
              color: "#fff",
              background: palette.good,
              borderRadius: "50%",
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            ✓
          </div>
        </Html>
      ) : null}
      {labelsVisible && showLabel ? (
        <Html center distanceFactor={11} style={{ pointerEvents: "none" }} zIndexRange={[40, 30]}>
          <div
            style={{
              color,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.3,
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {hotspot.label}
          </div>
        </Html>
      ) : null}
      {labelsVisible && showArrow ? (
        <Html
          center
          distanceFactor={9}
          position={[0, size[1] / 2 + 0.9, 0]}
          style={{ pointerEvents: "none" }}
          zIndexRange={[40, 30]}
        >
          <div
            ref={arrowRef}
            style={{
              color: palette.brandPulse,
              fontSize: 20,
              fontWeight: 900,
              filter: `drop-shadow(0 1px 3px rgba(0,0,0,0.6))`,
              pointerEvents: "none",
              userSelect: "none",
              lineHeight: 1,
            }}
          >
            ▼
          </div>
        </Html>
      ) : null}
    </group>
  );
}

type Props = {
  variant: DetachedBuildingLabel;
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  suggestedNext?: HubSectionKey | null;
  palette: ScenePalette;
  labelsVisible?: boolean;
};

export default function OutbuildingScene({
  variant,
  hotspots,
  onTap,
  suggestedNext,
  palette,
  labelsVisible = true,
}: Props) {
  const fallbackRef = useRef<THREE.Group | null>(null);
  const ctx = useHouseControls();
  const root = ctx?.groupRef ?? fallbackRef;
  const get = (k: HubSectionKey) => hotspots.find((h) => h.key === k);

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) return;
    if (ctx) {
      if (ctx.targetYRef.current !== null) {
        const cur = group.rotation.y;
        const tgt = ctx.targetYRef.current;
        const diff = shortestAngleDiff(tgt, cur);
        if (Math.abs(diff) < 0.005) {
          group.rotation.y = tgt;
          ctx.targetYRef.current = null;
        } else {
          group.rotation.y = cur + diff * Math.min(1, delta * 6);
        }
      } else if (typeof performance !== "undefined" && performance.now() - ctx.lastInteractionRef.current > 4000) {
        group.rotation.y += delta * 0.012;
      }
    } else {
      group.rotation.y += delta * 0.05;
    }
  });

  const stucco = useStuccoTexture(palette.walls);
  const shingle = useShingleTexture(palette.roof, palette.roofAccent);
  const lawn = useLawnTexture(palette.ground);

  if (variant === "garage") {
    return (
      <group ref={root}>
        <Ground palette={palette} lawn={lawn} />
        {/* Walls */}
        <mesh position={[0, 1.7, 0]} castShadow>
          <boxGeometry args={[8.4, 3.4, 5]} />
          <meshStandardMaterial color={palette.walls} roughness={0.7} map={stucco ?? undefined} />
          <Edges threshold={20} color={palette.trim} />
        </mesh>
        <GableRoof palette={palette} shingle={shingle} y={3.4} halfWidth={4.4} halfDepth={2.7} apexY={1.4} />
        {/* Overhead garage door */}
        <mesh position={[-1.4, 1.6, 2.51]}>
          <boxGeometry args={[3.6, 3.0, 0.06]} />
          <meshStandardMaterial color={palette.windowFrame} roughness={0.5} />
        </mesh>
        {[-1.4, -0.7, 0, 0.7, 1.4].map((y) => (
          <mesh key={y} position={[-1.4, 1.6 + y * 0.3, 2.55]}>
            <boxGeometry args={[3.5, 0.04, 0.02]} />
            <meshStandardMaterial color={palette.trim} />
          </mesh>
        ))}
        {/* Side service door */}
        <mesh position={[2.5, 1.4, 2.51]}>
          <boxGeometry args={[1, 2.4, 0.06]} />
          <meshStandardMaterial color={palette.door} />
        </mesh>
        {/* Side window */}
        <mesh position={[2.5, 2.8, 2.55]}>
          <boxGeometry args={[0.9, 0.7, 0.04]} />
          <meshStandardMaterial color={palette.windowGlass} transparent opacity={0.7} />
        </mesh>
        {/* Driveway */}
        <mesh position={[-1.4, 0.005, 5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.6, 5]} />
          <meshStandardMaterial color={palette.sidewalk} />
        </mesh>

        <Hotspot
          hkey="roof"
          position={[0, 4.5, 0]}
          size={[8.6, 0.4, 5]}
          hotspot={get("roof")}
          palette={palette}
          suggested={suggestedNext === "roof"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "roof"}
        />
        <Hotspot
          hkey="gutters"
          position={[0, 3.4, 0]}
          size={[9, 0.16, 5.4]}
          hotspot={get("gutters")}
          palette={palette}
          suggested={suggestedNext === "gutters"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "gutters"}
        />
        {/* SIDING — left side wall plane */}
        <Hotspot
          hkey="siding"
          position={[-4.25, 1.7, 0]}
          size={[0.05, 3, 5]}
          hotspot={get("siding")}
          palette={palette}
          suggested={suggestedNext === "siding"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "siding"}
        />
        {/* SIDING — right side wall plane */}
        <Hotspot
          hkey="siding"
          position={[4.25, 1.7, 0]}
          size={[0.05, 3, 5]}
          hotspot={get("siding")}
          palette={palette}
          suggested={suggestedNext === "siding"}
          onTap={onTap}
          showLabel={false}
          labelsVisible={labelsVisible}
        />
        {/* WINDOWS — tight to side glass only */}
        <Hotspot
          hkey="windows"
          position={[2.5, 2.8, 2.58]}
          size={[0.95, 0.75, 0.04]}
          hotspot={get("windows")}
          palette={palette}
          suggested={suggestedNext === "windows"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "windows"}
        />
        <Hotspot
          hkey="interior"
          position={[-1.4, 1.6, 2.55]}
          size={[3.6, 3, 0.05]}
          hotspot={get("interior")}
          palette={palette}
          suggested={suggestedNext === "interior"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "interior"}
        />
        <Hotspot
          hkey="personal_property"
          position={[0, 1.6, -2.5]}
          size={[8, 3, 0.06]}
          hotspot={get("personal_property")}
          palette={palette}
          suggested={suggestedNext === "personal_property"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "personal_property"}
        />
        <Hotspot
          hkey="perimeter"
          position={[-1.4, 0.05, 5]}
          size={[3.6, 0.05, 5]}
          hotspot={get("perimeter")}
          palette={palette}
          suggested={suggestedNext === "perimeter"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "perimeter"}
        />
        <Hotspot
          hkey="exterior_collateral"
          position={[-4.5, 1, 2]}
          size={[1, 1.4, 1]}
          hotspot={get("exterior_collateral")}
          palette={palette}
          suggested={suggestedNext === "exterior_collateral"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "exterior_collateral"}
        />
      </group>
    );
  }

  if (variant === "barn") {
    return (
      <group ref={root}>
        <Ground palette={palette} lawn={lawn} />
        <mesh position={[0, 1.8, 0]} castShadow>
          <boxGeometry args={[7, 3.6, 4.6]} />
          <meshStandardMaterial color="#5a3a30" roughness={0.85} map={stucco ?? undefined} />
          <Edges threshold={20} color={palette.trim} />
        </mesh>
        <mesh position={[0, 4, 0]}>
          <boxGeometry args={[7.2, 0.05, 4.8]} />
          <meshStandardMaterial color="#4a2c20" />
        </mesh>
        <GambrelRoof palette={palette} shingle={shingle} />
        <mesh position={[0, 1.6, 2.31]}>
          <boxGeometry args={[2.6, 2.8, 0.06]} />
          <meshStandardMaterial color="#3a1f12" />
        </mesh>
        <mesh position={[0, 1.6, 2.34]}>
          <boxGeometry args={[0.04, 2.8, 0.02]} />
          <meshStandardMaterial color={palette.trim} />
        </mesh>
        <mesh position={[0, 5.4, 2.4]}>
          <boxGeometry args={[0.9, 0.8, 0.04]} />
          <meshStandardMaterial color={palette.windowGlass} transparent opacity={0.6} />
        </mesh>

        <Hotspot
          hkey="roof"
          position={[0, 5.2, 0]}
          size={[7.4, 0.4, 5]}
          hotspot={get("roof")}
          palette={palette}
          suggested={suggestedNext === "roof"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "roof"}
        />
        <Hotspot
          hkey="gutters"
          position={[0, 3.6, 0]}
          size={[7.6, 0.14, 5]}
          hotspot={get("gutters")}
          palette={palette}
          suggested={suggestedNext === "gutters"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "gutters"}
        />
        {/* SIDING — left side wall */}
        <Hotspot
          hkey="siding"
          position={[-3.55, 1.8, 0]}
          size={[0.05, 3.4, 4.6]}
          hotspot={get("siding")}
          palette={palette}
          suggested={suggestedNext === "siding"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "siding"}
        />
        {/* SIDING — right side wall */}
        <Hotspot
          hkey="siding"
          position={[3.55, 1.8, 0]}
          size={[0.05, 3.4, 4.6]}
          hotspot={get("siding")}
          palette={palette}
          suggested={suggestedNext === "siding"}
          onTap={onTap}
          showLabel={false}
          labelsVisible={labelsVisible}
        />
        {/* WINDOWS — hayloft glass */}
        <Hotspot
          hkey="windows"
          position={[0, 5.4, 2.42]}
          size={[1.0, 0.9, 0.04]}
          hotspot={get("windows")}
          palette={palette}
          suggested={suggestedNext === "windows"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "windows"}
        />
        <Hotspot
          hkey="interior"
          position={[0, 1.6, 2.4]}
          size={[2.7, 3, 0.05]}
          hotspot={get("interior")}
          palette={palette}
          suggested={suggestedNext === "interior"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "interior"}
        />
        <Hotspot
          hkey="perimeter"
          position={[0, 0.05, 4.5]}
          size={[7.6, 0.05, 4]}
          hotspot={get("perimeter")}
          palette={palette}
          suggested={suggestedNext === "perimeter"}
          onTap={onTap}
          labelsVisible={labelsVisible}
          showArrow={suggestedNext === "perimeter"}
        />
      </group>
    );
  }

  // Shed / Other
  return (
    <group ref={root}>
      <Ground palette={palette} lawn={lawn} />
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[5, 2.6, 3.4]} />
        <meshStandardMaterial color={palette.walls} roughness={0.7} map={stucco ?? undefined} />
        <Edges threshold={20} color={palette.trim} />
      </mesh>
      <SinglePitchRoof palette={palette} shingle={shingle} />
      <mesh position={[0, 1.1, 1.71]}>
        <boxGeometry args={[1, 2.1, 0.05]} />
        <meshStandardMaterial color={palette.door} />
      </mesh>
      <mesh position={[-1.5, 1.6, 1.72]}>
        <boxGeometry args={[0.6, 0.5, 0.04]} />
        <meshStandardMaterial color={palette.windowGlass} transparent opacity={0.7} />
      </mesh>

      <Hotspot
        hkey="roof"
        position={[0, 3, 0]}
        size={[5.2, 0.3, 3.6]}
        hotspot={get("roof")}
        palette={palette}
        suggested={suggestedNext === "roof"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "roof"}
      />
      {/* SIDING — right side plane (primary label) */}
      <Hotspot
        hkey="siding"
        position={[2.5, 1.3, 0]}
        size={[0.1, 2.4, 3.4]}
        hotspot={get("siding")}
        palette={palette}
        suggested={suggestedNext === "siding"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "siding"}
      />
      {/* SIDING — left side plane */}
      <Hotspot
        hkey="siding"
        position={[-2.5, 1.3, 0]}
        size={[0.1, 2.4, 3.4]}
        hotspot={get("siding")}
        palette={palette}
        suggested={suggestedNext === "siding"}
        onTap={onTap}
        showLabel={false}
        labelsVisible={labelsVisible}
      />
      {/* WINDOWS — tight to glass */}
      <Hotspot
        hkey="windows"
        position={[-1.5, 1.6, 1.74]}
        size={[0.65, 0.55, 0.04]}
        hotspot={get("windows")}
        palette={palette}
        suggested={suggestedNext === "windows"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "windows"}
      />
      <Hotspot
        hkey="interior"
        position={[0, 1.1, 1.74]}
        size={[1.1, 2.2, 0.05]}
        hotspot={get("interior")}
        palette={palette}
        suggested={suggestedNext === "interior"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "interior"}
      />
      <Hotspot
        hkey="perimeter"
        position={[0, 0.05, 3]}
        size={[5.4, 0.05, 2.6]}
        hotspot={get("perimeter")}
        palette={palette}
        suggested={suggestedNext === "perimeter"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "perimeter"}
      />
    </group>
  );
}

function Ground({ palette, lawn }: { palette: ScenePalette; lawn: THREE.CanvasTexture | null }) {
  return (
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[20, 16]} />
      <meshStandardMaterial color={palette.ground} roughness={0.95} map={lawn ?? undefined} />
    </mesh>
  );
}

function GableRoof({
  palette,
  shingle,
  y,
  halfWidth,
  halfDepth,
  apexY,
}: {
  palette: ScenePalette;
  shingle: THREE.CanvasTexture | null;
  y: number;
  halfWidth: number;
  halfDepth: number;
  apexY: number;
}) {
  const geom = useMemo(() => {
    const verts = new Float32Array([
      -halfWidth, 0, halfDepth,
      halfWidth, 0, halfDepth,
      halfWidth, 0, -halfDepth,
      -halfWidth, 0, -halfDepth,
      -halfWidth, apexY, 0,
      halfWidth, apexY, 0,
    ]);
    const idx = new Uint16Array([
      0, 1, 5,
      0, 5, 4,
      2, 3, 4,
      2, 4, 5,
      1, 2, 5,
      3, 0, 4,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }, [halfWidth, halfDepth, apexY]);
  return (
    <mesh position={[0, y, 0]} geometry={geom} castShadow>
      <meshStandardMaterial color={palette.roof} side={THREE.DoubleSide} roughness={0.78} map={shingle ?? undefined} />
      <Edges threshold={15} color={palette.trim} />
    </mesh>
  );
}

function GambrelRoof({ palette, shingle }: { palette: ScenePalette; shingle: THREE.CanvasTexture | null }) {
  const geom = useMemo(() => {
    const halfW_lower = 3.7;
    const halfW_upper = 2.0;
    const halfD = 2.4;
    const lowerY = 0;
    const breakY = 1.0;
    const apexY = 1.8;
    const verts = new Float32Array([
      -halfW_lower, lowerY, halfD,
      halfW_lower, lowerY, halfD,
      halfW_lower, lowerY, -halfD,
      -halfW_lower, lowerY, -halfD,
      -halfW_upper, breakY, halfD,
      halfW_upper, breakY, halfD,
      halfW_upper, breakY, -halfD,
      -halfW_upper, breakY, -halfD,
      0, apexY, halfD,
      0, apexY, -halfD,
    ]);
    const idx = new Uint16Array([
      0, 1, 5, 0, 5, 4,
      2, 3, 7, 2, 7, 6,
      4, 5, 8, 4, 8, 4,
      5, 6, 9, 5, 9, 8,
      6, 7, 9, 7, 8, 9,
      0, 4, 8, 8, 1, 0,
      3, 9, 7, 9, 3, 2,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh position={[0, 4, 0]} geometry={geom} castShadow>
      <meshStandardMaterial color="#4a2c20" side={THREE.DoubleSide} roughness={0.85} map={shingle ?? undefined} />
      <Edges threshold={15} color={palette.trim} />
    </mesh>
  );
}

function SinglePitchRoof({ palette, shingle }: { palette: ScenePalette; shingle: THREE.CanvasTexture | null }) {
  const geom = useMemo(() => {
    const verts = new Float32Array([
      -2.6, 0, 1.8,
      2.6, 0, 1.8,
      2.6, 0.9, -1.8,
      -2.6, 0.9, -1.8,
    ]);
    const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh position={[0, 2.6, 0]} geometry={geom} castShadow>
      <meshStandardMaterial color={palette.roof} side={THREE.DoubleSide} roughness={0.78} map={shingle ?? undefined} />
      <Edges threshold={15} color={palette.trim} />
    </mesh>
  );
}
