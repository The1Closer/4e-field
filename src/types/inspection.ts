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
  | "personal_property"
  | "exterior_collateral"
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
export type ComponentStatus = "present" | "absent" | "unknown";
export type ComponentCondition = "good" | "fair" | "poor";

export type ComponentPresenceItem = {
  status: ComponentStatus;
  quantity: number | null;
  condition: ComponentCondition | null;
  note?: string;
  /** Legacy compat — treat as status:"present" when migrating old data */
  present?: boolean;
};

export type ComponentPresenceDraft = Record<string, ComponentPresenceItem>;

export const REQUIRED_PHOTO_COUNTS = {
  perimeterPhotos: 8,
  collateralDamage: 0,
  roofOverview: 8,
  roofDamage: 3,
} as const;

export function defaultComponentPresenceDraft(): ComponentPresenceDraft {
  return {};
}

/** Migrate a legacy ComponentPresenceItem ({present, quantity}) to the new shape */
export function migrateComponentItem(raw: Record<string, unknown>): ComponentPresenceItem {
  if ("status" in raw) {
    return raw as unknown as ComponentPresenceItem;
  }
  return {
    status: raw.present === true ? "present" : raw.present === false ? "absent" : "unknown",
    quantity: (raw.quantity as number | null) ?? null,
    condition: null,
    note: "",
  };
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

// ── Personal Property (room-flagged contents capture) ───────────────────────
export type PersonalPropertyRoomKey =
  | "living_room"
  | "dining_room"
  | "kitchen"
  | "master_bedroom"
  | "bedroom_2"
  | "bedroom_3"
  | "bathroom"
  | "office"
  | "basement"
  | string; // custom rooms saved as `custom:<uuid>`

export type PersonalPropertyRoom = {
  id: string;
  key: PersonalPropertyRoomKey;
  customLabel?: string;
  damageCause: DamageCause;
  note: string;
  photoIds: string[];
};

// ── Exterior Collateral (per-item subcards w/ taxonomy) ──────────────────────
export type ExteriorCollateralType =
  | "ac_condenser"
  | "mini_split"
  | "satellite_dish"
  | "mailbox"
  | "address_numbers"
  | "shutters"
  | "exterior_lights"
  | "fence"
  | "deck"
  | "pergola"
  | "awning"
  | "screen_door"
  | "gutter_section"
  | "downspout"
  | "chimney_cap"
  | "vent_cover"
  | "antenna"
  | "solar_panel"
  | "pool_cover"
  | "grill"
  | "patio_furniture"
  | "yard_ornament"
  | "hose_reel"
  | "generator"
  | "other";

export type ExteriorCollateralItem = {
  id: string;
  type: ExteriorCollateralType;
  customTypeLabel?: string;
  condition: SectionCondition | null;
  damageCause: DamageCause;
  note: string;
  photoIds: string[];
};

// ── Detached buildings ────────────────────────────────────────────────────────
export type DetachedBuildingLabel = "shed" | "garage" | "barn" | "other";

export type DetachedBuilding = {
  id: string;
  label: DetachedBuildingLabel;
  customLabel?: string;
  /** True after user presses Submit on the type card; opens its own hub. */
  submitted?: boolean;
  /** Per-section state, same shape as the main house hub. */
  sections?: HubSectionStates;
  /** Optional inhabited-building extras (e.g., garage apartment). */
  personalProperty?: PersonalPropertyRoom[];
  exteriorCollateral?: ExteriorCollateralItem[];
  /** Photos linked to this building only. */
  photoIds?: string[];
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

// ── Building footprint (cached per inspection) ──────────────────────────────
export type BuildingFootprint = {
  /** Polygon ring as [lng, lat] pairs, closed (first === last). */
  polygon: Array<[number, number]>;
  /** Polygon centroid in [lng, lat]. */
  centroid: [number, number];
  source: "osm";
  fetchedAt: string;
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
  personalProperty: PersonalPropertyRoom[];
  exteriorCollateral: ExteriorCollateralItem[];
  testSquares: TestSquare[];
  signatureId: string | null;
  signaturePath: string | null;
  reportBuilder: ReportBuilderPayload | null;
  buildingFootprint?: BuildingFootprint | null;
};
