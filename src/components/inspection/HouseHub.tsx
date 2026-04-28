"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { HubSectionKey } from "@/types/inspection";
import { useWebGLSupport } from "@/lib/use-webgl-support";
import House2D from "./House2D";
import type { HotspotInfo, HotspotState } from "./StructureHotspot";

export type { HotspotState };

const House3D = dynamic(() => import("./House3D"), {
  ssr: false,
  loading: () => <div className="hub-house-wrap h3d-canvas-wrap h3d-canvas-wrap--loading" />,
});

type Props = {
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  onAddDetached?: () => void;
  suggestedNext?: HubSectionKey | null;
};

export default function HouseHub(props: Props) {
  const support = useWebGLSupport();
  if (support === "checking") {
    return <div className="hub-house-wrap h3d-canvas-wrap h3d-canvas-wrap--loading" />;
  }
  if (support === "unsupported") {
    return <House2D {...props} />;
  }
  return <House3D {...props} />;
}
