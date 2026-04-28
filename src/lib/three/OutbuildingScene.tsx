"use client";

import React, { useMemo, useRef } from "react";
import { Edges, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DetachedBuildingLabel, HubSectionKey } from "@/types/inspection";
import type { HotspotInfo, HotspotState } from "@/components/inspection/StructureHotspot";
import { hotspotColor, hotspotEmissive, type ScenePalette } from "./theme-palette";

type HotspotMeshProps = {
  hkey: HubSectionKey;
  position: [number, number, number];
  size: [number, number, number];
  hotspot: HotspotInfo | undefined;
  palette: ScenePalette;
  suggested: boolean;
  onTap: (key: HubSectionKey) => void;
  showLabel?: boolean;
};

function Hotspot({ hkey, position, size, hotspot, palette, suggested, onTap, showLabel = true }: HotspotMeshProps) {
  const [hovered, setHovered] = React.useState(false);
  const pulseRef = useRef<THREE.Mesh>(null);
  if (!hotspot) return null;
  const color = hotspotColor(hotspot.state, palette);
  const emissive = hotspotEmissive(hotspot.state) + (hovered ? 0.2 : 0);
  const isComplete = hotspot.state === "complete" || hotspot.state === "override_complete";
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
  });
  return (
    <group position={position}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onTap(hkey); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissive}
          transparent
          opacity={hotspot.state === "untouched" ? 0.18 : 0.32}
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
      {isComplete ? (
        <Html center distanceFactor={9} position={[0, size[1] / 2 + 0.4, 0]}>
          <div style={{ color: "#fff", background: palette.good, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>✓</div>
        </Html>
      ) : null}
      {showLabel ? (
        <Html center distanceFactor={11} style={{ pointerEvents: "none" }}>
          <div style={{ color, fontSize: 10, fontWeight: 600, letterSpacing: 0.3, textShadow: "0 1px 2px rgba(0,0,0,0.6)", whiteSpace: "nowrap", pointerEvents: "none", userSelect: "none" }}>
            {hotspot.label}
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
};

export default function OutbuildingScene({ variant, hotspots, onTap, suggestedNext, palette }: Props) {
  const root = useRef<THREE.Group>(null);
  const get = (k: HubSectionKey) => hotspots.find((h) => h.key === k);
  useFrame((_, delta) => { if (root.current) root.current.rotation.y += delta * 0.05; });

  if (variant === "garage") {
    return (
      <group ref={root}>
        <Ground palette={palette} />
        {/* Walls */}
        <mesh position={[0, 1.7, 0]} castShadow>
          <boxGeometry args={[8.4, 3.4, 5]} />
          <meshStandardMaterial color={palette.walls} roughness={0.7} />
          <Edges threshold={20} color={palette.trim} />
        </mesh>
        {/* Gable roof */}
        <GableRoof palette={palette} y={3.4} halfWidth={4.4} halfDepth={2.7} apexY={1.4} />
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

        <Hotspot hkey="roof" position={[0, 4.5, 0]} size={[8.6, 0.4, 5]} hotspot={get("roof")} palette={palette} suggested={suggestedNext === "roof"} onTap={onTap} />
        <Hotspot hkey="gutters" position={[0, 3.4, 0]} size={[9, 0.16, 5.4]} hotspot={get("gutters")} palette={palette} suggested={suggestedNext === "gutters"} onTap={onTap} />
        <Hotspot hkey="siding" position={[3.5, 1.7, 2.5]} size={[1.5, 3, 0.05]} hotspot={get("siding")} palette={palette} suggested={suggestedNext === "siding"} onTap={onTap} />
        <Hotspot hkey="windows" position={[2.5, 2.8, 2.55]} size={[1, 0.85, 0.05]} hotspot={get("windows")} palette={palette} suggested={suggestedNext === "windows"} onTap={onTap} />
        <Hotspot hkey="interior" position={[-1.4, 1.6, 2.55]} size={[3.6, 3, 0.05]} hotspot={get("interior")} palette={palette} suggested={suggestedNext === "interior"} onTap={onTap} />
        <Hotspot hkey="personal_property" position={[0, 1.6, -2.5]} size={[8, 3, 0.06]} hotspot={get("personal_property")} palette={palette} suggested={suggestedNext === "personal_property"} onTap={onTap} />
        <Hotspot hkey="perimeter" position={[-1.4, 0.05, 5]} size={[3.6, 0.05, 5]} hotspot={get("perimeter")} palette={palette} suggested={suggestedNext === "perimeter"} onTap={onTap} />
        <Hotspot hkey="exterior_collateral" position={[-4.5, 1, 2]} size={[1, 1.4, 1]} hotspot={get("exterior_collateral")} palette={palette} suggested={suggestedNext === "exterior_collateral"} onTap={onTap} />
      </group>
    );
  }

  if (variant === "barn") {
    return (
      <group ref={root}>
        <Ground palette={palette} />
        {/* Walls */}
        <mesh position={[0, 1.8, 0]} castShadow>
          <boxGeometry args={[7, 3.6, 4.6]} />
          <meshStandardMaterial color="#5a3a30" roughness={0.85} />
          <Edges threshold={20} color={palette.trim} />
        </mesh>
        {/* Gambrel roof — two stacked segments */}
        <mesh position={[0, 4, 0]}>
          <boxGeometry args={[7.2, 0.05, 4.8]} />
          <meshStandardMaterial color="#4a2c20" />
        </mesh>
        <GambrelRoof palette={palette} />
        {/* Sliding door */}
        <mesh position={[0, 1.6, 2.31]}>
          <boxGeometry args={[2.6, 2.8, 0.06]} />
          <meshStandardMaterial color="#3a1f12" />
        </mesh>
        <mesh position={[0, 1.6, 2.34]}>
          <boxGeometry args={[0.04, 2.8, 0.02]} />
          <meshStandardMaterial color={palette.trim} />
        </mesh>
        {/* Hayloft window */}
        <mesh position={[0, 5.4, 2.4]}>
          <boxGeometry args={[0.9, 0.8, 0.04]} />
          <meshStandardMaterial color={palette.windowGlass} transparent opacity={0.6} />
        </mesh>

        <Hotspot hkey="roof" position={[0, 5.2, 0]} size={[7.4, 0.4, 5]} hotspot={get("roof")} palette={palette} suggested={suggestedNext === "roof"} onTap={onTap} />
        <Hotspot hkey="gutters" position={[0, 3.6, 0]} size={[7.6, 0.14, 5]} hotspot={get("gutters")} palette={palette} suggested={suggestedNext === "gutters"} onTap={onTap} />
        <Hotspot hkey="siding" position={[3, 1.8, 2.32]} size={[1.4, 3.4, 0.05]} hotspot={get("siding")} palette={palette} suggested={suggestedNext === "siding"} onTap={onTap} />
        <Hotspot hkey="windows" position={[0, 5.4, 2.4]} size={[1.1, 1, 0.05]} hotspot={get("windows")} palette={palette} suggested={suggestedNext === "windows"} onTap={onTap} />
        <Hotspot hkey="interior" position={[0, 1.6, 2.4]} size={[2.7, 3, 0.05]} hotspot={get("interior")} palette={palette} suggested={suggestedNext === "interior"} onTap={onTap} />
        <Hotspot hkey="perimeter" position={[0, 0.05, 4.5]} size={[7.6, 0.05, 4]} hotspot={get("perimeter")} palette={palette} suggested={suggestedNext === "perimeter"} onTap={onTap} />
      </group>
    );
  }

  // Shed / Other
  return (
    <group ref={root}>
      <Ground palette={palette} />
      {/* Walls */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[5, 2.6, 3.4]} />
        <meshStandardMaterial color={palette.walls} roughness={0.7} />
        <Edges threshold={20} color={palette.trim} />
      </mesh>
      {/* Single-pitch roof (slight forward slope) */}
      <SinglePitchRoof palette={palette} />
      {/* Door */}
      <mesh position={[0, 1.1, 1.71]}>
        <boxGeometry args={[1, 2.1, 0.05]} />
        <meshStandardMaterial color={palette.door} />
      </mesh>
      {/* Small window */}
      <mesh position={[-1.5, 1.6, 1.72]}>
        <boxGeometry args={[0.6, 0.5, 0.04]} />
        <meshStandardMaterial color={palette.windowGlass} transparent opacity={0.7} />
      </mesh>

      <Hotspot hkey="roof" position={[0, 3, 0]} size={[5.2, 0.3, 3.6]} hotspot={get("roof")} palette={palette} suggested={suggestedNext === "roof"} onTap={onTap} />
      <Hotspot hkey="siding" position={[2.5, 1.3, 0]} size={[0.1, 2.4, 3.4]} hotspot={get("siding")} palette={palette} suggested={suggestedNext === "siding"} onTap={onTap} />
      <Hotspot hkey="windows" position={[-1.5, 1.6, 1.74]} size={[0.7, 0.6, 0.04]} hotspot={get("windows")} palette={palette} suggested={suggestedNext === "windows"} onTap={onTap} />
      <Hotspot hkey="interior" position={[0, 1.1, 1.74]} size={[1.1, 2.2, 0.05]} hotspot={get("interior")} palette={palette} suggested={suggestedNext === "interior"} onTap={onTap} />
      <Hotspot hkey="perimeter" position={[0, 0.05, 3]} size={[5.4, 0.05, 2.6]} hotspot={get("perimeter")} palette={palette} suggested={suggestedNext === "perimeter"} onTap={onTap} />
    </group>
  );
}

function Ground({ palette }: { palette: ScenePalette }) {
  return (
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[20, 16]} />
      <meshStandardMaterial color={palette.ground} roughness={0.95} />
    </mesh>
  );
}

function GableRoof({
  palette,
  y,
  halfWidth,
  halfDepth,
  apexY,
}: { palette: ScenePalette; y: number; halfWidth: number; halfDepth: number; apexY: number }) {
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
      <meshStandardMaterial color={palette.roof} side={THREE.DoubleSide} roughness={0.78} />
      <Edges threshold={15} color={palette.trim} />
    </mesh>
  );
}

function GambrelRoof({ palette }: { palette: ScenePalette }) {
  const geom = useMemo(() => {
    // Gambrel = lower steep slope, upper gentle slope. Cross-section like:
    //          /‾‾\
    //        /      \
    //       |        |
    const halfW_lower = 3.7;
    const halfW_upper = 2.0;
    const halfD = 2.4;
    const lowerY = 0;
    const breakY = 1.0;
    const apexY = 1.8;
    const verts = new Float32Array([
      // 0 front-left lower
      -halfW_lower, lowerY, halfD,
      // 1 front-right lower
      halfW_lower, lowerY, halfD,
      // 2 back-right lower
      halfW_lower, lowerY, -halfD,
      // 3 back-left lower
      -halfW_lower, lowerY, -halfD,
      // 4 front-left break
      -halfW_upper, breakY, halfD,
      // 5 front-right break
      halfW_upper, breakY, halfD,
      // 6 back-right break
      halfW_upper, breakY, -halfD,
      // 7 back-left break
      -halfW_upper, breakY, -halfD,
      // 8 ridge front
      0, apexY, halfD,
      // 9 ridge back
      0, apexY, -halfD,
    ]);
    const idx = new Uint16Array([
      // Front lower slopes
      0, 1, 5, 0, 5, 4,
      // Back lower slopes
      2, 3, 7, 2, 7, 6,
      // Front upper slopes (gentle)
      4, 5, 8, 4, 8, 4,
      5, 6, 9, 5, 9, 8,
      // Back upper slopes
      6, 7, 9, 7, 8, 9,
      // Side caps (front face)
      0, 4, 8, 8, 1, 0,
      // Side caps (back face)
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
      <meshStandardMaterial color="#4a2c20" side={THREE.DoubleSide} roughness={0.85} />
      <Edges threshold={15} color={palette.trim} />
    </mesh>
  );
}

function SinglePitchRoof({ palette }: { palette: ScenePalette }) {
  const geom = useMemo(() => {
    // Slanted plane sloping from back (high) to front (low).
    const verts = new Float32Array([
      -2.6, 0, 1.8,    // front-left low
      2.6, 0, 1.8,    // front-right low
      2.6, 0.9, -1.8,    // back-right high
      -2.6, 0.9, -1.8,    // back-left high
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
      <meshStandardMaterial color={palette.roof} side={THREE.DoubleSide} roughness={0.78} />
      <Edges threshold={15} color={palette.trim} />
    </mesh>
  );
}
