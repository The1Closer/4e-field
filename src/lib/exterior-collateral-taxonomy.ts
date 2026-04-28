import type { DamageCause, ExteriorCollateralType } from "@/types/inspection";

export type CollateralTypeMeta = {
  key: ExteriorCollateralType;
  label: string;
  icon: string;
  group: "mechanical" | "exterior_finish" | "outdoor_structure" | "drainage" | "specialty" | "contents";
  defaultDamageHint?: DamageCause;
};

export const COLLATERAL_TYPES: CollateralTypeMeta[] = [
  // Mechanical / HVAC
  { key: "ac_condenser", label: "AC Condenser", icon: "❄️", group: "mechanical", defaultDamageHint: "hail" },
  { key: "mini_split", label: "Mini-Split Unit", icon: "🌬️", group: "mechanical", defaultDamageHint: "hail" },
  { key: "generator", label: "Generator", icon: "⚡", group: "mechanical" },
  { key: "solar_panel", label: "Solar Panel", icon: "🔆", group: "mechanical", defaultDamageHint: "hail" },
  // Exterior finish
  { key: "shutters", label: "Exterior Shutters", icon: "🪟", group: "exterior_finish", defaultDamageHint: "wind" },
  { key: "exterior_lights", label: "Exterior Lights", icon: "💡", group: "exterior_finish" },
  { key: "address_numbers", label: "Address Numbers", icon: "🔢", group: "exterior_finish" },
  { key: "mailbox", label: "Mailbox", icon: "📬", group: "exterior_finish" },
  { key: "screen_door", label: "Screen Door", icon: "🚪", group: "exterior_finish", defaultDamageHint: "wind" },
  { key: "awning", label: "Awning", icon: "⛱️", group: "exterior_finish", defaultDamageHint: "wind" },
  // Drainage
  { key: "gutter_section", label: "Gutter Section", icon: "〰️", group: "drainage", defaultDamageHint: "wind" },
  { key: "downspout", label: "Downspout", icon: "🚰", group: "drainage", defaultDamageHint: "wind" },
  { key: "chimney_cap", label: "Chimney Cap", icon: "🏠", group: "drainage", defaultDamageHint: "wind" },
  { key: "vent_cover", label: "Vent Cover", icon: "🌀", group: "drainage", defaultDamageHint: "hail" },
  // Outdoor structures
  { key: "fence", label: "Fence", icon: "🪵", group: "outdoor_structure", defaultDamageHint: "wind" },
  { key: "deck", label: "Deck", icon: "🪜", group: "outdoor_structure" },
  { key: "pergola", label: "Pergola", icon: "🏛️", group: "outdoor_structure", defaultDamageHint: "wind" },
  { key: "pool_cover", label: "Pool Cover", icon: "🏊", group: "outdoor_structure", defaultDamageHint: "wind" },
  // Specialty / antennae
  { key: "satellite_dish", label: "Satellite Dish", icon: "📡", group: "specialty", defaultDamageHint: "wind" },
  { key: "antenna", label: "Antenna", icon: "📶", group: "specialty", defaultDamageHint: "wind" },
  // Contents (movable items damaged outside)
  { key: "grill", label: "Grill / BBQ", icon: "🍖", group: "contents", defaultDamageHint: "wind" },
  { key: "patio_furniture", label: "Patio Furniture", icon: "🪑", group: "contents", defaultDamageHint: "wind" },
  { key: "yard_ornament", label: "Yard Ornament", icon: "🦩", group: "contents", defaultDamageHint: "wind" },
  { key: "hose_reel", label: "Hose Reel", icon: "🪢", group: "contents" },
  // Other
  { key: "other", label: "Other", icon: "❓", group: "specialty" },
];

export const COLLATERAL_GROUP_LABELS: Record<CollateralTypeMeta["group"], string> = {
  mechanical: "Mechanical / HVAC",
  exterior_finish: "Exterior Finish",
  drainage: "Drainage & Roof Edges",
  outdoor_structure: "Outdoor Structures",
  specialty: "Specialty",
  contents: "Outdoor Contents",
};

export function collateralLabel(type: ExteriorCollateralType, customTypeLabel?: string): string {
  if (type === "other" && customTypeLabel?.trim()) return customTypeLabel.trim();
  return COLLATERAL_TYPES.find((t) => t.key === type)?.label ?? type;
}

export function collateralMeta(type: ExteriorCollateralType): CollateralTypeMeta {
  return COLLATERAL_TYPES.find((t) => t.key === type) ?? COLLATERAL_TYPES[COLLATERAL_TYPES.length - 1];
}
