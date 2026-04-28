export type RoofComponentGroup =
  | "coverings"
  | "edge_trim"
  | "flashing"
  | "ventilation"
  | "penetrations"
  | "fixtures"
  | "specialty";

export type RoofComponentDef = {
  key: string;
  label: string;
  group: RoofComponentGroup;
  helper?: string;
  hasQty: boolean;
  qtyUnit?: string;
  qtyMax?: number;
};

export const ROOF_COMPONENT_GROUP_LABELS: Record<RoofComponentGroup, string> = {
  coverings: "Coverings & Underlayment",
  edge_trim: "Edge & Trim",
  flashing: "Flashing",
  ventilation: "Ventilation",
  penetrations: "Penetrations",
  fixtures: "Fixtures & Equipment",
  specialty: "Specialty",
};

export const ROOF_COMPONENT_GROUP_ORDER: RoofComponentGroup[] = [
  "coverings",
  "edge_trim",
  "flashing",
  "ventilation",
  "penetrations",
  "fixtures",
  "specialty",
];

export const ROOF_COMPONENTS: RoofComponentDef[] = [
  // Coverings & Underlayment
  { key: "underlayment", label: "Underlayment", group: "coverings", helper: "Felt or synthetic layer under shingles", hasQty: false },
  { key: "ice_water_shield", label: "Ice & Water Shield", group: "coverings", helper: "Self-adhesive waterproof membrane at eaves / valleys", hasQty: false },
  { key: "starter_strip", label: "Starter Strip", group: "coverings", helper: "First row along eave before field shingles", hasQty: false },
  { key: "hip_ridge_caps", label: "Hip & Ridge Caps", group: "coverings", helper: "Capping shingles along ridges and hips", hasQty: false },

  // Edge & Trim
  { key: "drip_edge", label: "Drip Edge", group: "edge_trim", helper: "Metal flashing along eaves and rakes", hasQty: true, qtyUnit: "ft", qtyMax: 999 },
  { key: "rake_edge", label: "Rake Edge", group: "edge_trim", helper: "Trim board along sloped gable edges", hasQty: true, qtyUnit: "ft", qtyMax: 999 },
  { key: "fascia", label: "Fascia", group: "edge_trim", helper: "Board at eave where gutters attach", hasQty: true, qtyUnit: "ft", qtyMax: 999 },
  { key: "soffit_vented", label: "Soffit (Vented)", group: "edge_trim", helper: "Perforated soffit allowing attic air intake", hasQty: false },
  { key: "soffit_solid", label: "Soffit (Solid)", group: "edge_trim", helper: "Non-vented soffit panel", hasQty: false },
  { key: "gable_trim", label: "Gable Trim", group: "edge_trim", helper: "Decorative trim along gable ends", hasQty: false },

  // Flashing
  { key: "step_flashing", label: "Step Flashing", group: "flashing", helper: "L-shaped pieces where roof meets a vertical wall", hasQty: false },
  { key: "counter_flashing", label: "Counter Flashing", group: "flashing", helper: "Overlapping flashing that caps step flashing", hasQty: false },
  { key: "apron_flashing", label: "Apron / Headwall Flashing", group: "flashing", helper: "Horizontal flashing at base of a wall", hasQty: false },
  { key: "valley_flashing", label: "Valley Flashing", group: "flashing", helper: "Metal or woven flashing in roof valleys", hasQty: false },
  { key: "pipe_boot", label: "Pipe Boot Flashing", group: "flashing", helper: "Rubber boot sealing around vent pipes", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "chimney_flashing", label: "Chimney Flashing", group: "flashing", helper: "Flashing around chimney base and sides", hasQty: false },
  { key: "kickout_flashing", label: "Kickout Flashing", group: "flashing", helper: "Deflects water away from wall at eave end", hasQty: false },

  // Ventilation
  { key: "ridge_vent", label: "Ridge Vent", group: "ventilation", helper: "Continuous vent along the peak of the ridge", hasQty: true, qtyUnit: "ft", qtyMax: 999 },
  { key: "box_vent", label: "Box / Turtle Vent", group: "ventilation", helper: "Static low-profile exhaust vents on field", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "power_vent", label: "Power Vent (Electric)", group: "ventilation", helper: "Motorized exhaust fan on roof deck", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "turbine_vent", label: "Turbine Vent", group: "ventilation", helper: "Wind-driven spinning exhaust vent", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "soffit_vent", label: "Soffit Vent (Strip)", group: "ventilation", helper: "Continuous or individual soffit intake vents", hasQty: false },
  { key: "gable_vent", label: "Gable Vent", group: "ventilation", helper: "Louvered vent in gable end wall", hasQty: true, qtyUnit: "ea", qtyMax: 99 },

  // Penetrations
  { key: "plumbing_vent_stack", label: "Plumbing Vent Stack", group: "penetrations", helper: "Vertical pipe venting the plumbing drain system", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "furnace_exhaust_vent", label: "Furnace / HVAC Exhaust Vent", group: "penetrations", helper: "Flue or direct-vent pipe for HVAC equipment", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "bathroom_exhaust", label: "Bathroom Exhaust Vent", group: "penetrations", helper: "Small roof cap for bathroom fan exhaust", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "range_hood_vent", label: "Range Hood Vent", group: "penetrations", helper: "Kitchen exhaust cap through roof", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "electrical_mast", label: "Electrical Mast / Weatherhead", group: "penetrations", helper: "Utility service entrance mast through roof", hasQty: false },

  // Fixtures & Equipment
  { key: "chimney", label: "Chimney", group: "fixtures", helper: "Masonry or metal fireplace / furnace flue", hasQty: true, qtyUnit: "ea", qtyMax: 9 },
  { key: "skylight", label: "Skylight", group: "fixtures", helper: "Fixed or operable skylight unit", hasQty: true, qtyUnit: "ea", qtyMax: 99 },
  { key: "solar_panels", label: "Solar Panel Array", group: "fixtures", helper: "Photovoltaic panels mounted on the roof", hasQty: true, qtyUnit: "panels", qtyMax: 999 },
  { key: "satellite_dish", label: "Satellite Dish / Antenna", group: "fixtures", helper: "Dish or TV antenna attached to roof", hasQty: true, qtyUnit: "ea", qtyMax: 9 },
  { key: "lightning_rod", label: "Lightning Rod", group: "fixtures", helper: "Air terminal and down-conductor system", hasQty: false },
  { key: "snow_guards", label: "Snow Guards", group: "fixtures", helper: "Cleats or bars preventing snow slide-off", hasQty: false },
  { key: "gutter_guards", label: "Gutter Guards", group: "fixtures", helper: "Covers or screens over gutters", hasQty: false },

  // Specialty
  { key: "cricket_saddle", label: "Cricket / Saddle", group: "specialty", helper: "Small peaked structure diverting water around chimney", hasQty: false },
  { key: "dormer", label: "Dormer", group: "specialty", helper: "Roofed projection with window(s) in the main roof", hasQty: true, qtyUnit: "ea", qtyMax: 9 },
  { key: "eyebrow_window", label: "Eyebrow Window", group: "specialty", helper: "Low curved dormer window at eave", hasQty: true, qtyUnit: "ea", qtyMax: 9 },
  { key: "roof_hatch", label: "Roof Access Hatch", group: "specialty", helper: "Hatch or scuttle providing roof access from inside", hasQty: false },
];

export const ROOF_COMPONENT_BY_KEY = new Map<string, RoofComponentDef>(
  ROOF_COMPONENTS.map((c) => [c.key, c])
);

export const QUICK_ADD_KEYS = [
  "drip_edge",
  "ridge_vent",
  "step_flashing",
  "pipe_boot",
  "skylight",
  "chimney",
  "box_vent",
  "underlayment",
];

export function groupedComponents(): Array<{ group: RoofComponentGroup; label: string; items: RoofComponentDef[] }> {
  return ROOF_COMPONENT_GROUP_ORDER.map((group) => ({
    group,
    label: ROOF_COMPONENT_GROUP_LABELS[group],
    items: ROOF_COMPONENTS.filter((c) => c.group === group),
  }));
}
