"use client";

import React, { useMemo, useRef } from "react";
import { Edges, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HotspotInfo } from "@/components/inspection/StructureHotspot";
import type { HubSectionKey } from "@/types/inspection";
import { hotspotColor, hotspotEmissive, type ScenePalette } from "./theme-palette";

type HotspotMeshProps = {
  hkey: HubSectionKey;
  position: [number, number, number];
  size: [number, number, number];
  hotspot: HotspotInfo | undefined;
  palette: ScenePalette;
  suggested: boolean;
  onTap: (key: HubSectionKey) => void;
  visible?: boolean; // defaults to true for the overlay; the underlying form element renders separately
  showLabel?: boolean;
};

function Hotspot({ hkey, position, size, hotspot, palette, suggested, onTap, showLabel = true }: HotspotMeshProps) {
  const ref = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = React.useState(false);
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
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          onTap(hkey);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
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
        <Html center distanceFactor={10} position={[0, size[1] / 2 + 0.4, 0]}>
          <div
            style={{
              color: "#fff",
              background: palette.good,
              borderRadius: "50%",
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 700,
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              pointerEvents: "none",
            }}
          >
            ✓
          </div>
        </Html>
      ) : null}
      {showLabel ? (
        <Html center distanceFactor={12} position={[0, 0, 0]} style={{ pointerEvents: "none" }}>
          <div
            style={{
              color: color,
              fontSize: 11,
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
    </group>
  );
}

type Props = {
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  suggestedNext?: HubSectionKey | null;
  palette: ScenePalette;
};

export default function HouseScene({ hotspots, onTap, suggestedNext, palette }: Props) {
  const rootRef = useRef<THREE.Group>(null);
  const smokeRefs = useRef<THREE.Mesh[]>([]);

  const get = (k: HubSectionKey) => hotspots.find((h) => h.key === k);

  // Gentle idle rotation
  useFrame((_, delta) => {
    if (rootRef.current) rootRef.current.rotation.y += delta * 0.05;
    // Animate chimney smoke puffs
    smokeRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const offset = i * 0.7;
      const t = ((performance.now() / 1000) + offset) % 3;
      mesh.position.y = 4.5 + t * 0.6;
      mesh.scale.setScalar(0.18 + t * 0.06);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.55 - t * 0.18);
    });
  });

  // Window glass material — uses transmission for that subtle refraction look
  const glassMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: palette.windowGlass,
        roughness: 0.05,
        metalness: 0.0,
        transmission: 0.55,
        thickness: 0.4,
        ior: 1.45,
        transparent: true,
        opacity: 0.9,
      }),
    [palette.windowGlass],
  );

  return (
    <group ref={rootRef}>
      {/* GROUND / LAWN */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[28, 22]} />
        <meshStandardMaterial color={palette.ground} roughness={0.95} />
      </mesh>

      {/* SIDEWALK strip */}
      <mesh position={[0, 0.005, 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 12]} />
        <meshStandardMaterial color={palette.sidewalk} roughness={0.85} />
      </mesh>

      {/* FOUNDATION */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[10, 0.4, 7]} />
        <meshStandardMaterial color={palette.foundation} roughness={0.9} />
      </mesh>

      {/* WALLS */}
      <mesh position={[0, 2.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[9.6, 3.8, 6.6]} />
        <meshStandardMaterial color={palette.walls} roughness={0.7} />
        <Edges threshold={20} color={palette.trim} />
      </mesh>

      {/* HIP ROOF — built from a custom geometry */}
      <HipRoof palette={palette} />

      {/* CHIMNEY */}
      <mesh position={[2.9, 5.7, -0.6]} castShadow>
        <boxGeometry args={[0.7, 1.6, 0.7]} />
        <meshStandardMaterial color={palette.chimney} roughness={0.85} />
        <Edges threshold={15} color={palette.trim} />
      </mesh>
      {/* Chimney cap */}
      <mesh position={[2.9, 6.55, -0.6]}>
        <boxGeometry args={[0.85, 0.12, 0.85]} />
        <meshStandardMaterial color={palette.trim} roughness={0.6} />
      </mesh>
      {/* Smoke puffs */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => { if (el) smokeRefs.current[i] = el; }}
          position={[2.9, 4.5, -0.6]}
        >
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.4} />
        </mesh>
      ))}

      {/* FRONT WINDOWS — left & right of door */}
      {[-2.6, 2.6].map((x) => (
        <group key={x} position={[x, 2.6, 3.31]}>
          {/* frame */}
          <mesh>
            <boxGeometry args={[1.5, 1.4, 0.08]} />
            <meshStandardMaterial color={palette.windowFrame} roughness={0.5} />
          </mesh>
          {/* glass */}
          <mesh position={[0, 0, 0.05]} material={glassMaterial}>
            <planeGeometry args={[1.3, 1.2]} />
          </mesh>
          {/* mullion cross */}
          <mesh position={[0, 0, 0.06]}>
            <boxGeometry args={[0.05, 1.2, 0.02]} />
            <meshStandardMaterial color={palette.windowFrame} />
          </mesh>
          <mesh position={[0, 0, 0.06]}>
            <boxGeometry args={[1.3, 0.05, 0.02]} />
            <meshStandardMaterial color={palette.windowFrame} />
          </mesh>
        </group>
      ))}

      {/* FRONT DOOR (slightly ajar 8°) */}
      <group position={[0, 1.5, 3.31]} rotation={[0, -0.14, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.2, 2.4, 0.1]} />
          <meshStandardMaterial color={palette.door} roughness={0.55} />
          <Edges threshold={20} color={palette.trim} />
        </mesh>
        {/* Door knob */}
        <mesh position={[0.45, 0, 0.07]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color={palette.brand} metalness={0.3} roughness={0.4} />
        </mesh>
      </group>

      {/* MAILBOX */}
      <group position={[3.6, 1, 5.5]}>
        <mesh>
          <boxGeometry args={[0.08, 1.6, 0.08]} />
          <meshStandardMaterial color={palette.trim} />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[0.5, 0.3, 0.7]} />
          <meshStandardMaterial color={palette.brand} roughness={0.6} />
        </mesh>
      </group>

      {/* HOUSE-NUMBER PLATE */}
      <Html position={[0, 3.2, 3.36]} center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: palette.brand,
            color: "#fff",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}
        >
          4E
        </div>
      </Html>

      {/* AC CONDENSER (left side) */}
      <group position={[-5.4, 0.6, 1.2]}>
        <mesh castShadow>
          <boxGeometry args={[1, 1.2, 1]} />
          <meshStandardMaterial color={palette.ac} roughness={0.8} metalness={0.1} />
          <Edges threshold={15} color={palette.trim} />
        </mesh>
        {/* Fan disc on top */}
        <mesh position={[0, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.04, 24]} />
          <meshStandardMaterial color={palette.acFins} roughness={0.6} />
        </mesh>
        {/* Fins */}
        {[-0.3, -0.15, 0, 0.15, 0.3].map((y) => (
          <mesh key={y} position={[0, y, 0.51]}>
            <boxGeometry args={[0.95, 0.04, 0.02]} />
            <meshStandardMaterial color={palette.acFins} />
          </mesh>
        ))}
      </group>

      {/* DECK / PATIO (right side) */}
      <group position={[5.4, 0.15, -0.5]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[1.4, 0.15, 3]} />
          <meshStandardMaterial color={palette.fence} roughness={0.85} />
        </mesh>
        {[-1.2, -0.6, 0, 0.6, 1.2].map((z) => (
          <mesh key={z} position={[0, 0.08, z]}>
            <boxGeometry args={[1.4, 0.03, 0.05]} />
            <meshStandardMaterial color={palette.trim} />
          </mesh>
        ))}
        {/* Fence posts */}
        {[-1.4, 1.4].map((z) => (
          <mesh key={z} position={[0.7, 0.6, z]}>
            <boxGeometry args={[0.1, 1.2, 0.1]} />
            <meshStandardMaterial color={palette.fence} />
          </mesh>
        ))}
      </group>

      {/* TREE (left front lawn) */}
      <group position={[-4.5, 0, 6.5]}>
        <mesh castShadow position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.18, 0.22, 1.6, 10]} />
          <meshStandardMaterial color={palette.treeTrunk} roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0, 2.1, 0]}>
          <icosahedronGeometry args={[1.1, 0]} />
          <meshStandardMaterial color={palette.treeFoliage} roughness={0.85} flatShading />
        </mesh>
      </group>

      {/* SHRUBS (right front) */}
      <group position={[4, 0.4, 6]}>
        <mesh castShadow>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshStandardMaterial color={palette.shrub} roughness={0.85} flatShading />
        </mesh>
        <mesh castShadow position={[0.7, -0.1, 0.2]}>
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshStandardMaterial color={palette.shrub} roughness={0.85} flatShading />
        </mesh>
      </group>

      {/* HOTSPOTS — overlay rectangles on the visual elements */}
      {/* ROOF — large area above the walls */}
      <Hotspot hkey="roof" position={[0, 5.4, 0]} size={[10, 0.4, 7]} hotspot={get("roof")} palette={palette} suggested={suggestedNext === "roof"} onTap={onTap} />
      {/* GUTTERS — strip at eave line */}
      <Hotspot hkey="gutters" position={[0, 4.25, 0]} size={[10.4, 0.18, 7.4]} hotspot={get("gutters")} palette={palette} suggested={suggestedNext === "gutters"} onTap={onTap} />
      {/* SIDING — front-left wall */}
      <Hotspot hkey="siding" position={[-2.4, 2.8, 3.32]} size={[3.6, 2, 0.05]} hotspot={get("siding")} palette={palette} suggested={suggestedNext === "siding"} onTap={onTap} />
      {/* WINDOWS — front-right wall area */}
      <Hotspot hkey="windows" position={[2.6, 2.7, 3.32]} size={[3.6, 2.4, 0.05]} hotspot={get("windows")} palette={palette} suggested={suggestedNext === "windows"} onTap={onTap} />
      {/* INTERIOR — center over the door area */}
      <Hotspot hkey="interior" position={[0, 1.9, 3.32]} size={[2, 2.6, 0.05]} hotspot={get("interior")} palette={palette} suggested={suggestedNext === "interior"} onTap={onTap} />
      {/* ATTIC — gable triangle area */}
      <Hotspot hkey="attic" position={[0, 5.4, 3.1]} size={[3, 0.6, 0.4]} hotspot={get("attic")} palette={palette} suggested={suggestedNext === "attic"} onTap={onTap} />
      {/* PERSONAL PROPERTY — right window cluster (interior contents) */}
      <Hotspot hkey="personal_property" position={[2.6, 2.7, -3.32]} size={[3.6, 2.4, 0.05]} hotspot={get("personal_property")} palette={palette} suggested={suggestedNext === "personal_property"} onTap={onTap} />
      {/* PERIMETER — sidewalk */}
      <Hotspot hkey="perimeter" position={[0, 0.05, 5]} size={[2.6, 0.05, 11.5]} hotspot={get("perimeter")} palette={palette} suggested={suggestedNext === "perimeter"} onTap={onTap} />
      {/* EXTERIOR COLLATERAL — wraps AC and deck side hints */}
      <Hotspot hkey="exterior_collateral" position={[-5.4, 0.7, 1.2]} size={[1.5, 1.6, 1.5]} hotspot={get("exterior_collateral")} palette={palette} suggested={suggestedNext === "exterior_collateral"} onTap={onTap} />
      <Hotspot hkey="exterior_collateral" position={[5.4, 0.7, -0.5]} size={[1.8, 1.4, 3.4]} hotspot={get("exterior_collateral")} palette={palette} suggested={suggestedNext === "exterior_collateral"} onTap={onTap} showLabel={false} />
    </group>
  );
}

function HipRoof({ palette }: { palette: ScenePalette }) {
  // Hip roof = 4-faceted pyramid-like shape over the rectangular walls.
  // Wall span: 9.6 x 6.6 at y=4.2 (top of walls). Apex at y=5.6.
  const geometry = useMemo(() => {
    const halfW = 5.0; // overhang slightly past 4.8
    const halfD = 3.5; // overhang slightly past 3.3
    const ridgeHalf = 1.5; // ridge runs along x for hip roof
    const apexY = 1.6;

    const vertices = new Float32Array([
      // 8 base corners (4 outer, top-of-wall) + 2 ridge points
      // 0: front-left base
      -halfW, 0, halfD,
      // 1: front-right base
      halfW, 0, halfD,
      // 2: back-right base
      halfW, 0, -halfD,
      // 3: back-left base
      -halfW, 0, -halfD,
      // 4: ridge front
      -ridgeHalf, apexY, 0,
      // 5: ridge back (shifted along x to make a hip ridge)
      ridgeHalf, apexY, 0,
    ]);

    // Triangle faces — hip roof has 2 trapezoidal sides (split into triangles) + 2 triangular ends
    // Front face: 0, 1, 5 + 0, 5, 4
    // Right end: 1, 2, 5
    // Back face: 2, 3, 4 + 2, 4, 5
    // Left end: 3, 0, 4
    const indices = new Uint16Array([
      0, 1, 5,
      0, 5, 4,
      1, 2, 5,
      2, 3, 4,
      2, 4, 5,
      3, 0, 4,
    ]);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    return geom;
  }, []);

  return (
    <mesh position={[0, 4.2, 0]} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={palette.roof} roughness={0.78} side={THREE.DoubleSide} />
      <Edges threshold={15} color={palette.trim} />
    </mesh>
  );
}
