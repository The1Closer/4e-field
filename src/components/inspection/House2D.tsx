"use client";

import React from "react";
import type { HubSectionKey } from "@/types/inspection";
import { HotspotRect, type HotspotInfo, type HotspotState } from "./StructureHotspot";

export type { HotspotState };

type Props = {
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  onAddDetached?: () => void;
  suggestedNext?: HubSectionKey | null;
};

export default function House2D({ hotspots, onTap, onAddDetached, suggestedNext }: Props) {
  const getHotspot = (key: HubSectionKey) => hotspots.find((h) => h.key === key);

  return (
    <div className="hub-house-wrap">
      <svg
        viewBox="0 0 320 340"
        xmlns="http://www.w3.org/2000/svg"
        className="hub-house-svg"
        aria-label="House inspection hub"
        role="img"
      >
        {/* Sky background */}
        <rect x={0} y={0} width={320} height={340} fill="#1a2030" rx={12} />

        {/* ── ROOF SHAPE ────────────────────────────────────────────────── */}
        <polygon points="160,18 310,105 10,105" fill="#2a3348" stroke="#4a5568" strokeWidth={1} />
        <line x1={160} y1={18} x2={310} y2={105} stroke="#3d4f68" strokeWidth={0.5} />
        <line x1={160} y1={18} x2={10} y2={105} stroke="#3d4f68" strokeWidth={0.5} />
        {/* Chimney */}
        <rect x={225} y={42} width={20} height={35} fill="#2a3348" stroke="#4a5568" strokeWidth={1} />
        <rect x={222} y={38} width={26} height={7} fill="#3d4f68" stroke="#4a5568" strokeWidth={0.5} rx={1} />

        {/* ── HOUSE WALLS ───────────────────────────────────────────────── */}
        <rect x={22} y={104} width={276} height={160} fill="#222b3a" stroke="#4a5568" strokeWidth={1} />

        {/* ── GUTTER LINE ───────────────────────────────────────────────── */}
        <rect x={10} y={104} width={300} height={7} fill="#2d3e52" stroke="#4a5568" strokeWidth={0.5} />

        {/* ── FRONT YARD ────────────────────────────────────────────────── */}
        <rect x={0} y={264} width={320} height={76} fill="#1e2d1e" rx={0} />
        {/* Sidewalk */}
        <rect x={115} y={264} width={90} height={76} fill="#2a3028" />
        {/* Path steps */}
        <rect x={125} y={285} width={70} height={6} fill="#323828" rx={1} />
        <rect x={125} y={297} width={70} height={6} fill="#323828" rx={1} />
        <rect x={125} y={309} width={70} height={6} fill="#323828" rx={1} />
        {/* Lawn texture lines */}
        <line x1={30} y1={280} x2={110} y2={280} stroke="#243824" strokeWidth={1.5} />
        <line x1={30} y1={295} x2={110} y2={295} stroke="#243824" strokeWidth={1} />
        <line x1={210} y1={280} x2={290} y2={280} stroke="#243824" strokeWidth={1.5} />
        <line x1={210} y1={295} x2={290} y2={295} stroke="#243824" strokeWidth={1} />

        {/* ── WINDOW PANE DETAILS (decorative — drawn before hotspots) ── */}
        <rect x={200} y={141} width={36} height={28} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={1} />
        <line x1={218} y1={141} x2={218} y2={169} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={200} y1={155} x2={236} y2={155} stroke="#3d5070" strokeWidth={0.5} />
        <rect x={248} y={141} width={36} height={28} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={1} />
        <line x1={266} y1={141} x2={266} y2={169} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={248} y1={155} x2={284} y2={155} stroke="#3d5070" strokeWidth={0.5} />

        {/* ── DOOR DETAILS (decorative) ────────────────────────────────── */}
        <rect x={134} y={203} width={52} height={57} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={2} />
        <circle cx={178} cy={232} r={3} fill="#d6b37a" />
        <line x1={160} y1={203} x2={160} y2={260} stroke="#3d5070" strokeWidth={0.5} />

        {/* ── AC CONDENSER (left side yard, for Exterior Collateral hint) ── */}
        <rect x={4} y={232} width={20} height={28} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={1.5} />
        <line x1={6} y1={238} x2={22} y2={238} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={6} y1={244} x2={22} y2={244} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={6} y1={250} x2={22} y2={250} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={6} y1={256} x2={22} y2={256} stroke="#3d5070" strokeWidth={0.5} />

        {/* ── DECK / FENCE (right side yard, EC hint) ─────────────────── */}
        <rect x={296} y={228} width={22} height={36} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={1} />
        <line x1={297} y1={236} x2={317} y2={236} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={297} y1={244} x2={317} y2={244} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={297} y1={252} x2={317} y2={252} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={297} y1={260} x2={317} y2={260} stroke="#3d5070" strokeWidth={0.5} />

        {/* ── INTERIOR PERSONAL PROPERTY HINT (TV silhouette inside the wall, right of windows) ── */}
        <rect x={222} y={210} width={56} height={36} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={2} />
        <rect x={228} y={216} width={44} height={22} fill="#0f1825" rx={1} />
        <rect x={244} y={244} width={12} height={3} fill="#3d5070" rx={0.5} />

        {/* ── HOTSPOT REGIONS ───────────────────────────────────────────── */}
        <HotspotRect hkey="roof" x={70} y={22} w={180} h={52} hotspot={getHotspot("roof")} isSuggested={suggestedNext === "roof"} onTap={onTap} />
        <HotspotRect hkey="gutters" x={12} y={108} w={296} h={22} hotspot={getHotspot("gutters")} isSuggested={suggestedNext === "gutters"} onTap={onTap} />
        <HotspotRect hkey="siding" x={30} y={134} w={100} h={52} hotspot={getHotspot("siding")} isSuggested={suggestedNext === "siding"} onTap={onTap} />
        <HotspotRect hkey="windows" x={190} y={134} w={100} h={52} hotspot={getHotspot("windows")} isSuggested={suggestedNext === "windows"} onTap={onTap} />
        <HotspotRect hkey="interior" x={126} y={195} w={68} h={65} rx={4} hotspot={getHotspot("interior")} isSuggested={suggestedNext === "interior"} onTap={onTap} />
        <HotspotRect hkey="attic" x={130} y={60} w={60} h={30} hotspot={getHotspot("attic")} isSuggested={suggestedNext === "attic"} onTap={onTap} />
        {/* Perimeter shrunk to sidewalk strip — lawn/yard now covered by exterior collateral */}
        <HotspotRect hkey="perimeter" x={110} y={268} w={100} h={48} hotspot={getHotspot("perimeter")} isSuggested={suggestedNext === "perimeter"} onTap={onTap} />
        {/* Personal Property — interior right wall (over the TV silhouette) */}
        <HotspotRect hkey="personal_property" x={200} y={196} w={98} h={60} hotspot={getHotspot("personal_property")} isSuggested={suggestedNext === "personal_property"} onTap={onTap} />
        {/* Exterior Collateral — left + right side yards (two rects, same key) */}
        <HotspotRect hkey="exterior_collateral" x={2} y={220} w={26} h={48} hotspot={getHotspot("exterior_collateral")} isSuggested={suggestedNext === "exterior_collateral"} onTap={onTap} />
        <HotspotRect hkey="exterior_collateral" x={294} y={220} w={26} h={48} hotspot={getHotspot("exterior_collateral")} isSuggested={suggestedNext === "exterior_collateral"} onTap={onTap} />

        {/* ── STATE INDICATOR RINGS for in-progress hotspots ────────────── */}
        {hotspots
          .filter((h) => h.state === "in_progress")
          .map((h) => {
            const centers: Partial<Record<HubSectionKey, [number, number]>> = {
              roof: [160, 48],
              gutters: [160, 119],
              siding: [80, 160],
              windows: [240, 160],
              interior: [160, 228],
              attic: [160, 75],
              perimeter: [160, 292],
              personal_property: [249, 226],
              exterior_collateral: [15, 244],
            };
            const [cx, cy] = centers[h.key] ?? [160, 170];
            return (
              <circle
                key={`pulse-${h.key}`}
                cx={cx}
                cy={cy}
                r={8}
                fill="none"
                stroke="#d6b37a"
                strokeWidth={1}
                opacity={0.4}
                className="hub-pulse"
              />
            );
          })}
      </svg>

      {/* + Add detached button */}
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
