export type HeatmapLayer =
  | "conversions"
  | "approval_rate"
  | "knock_density"
  | "inspection_rate"
  | "contingency_close";

export type HeatmapCell = {
  hexKey: string;
  centerLat: number;
  centerLng: number;
  value: number;
  knocks: number;
  talks: number;
  inspections: number;
  contingencies: number;
  conversions: number;
  approvals: number;
  jobsTotal: number;
};

export type AreaSuggestion = {
  areaKey: string;
  centerLat: number;
  centerLng: number;
  zip: string | null;
  score: number;
  rank: number;
  reasons: string[];
};

export type SessionFeedback = {
  knocksPerHour: number;
  talkRate: number;
  inspectionRate: number;
  contingencyRate: number;
};
