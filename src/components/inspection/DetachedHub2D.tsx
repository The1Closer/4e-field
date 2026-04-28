"use client";

import React from "react";
import type { DetachedBuildingLabel, HubSectionKey } from "@/types/inspection";
import { HotspotRect, type HotspotInfo, type HotspotState } from "./StructureHotspot";

export type { HotspotState };

type Props = {
  variant: DetachedBuildingLabel;
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  suggestedNext?: HubSectionKey | null;
};

export default function DetachedHub2D({ variant, hotspots, onTap, suggestedNext }: Props) {
  const getHotspot = (key: HubSectionKey) => hotspots.find((h) => h.key === key);

  if (variant === "garage") {
    return (
      <div className="hub-house-wrap">
        <svg viewBox="0 0 320 280" className="hub-house-svg" role="img" aria-label="Garage hub">
          <rect x={0} y={0} width={320} height={280} fill="#1a2030" rx={12} />
          {/* Roof */}
          <polygon points="160,18 300,90 20,90" fill="#2a3348" stroke="#4a5568" />
          {/* Walls — wider than house, shorter */}
          <rect x={28} y={88} width={264} height={130} fill="#222b3a" stroke="#4a5568" />
          {/* Gutter line */}
          <rect x={20} y={88} width={280} height={6} fill="#2d3e52" />
          {/* Overhead garage door */}
          <rect x={70} y={120} width={130} height={98} fill="#1a2535" stroke="#3d5070" rx={3} />
          <line x1={70} y1={140} x2={200} y2={140} stroke="#3d5070" strokeWidth={0.5} />
          <line x1={70} y1={160} x2={200} y2={160} stroke="#3d5070" strokeWidth={0.5} />
          <line x1={70} y1={180} x2={200} y2={180} stroke="#3d5070" strokeWidth={0.5} />
          <line x1={70} y1={200} x2={200} y2={200} stroke="#3d5070" strokeWidth={0.5} />
          {/* Side service door */}
          <rect x={224} y={150} width={36} height={66} fill="#1a2535" stroke="#3d5070" rx={2} />
          <circle cx={252} cy={183} r={2} fill="#d6b37a" />
          {/* Side window */}
          <rect x={228} y={108} width={28} height={22} fill="#1a2535" stroke="#3d5070" rx={1} />
          <line x1={242} y1={108} x2={242} y2={130} stroke="#3d5070" strokeWidth={0.5} />
          {/* Lawn / driveway */}
          <rect x={0} y={218} width={320} height={62} fill="#1e2d1e" />
          <rect x={70} y={218} width={130} height={62} fill="#2a3028" />

          {/* Hotspots */}
          <HotspotRect hkey="roof" x={60} y={22} w={200} h={50} hotspot={getHotspot("roof")} isSuggested={suggestedNext === "roof"} onTap={onTap} />
          <HotspotRect hkey="gutters" x={20} y={92} w={280} h={20} hotspot={getHotspot("gutters")} isSuggested={suggestedNext === "gutters"} onTap={onTap} />
          <HotspotRect hkey="siding" x={32} y={114} w={36} h={100} hotspot={getHotspot("siding")} isSuggested={suggestedNext === "siding"} onTap={onTap} />
          <HotspotRect hkey="windows" x={224} y={104} w={36} h={28} hotspot={getHotspot("windows")} isSuggested={suggestedNext === "windows"} onTap={onTap} />
          <HotspotRect hkey="interior" x={72} y={122} w={126} h={94} rx={4} hotspot={getHotspot("interior")} isSuggested={suggestedNext === "interior"} onTap={onTap} />
          <HotspotRect hkey="personal_property" x={224} y={150} w={64} h={66} hotspot={getHotspot("personal_property")} isSuggested={suggestedNext === "personal_property"} onTap={onTap} />
          <HotspotRect hkey="perimeter" x={70} y={222} w={130} h={56} hotspot={getHotspot("perimeter")} isSuggested={suggestedNext === "perimeter"} onTap={onTap} />
          <HotspotRect hkey="exterior_collateral" x={2} y={120} w={28} h={92} hotspot={getHotspot("exterior_collateral")} isSuggested={suggestedNext === "exterior_collateral"} onTap={onTap} />
          <HotspotRect hkey="exterior_collateral" x={290} y={120} w={28} h={92} hotspot={getHotspot("exterior_collateral")} isSuggested={suggestedNext === "exterior_collateral"} onTap={onTap} />
        </svg>
      </div>
    );
  }

  if (variant === "barn") {
    return (
      <div className="hub-house-wrap">
        <svg viewBox="0 0 320 290" className="hub-house-svg" role="img" aria-label="Barn hub">
          <rect x={0} y={0} width={320} height={290} fill="#1a2030" rx={12} />
          {/* Gambrel roof — top + lower segments */}
          <polygon points="160,16 240,70 80,70" fill="#3a2c2a" stroke="#5a4040" />
          <polygon points="80,70 240,70 290,110 30,110" fill="#3a2c2a" stroke="#5a4040" />
          {/* Walls */}
          <rect x={30} y={108} width={260} height={120} fill="#2c1f1c" stroke="#5a4040" />
          {/* Sliding door */}
          <rect x={120} y={130} width={80} height={98} fill="#1a1410" stroke="#5a4040" rx={2} />
          <line x1={160} y1={130} x2={160} y2={228} stroke="#5a4040" strokeWidth={0.5} />
          {/* Hayloft window */}
          <rect x={148} y={36} width={24} height={20} fill="#1a1410" stroke="#5a4040" />
          <line x1={148} y1={46} x2={172} y2={46} stroke="#5a4040" strokeWidth={0.5} />
          {/* Side windows */}
          <rect x={50} y={140} width={28} height={22} fill="#1a1410" stroke="#5a4040" rx={1} />
          <rect x={242} y={140} width={28} height={22} fill="#1a1410" stroke="#5a4040" rx={1} />
          {/* Lawn */}
          <rect x={0} y={228} width={320} height={62} fill="#1e2d1e" />

          <HotspotRect hkey="roof" x={50} y={20} w={220} h={86} hotspot={getHotspot("roof")} isSuggested={suggestedNext === "roof"} onTap={onTap} />
          <HotspotRect hkey="gutters" x={26} y={108} w={268} h={14} hotspot={getHotspot("gutters")} isSuggested={suggestedNext === "gutters"} onTap={onTap} />
          <HotspotRect hkey="siding" x={32} y={130} w={84} h={92} hotspot={getHotspot("siding")} isSuggested={suggestedNext === "siding"} onTap={onTap} />
          <HotspotRect hkey="windows" x={42} y={136} w={48} h={32} hotspot={getHotspot("windows")} isSuggested={suggestedNext === "windows"} onTap={onTap} />
          <HotspotRect hkey="interior" x={120} y={130} w={80} h={96} rx={4} hotspot={getHotspot("interior")} isSuggested={suggestedNext === "interior"} onTap={onTap} />
          <HotspotRect hkey="perimeter" x={20} y={232} w={280} h={50} hotspot={getHotspot("perimeter")} isSuggested={suggestedNext === "perimeter"} onTap={onTap} />
        </svg>
      </div>
    );
  }

  // shed / other
  return (
    <div className="hub-house-wrap">
      <svg viewBox="0 0 320 260" className="hub-house-svg" role="img" aria-label="Shed hub">
        <rect x={0} y={0} width={320} height={260} fill="#1a2030" rx={12} />
        {/* Roof */}
        <polygon points="160,30 250,90 70,90" fill="#2a3348" stroke="#4a5568" />
        {/* Walls */}
        <rect x={70} y={88} width={180} height={110} fill="#222b3a" stroke="#4a5568" />
        {/* Door */}
        <rect x={140} y={120} width={40} height={78} fill="#1a2535" stroke="#3d5070" rx={2} />
        <circle cx={172} cy={159} r={2} fill="#d6b37a" />
        {/* Small window */}
        <rect x={88} y={108} width={28} height={20} fill="#1a2535" stroke="#3d5070" rx={1} />
        <line x1={102} y1={108} x2={102} y2={128} stroke="#3d5070" strokeWidth={0.5} />
        {/* Lawn */}
        <rect x={0} y={198} width={320} height={62} fill="#1e2d1e" />
        <line x1={20} y1={216} x2={290} y2={216} stroke="#243824" strokeWidth={1} />
        <line x1={20} y1={232} x2={290} y2={232} stroke="#243824" strokeWidth={1} />

        <HotspotRect hkey="roof" x={80} y={32} w={160} h={54} hotspot={getHotspot("roof")} isSuggested={suggestedNext === "roof"} onTap={onTap} />
        <HotspotRect hkey="siding" x={74} y={94} w={62} h={102} hotspot={getHotspot("siding")} isSuggested={suggestedNext === "siding"} onTap={onTap} />
        <HotspotRect hkey="windows" x={84} y={104} w={36} h={28} hotspot={getHotspot("windows")} isSuggested={suggestedNext === "windows"} onTap={onTap} />
        <HotspotRect hkey="interior" x={138} y={120} w={44} h={78} rx={4} hotspot={getHotspot("interior")} isSuggested={suggestedNext === "interior"} onTap={onTap} />
        <HotspotRect hkey="perimeter" x={20} y={202} w={280} h={48} hotspot={getHotspot("perimeter")} isSuggested={suggestedNext === "perimeter"} onTap={onTap} />
      </svg>
    </div>
  );
}
