export type InspectionStepKey =
  | "perimeter_photos"
  | "collateral_damage"
  | "roof_overview"
  | "roof_components"
  | "roof_damage"
  | "interior_attic"
  | "report_signature";

// Includes legacy section values so existing historical rows remain representable.
export type CaptureSection =
  | "perimeter_photos"
  | "collateral_damage"
  | "roof_overview"
  | "roof_damage"
  | "interior_attic"
  | "other"
  | "perimeter"
  | "roof"
  | "damage"
  | "interior"
  | "attic";
export type DamageCause = "none" | "hail" | "wind" | "other" | "perimeter";
export type DamageSlope = "front" | "rear" | "left" | "right" | "other";

export type InspectionPhotoDraft = {
  id: string;
  file: File;
  captureSection: CaptureSection;
  damageCause: DamageCause;
  slopeTag: DamageSlope | "";
  customTag: string;
  componentTag: string;
  note: string;
  autoTagged: boolean;
};

export type ComponentPresenceItem = {
  present: boolean;
  quantity: number | null;
};

export type ComponentPresenceDraft = Record<string, ComponentPresenceItem>;

export const COMPONENT_PRESENCE_KEYS = [
  "drip_edge",
  "flashing",
  "soffit",
  "fascia",
  "chimney",
  "skylight",
  "vents",
  "satellite_dish",
];

export const REQUIRED_PHOTO_COUNTS = {
  perimeterPhotos: 8,
  collateralDamage: 0,
  roofOverview: 8,
  roofDamage: 3,
} as const;

export function defaultComponentPresenceDraft(): ComponentPresenceDraft {
  return Object.fromEntries(COMPONENT_PRESENCE_KEYS.map((key) => [key, { present: false, quantity: null }]));
}
