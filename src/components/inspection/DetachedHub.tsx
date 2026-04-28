"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { DetachedBuildingLabel, HubSectionKey } from "@/types/inspection";
import { useWebGLSupport } from "@/lib/use-webgl-support";
import DetachedHub2D from "./DetachedHub2D";
import type { HotspotInfo, HotspotState } from "./StructureHotspot";

export type { HotspotState };

const Detached3D = dynamic(() => import("./Detached3D"), {
  ssr: false,
  loading: () => <div className="hub-house-wrap h3d-canvas-wrap h3d-canvas-wrap--loading" />,
});

export const SHED_HOTSPOT_KEYS: HubSectionKey[] = ["roof", "siding", "windows", "interior", "perimeter"];
export const GARAGE_HOTSPOT_KEYS: HubSectionKey[] = [
  "roof",
  "siding",
  "gutters",
  "windows",
  "interior",
  "perimeter",
  "personal_property",
  "exterior_collateral",
];
export const BARN_HOTSPOT_KEYS: HubSectionKey[] = ["roof", "siding", "gutters", "windows", "interior", "perimeter"];

export function hotspotKeysForVariant(variant: DetachedBuildingLabel): HubSectionKey[] {
  switch (variant) {
    case "garage":
      return GARAGE_HOTSPOT_KEYS;
    case "barn":
      return BARN_HOTSPOT_KEYS;
    case "shed":
    case "other":
    default:
      return SHED_HOTSPOT_KEYS;
  }
}

type Props = {
  variant: DetachedBuildingLabel;
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  suggestedNext?: HubSectionKey | null;
  labelsVisible?: boolean;
};

export default function DetachedHub(props: Props) {
  const support = useWebGLSupport();
  if (support === "checking") {
    return <div className="hub-house-wrap h3d-canvas-wrap h3d-canvas-wrap--loading" />;
  }
  if (support === "unsupported") {
    const { labelsVisible: _omit, ...fallbackProps } = props;
    void _omit;
    return <DetachedHub2D {...fallbackProps} />;
  }
  return <Detached3D {...props} />;
}
