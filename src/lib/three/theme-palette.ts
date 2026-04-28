import type { HotspotState } from "@/components/inspection/StructureHotspot";

export type ScenePalette = {
  bg: string;
  ground: string;
  walls: string;
  trim: string;
  roof: string;
  roofAccent: string;
  chimney: string;
  door: string;
  windowFrame: string;
  windowGlass: string;
  foundation: string;
  sidewalk: string;
  ac: string;
  acFins: string;
  fence: string;
  treeTrunk: string;
  treeFoliage: string;
  shrub: string;
  brand: string;
  brandPulse: string;
  good: string;
  warn: string;
  bad: string;
};

export const PALETTE_DARK: ScenePalette = {
  bg: "#0f1320",
  ground: "#27332b",
  walls: "#3a3528",
  trim: "#1a1f2c",
  roof: "#1f2530",
  roofAccent: "#293040",
  chimney: "#2a2e38",
  door: "#5c3d24",
  windowFrame: "#0f1320",
  windowGlass: "#3d5878",
  foundation: "#3a4250",
  sidewalk: "#5a5a52",
  ac: "#1f2530",
  acFins: "#3a4250",
  fence: "#2a2419",
  treeTrunk: "#3a2516",
  treeFoliage: "#3a5a3a",
  shrub: "#2f4a2f",
  brand: "#d6b37a",
  brandPulse: "#f0c168",
  good: "#2f8a46",
  warn: "#d6b37a",
  bad: "#c0312f",
};

export const PALETTE_LIGHT: ScenePalette = {
  bg: "#eef3f8",
  ground: "#7ba67b",
  walls: "#e8ddc9",
  trim: "#1a1f2c",
  roof: "#3f4a5a",
  roofAccent: "#5a6378",
  chimney: "#5a6275",
  door: "#7b5230",
  windowFrame: "#1a1f2c",
  windowGlass: "#a8c8e8",
  foundation: "#9aa0a8",
  sidewalk: "#c7c2b8",
  ac: "#9aa0a8",
  acFins: "#5a6378",
  fence: "#8a6a3a",
  treeTrunk: "#6b4a2a",
  treeFoliage: "#5a8a5a",
  shrub: "#6a906a",
  brand: "#c79b56",
  brandPulse: "#f0c168",
  good: "#2f8a46",
  warn: "#c79b56",
  bad: "#c0312f",
};

export function paletteForTheme(isLight: boolean): ScenePalette {
  return isLight ? PALETTE_LIGHT : PALETTE_DARK;
}

export function hotspotColor(state: HotspotState, palette: ScenePalette): string {
  if (state === "complete" || state === "override_complete") return palette.good;
  if (state === "in_progress") return palette.warn;
  return palette.brand;
}

export function hotspotEmissive(state: HotspotState): number {
  if (state === "in_progress") return 0.6;
  if (state === "complete" || state === "override_complete") return 0.4;
  return 0.18;
}
