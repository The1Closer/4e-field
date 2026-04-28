"use client";

import React from "react";
import type { HubSectionKey } from "@/types/inspection";

export type HotspotState = "untouched" | "in_progress" | "complete" | "override_complete";

export type HotspotInfo = {
  key: HubSectionKey;
  label: string;
  state: HotspotState;
};

export const HOTSPOT_STYLE: Record<HotspotState, { fill: string; stroke: string; opacity: number }> = {
  untouched: { fill: "transparent", stroke: "#d6b37a", opacity: 0.85 },
  in_progress: { fill: "#d6b37a33", stroke: "#d6b37a", opacity: 1 },
  complete: { fill: "#2f8a4622", stroke: "#2f8a46", opacity: 1 },
  override_complete: { fill: "#2f8a4622", stroke: "#2f8a46", opacity: 1 },
};

export function stateIcon(state: HotspotState): string | null {
  if (state === "complete" || state === "override_complete") return "✓";
  if (state === "in_progress") return "•";
  return null;
}

type RectProps = {
  hkey: HubSectionKey;
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  hotspot: HotspotInfo | undefined;
  isSuggested: boolean;
  onTap: (key: HubSectionKey) => void;
};

export function HotspotRect({ hkey, x, y, w, h, rx = 6, hotspot, isSuggested, onTap }: RectProps) {
  if (!hotspot) return null;
  const style = HOTSPOT_STYLE[hotspot.state];
  const icon = stateIcon(hotspot.state);
  return (
    <g
      className={`hub-hotspot${isSuggested ? " hub-hotspot--suggested" : ""}`}
      onClick={() => onTap(hkey)}
      role="button"
      aria-label={hotspot.label}
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
          fill={hotspot.state === "complete" || hotspot.state === "override_complete" ? "#2f8a46" : "#d6b37a"}
          fontWeight="bold"
          textAnchor="middle"
        >
          {icon}
        </text>
      ) : null}
      <text x={x + w / 2} y={y + h / 2 + 5} fontSize={11} fill="#e8d5b0" textAnchor="middle" pointerEvents="none">
        {hotspot.label}
      </text>
    </g>
  );
}
