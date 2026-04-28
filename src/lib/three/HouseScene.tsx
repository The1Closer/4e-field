"use client";

import React, { useMemo, useRef } from "react";
import { Edges, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HotspotInfo } from "@/components/inspection/StructureHotspot";
import type { HubSectionKey } from "@/types/inspection";
import { hotspotColor, hotspotEmissive, type ScenePalette } from "./theme-palette";
import { SECTION_ANGLES, shortestAngleDiff, useHouseControls } from "./useHouseControls";
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
  const ref = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = React.useState(false);
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

  // Dim completed sections so "what's left" reads instantly.
  const baseOpacity =
    hotspot.state === "untouched" ? 0.18 : isComplete ? 0.12 : 0.32;

  return (
    <group position={position}>
      <mesh
        ref={ref}
        onPointerDown={(e) => {
          e.stopPropagation();
          ctx?.noteInteraction();
        }}
        onClick={(e) => {
          e.stopPropagation();
          ctx?.requestSnap(hkey);
          // Stagger drawer open by ~220ms so the snap-lerp completes visibly.
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
        <Html center distanceFactor={10} position={[0, size[1] / 2 + 0.4, 0]} zIndexRange={[40, 30]}>
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
      {labelsVisible && showLabel ? (
        <Html
          center
          distanceFactor={12}
          position={[0, 0, 0]}
          style={{ pointerEvents: "none" }}
          zIndexRange={[40, 30]}
        >
          <div
            style={{
              color,
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
      {labelsVisible && showArrow ? (
        <Html
          center
          distanceFactor={9}
          position={[0, size[1] / 2 + 1.0, 0]}
          style={{ pointerEvents: "none" }}
          zIndexRange={[40, 30]}
        >
          <div
            ref={arrowRef}
            style={{
              color: palette.brandPulse,
              fontSize: 22,
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
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  suggestedNext?: HubSectionKey | null;
  palette: ScenePalette;
  labelsVisible?: boolean;
};

export default function HouseScene({ hotspots, onTap, suggestedNext, palette, labelsVisible = true }: Props) {
  const fallbackRef = useRef<THREE.Group | null>(null);
  const ctx = useHouseControls();
  const groupRef = ctx?.groupRef ?? fallbackRef;
  const smokeRefs = useRef<THREE.Mesh[]>([]);

  const get = (k: HubSectionKey) => hotspots.find((h) => h.key === k);

  // Snap-to-section lerp + idle drift after ~4 s of no interaction.
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (group) {
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
        // No controls context (legacy / tests): keep the original gentle spin.
        group.rotation.y += delta * 0.05;
      }
    }
    smokeRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const offset = i * 0.7;
      const t = (performance.now() / 1000 + offset) % 3;
      mesh.position.y = 4.5 + t * 0.6;
      mesh.scale.setScalar(0.18 + t * 0.06);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.55 - t * 0.18);
    });
  });

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

  const stucco = useStuccoTexture(palette.walls);
  const shingle = useShingleTexture(palette.roof, palette.roofAccent);
  const lawn = useLawnTexture(palette.ground);

  return (
    <group ref={groupRef}>
      {/* GROUND / LAWN */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[28, 22]} />
        <meshStandardMaterial color={palette.ground} roughness={0.95} map={lawn ?? undefined} />
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
        <meshStandardMaterial color={palette.walls} roughness={0.7} map={stucco ?? undefined} />
        <Edges threshold={20} color={palette.trim} />
      </mesh>

      {/* HIP ROOF */}
      <HipRoof palette={palette} shingle={shingle} />

      {/* CHIMNEY */}
      <mesh position={[2.9, 5.7, -0.6]} castShadow>
        <boxGeometry args={[0.7, 1.6, 0.7]} />
        <meshStandardMaterial color={palette.chimney} roughness={0.85} />
        <Edges threshold={15} color={palette.trim} />
      </mesh>
      <mesh position={[2.9, 6.55, -0.6]}>
        <boxGeometry args={[0.85, 0.12, 0.85]} />
        <meshStandardMaterial color={palette.trim} roughness={0.6} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) smokeRefs.current[i] = el;
          }}
          position={[2.9, 4.5, -0.6]}
        >
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.4} />
        </mesh>
      ))}

      {/* FRONT WINDOWS — left & right of door */}
      {[-2.6, 2.6].map((x) => (
        <group key={x} position={[x, 2.6, 3.31]}>
          <mesh>
            <boxGeometry args={[1.5, 1.4, 0.08]} />
            <meshStandardMaterial color={palette.windowFrame} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.05]} material={glassMaterial}>
            <planeGeometry args={[1.3, 1.2]} />
          </mesh>
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
      {labelsVisible ? (
        <Html
          position={[0, 3.2, 3.36]}
          center
          distanceFactor={8}
          style={{ pointerEvents: "none" }}
          zIndexRange={[40, 30]}
        >
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
      ) : null}

      {/* AC CONDENSER (left side) */}
      <group position={[-5.4, 0.6, 1.2]}>
        <mesh castShadow>
          <boxGeometry args={[1, 1.2, 1]} />
          <meshStandardMaterial color={palette.ac} roughness={0.8} metalness={0.1} />
          <Edges threshold={15} color={palette.trim} />
        </mesh>
        <mesh position={[0, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 0.04, 24]} />
          <meshStandardMaterial color={palette.acFins} roughness={0.6} />
        </mesh>
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

      {/* HOTSPOTS — overlay rectangles. Sized so siding never covers windows. */}
      {/* ROOF */}
      <Hotspot
        hkey="roof"
        position={[0, 5.4, 0]}
        size={[10, 0.4, 7]}
        hotspot={get("roof")}
        palette={palette}
        suggested={suggestedNext === "roof"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "roof"}
      />
      {/* GUTTERS — thin band at eave line */}
      <Hotspot
        hkey="gutters"
        position={[0, 4.25, 0]}
        size={[10.4, 0.12, 7.4]}
        hotspot={get("gutters")}
        palette={palette}
        suggested={suggestedNext === "gutters"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "gutters"}
      />
      {/* SIDING — left wall plane (primary label here) */}
      <Hotspot
        hkey="siding"
        position={[-4.85, 2.3, 0]}
        size={[0.04, 3.6, 6.5]}
        hotspot={get("siding")}
        palette={palette}
        suggested={suggestedNext === "siding"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "siding"}
      />
      {/* SIDING — right wall plane (no label) */}
      <Hotspot
        hkey="siding"
        position={[4.85, 2.3, 0]}
        size={[0.04, 3.6, 6.5]}
        hotspot={get("siding")}
        palette={palette}
        suggested={suggestedNext === "siding"}
        onTap={onTap}
        showLabel={false}
        labelsVisible={labelsVisible}
      />
      {/* SIDING — front top band between window-tops and eave */}
      <Hotspot
        hkey="siding"
        position={[0, 3.85, 3.33]}
        size={[7.4, 0.6, 0.04]}
        hotspot={get("siding")}
        palette={palette}
        suggested={suggestedNext === "siding"}
        onTap={onTap}
        showLabel={false}
        labelsVisible={labelsVisible}
      />
      {/* SIDING — front bottom band between foundation and sills */}
      <Hotspot
        hkey="siding"
        position={[0, 0.7, 3.33]}
        size={[7.4, 0.5, 0.04]}
        hotspot={get("siding")}
        palette={palette}
        suggested={suggestedNext === "siding"}
        onTap={onTap}
        showLabel={false}
        labelsVisible={labelsVisible}
      />
      {/* WINDOWS — left glass, no label (right one carries label) */}
      <Hotspot
        hkey="windows"
        position={[-2.6, 2.6, 3.36]}
        size={[1.55, 1.45, 0.04]}
        hotspot={get("windows")}
        palette={palette}
        suggested={suggestedNext === "windows"}
        onTap={onTap}
        showLabel={false}
        labelsVisible={labelsVisible}
      />
      {/* WINDOWS — right glass, primary label */}
      <Hotspot
        hkey="windows"
        position={[2.6, 2.6, 3.36]}
        size={[1.55, 1.45, 0.04]}
        hotspot={get("windows")}
        palette={palette}
        suggested={suggestedNext === "windows"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "windows"}
      />
      {/* INTERIOR — door area only */}
      <Hotspot
        hkey="interior"
        position={[0, 1.55, 3.36]}
        size={[1.4, 2.5, 0.04]}
        hotspot={get("interior")}
        palette={palette}
        suggested={suggestedNext === "interior"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "interior"}
      />
      {/* ATTIC — gable triangle area */}
      <Hotspot
        hkey="attic"
        position={[0, 5.4, 3.1]}
        size={[3, 0.6, 0.4]}
        hotspot={get("attic")}
        palette={palette}
        suggested={suggestedNext === "attic"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "attic"}
      />
      {/* PERSONAL PROPERTY — back wall */}
      <Hotspot
        hkey="personal_property"
        position={[2.6, 2.7, -3.32]}
        size={[3.6, 2.4, 0.05]}
        hotspot={get("personal_property")}
        palette={palette}
        suggested={suggestedNext === "personal_property"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "personal_property"}
      />
      {/* PERIMETER — sidewalk */}
      <Hotspot
        hkey="perimeter"
        position={[0, 0.05, 5]}
        size={[2.6, 0.05, 11.5]}
        hotspot={get("perimeter")}
        palette={palette}
        suggested={suggestedNext === "perimeter"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "perimeter"}
      />
      {/* EXTERIOR COLLATERAL — AC + deck side hints */}
      <Hotspot
        hkey="exterior_collateral"
        position={[-5.4, 0.7, 1.2]}
        size={[1.5, 1.6, 1.5]}
        hotspot={get("exterior_collateral")}
        palette={palette}
        suggested={suggestedNext === "exterior_collateral"}
        onTap={onTap}
        labelsVisible={labelsVisible}
        showArrow={suggestedNext === "exterior_collateral"}
      />
      <Hotspot
        hkey="exterior_collateral"
        position={[5.4, 0.7, -0.5]}
        size={[1.8, 1.4, 3.4]}
        hotspot={get("exterior_collateral")}
        palette={palette}
        suggested={suggestedNext === "exterior_collateral"}
        onTap={onTap}
        showLabel={false}
        labelsVisible={labelsVisible}
      />
    </group>
  );
}

function HipRoof({ palette, shingle }: { palette: ScenePalette; shingle: THREE.CanvasTexture | null }) {
  const geometry = useMemo(() => {
    const halfW = 5.0;
    const halfD = 3.5;
    const ridgeHalf = 1.5;
    const apexY = 1.6;

    const vertices = new Float32Array([
      -halfW, 0, halfD,
      halfW, 0, halfD,
      halfW, 0, -halfD,
      -halfW, 0, -halfD,
      -ridgeHalf, apexY, 0,
      ridgeHalf, apexY, 0,
    ]);

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
      <meshStandardMaterial
        color={palette.roof}
        roughness={0.78}
        side={THREE.DoubleSide}
        map={shingle ?? undefined}
      />
      <Edges threshold={15} color={palette.trim} />
    </mesh>
  );
}
