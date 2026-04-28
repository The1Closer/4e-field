"use client";

import { createContext, useContext } from "react";
import type * as THREE from "three";
import type { HubSectionKey } from "@/types/inspection";

export type HouseControlsCtxValue = {
  groupRef: React.MutableRefObject<THREE.Group | null>;
  targetYRef: React.MutableRefObject<number | null>;
  lastInteractionRef: React.MutableRefObject<number>;
  requestSnap: (key: HubSectionKey) => void;
  noteInteraction: () => void;
};

export const HouseControlsCtx = createContext<HouseControlsCtxValue | null>(null);

export function useHouseControls(): HouseControlsCtxValue | null {
  return useContext(HouseControlsCtx);
}

// Front-of-house faces +Z (rotation.y = 0). Most hotspots live on the front.
// personal_property is on the back wall; exterior_collateral spans both sides.
export const SECTION_ANGLES: Partial<Record<HubSectionKey, number>> = {
  roof: 0,
  gutters: 0,
  siding: 0,
  windows: 0,
  interior: 0,
  attic: 0,
  perimeter: 0,
  personal_property: Math.PI,
  exterior_collateral: -Math.PI / 2,
};

export function shortestAngleDiff(target: number, current: number): number {
  return ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
}
