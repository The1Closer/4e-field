// ── Legacy step keys (v2 7-step flow, kept for backward compat) ──────────────
export type InspectionStepKey =
  | "perimeter_photos"
  | "collateral_damage"
  | "roof_overview"
  | "roof_components"
  | "roof_damage"
  | "interior_attic"
  | "report_signature";

// ── New hub section keys (v3) ─────────────────────────────────────────────────
export type HubSectionKey =
  | "roof"
  | "perimeter"
  | "siding"
  | "gutters"
  | "windows"
  | "interior"
  | "attic"
  | "detached";

// Roof sub-hub cards
export type RoofCardKey = "overview" | "damage" | "components";

export type SectionCondition = "good" | "damaged" | "missing" | "not_visible";

// ── Photo capture ─────────────────────────────────────────────────────────────
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
  | "attic"
  | "siding"
  | "gutters"
  | "windows"
  | "roof_damage_test_square";

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
  /** Set to a test square id when photo belongs to a test square */
  testSquareId?: string;
  /** Set when uploaded to Supabase; used for PDF + CRM */
  uploadedPath?: string;
};

// ── Component presence ────────────────────────────────────────────────────────
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

// ── Roof damage / test squares ────────────────────────────────────────────────
export type TestSquare = {
  id: string;
  slope: DamageSlope | "";
  photoId: string | null;
  hitCount: number | null;
  note: string;
  createdAt: string;
};

export type RoofDamageMetrics = {
  windShingleCount: number | null;
  hailCount: number | null;
  slopesAffected: DamageSlope[];
  testSquares: TestSquare[];
};

// ── Detached buildings ────────────────────────────────────────────────────────
export type DetachedBuildingLabel = "shed" | "garage" | "barn" | "other";

export type DetachedBuilding = {
  id: string;
  label: DetachedBuildingLabel;
  customLabel?: string;
  completedAt: string | null;
};

// ── Per-section state stored in hub ──────────────────────────────────────────
export type SectionState = {
  condition: SectionCondition | null;
  note: string;
  manualComplete: boolean;
  manualIncomplete: boolean;
};

export type HubSectionStates = Partial<Record<HubSectionKey, SectionState>>;

// ── Report builder ────────────────────────────────────────────────────────────
export type ReportSection = {
  key: string;
  title: string;
  visible: boolean;
  includePhotos: boolean;
  photoIds: string[];
};

export type ReportBuilderPayload = {
  cover: {
    intro: string;
    coverPhotoId: string | null;
  };
  sections: ReportSection[];
  closing: {
    notes: string;
  };
  contingent: boolean;
  signatureId: string | null;
  signaturePath: string | null;
};

// ── Legacy report section selection (v2, kept for backward compat) ────────────
export type ReportSectionSelection = {
  homeowner: boolean;
  perimeterPhotos: boolean;
  collateralDamage: boolean;
  roofOverview: boolean;
  roofComponents: boolean;
  roofDamage: boolean;
  interiorAttic: boolean;
  signature: boolean;
  summaryNotes: boolean;
};

// ── Inspection metadata shape (new hub fields) ────────────────────────────────
export type InspectionHubMetadata = {
  guidedFlowVersion: "v3";
  shingleLengthInches: string | null;
  shingleWidthInches: string | null;
  dripEdgePresent: "yes" | "no" | "na" | null;
  estimatedRoofAgeYears: number | null;
  layerCount: "1" | "2" | "3+" | null;
  layerPhotoId: string | null;
  contingent: boolean;
  notes: string;
  roofDamage: RoofDamageMetrics;
  sectionStates: HubSectionStates;
  detachedBuildings: DetachedBuilding[];
  testSquares: TestSquare[];
  signatureId: string | null;
  signaturePath: string | null;
  reportBuilder: ReportBuilderPayload | null;
};
