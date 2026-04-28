"use client";

import React from "react";
import type { HubSectionKey } from "@/types/inspection";

export type HotspotState = "untouched" | "in_progress" | "complete" | "override_complete";

type HotspotInfo = {
  key: HubSectionKey;
  label: string;
  state: HotspotState;
};

type Props = {
  hotspots: HotspotInfo[];
  onTap: (key: HubSectionKey) => void;
  onAddDetached?: () => void;
  suggestedNext?: HubSectionKey | null;
};

const HOTSPOT_STYLE: Record<HotspotState, { fill: string; stroke: string; opacity: number }> = {
  untouched: { fill: "transparent", stroke: "#d6b37a", opacity: 0.85 },
  in_progress: { fill: "#d6b37a33", stroke: "#d6b37a", opacity: 1 },
  complete: { fill: "#2f8a4622", stroke: "#2f8a46", opacity: 1 },
  override_complete: { fill: "#2f8a4622", stroke: "#2f8a46", opacity: 1 },
};

function stateIcon(state: HotspotState) {
  if (state === "complete" || state === "override_complete") return "✓";
  if (state === "in_progress") return "•";
  return null;
}

export default function HouseHub({ hotspots, onTap, onAddDetached, suggestedNext }: Props) {
  const getHotspot = (key: HubSectionKey) => hotspots.find((h) => h.key === key);

  function HotspotRect({
    hkey,
    x,
    y,
    w,
    h,
    rx = 6,
  }: {
    hkey: HubSectionKey;
    x: number;
    y: number;
    w: number;
    h: number;
    rx?: number;
  }) {
    const hp = getHotspot(hkey);
    if (!hp) return null;
    const style = HOTSPOT_STYLE[hp.state];
    const icon = stateIcon(hp.state);
    const isSuggested = suggestedNext === hkey;

    return (
      <g
        className={`hub-hotspot${isSuggested ? " hub-hotspot--suggested" : ""}`}
        onClick={() => onTap(hkey)}
        role="button"
        aria-label={hp.label}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onTap(hkey);
        }}
        style={{ cursor: "pointer" }}
      >
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={rx}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={isSuggested ? 2.5 : 1.5}
          opacity={style.opacity}
        />
        {icon ? (
          <text
            x={x + w - 12}
            y={y + 14}
            fontSize={12}
            fill={hp.state === "complete" || hp.state === "override_complete" ? "#2f8a46" : "#d6b37a"}
            fontWeight="bold"
            textAnchor="middle"
          >
            {icon}
          </text>
        ) : null}
        <text x={x + w / 2} y={y + h / 2 + 5} fontSize={11} fill="#e8d5b0" textAnchor="middle" pointerEvents="none">
          {hp.label}
        </text>
      </g>
    );
  }

  // SVG viewBox 0 0 320 340 — scales to any width
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
        {/* Main roof silhouette */}
        <polygon points="160,18 310,105 10,105" fill="#2a3348" stroke="#4a5568" strokeWidth={1} />
        {/* Roof ridge accent line */}
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

        {/* ── HOTSPOT REGIONS ───────────────────────────────────────────── */}
        {/* ROOF — covers the roof triangle */}
        <HotspotRect hkey="roof" x={70} y={22} w={180} h={52} />

        {/* GUTTERS — along the eave line */}
        <HotspotRect hkey="gutters" x={12} y={108} w={296} h={22} />

        {/* SIDING — large wall area, center */}
        <HotspotRect hkey="siding" x={30} y={134} w={100} h={52} />

        {/* WINDOWS — right side of wall */}
        <HotspotRect hkey="windows" x={190} y={134} w={100} h={52} />

        {/* Front door / INTERIOR */}
        <HotspotRect hkey="interior" x={126} y={195} w={68} h={65} rx={4} />

        {/* ATTIC — gable area in roof */}
        <HotspotRect hkey="attic" x={130} y={60} w={60} h={30} />

        {/* PERIMETER — front yard / sidewalk area */}
        <HotspotRect hkey="perimeter" x={24} y={268} w={272} h={48} />

        {/* ── WINDOW PANE DETAILS (decorative) ──────────────────────────── */}
        <rect x={200} y={141} width={36} height={28} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={1} />
        <line x1={218} y1={141} x2={218} y2={169} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={200} y1={155} x2={236} y2={155} stroke="#3d5070" strokeWidth={0.5} />
        <rect x={248} y={141} width={36} height={28} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={1} />
        <line x1={266} y1={141} x2={266} y2={169} stroke="#3d5070" strokeWidth={0.5} />
        <line x1={248} y1={155} x2={284} y2={155} stroke="#3d5070" strokeWidth={0.5} />

        {/* ── DOOR DETAILS ──────────────────────────────────────────────── */}
        <rect x={134} y={203} width={52} height={57} fill="#1a2535" stroke="#3d5070" strokeWidth={0.75} rx={2} />
        <circle cx={178} cy={232} r={3} fill="#d6b37a" />
        <line x1={160} y1={203} x2={160} y2={260} stroke="#3d5070" strokeWidth={0.5} />

        {/* ── STATE INDICATOR RINGS for in-progress hotspots ────────────── */}
        {hotspots
          .filter((h) => h.state === "in_progress")
          .map((h) => (
            <circle
              key={`pulse-${h.key}`}
              cx={160}
              cy={170}
              r={8}
              fill="none"
              stroke="#d6b37a"
              strokeWidth={1}
              opacity={0.4}
              className="hub-pulse"
            />
          ))}
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
