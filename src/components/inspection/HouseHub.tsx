"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { BuildingFootprint, HubSectionKey } from "@/types/inspection";
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
  labelsVisible?: boolean;
  imageryStatus?: "idle" | "loading" | "ready" | "partial" | "failed";
  satelliteUrl?: string | null;
  streetViewUrl?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  cachedFootprint?: BuildingFootprint | null;
  onFootprintFetched?: (footprint: BuildingFootprint | null) => void;
};

export default function HouseHub(props: Props) {
  const support = useWebGLSupport();
  if (support === "checking") {
    return <div className="hub-house-wrap h3d-canvas-wrap h3d-canvas-wrap--loading" />;
  }
  if (support === "unsupported") {
    // House2D doesn't render floating labels, imagery, or 3D footprint.
    const {
      labelsVisible: _labelsVisible,
      imageryStatus: _imageryStatus,
      satelliteUrl: _satelliteUrl,
      streetViewUrl: _streetViewUrl,
      address: _address,
      lat: _lat,
      lng: _lng,
      cachedFootprint: _cachedFootprint,
      onFootprintFetched: _onFootprintFetched,
      ...fallbackProps
    } = props;
    void _labelsVisible;
    void _imageryStatus;
    void _satelliteUrl;
    void _streetViewUrl;
    void _address;
    void _lat;
    void _lng;
    void _cachedFootprint;
    void _onFootprintFetched;
    return <House2D {...fallbackProps} />;
  }
  return <House3D {...props} />;
}
