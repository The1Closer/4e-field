"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { loadGoogleMaps } from "@/lib/google-maps";
import { managerLike } from "@/lib/knocking";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { HeatmapCell, HeatmapLayer } from "@/types/field-intelligence";
import type { JsonRecord } from "@/types/models";

type KnockEventRow = JsonRecord & {
  id: string;
  rep_id: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
  outcome?: string | null;
  homeowner_name?: string | null;
  contingencies_delta?: number | null;
  linked_job_id?: string | null;
};

type PotentialLeadRow = JsonRecord & {
  id: string;
  rep_id: string;
  address?: string | null;
  address_normalized?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  homeowner_name?: string | null;
  homeowner_phone?: string | null;
  homeowner_email?: string | null;
  lead_source?: string | null;
  lead_status?: string | null;
  best_contact_time?: string | null;
  follow_up_at?: string | null;
  notes?: string | null;
  additional_details?: string | null;
};

type PotentialLeadDocumentRow = JsonRecord & {
  id: string;
  lead_id: string;
  rep_id: string;
  file_name: string;
  file_path: string;
  content_type?: string | null;
  size_bytes?: number | null;
  created_at?: string | null;
};

type LeadDraft = {
  address: string;
  homeownerName: string;
  homeownerPhone: string;
  homeownerEmail: string;
  leadSource: string;
  leadStatus: string;
  bestContactTime: string;
  followUpAtLocal: string;
  notes: string;
  additionalDetails: string;
  latitude: string;
  longitude: string;
};

type LeadStatus =
  | "new"
  | "contacted"
  | "appointment_set"
  | "not_interested"
  | "do_not_knock";

type DoorPin = {
  address: string;
  lat: number | null;
  lng: number | null;
  knocks: number;
  knockEventIds: string[];
  potentialLeadCount: number;
  lastKnockedAt: string | null;
  lastOutcome: string | null;
  lastHomeownerName: string | null;
  latestPotentialLeadNote: string | null;
  lastPotentialLeadAt: string | null;
  lastPotentialLeadRepId: string | null;
  lastPotentialLeadRepName: string | null;
  lastKnockedRepId: string | null;
  lastKnockedRepName: string | null;
  resolvedLeadStatus: LeadStatus | null;
  repCount: number;
};

type JobStageRow = {
  id: string;
  stage_id: number | null;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
};

type DoorPinAggregate = DoorPin & {
  repIds: Set<string>;
  linkedJobIds: Set<string>;
  hasContingencyEvent: boolean;
  leadStatusUpdatedAtMs: number;
  knockEventIdSet: Set<string>;
};

type RouteSummary = {
  stopCount: number;
  totalDistanceMiles: number;
  totalDurationMinutes: number;
};

type RouteLaunchSegment = {
  id: string;
  label: string;
  stopCount: number;
  url: string;
};

type StatusFilterKey = LeadStatus | "no_lead";
type RouteStartMode = "pin" | "user_location";
type MapMode = "pins" | "heatmap";

const CONTINGENCY_STAGE_ID = 2;
const LEAD_DOC_BUCKET = "knock-potential-lead-documents";
const HEATMAP_LAYERS: Array<{ value: HeatmapLayer; label: string }> = [
  { value: "conversions", label: "Conversions" },
  { value: "approval_rate", label: "Approval Rate" },
  { value: "knock_density", label: "Knock Density" },
  { value: "inspection_rate", label: "Inspection Rate" },
  { value: "contingency_close", label: "Contingency Rate" },
];

const POTENTIAL_LEAD_SELECT =
  "id,rep_id,address,address_normalized,latitude,longitude,created_at,updated_at,homeowner_name,homeowner_phone,homeowner_email,lead_source,lead_status,best_contact_time,follow_up_at,notes,additional_details";

const LEAD_DOCUMENT_SELECT =
  "id,lead_id,rep_id,file_name,file_path,content_type,size_bytes,created_at";

const LEAD_STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "appointment_set", label: "Appointment Set" },
  { value: "not_interested", label: "Not Interested" },
  { value: "do_not_knock", label: "Do Not Knock" },
];

const LEAD_STATUS_LEGEND: Array<{ status: LeadStatus | null; label: string }> = [
  ...LEAD_STATUS_OPTIONS.map((option) => ({
    status: option.value,
    label: option.label,
  })),
  { status: null, label: "No Lead Record" },
];
const NO_LEAD_STATUS_KEY: StatusFilterKey = "no_lead";

const LEAD_STATUS_SET = new Set<LeadStatus>(
  LEAD_STATUS_OPTIONS.map((option) => option.value),
);

function parseLeadStatus(value: unknown): LeadStatus | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim() as LeadStatus;
  return LEAD_STATUS_SET.has(trimmed) ? trimmed : null;
}

function getLeadStatusLabel(status: LeadStatus | null) {
  if (!status) return "No Lead Record";
  return (
    LEAD_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    "No Lead Record"
  );
}

function getStatusFilterKey(status: LeadStatus | null): StatusFilterKey {
  return status ?? NO_LEAD_STATUS_KEY;
}

function getLeadStatusMarkerMeta(status: LeadStatus | null) {
  switch (status) {
    case "new":
      return { fill: "#3b82f6", label: "New" };
    case "contacted":
      return { fill: "#f97316", label: "Contacted" };
    case "appointment_set":
      return { fill: "#22c55e", label: "Appointment Set" };
    case "not_interested":
      return { fill: "#eab308", label: "Not Interested" };
    case "do_not_knock":
      return { fill: "#ef4444", label: "Do Not Knock" };
    default:
      return { fill: "#64748b", label: "No Lead Record" };
  }
}

function getLeadStatusMarkerIcon(maps: any, status: LeadStatus | null) {
  const meta = getLeadStatusMarkerMeta(status);
  const symbolSvg = (() => {
    switch (status) {
      case "new":
        return `<text x="21" y="22.8" text-anchor="middle" font-family="Arial, sans-serif" font-size="8.2" font-weight="700" fill="#0f172a">NEW</text>`;
      case "contacted":
        return `<path d="M16.1 16.7c.5-.5 1.3-.6 1.8-.2l2.3 1.9c.5.4.7 1.2.3 1.8l-1.1 1.6c.8 1.6 2.1 3 3.7 3.8l1.6-1.1c.7-.4 1.4-.3 1.9.3l1.9 2.3c.4.5.3 1.3-.2 1.8l-1.3 1.1c-1.1 1-2.7 1.2-4 .6-2.3-1.1-4.4-2.7-6.1-4.6-1.9-1.7-3.5-3.8-4.6-6.1-.6-1.3-.4-2.9.6-4l1.2-1.2Z" fill="#0f172a"/>`;
      case "appointment_set":
        return `<rect x="12.8" y="13.8" width="16.4" height="14.5" rx="2.2" fill="#0f172a"/><rect x="12.8" y="17.3" width="16.4" height="11" rx="1.8" fill="#f8fafc"/><rect x="16.1" y="12.3" width="2.1" height="4.4" rx="1" fill="#0f172a"/><rect x="23.8" y="12.3" width="2.1" height="4.4" rx="1" fill="#0f172a"/><rect x="16.2" y="20.6" width="9.6" height="1.7" rx=".8" fill="#0f172a"/><rect x="16.2" y="23.7" width="6.1" height="1.7" rx=".8" fill="#0f172a"/>`;
      case "not_interested":
        return `<polygon points="21,11.5 30.4,28.5 11.6,28.5" fill="#eab308" stroke="#0f172a" stroke-width="1.9"/><rect x="19.9" y="17.9" width="2.2" height="6.2" rx="1.1" fill="#0f172a"/><circle cx="21" cy="26.2" r="1.2" fill="#0f172a"/>`;
      case "do_not_knock":
        return `<path d="M13.4 26.8h15.2l-1.4-6.4c-.6-2.5-2.5-4.5-4.9-5.1v-2.3a1 1 0 1 0-2 0v2.3c-2.4.6-4.3 2.6-4.9 5.1l-1.3 6.4Z" fill="#ef4444" stroke="#0f172a" stroke-width="1.5"/><circle cx="21" cy="28.8" r="1.8" fill="#0f172a"/><path d="M12.5 17.7l-2.1-2.1M29.5 17.7l2.1-2.1" stroke="#0f172a" stroke-width="1.6" stroke-linecap="round"/>`;
      default:
        return `<text x="21" y="24.8" text-anchor="middle" font-family="Arial, sans-serif" font-size="14.5" font-weight="700" fill="#0f172a">-</text>`;
    }
  })();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="42" height="56" viewBox="0 0 42 56">
      <circle cx="21" cy="21" r="16.2" fill="#f8fafc" stroke="${meta.fill}" stroke-width="4.2"/>
      <path d="M21 53L15.4 34.8H26.6L21 53Z" fill="${meta.fill}" stroke="#0f172a" stroke-width="1.4"/>
      ${symbolSvg}
    </svg>
  `;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(38, 50),
    anchor: new maps.Point(19, 49),
    labelOrigin: new maps.Point(19, 18),
  };
}

function getMarkerInfoWindowContent(pin: DoorPin) {
  return `
    <div style="font-family: system-ui; min-width: 240px; color: var(--ink); background: var(--panel); padding: 4px 6px; border-radius: 8px;">
      <strong>${pin.address}</strong><br/>
      <span>${pin.knocks > 0 ? `Knocks: ${pin.knocks}` : `Potential leads: ${pin.potentialLeadCount}`}</span><br/>
      <span>Last activity: ${formatDateTime(pin.lastKnockedAt)}</span><br/>
      <span>Outcome: ${displayOutcome(pin.knocks > 0 ? pin.lastOutcome : "potential_lead")}</span><br/>
      <span>Lead status: ${getLeadStatusLabel(pin.resolvedLeadStatus)}</span><br/>
      <span>Homeowner: ${pin.lastHomeownerName ?? "-"}</span>
    </div>
  `;
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDateMs(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatBytes(sizeBytes: number | null | undefined) {
  if (!Number.isFinite(sizeBytes ?? null) || (sizeBytes ?? 0) <= 0) return "-";
  const bytes = Number(sizeBytes);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function distanceMetersBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function formatMiles(miles: number) {
  if (!Number.isFinite(miles)) return "-";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function formatMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatLatLng(lat: number, lng: number) {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function buildGoogleMapsDirectionsUrl(params: {
  origin: string;
  destination: string;
  waypointLocations: string[];
}) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", params.origin);
  url.searchParams.set("destination", params.destination);
  url.searchParams.set("travelmode", "driving");
  if (params.waypointLocations.length > 0) {
    url.searchParams.set("waypoints", params.waypointLocations.join("|"));
  }
  return url.toString();
}

async function getBrowserGeolocation(): Promise<{ lat: number; lng: number }> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    throw new Error("Geolocation is not available in this browser.");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => {
        reject(
          new Error(
            error.message || "Could not read your current location.",
          ),
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 },
    );
  });
}

function displayOutcome(value: string | null) {
  if (value === "no_answer") return "No Answer";
  if (value === "soft_set") return "Soft Set";
  if (value === "inspection") return "Inspection";
  if (value === "no") return "No";
  if (value === "potential_lead") return "Potential Lead";
  return value ?? "-";
}

function toLocalInputDateTime(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toUtcIsoFromLocalInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseOptionalNumberInput(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function sanitizeFileName(name: string) {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : "document";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function makeLeadDraftFromRow(row: PotentialLeadRow): LeadDraft {
  const parsedLeadStatus = parseLeadStatus(row.lead_status);
  return {
    address: typeof row.address === "string" ? row.address : "",
    homeownerName: typeof row.homeowner_name === "string" ? row.homeowner_name : "",
    homeownerPhone: typeof row.homeowner_phone === "string" ? row.homeowner_phone : "",
    homeownerEmail: typeof row.homeowner_email === "string" ? row.homeowner_email : "",
    leadSource: typeof row.lead_source === "string" ? row.lead_source : "",
    leadStatus: parsedLeadStatus ?? "new",
    bestContactTime: typeof row.best_contact_time === "string" ? row.best_contact_time : "",
    followUpAtLocal: toLocalInputDateTime(row.follow_up_at),
    notes: typeof row.notes === "string" ? row.notes : "",
    additionalDetails:
      typeof row.additional_details === "string" ? row.additional_details : "",
    latitude:
      typeof row.latitude === "number" && Number.isFinite(row.latitude)
        ? String(row.latitude)
        : "",
    longitude:
      typeof row.longitude === "number" && Number.isFinite(row.longitude)
        ? String(row.longitude)
        : "",
  };
}

function makeNewLeadDraftForAddress(
  address: string,
  lat: number | null,
  lng: number | null,
): LeadDraft {
  return {
    address,
    homeownerName: "",
    homeownerPhone: "",
    homeownerEmail: "",
    leadSource: "",
    leadStatus: "new",
    bestContactTime: "",
    followUpAtLocal: "",
    notes: "",
    additionalDetails: "",
    latitude:
      typeof lat === "number" && Number.isFinite(lat) ? String(lat) : "",
    longitude:
      typeof lng === "number" && Number.isFinite(lng) ? String(lng) : "",
  };
}

async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  if (items.length === 0) return;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await worker(items[currentIndex]);
      }
    }),
  );
}

async function geocodeAddress(address: string, apiKey: string) {
  if (!apiKey.trim()) return null;

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&key=${encodeURIComponent(apiKey)}`,
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      geometry?: {
        location?: {
          lat?: number;
          lng?: number;
        };
      };
    }>;
  };

  if (payload.status !== "OK") return null;

  const location = payload.results?.[0]?.geometry?.location;
  if (!location) return null;

  const lat = toNumber(location.lat);
  const lng = toNumber(location.lng);
  if (lat === null || lng === null) return null;

  return { lat, lng };
}

export default function KnockingDoorsPage() {
  const router = useRouter();
  const {
    user,
    loading,
    role,
    signOut,
    accessToken,
    error: authError,
    profileImageUrl,
    fullName,
  } = useAuthSession();
  const supabase = getSupabaseBrowserClient();

  const [pins, setPins] = useState<DoorPin[]>([]);
  const [leadRows, setLeadRows] = useState<PotentialLeadRow[]>([]);
  const [documentsByLeadId, setDocumentsByLeadId] = useState<
    Record<string, PotentialLeadDocumentRow[]>
  >({});
  const [repNameById, setRepNameById] = useState<Record<string, string>>({});

  const [expandedPinKeys, setExpandedPinKeys] = useState<string[]>([]);
  const [leadDraftById, setLeadDraftById] = useState<Record<string, LeadDraft>>(
    {},
  );
  const [newLeadDraftByAddress, setNewLeadDraftByAddress] = useState<
    Record<string, LeadDraft>
  >({});
  const [selectedFileByLeadId, setSelectedFileByLeadId] = useState<
    Record<string, File | null>
  >({});

  const [searchTerm, setSearchTerm] = useState("");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [loadingPins, setLoadingPins] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [savingNewAddressKey, setSavingNewAddressKey] = useState<string | null>(
    null,
  );
  const [deletingPinKey, setDeletingPinKey] = useState<string | null>(null);
  const [uploadingLeadId, setUploadingLeadId] = useState<string | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(
    null,
  );
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null,
  );

  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>("pins");
  const [heatmapLayer, setHeatmapLayer] = useState<HeatmapLayer>("conversions");
  const [heatmapDays, setHeatmapDays] = useState<number>(30);
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCell[]>([]);
  const [loadingHeatmap, setLoadingHeatmap] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [isDrawingRouteCircle, setIsDrawingRouteCircle] = useState(false);
  const [hasRouteCircle, setHasRouteCircle] = useState(false);
  const [routeCircleRadiusMilesInput, setRouteCircleRadiusMilesInput] =
    useState("");
  const [selectedRoutePinKeys, setSelectedRoutePinKeys] = useState<string[]>([]);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routeLaunchUrl, setRouteLaunchUrl] = useState<string | null>(null);
  const [routeLaunchSegments, setRouteLaunchSegments] = useState<
    RouteLaunchSegment[]
  >([]);
  const [completedRouteLaunchIds, setCompletedRouteLaunchIds] = useState<
    string[]
  >([]);
  const [buildingRoute, setBuildingRoute] = useState(false);
  const [routeStartPromptOpen, setRouteStartPromptOpen] = useState(false);
  const [routeStartMode, setRouteStartMode] = useState<RouteStartMode>("pin");
  const [routeStartPinKey, setRouteStartPinKey] = useState<string>("");
  const [activeMapStatusFilters, setActiveMapStatusFilters] = useState<
    StatusFilterKey[]
  >(() => LEAD_STATUS_LEGEND.map((item) => getStatusFilterKey(item.status)));

  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapsApiRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const heatmapCirclesRef = useRef<any[]>([]);
  const drawingManagerRef = useRef<any>(null);
  const routeCircleRef = useRef<any>(null);
  const routeCircleListenersRef = useRef<any[]>([]);
  const directionsRenderersRef = useRef<any[]>([]);
  const geocodeCacheRef = useRef<
    Map<string, { lat: number; lng: number } | null>
  >(new Map());

  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const managerView = managerLike(role);

  const locatedPins = useMemo(
    () => pins.filter((pin) => pin.lat !== null && pin.lng !== null),
    [pins],
  );
  const mapVisiblePins = useMemo(() => {
    const activeFilters = new Set(activeMapStatusFilters);
    return locatedPins.filter((pin) =>
      activeFilters.has(getStatusFilterKey(pin.resolvedLeadStatus)),
    );
  }, [activeMapStatusFilters, locatedPins]);
  const mappableLeadPins = useMemo(
    () => mapVisiblePins.filter((pin) => pin.potentialLeadCount > 0),
    [mapVisiblePins],
  );
  const selectedRoutePins = useMemo(() => {
    const selectedKeys = new Set(selectedRoutePinKeys);
    return mappableLeadPins.filter((pin) =>
      selectedKeys.has(normalizeAddress(pin.address)),
    );
  }, [mappableLeadPins, selectedRoutePinKeys]);
  const selectedRoutePinOptions = useMemo(
    () =>
      selectedRoutePins
        .filter((pin) => pin.lat !== null && pin.lng !== null)
        .map((pin) => ({
          key: normalizeAddress(pin.address),
          label: pin.address,
        })),
    [selectedRoutePins],
  );

  const potentialLeadAddresses = useMemo(
    () => pins.filter((pin) => pin.potentialLeadCount > 0).length,
    [pins],
  );

  const filteredPins = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return pins;
    return pins.filter((pin) => {
      const addressMatch = pin.address.toLowerCase().includes(query);
      const homeownerMatch = (pin.lastHomeownerName ?? "")
        .toLowerCase()
        .includes(query);
      const outcomeMatch = (pin.lastOutcome ?? "").toLowerCase().includes(query);
      return addressMatch || homeownerMatch || outcomeMatch;
    });
  }, [pins, searchTerm]);

  const visiblePins = useMemo(() => filteredPins.slice(0, 24), [filteredPins]);

  const leadsByAddress = useMemo(() => {
    const grouped = new Map<string, PotentialLeadRow[]>();

    leadRows.forEach((lead) => {
      const address =
        typeof lead.address === "string" ? lead.address.trim() : "";
      const key = normalizeAddress(address);
      if (!key) return;

      const current = grouped.get(key) ?? [];
      current.push(lead);
      grouped.set(key, current);
    });

    grouped.forEach((list) =>
      list.sort((a, b) => toDateMs(b.created_at) - toDateMs(a.created_at)),
    );
    return grouped;
  }, [leadRows]);

  const recomputeRouteCircleSelection = useCallback(
    (circle: any) => {
      if (!circle) {
        setRouteCircleRadiusMilesInput("");
        setSelectedRoutePinKeys([]);
        return;
      }

      const center = circle.getCenter?.();
      const radiusMeters = Number(circle.getRadius?.());
      if (!center || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
        setRouteCircleRadiusMilesInput("");
        setSelectedRoutePinKeys([]);
        return;
      }

      setRouteCircleRadiusMilesInput((radiusMeters / 1609.344).toFixed(2));

      const centerLat = Number(center.lat?.());
      const centerLng = Number(center.lng?.());
      if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
        setSelectedRoutePinKeys([]);
        return;
      }

      const keys = mappableLeadPins
        .filter((pin) => {
          if (pin.lat === null || pin.lng === null) return false;
          return (
            distanceMetersBetween(centerLat, centerLng, pin.lat, pin.lng) <=
            radiusMeters
          );
        })
        .map((pin) => normalizeAddress(pin.address));

      setSelectedRoutePinKeys(keys);
    },
    [mappableLeadPins],
  );

  function requestRefresh() {
    setRefreshNonce((previous) => previous + 1);
  }

  function clearActionFeedback() {
    setActionError(null);
    setActionMessage(null);
  }

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/knocking/doors");
    }
  }, [loading, router, user]);

  useEffect(() => {
    const validKeys = new Set(pins.map((pin) => normalizeAddress(pin.address)));
    setExpandedPinKeys((previous) =>
      previous.filter((key) => validKeys.has(key)),
    );
    setNewLeadDraftByAddress((previous) => {
      const next: Record<string, LeadDraft> = {};
      Object.entries(previous).forEach(([key, value]) => {
        if (validKeys.has(key)) {
          next[key] = value;
        }
      });
      return next;
    });
  }, [pins]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadPins = async () => {
      setLoadingPins(true);
      setDataError(null);
      setDataMessage(null);

      const [eventsResult, initialLeadsResult] = await Promise.all([
        supabase
          .from("knock_events")
          .select(
            "id,rep_id,address,latitude,longitude,created_at,outcome,homeowner_name,contingencies_delta,linked_job_id",
          )
          .not("address", "is", null)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("knock_potential_leads")
          .select(POTENTIAL_LEAD_SELECT)
          .not("address", "is", null)
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

      let leadsResult: any = initialLeadsResult;

      if (!active) return;

      if (eventsResult.error) {
        setDataError(eventsResult.error.message);
        setPins([]);
        setLeadRows([]);
        setDocumentsByLeadId({});
        setLoadingPins(false);
        return;
      }

      const dataWarnings: string[] = [];

      if (
        leadsResult.error &&
        leadsResult.error.message.toLowerCase().includes("column") &&
        leadsResult.error.message.toLowerCase().includes("does not exist")
      ) {
        const fallbackLeadsResult = await supabase
          .from("knock_potential_leads")
          .select(
            "id,rep_id,address,address_normalized,latitude,longitude,created_at,updated_at,homeowner_name,notes",
          )
          .not("address", "is", null)
          .order("created_at", { ascending: false })
          .limit(5000);

        if (!active) return;

        if (!fallbackLeadsResult.error) {
          leadsResult = fallbackLeadsResult;
          dataWarnings.push(
            "Lead extended fields are not yet available. Run SQL migration 005 to enable full lead editing and documents.",
          );
        }
      }

      if (leadsResult.error) {
        setLeadRows([]);
        setLeadDraftById({});
        dataWarnings.push(`Potential leads unavailable: ${leadsResult.error.message}`);
      }

      const leadData = (leadsResult.data ?? []) as PotentialLeadRow[];
      setLeadRows(leadData);
      setLeadDraftById(
        Object.fromEntries(
          leadData.map((lead) => [lead.id, makeLeadDraftFromRow(lead)]),
        ),
      );

      const grouped = new Map<string, DoorPinAggregate>();

      ((eventsResult.data ?? []) as KnockEventRow[]).forEach((row) => {
        const address = typeof row.address === "string" ? row.address.trim() : "";
        if (!address) return;

        const key = normalizeAddress(address);
        if (!key) return;

        const lat = toNumber(row.latitude);
        const lng = toNumber(row.longitude);
        const contingenciesDelta = Number(row.contingencies_delta ?? 0);
        const linkedJobId = toNonEmptyString(row.linked_job_id);
        const repId = toNonEmptyString(row.rep_id);

        const existing = grouped.get(key);
        if (!existing) {
          grouped.set(key, {
            address,
            lat,
            lng,
            knocks: 1,
            knockEventIds: [],
            potentialLeadCount: 0,
            lastKnockedAt:
              typeof row.created_at === "string" ? row.created_at : null,
            lastOutcome: typeof row.outcome === "string" ? row.outcome : null,
            lastHomeownerName:
              typeof row.homeowner_name === "string" ? row.homeowner_name : null,
            latestPotentialLeadNote: null,
            lastPotentialLeadAt: null,
            lastPotentialLeadRepId: null,
            lastPotentialLeadRepName: null,
            lastKnockedRepId: repId,
            lastKnockedRepName: null,
            resolvedLeadStatus: null,
            repCount: 1,
            repIds: repId ? new Set([repId]) : new Set<string>(),
            linkedJobIds: linkedJobId
              ? new Set([linkedJobId])
              : new Set<string>(),
            hasContingencyEvent: contingenciesDelta > 0,
            leadStatusUpdatedAtMs: 0,
            knockEventIdSet: row.id ? new Set([row.id]) : new Set<string>(),
          });
          return;
        }

        existing.knocks += 1;
        if (row.id) {
          existing.knockEventIdSet.add(row.id);
        }
        if (existing.lat === null && lat !== null) existing.lat = lat;
        if (existing.lng === null && lng !== null) existing.lng = lng;
        if (!existing.lastKnockedAt && typeof row.created_at === "string") {
          existing.lastKnockedAt = row.created_at;
        }
        if (!existing.lastOutcome && typeof row.outcome === "string") {
          existing.lastOutcome = row.outcome;
        }
        if (
          !existing.lastHomeownerName &&
          typeof row.homeowner_name === "string"
        ) {
          existing.lastHomeownerName = row.homeowner_name;
        }
        if (!existing.lastKnockedRepId && repId) {
          existing.lastKnockedRepId = repId;
        }

        if (repId) {
          existing.repIds.add(repId);
          existing.repCount = existing.repIds.size;
        }
        if (linkedJobId) {
          existing.linkedJobIds.add(linkedJobId);
        }
        if (contingenciesDelta > 0) {
          existing.hasContingencyEvent = true;
        }
      });

      leadData.forEach((lead) => {
        const address = typeof lead.address === "string" ? lead.address.trim() : "";
        if (!address) return;

        const key = normalizeAddress(address);
        if (!key) return;

        const lat = toNumber(lead.latitude);
        const lng = toNumber(lead.longitude);
        const homeownerName = toNonEmptyString(lead.homeowner_name);
        const note = toNonEmptyString(lead.notes);
        const repId = toNonEmptyString(lead.rep_id);
        const leadStatus = parseLeadStatus(lead.lead_status);
        const leadStatusAtMs = Math.max(
          toDateMs(lead.updated_at),
          toDateMs(lead.created_at),
        );

        const existing = grouped.get(key);
        if (!existing) {
          grouped.set(key, {
            address,
            lat,
            lng,
            knocks: 0,
            knockEventIds: [],
            potentialLeadCount: 1,
            lastKnockedAt:
              typeof lead.created_at === "string" ? lead.created_at : null,
            lastOutcome: "potential_lead",
            lastHomeownerName: homeownerName,
            latestPotentialLeadNote: note,
            lastPotentialLeadAt:
              typeof lead.created_at === "string" ? lead.created_at : null,
            lastPotentialLeadRepId: repId,
            lastPotentialLeadRepName: null,
            lastKnockedRepId: null,
            lastKnockedRepName: null,
            resolvedLeadStatus: leadStatus,
            repCount: repId ? 1 : 0,
            repIds: repId ? new Set([repId]) : new Set<string>(),
            linkedJobIds: new Set<string>(),
            hasContingencyEvent: false,
            leadStatusUpdatedAtMs: leadStatusAtMs,
            knockEventIdSet: new Set<string>(),
          });
          return;
        }

        existing.potentialLeadCount += 1;
        if (existing.lat === null && lat !== null) existing.lat = lat;
        if (existing.lng === null && lng !== null) existing.lng = lng;
        if (!existing.lastHomeownerName && homeownerName) {
          existing.lastHomeownerName = homeownerName;
        }
        if (!existing.latestPotentialLeadNote && note) {
          existing.latestPotentialLeadNote = note;
        }
        if (!existing.lastPotentialLeadAt && typeof lead.created_at === "string") {
          existing.lastPotentialLeadAt = lead.created_at;
        }
        if (!existing.lastPotentialLeadRepId && repId) {
          existing.lastPotentialLeadRepId = repId;
        }
        if (leadStatusAtMs >= existing.leadStatusUpdatedAtMs) {
          existing.resolvedLeadStatus = leadStatus;
          existing.leadStatusUpdatedAtMs = leadStatusAtMs;
        }

        if (repId) {
          existing.repIds.add(repId);
          existing.repCount = existing.repIds.size;
        }
      });

      let contingencyJobIds = new Set<string>();
      const allLinkedJobIds = Array.from(
        new Set(
          Array.from(grouped.values()).flatMap((item) =>
            Array.from(item.linkedJobIds),
          ),
        ),
      );

      if (allLinkedJobIds.length > 0) {
        try {
          const rows: JobStageRow[] = [];
          for (const idsChunk of chunkArray(allLinkedJobIds, 200)) {
            const { data: jobsData, error: jobsError } = await supabase
              .from("jobs")
              .select("id,stage_id")
              .in("id", idsChunk);

            if (jobsError) {
              throw jobsError;
            }

            rows.push(...((jobsData ?? []) as JobStageRow[]));
          }

          contingencyJobIds = new Set(
            rows
              .filter((row) => Number(row.stage_id) === CONTINGENCY_STAGE_ID)
              .map((row) => row.id),
          );
        } catch (jobsLookupError) {
          console.warn(
            "Knocked doors map: could not apply job-stage contingency filter.",
            jobsLookupError,
          );
        }
      }

      const filtered = Array.from(grouped.values()).filter((item) => {
        if (item.hasContingencyEvent) return false;
        for (const linkedJobId of item.linkedJobIds) {
          if (contingencyJobIds.has(linkedJobId)) return false;
        }
        return true;
      });

      let nextRepNameById = new Map<string, string>();
      const repIdsForNames = Array.from(
        new Set(filtered.flatMap((item) => Array.from(item.repIds))),
      );

      if (managerView && repIdsForNames.length > 0) {
        try {
          const profiles: ProfileRow[] = [];
          for (const idsChunk of chunkArray(repIdsForNames, 200)) {
            const { data: profileData, error: profileError } = await supabase
              .from("profiles")
              .select("id,full_name")
              .in("id", idsChunk);

            if (profileError) {
              throw profileError;
            }

            profiles.push(...((profileData ?? []) as ProfileRow[]));
          }

          nextRepNameById = new Map(
            profiles.map((profile) => [
              profile.id,
              toNonEmptyString(profile.full_name) ?? profile.id,
            ]),
          );
        } catch (profileLookupError) {
          console.warn(
            "Knocked doors map: could not load rep names for manager view.",
            profileLookupError,
          );
        }
      }

      const merged = filtered.map(
        ({
          repIds: _repIds,
          linkedJobIds: _linkedJobIds,
          hasContingencyEvent: _hasContingencyEvent,
          leadStatusUpdatedAtMs: _leadStatusUpdatedAtMs,
          knockEventIdSet: _knockEventIdSet,
          ...rest
        }) => ({
          ...rest,
          knockEventIds: Array.from(_knockEventIdSet),
          lastKnockedRepName: rest.lastKnockedRepId
            ? nextRepNameById.get(rest.lastKnockedRepId) ?? rest.lastKnockedRepId
            : null,
          lastPotentialLeadRepName: rest.lastPotentialLeadRepId
            ? nextRepNameById.get(rest.lastPotentialLeadRepId) ??
              rest.lastPotentialLeadRepId
            : null,
        }),
      );

      const leadIds = leadData.map((lead) => lead.id);
      const nextDocumentsByLeadId: Record<string, PotentialLeadDocumentRow[]> = {};

      if (leadIds.length > 0) {
        const { data: docsData, error: docsError } = await supabase
          .from("knock_potential_lead_documents")
          .select(LEAD_DOCUMENT_SELECT)
          .in("lead_id", leadIds)
          .order("created_at", { ascending: false });

        if (docsError) {
          dataWarnings.push(
            `Lead documents unavailable: ${docsError.message}. Run SQL migration 005 to enable documents.`,
          );
        } else {
          ((docsData ?? []) as PotentialLeadDocumentRow[]).forEach((doc) => {
            const list = nextDocumentsByLeadId[doc.lead_id] ?? [];
            list.push(doc);
            nextDocumentsByLeadId[doc.lead_id] = list;
          });
        }
      }

      const missingCoords = merged
        .filter((item) => item.lat === null || item.lng === null)
        .slice(0, 160);

      await forEachWithConcurrency(missingCoords, 6, async (item) => {
        const key = normalizeAddress(item.address);

        if (geocodeCacheRef.current.has(key)) {
          const cached = geocodeCacheRef.current.get(key) ?? null;
          if (cached) {
            item.lat = cached.lat;
            item.lng = cached.lng;
          }
          return;
        }

        const coords = await geocodeAddress(item.address, googleKey);
        geocodeCacheRef.current.set(key, coords);

        if (coords) {
          item.lat = coords.lat;
          item.lng = coords.lng;
        }
      });

      if (!active) return;

      setPins(merged);
      setDocumentsByLeadId(nextDocumentsByLeadId);
      setRepNameById(Object.fromEntries(nextRepNameById));
      setDataMessage(dataWarnings.length > 0 ? dataWarnings.join(" | ") : null);
      setLoadingPins(false);
    };

    void loadPins();

    return () => {
      active = false;
    };
  }, [googleKey, managerView, refreshNonce, supabase, user]);

  useEffect(() => {
    if (!user) return;
    if (mapMode !== "heatmap") return;

    let active = true;
    const loadHeatmap = async () => {
      setLoadingHeatmap(true);
      setHeatmapError(null);
      try {
        const params = new URLSearchParams({
          layer: heatmapLayer,
          days: String(heatmapDays),
        });
        const response = await fetch(`/api/territory/heatmap?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const payload = (await response.json()) as {
          error?: string;
          cells?: HeatmapCell[];
        };
        if (!response.ok) {
          throw new Error(payload.error || `Heat map request failed (${response.status})`);
        }

        if (!active) return;
        setHeatmapCells(Array.isArray(payload.cells) ? payload.cells : []);
      } catch (fetchError) {
        if (!active) return;
        setHeatmapCells([]);
        setHeatmapError(fetchError instanceof Error ? fetchError.message : "Could not load heat map.");
      } finally {
        if (active) {
          setLoadingHeatmap(false);
        }
      }
    };

    void loadHeatmap();
    return () => {
      active = false;
    };
  }, [heatmapDays, heatmapLayer, mapMode, user]);

  useEffect(() => {
    if (!user) return;
    if (!mapNodeRef.current) return;
    let active = true;

    const waitForMapNodeSize = async (node: HTMLDivElement) => {
      const deadline = Date.now() + 3000;
      while (active && Date.now() < deadline) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }
      return false;
    };

    const initMap = async () => {
      try {
        const maps = await loadGoogleMaps(googleKey);
        mapsApiRef.current = maps;
        if (typeof maps.importLibrary === "function") {
          try {
            await maps.importLibrary("drawing");
          } catch (drawingError) {
            console.warn(
              "Knocked doors map: could not load drawing library.",
              drawingError,
            );
          }
        }
        if (!active || !mapNodeRef.current) return;

        const hasSize = await waitForMapNodeSize(mapNodeRef.current);
        if (!active || !mapNodeRef.current) return;
        if (!hasSize) {
          throw new Error("Map container has zero size. Refresh and try again.");
        }

        const map = new maps.Map(mapNodeRef.current, {
          center: { lat: 39.8283, lng: -98.5795 },
          zoom: 4,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });

        mapRef.current = map;
        window.requestAnimationFrame(() => {
          maps.event.trigger(map, "resize");
        });
        setMapReady(true);
      } catch (loadError) {
        if (active) {
          setMapError(
            loadError instanceof Error ? loadError.message : "Could not load map.",
          );
        }
      }
    };

    void initMap();

    return () => {
      active = false;
      routeCircleListenersRef.current.forEach((listener) =>
        listener?.remove?.(),
      );
      routeCircleListenersRef.current = [];
      if (routeCircleRef.current) {
        routeCircleRef.current.setMap(null);
        routeCircleRef.current = null;
      }
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        drawingManagerRef.current = null;
      }
      directionsRenderersRef.current.forEach((renderer) => renderer?.setMap?.(null));
      directionsRenderersRef.current = [];
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.clear();
      heatmapCirclesRef.current.forEach((circle) => circle.setMap(null));
      heatmapCirclesRef.current = [];
    };
  }, [googleKey, user]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const maps = (window as Window & { google?: { maps?: any } }).google?.maps;
    if (!maps) return;

    if (mapMode !== "pins") {
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current.clear();
      return;
    }

    const nextIds = new Set(mapVisiblePins.map((pin) => normalizeAddress(pin.address)));

    markersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });

    mapVisiblePins.forEach((pin) => {
      if (pin.lat === null || pin.lng === null) return;

      const id = normalizeAddress(pin.address);
      const position = { lat: pin.lat, lng: pin.lng };
      const markerIcon = getLeadStatusMarkerIcon(maps, pin.resolvedLeadStatus);
      const infoContent = getMarkerInfoWindowContent(pin);

      const existing = markersRef.current.get(id);
      if (existing) {
        existing.setPosition(position);
        existing.setIcon(markerIcon);
        existing.setTitle(pin.address);
        if (existing.__infoWindow?.setContent) {
          existing.__infoWindow.setContent(infoContent);
        }
        return;
      }

      const marker = new maps.Marker({
        map: mapRef.current,
        position,
        title: pin.address,
        icon: markerIcon,
      });

      const info = new maps.InfoWindow({ content: infoContent });
      marker.__infoWindow = info;

      marker.addListener("click", () =>
        info.open({ map: mapRef.current, anchor: marker }),
      );
      markersRef.current.set(id, marker);
    });

    if (mapVisiblePins.length > 0) {
      const bounds = new maps.LatLngBounds();
      mapVisiblePins.forEach((pin) => {
        if (pin.lat !== null && pin.lng !== null) {
          bounds.extend({ lat: pin.lat, lng: pin.lng });
        }
      });
      mapRef.current.fitBounds(bounds, 64);
    }
  }, [mapMode, mapReady, mapVisiblePins]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const maps = (window as Window & { google?: { maps?: any } }).google?.maps;
    if (!maps) return;

    heatmapCirclesRef.current.forEach((circle) => circle.setMap(null));
    heatmapCirclesRef.current = [];

    if (mapMode !== "heatmap") {
      return;
    }

    if (heatmapCells.length === 0) {
      return;
    }

    const maxValue = Math.max(
      0.0001,
      ...heatmapCells.map((cell) => Number(cell.value || 0)),
    );
    const bounds = new maps.LatLngBounds();

    heatmapCells.forEach((cell) => {
      if (!Number.isFinite(cell.centerLat) || !Number.isFinite(cell.centerLng)) return;
      const normalized = Math.max(0, Math.min(1, Number(cell.value || 0) / maxValue));
      const circle = new maps.Circle({
        map: mapRef.current,
        center: { lat: cell.centerLat, lng: cell.centerLng },
        radius: 200 + normalized * 650,
        strokeColor: "#f97316",
        strokeOpacity: 0.15 + normalized * 0.45,
        strokeWeight: 1,
        fillColor: "#f97316",
        fillOpacity: 0.12 + normalized * 0.38,
        clickable: true,
      });

      const info = new maps.InfoWindow({
        content: `
          <div style="font-family: system-ui; min-width: 220px;">
            <strong>Heat Cell ${cell.hexKey}</strong><br/>
            <span>Layer: ${heatmapLayer}</span><br/>
            <span>Value: ${Number(cell.value).toFixed(3)}</span><br/>
            <span>K ${cell.knocks} | T ${cell.talks} | I ${cell.inspections} | C ${cell.contingencies}</span>
          </div>
        `,
      });

      circle.addListener("click", () => {
        info.setPosition({ lat: cell.centerLat, lng: cell.centerLng });
        info.open({ map: mapRef.current });
      });

      heatmapCirclesRef.current.push(circle);
      bounds.extend({ lat: cell.centerLat, lng: cell.centerLng });
    });

    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, 64);
    }
  }, [heatmapCells, heatmapLayer, mapMode, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    const maps =
      mapsApiRef.current ??
      (window as Window & { google?: { maps?: any } }).google?.maps;
    if (!maps?.drawing?.DrawingManager) return;

    if (!drawingManagerRef.current) {
      const drawingManager = new maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: false,
        circleOptions: {
          fillColor: "#2563eb",
          fillOpacity: 0.12,
          strokeColor: "#2563eb",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          clickable: false,
          editable: true,
          draggable: true,
          zIndex: 2,
        },
      });

      drawingManager.setMap(mapRef.current);
      drawingManagerRef.current = drawingManager;

      maps.event.addListener(drawingManager, "circlecomplete", (circle: any) => {
        routeCircleListenersRef.current.forEach((listener) =>
          listener?.remove?.(),
        );
        routeCircleListenersRef.current = [];

        if (routeCircleRef.current) {
          routeCircleRef.current.setMap(null);
        }

        routeCircleRef.current = circle;
        setHasRouteCircle(true);
        setIsDrawingRouteCircle(false);
        drawingManager.setDrawingMode(null);
        setRouteSummary(null);

        routeCircleListenersRef.current = [
          maps.event.addListener(circle, "center_changed", () =>
            recomputeRouteCircleSelection(circle),
          ),
          maps.event.addListener(circle, "radius_changed", () =>
            recomputeRouteCircleSelection(circle),
          ),
        ];

        recomputeRouteCircleSelection(circle);
      });
    } else {
      drawingManagerRef.current.setMap(mapRef.current);
    }
  }, [mapReady, recomputeRouteCircleSelection]);

  useEffect(() => {
    if (routeCircleRef.current) {
      recomputeRouteCircleSelection(routeCircleRef.current);
    }
  }, [recomputeRouteCircleSelection]);

  useEffect(() => {
    if (selectedRoutePins.length >= 2) return;
    if (directionsRenderersRef.current.length === 0 && !routeSummary) return;
    clearRenderedRoute();
  }, [routeSummary, selectedRoutePins.length]);

  useEffect(() => {
    if (selectedRoutePinOptions.length === 0) {
      setRouteStartPinKey("");
      return;
    }

    if (!selectedRoutePinOptions.some((pin) => pin.key === routeStartPinKey)) {
      setRouteStartPinKey(selectedRoutePinOptions[0].key);
    }
  }, [routeStartPinKey, selectedRoutePinOptions]);

  function togglePinExpanded(pinKey: string) {
    setExpandedPinKeys((previous) =>
      previous.includes(pinKey)
        ? previous.filter((key) => key !== pinKey)
        : [...previous, pinKey],
    );
  }

  function toggleMapStatusFilter(status: LeadStatus | null) {
    const filterKey = getStatusFilterKey(status);
    setActiveMapStatusFilters((previous) =>
      previous.includes(filterKey)
        ? previous.filter((value) => value !== filterKey)
        : [...previous, filterKey],
    );
  }

  function getLeadDraft(lead: PotentialLeadRow) {
    return leadDraftById[lead.id] ?? makeLeadDraftFromRow(lead);
  }

  function setLeadDraftField(
    leadId: string,
    field: keyof LeadDraft,
    value: string,
  ) {
    setLeadDraftById((previous) => {
      const current = previous[leadId];
      if (!current) return previous;
      return {
        ...previous,
        [leadId]: {
          ...current,
          [field]: value,
        },
      };
    });
  }

  function getNewLeadDraft(pin: DoorPin) {
    const key = normalizeAddress(pin.address);
    return (
      newLeadDraftByAddress[key] ??
      makeNewLeadDraftForAddress(pin.address, pin.lat, pin.lng)
    );
  }

  function setNewLeadDraftField(
    addressKey: string,
    pin: DoorPin,
    field: keyof LeadDraft,
    value: string,
  ) {
    setNewLeadDraftByAddress((previous) => {
      const current =
        previous[addressKey] ??
        makeNewLeadDraftForAddress(pin.address, pin.lat, pin.lng);
      return {
        ...previous,
        [addressKey]: {
          ...current,
          [field]: value,
        },
      };
    });
  }

  function clearRenderedRoute() {
    directionsRenderersRef.current.forEach((renderer) => renderer?.setMap?.(null));
    directionsRenderersRef.current = [];
    setRouteSummary(null);
    setRouteLaunchUrl(null);
    setRouteLaunchSegments([]);
    setCompletedRouteLaunchIds([]);
  }

  function toggleRouteLaunchCompleted(segmentId: string) {
    setCompletedRouteLaunchIds((previous) =>
      previous.includes(segmentId)
        ? previous.filter((id) => id !== segmentId)
        : [...previous, segmentId],
    );
  }

  function startRouteCircleDraw() {
    if (mapMode !== "pins") {
      setActionError("Switch to Lead Pins mode to draw routing circles.");
      return;
    }

    const maps =
      mapsApiRef.current ??
      (window as Window & { google?: { maps?: any } }).google?.maps;

    if (!mapReady || !mapRef.current || !maps?.drawing?.OverlayType) {
      setActionError(
        "Map drawing tools are not ready yet. Refresh and try again.",
      );
      return;
    }
    clearActionFeedback();
    clearRenderedRoute();

    routeCircleListenersRef.current.forEach((listener) => listener?.remove?.());
    routeCircleListenersRef.current = [];
    if (routeCircleRef.current) {
      routeCircleRef.current.setMap(null);
      routeCircleRef.current = null;
    }
    setHasRouteCircle(false);
    setRouteCircleRadiusMilesInput("");
    setSelectedRoutePinKeys([]);

    drawingManagerRef.current?.setDrawingMode(maps.drawing.OverlayType.CIRCLE);
    setIsDrawingRouteCircle(true);
  }

  function clearRouteCircleSelection() {
    clearActionFeedback();
    setIsDrawingRouteCircle(false);
    setRouteStartPromptOpen(false);
    drawingManagerRef.current?.setDrawingMode(null);
    routeCircleListenersRef.current.forEach((listener) => listener?.remove?.());
    routeCircleListenersRef.current = [];
    if (routeCircleRef.current) {
      routeCircleRef.current.setMap(null);
      routeCircleRef.current = null;
    }
    setHasRouteCircle(false);
    setRouteCircleRadiusMilesInput("");
    setSelectedRoutePinKeys([]);
    clearRenderedRoute();
  }

  function applyRouteCircleRadiusFromInput() {
    if (!routeCircleRef.current) {
      setActionError("Draw a circle first.");
      return;
    }

    const miles = Number(routeCircleRadiusMilesInput);
    if (!Number.isFinite(miles) || miles <= 0) {
      setActionError("Radius must be a positive number of miles.");
      return;
    }

    clearActionFeedback();
    routeCircleRef.current.setRadius(miles * 1609.344);
    recomputeRouteCircleSelection(routeCircleRef.current);
  }

  function openRouteStartPrompt() {
    const selected = selectedRoutePins.filter(
      (pin) => pin.lat !== null && pin.lng !== null,
    );
    if (selected.length < 2) {
      setActionError("Select at least 2 lead pins inside the circle.");
      return;
    }

    clearActionFeedback();
    setRouteStartMode("pin");
    if (selectedRoutePinOptions.length > 0) {
      setRouteStartPinKey(selectedRoutePinOptions[0].key);
    }
    setRouteStartPromptOpen(true);
  }

  async function generateOptimizedRouteForCircle(
    startMode: RouteStartMode,
    startPinKey?: string,
  ) {
    const maps =
      mapsApiRef.current ??
      (window as Window & { google?: { maps?: any } }).google?.maps;
    if (!mapReady || !mapRef.current || !maps?.DirectionsService) {
      setActionError("Map routing is not ready yet. Refresh and try again.");
      return;
    }

    const selected = selectedRoutePins.filter(
      (pin) => pin.lat !== null && pin.lng !== null,
    );
    if (selected.length < 2) {
      setActionError("Select at least 2 lead pins inside the circle.");
      return;
    }

    clearActionFeedback();
    setBuildingRoute(true);

    try {
      clearRenderedRoute();
      const routeNotices: string[] = [];
      const maxOptimizedStopsPerRequest = 24;
      if (selected.length > maxOptimizedStopsPerRequest) {
        routeNotices.push(
          `Selected ${selected.length} leads. Building multiple optimized route chunks of up to ${maxOptimizedStopsPerRequest} pins.`,
        );
      }

      let origin: { lat: number; lng: number };
      let requestedStartPin: DoorPin | null = null;
      let startPinAddressKey = "";

      if (startMode === "user_location") {
        const userLocation = await getBrowserGeolocation();
        origin = userLocation;
      } else {
        requestedStartPin =
          (startPinKey
            ? selected.find(
                (pin) => normalizeAddress(pin.address) === startPinKey,
              )
            : null) ?? selected[0];

        origin = {
          lat: requestedStartPin.lat as number,
          lng: requestedStartPin.lng as number,
        };
        startPinAddressKey = normalizeAddress(requestedStartPin.address);
      }

      const directionsService = new maps.DirectionsService();
      const pinsToOptimize =
        startMode === "pin"
          ? selected.filter(
              (pin) => normalizeAddress(pin.address) !== startPinAddressKey,
            )
          : selected;
      let remainingStops = [...pinsToOptimize];
      if (remainingStops.length === 0) {
        throw new Error("Could not determine stops for this route.");
      }

      let chunkOrigin = origin;
      const orderedSelectedPinLocations: string[] = [];
      if (startMode === "pin" && requestedStartPin) {
        orderedSelectedPinLocations.push(
          formatLatLng(requestedStartPin.lat as number, requestedStartPin.lng as number),
        );
      }
      const chunkRouteResults: any[] = [];
      let totalDistanceMeters = 0;
      let totalDurationSeconds = 0;
      let chunkCount = 0;

      // Greedy cross-chunk ordering: each chunk starts with the nearest remaining pins
      // from the current chunk origin, then Google optimizes waypoint order in that chunk.
      while (remainingStops.length > 0) {
        const chunkStops = [...remainingStops]
          .sort((a, b) => {
            const da = distanceMetersBetween(
              chunkOrigin.lat,
              chunkOrigin.lng,
              a.lat as number,
              a.lng as number,
            );
            const db = distanceMetersBetween(
              chunkOrigin.lat,
              chunkOrigin.lng,
              b.lat as number,
              b.lng as number,
            );
            return da - db;
          })
          .slice(0, maxOptimizedStopsPerRequest);
        chunkCount += 1;

        let bestResult: any = null;
        let bestWaypoints: Array<{
          location: { lat: number; lng: number };
          stopover: true;
        }> = [];
        let bestDestination: { lat: number; lng: number } | null = null;
        let bestDurationSecondsForChunk = Number.POSITIVE_INFINITY;

        for (const endpoint of chunkStops) {
          const endpointAddressKey = normalizeAddress(endpoint.address);
          const destination = {
            lat: endpoint.lat as number,
            lng: endpoint.lng as number,
          };

          const intermediateStops = chunkStops.filter((pin) => {
            const key = normalizeAddress(pin.address);
            return key !== endpointAddressKey;
          });

          const waypoints = intermediateStops.map((pin) => ({
            location: { lat: pin.lat as number, lng: pin.lng as number },
            stopover: true as const,
          }));

          const routeResult = await directionsService.route({
            origin: chunkOrigin,
            destination,
            waypoints,
            optimizeWaypoints: true,
            travelMode: maps.TravelMode.DRIVING,
          });

          const legs = routeResult.routes?.[0]?.legs ?? [];
          const durationSeconds = legs.reduce(
            (sum: number, leg: any) => sum + Number(leg?.duration?.value ?? 0),
            0,
          );

          if (durationSeconds < bestDurationSecondsForChunk) {
            bestDurationSecondsForChunk = durationSeconds;
            bestResult = routeResult;
            bestWaypoints = waypoints;
            bestDestination = destination;
          }
        }

        if (!bestResult || !bestDestination) {
          throw new Error("Could not generate optimized route.");
        }
        chunkRouteResults.push(bestResult);

        const optimizedWaypointOrder: number[] =
          bestResult.routes?.[0]?.waypoint_order ?? [];
        const orderedWaypointLocations = optimizedWaypointOrder.map((index) => {
          const point = bestWaypoints[index]?.location;
          return formatLatLng(point.lat, point.lng);
        });
        orderedSelectedPinLocations.push(
          ...orderedWaypointLocations,
          formatLatLng(bestDestination.lat, bestDestination.lng),
        );

        const legs = bestResult.routes?.[0]?.legs ?? [];
        totalDistanceMeters += legs.reduce(
          (sum: number, leg: any) => sum + Number(leg?.distance?.value ?? 0),
          0,
        );
        totalDurationSeconds += bestDurationSecondsForChunk;
        chunkOrigin = bestDestination;

        const chunkStopKeys = new Set(
          chunkStops.map((pin) => normalizeAddress(pin.address)),
        );
        remainingStops = remainingStops.filter(
          (pin) => !chunkStopKeys.has(normalizeAddress(pin.address)),
        );
      }

      if (chunkRouteResults.length === 0) {
        throw new Error("Could not generate optimized route.");
      }

      directionsRenderersRef.current = chunkRouteResults.map((chunkResult, index) => {
        const renderer = new maps.DirectionsRenderer({
          preserveViewport: true,
          suppressMarkers: index > 0,
          polylineOptions: {
            strokeColor: "#1d4ed8",
            strokeWeight: 5,
            strokeOpacity: 0.82,
          },
        });
        renderer.setMap(mapRef.current);
        renderer.setDirections(chunkResult);
        return renderer;
      });

      const bounds = new maps.LatLngBounds();
      if (startMode === "user_location") {
        bounds.extend(origin);
      }
      selected.forEach((pin) => {
        bounds.extend({ lat: pin.lat as number, lng: pin.lng as number });
      });
      mapRef.current.fitBounds(bounds);

      routeNotices.push(
        `Optimized in ${chunkCount} sequential chunk(s) for turn-by-turn efficiency across all selected pins.`,
      );
      const maxMapsDestinations = 10;
      const pinChunks = chunkArray(orderedSelectedPinLocations, maxMapsDestinations);

      const mapsLaunchSegments: RouteLaunchSegment[] = pinChunks
        .map((chunk, index) => {
          const previousChunkLastLocation =
            index > 0 ? pinChunks[index - 1]?.[pinChunks[index - 1].length - 1] : null;

          const originLocation =
            index === 0
              ? startMode === "user_location"
                ? "Current Location"
                : chunk[0]
              : previousChunkLastLocation ?? chunk[0];

          const destinationsForSegment =
            index === 0 && startMode === "pin" ? chunk.slice(1) : chunk;

          if (destinationsForSegment.length === 0) {
            return null;
          }

          const destinationLocation =
            destinationsForSegment[destinationsForSegment.length - 1];
          const waypointLocations = destinationsForSegment.slice(
            0,
            destinationsForSegment.length - 1,
          );

          return {
            id: `route-segment-${index + 1}`,
            label: `Route ${index + 1}`,
            stopCount: chunk.length,
            url: buildGoogleMapsDirectionsUrl({
              origin: originLocation,
              destination: destinationLocation,
              waypointLocations,
            }),
          };
        })
        .filter((segment): segment is RouteLaunchSegment => segment !== null);

      setRouteLaunchSegments(mapsLaunchSegments);
      setCompletedRouteLaunchIds([]);
      setRouteLaunchUrl(
        mapsLaunchSegments.length === 1 ? mapsLaunchSegments[0].url : null,
      );

      if (selected.length > maxMapsDestinations) {
        routeNotices.push(
          `Split into ${mapsLaunchSegments.length} routes (up to ${maxMapsDestinations} pins each) for Maps app launch limits.`,
        );
      }
      setActionMessage(routeNotices.length > 0 ? routeNotices.join(" ") : null);
      setRouteSummary({
        stopCount: selected.length,
        totalDistanceMiles: totalDistanceMeters / 1609.344,
        totalDurationMinutes: totalDurationSeconds / 60,
      });
    } catch (routeError) {
      setActionError(
        routeError instanceof Error
          ? routeError.message
          : "Could not generate route.",
      );
    } finally {
      setBuildingRoute(false);
    }
  }

  async function confirmRouteStartAndGenerate() {
    setRouteStartPromptOpen(false);
    await generateOptimizedRouteForCircle(routeStartMode, routeStartPinKey);
  }

  function openRouteInMapsApp() {
    if (!routeLaunchUrl) {
      setActionError("Generate a route first.");
      return;
    }
    window.location.assign(routeLaunchUrl);
  }

  function openRouteSegmentInMapsApp(url: string) {
    window.location.assign(url);
  }

  async function saveLead(lead: PotentialLeadRow) {
    const draft = getLeadDraft(lead);
    const address = draft.address.trim();
    if (!address) {
      setActionError("Address is required.");
      return;
    }

    const latitude = parseOptionalNumberInput(draft.latitude);
    const longitude = parseOptionalNumberInput(draft.longitude);
    if (typeof latitude === "undefined" || typeof longitude === "undefined") {
      setActionError("Latitude/longitude must be valid numbers when provided.");
      return;
    }

    clearActionFeedback();
    setSavingLeadId(lead.id);

    try {
      const payload = {
        address,
        address_normalized: normalizeAddress(address),
        homeowner_name: toNonEmptyString(draft.homeownerName),
        homeowner_phone: toNonEmptyString(draft.homeownerPhone),
        homeowner_email: toNonEmptyString(draft.homeownerEmail),
        lead_source: toNonEmptyString(draft.leadSource),
        lead_status: toNonEmptyString(draft.leadStatus) ?? "new",
        best_contact_time: toNonEmptyString(draft.bestContactTime),
        follow_up_at: toUtcIsoFromLocalInput(draft.followUpAtLocal),
        notes: toNonEmptyString(draft.notes),
        additional_details: toNonEmptyString(draft.additionalDetails),
        latitude,
        longitude,
      };

      const { error: updateError } = await supabase
        .from("knock_potential_leads")
        .update(payload)
        .eq("id", lead.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setActionMessage("Lead updated.");
      requestRefresh();
    } catch (updateError) {
      setActionError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update lead.",
      );
    } finally {
      setSavingLeadId(null);
    }
  }

  async function createLeadForAddress(pin: DoorPin) {
    if (!user) return;
    const addressKey = normalizeAddress(pin.address);
    const draft = getNewLeadDraft(pin);
    const address = draft.address.trim();
    if (!address) {
      setActionError("Address is required to create a lead.");
      return;
    }

    const latitude = parseOptionalNumberInput(draft.latitude);
    const longitude = parseOptionalNumberInput(draft.longitude);
    if (typeof latitude === "undefined" || typeof longitude === "undefined") {
      setActionError("Latitude/longitude must be valid numbers when provided.");
      return;
    }

    clearActionFeedback();
    setSavingNewAddressKey(addressKey);

    try {
      const payload = {
        rep_id: user.id,
        address,
        address_normalized: normalizeAddress(address),
        homeowner_name: toNonEmptyString(draft.homeownerName),
        homeowner_phone: toNonEmptyString(draft.homeownerPhone),
        homeowner_email: toNonEmptyString(draft.homeownerEmail),
        lead_source: toNonEmptyString(draft.leadSource),
        lead_status: toNonEmptyString(draft.leadStatus) ?? "new",
        best_contact_time: toNonEmptyString(draft.bestContactTime),
        follow_up_at: toUtcIsoFromLocalInput(draft.followUpAtLocal),
        notes: toNonEmptyString(draft.notes),
        additional_details: toNonEmptyString(draft.additionalDetails),
        latitude,
        longitude,
      };

      const { error: upsertError } = await supabase
        .from("knock_potential_leads")
        .upsert(payload, { onConflict: "rep_id,address_normalized" });

      if (upsertError) {
        throw new Error(upsertError.message);
      }

      setActionMessage("Lead saved for this address.");
      setNewLeadDraftByAddress((previous) => ({
        ...previous,
        [addressKey]: makeNewLeadDraftForAddress(address, latitude, longitude),
      }));
      requestRefresh();
    } catch (saveError) {
      setActionError(
        saveError instanceof Error ? saveError.message : "Could not save lead.",
      );
    } finally {
      setSavingNewAddressKey(null);
    }
  }

  async function deleteLead(lead: PotentialLeadRow) {
    const shouldDelete = window.confirm(
      "Delete this lead? This also removes document records for the lead.",
    );
    if (!shouldDelete) return;

    clearActionFeedback();
    setDeletingLeadId(lead.id);

    try {
      const docs = documentsByLeadId[lead.id] ?? [];
      const docPaths = docs.map((doc) => doc.file_path).filter(Boolean);
      if (docPaths.length > 0) {
        await supabase.storage.from(LEAD_DOC_BUCKET).remove(docPaths);
      }

      const { error: deleteError } = await supabase
        .from("knock_potential_leads")
        .delete()
        .eq("id", lead.id);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      setActionMessage("Lead removed.");
      requestRefresh();
    } catch (removeError) {
      setActionError(
        removeError instanceof Error
          ? removeError.message
          : "Could not remove lead.",
      );
    } finally {
      setDeletingLeadId(null);
    }
  }

  async function deletePinData(pin: DoorPin) {
    if (!managerView) {
      setActionError("Only management can delete pins/knocks from this page.");
      return;
    }

    const pinKey = normalizeAddress(pin.address);
    const leadsForAddress = leadsByAddress.get(pinKey) ?? [];
    const leadCount = leadsForAddress.length;
    const knockCount = pin.knockEventIds.length;

    const shouldDelete = window.confirm(
      `Delete this pin and all activity at ${pin.address}?\n\nThis removes ${knockCount} knock event(s) and ${leadCount} lead record(s).`,
    );
    if (!shouldDelete) return;

    clearActionFeedback();
    setDeletingPinKey(pinKey);

    try {
      const leadIds = leadsForAddress.map((lead) => lead.id);
      const docs = leadIds.flatMap((leadId) => documentsByLeadId[leadId] ?? []);
      const docPaths = docs.map((doc) => doc.file_path).filter(Boolean);

      if (pin.knockEventIds.length > 0) {
        const { error: eventDeleteError } = await supabase
          .from("knock_events")
          .delete()
          .in("id", pin.knockEventIds);
        if (eventDeleteError) {
          throw new Error(eventDeleteError.message);
        }
      }

      if (docPaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(LEAD_DOC_BUCKET)
          .remove(docPaths);
        if (storageError && !storageError.message.toLowerCase().includes("not found")) {
          throw new Error(storageError.message);
        }
      }

      if (leadIds.length > 0) {
        const { error: leadDeleteError } = await supabase
          .from("knock_potential_leads")
          .delete()
          .in("id", leadIds);
        if (leadDeleteError) {
          throw new Error(leadDeleteError.message);
        }
      }

      setActionMessage(
        `Deleted pin data: ${knockCount} knock(s) and ${leadCount} lead(s) removed.`,
      );
      requestRefresh();
    } catch (removeError) {
      setActionError(
        removeError instanceof Error
          ? removeError.message
          : "Could not delete this pin and knock data.",
      );
    } finally {
      setDeletingPinKey(null);
    }
  }

  async function uploadDocument(lead: PotentialLeadRow) {
    const file = selectedFileByLeadId[lead.id] ?? null;
    if (!file) {
      setActionError("Choose a document file first.");
      return;
    }

    clearActionFeedback();
    setUploadingLeadId(lead.id);

    const safeName = sanitizeFileName(file.name);
    const storagePath = `${lead.rep_id}/${lead.id}/${crypto.randomUUID()}-${safeName}`;

    try {
      const uploadResult = await supabase.storage
        .from(LEAD_DOC_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }

      const { data: insertedDoc, error: insertError } = await supabase
        .from("knock_potential_lead_documents")
        .insert({
          lead_id: lead.id,
          rep_id: lead.rep_id,
          file_name: file.name,
          file_path: storagePath,
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        })
        .select(LEAD_DOCUMENT_SELECT)
        .single();

      if (insertError) {
        await supabase.storage.from(LEAD_DOC_BUCKET).remove([storagePath]);
        throw new Error(insertError.message);
      }

      const doc = insertedDoc as PotentialLeadDocumentRow;
      setDocumentsByLeadId((previous) => ({
        ...previous,
        [lead.id]: [doc, ...(previous[lead.id] ?? [])],
      }));
      setSelectedFileByLeadId((previous) => ({ ...previous, [lead.id]: null }));
      setActionMessage("Document uploaded.");
    } catch (uploadError) {
      setActionError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload document.",
      );
    } finally {
      setUploadingLeadId(null);
    }
  }

  async function openDocument(doc: PotentialLeadDocumentRow) {
    clearActionFeedback();
    setOpeningDocumentId(doc.id);

    try {
      const { data, error } = await supabase.storage
        .from(LEAD_DOC_BUCKET)
        .createSignedUrl(doc.file_path, 120);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || "Could not open document.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (openError) {
      setActionError(
        openError instanceof Error
          ? openError.message
          : "Could not open document.",
      );
    } finally {
      setOpeningDocumentId(null);
    }
  }

  async function deleteDocument(doc: PotentialLeadDocumentRow) {
    const shouldDelete = window.confirm("Delete this document?");
    if (!shouldDelete) return;

    clearActionFeedback();
    setDeletingDocumentId(doc.id);

    try {
      const [{ error: storageError }, { error: deleteError }] = await Promise.all([
        supabase.storage.from(LEAD_DOC_BUCKET).remove([doc.file_path]),
        supabase.from("knock_potential_lead_documents").delete().eq("id", doc.id),
      ]);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (storageError && !storageError.message.toLowerCase().includes("not found")) {
        setActionMessage(
          `Document record removed, but storage removal had a warning: ${storageError.message}`,
        );
      } else {
        setActionMessage("Document removed.");
      }

      setDocumentsByLeadId((previous) => {
        const list = previous[doc.lead_id] ?? [];
        return {
          ...previous,
          [doc.lead_id]: list.filter((item) => item.id !== doc.id),
        };
      });
    } catch (removeError) {
      setActionError(
        removeError instanceof Error
          ? removeError.message
          : "Could not remove document.",
      );
    } finally {
      setDeletingDocumentId(null);
    }
  }

  if (loading) return <main className="layout">Loading session...</main>;
  if (!user) return <main className="layout">Redirecting to sign in...</main>;

  return (
    <AppShell
      role={role}
      profileName={fullName}
      profileImageUrl={profileImageUrl}
      onSignOut={signOut}
      debug={{ userId: user.id, role, accessToken, authError }}
    >
      <section className="panel">
        <div className="row">
          <h2 style={{ margin: 0 }}>Knocked Doors Map</h2>
          <p className="hint">
            {pins.length} addresses | {locatedPins.length} pinned |{" "}
            {potentialLeadAddresses} potential leads
          </p>
        </div>
        <p className="hint">
          {managerView
            ? "Manager view: all knocked doors and potential leads entered through the app."
            : "Rep view: your knocked doors and your potential leads entered through the app."}
        </p>

        <div className="tabs" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={mapMode === "pins" ? "tab tab-active" : "tab"}
            onClick={() => setMapMode("pins")}
          >
            Lead Pins
          </button>
          <button
            type="button"
            className={mapMode === "heatmap" ? "tab tab-active" : "tab"}
            onClick={() => setMapMode("heatmap")}
          >
            Heat Map
          </button>
        </div>

        {mapMode === "pins" ? (
          <label className="stack" style={{ marginTop: 8 }}>
            Search List
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Filter by address, homeowner, or outcome"
            />
          </label>
        ) : (
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <label className="hint">
              Layer
              <select
                value={heatmapLayer}
                onChange={(event) => setHeatmapLayer(event.target.value as HeatmapLayer)}
                style={{ marginLeft: 6 }}
              >
                {HEATMAP_LAYERS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="hint">
              Window
              <select
                value={String(heatmapDays)}
                onChange={(event) => setHeatmapDays(Number(event.target.value))}
                style={{ marginLeft: 6 }}
              >
                <option value="7">7d</option>
                <option value="30">30d</option>
                <option value="90">90d</option>
              </select>
            </label>
            <label className="hint">
              Custom Days
              <input
                type="number"
                min={1}
                max={365}
                value={String(heatmapDays)}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next) && next > 0) {
                    setHeatmapDays(Math.min(365, Math.round(next)));
                  }
                }}
                style={{ marginLeft: 6, width: 86 }}
              />
            </label>
            <span className="hint">{heatmapCells.length} heat cell(s)</span>
          </div>
        )}

        {actionError ? <p className="error">{actionError}</p> : null}
        {actionMessage ? <p className="hint">{actionMessage}</p> : null}
        {loadingPins ? <p className="hint">Loading knocked doors...</p> : null}
        {loadingHeatmap ? <p className="hint">Loading heat map...</p> : null}
        {heatmapError ? <p className="error">{heatmapError}</p> : null}
        {!mapReady && !mapError ? <p className="hint">Initializing map...</p> : null}
        {mapError ? <p className="error">{mapError}</p> : null}
        {dataError ? <p className="error">{dataError}</p> : null}
        {dataMessage ? <p className="hint">{dataMessage}</p> : null}

        <div ref={mapNodeRef} className="live-map" />
        {mapMode === "pins" ? (
        <>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="secondary"
            onClick={startRouteCircleDraw}
            disabled={!mapReady}
          >
            {isDrawingRouteCircle ? "Drawing..." : "Draw Custom Circle"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={clearRouteCircleSelection}
            disabled={!mapReady}
          >
            Clear Circle + Route
          </button>
          <button
            type="button"
            onClick={openRouteStartPrompt}
            disabled={!mapReady || selectedRoutePins.length < 2 || buildingRoute}
          >
            {buildingRoute ? "Building Route..." : "Generate Optimized Route"}
          </button>
          <span className="hint">
            Selected leads in circle: {selectedRoutePins.length}
          </span>
        </div>
        {hasRouteCircle ? (
          <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
            <label className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Circle radius (miles)
              <input
                type="number"
                min="0.05"
                step="0.05"
                value={routeCircleRadiusMilesInput}
                onChange={(event) =>
                  setRouteCircleRadiusMilesInput(event.target.value)
                }
                style={{ width: 110, padding: "6px 8px" }}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={applyRouteCircleRadiusFromInput}
              disabled={!mapReady}
            >
              Apply Radius
            </button>
          </div>
        ) : null}
        {isDrawingRouteCircle ? (
          <p className="hint">
            Draw mode is active: click and drag on the map to create your custom
            route circle.
          </p>
        ) : null}
        {hasRouteCircle && !isDrawingRouteCircle ? (
          <p className="hint">
            Tip: drag the circle to reposition it, or drag the edge to resize for
            precise pin selection.
          </p>
        ) : null}
        {routeSummary ? (
          <div className="stack" style={{ gap: 8 }}>
            <p className="hint" style={{ margin: 0 }}>
              Optimized route for {routeSummary.stopCount} stops | Distance:{" "}
              {formatMiles(routeSummary.totalDistanceMiles)} | ETA:{" "}
              {formatMinutes(routeSummary.totalDurationMinutes)}
            </p>
            {routeLaunchSegments.length <= 1 ? (
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={openRouteInMapsApp}
                  disabled={!routeLaunchUrl || buildingRoute}
                >
                  Open In Maps App
                </button>
              </div>
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                <p className="hint" style={{ margin: 0 }}>
                  Split routes (open in order):
                </p>
                {routeLaunchSegments.map((segment) => (
                  <div
                    key={segment.id}
                    className="row"
                    style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}
                  >
                    <label
                      className="row"
                      style={{ gap: 6, alignItems: "center", margin: 0 }}
                    >
                      <input
                        type="checkbox"
                        checked={completedRouteLaunchIds.includes(segment.id)}
                        onChange={() => toggleRouteLaunchCompleted(segment.id)}
                      />
                      <span className="hint" style={{ margin: 0 }}>
                        {segment.label} ({segment.stopCount} pins)
                      </span>
                    </label>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => openRouteSegmentInMapsApp(segment.url)}
                      disabled={buildingRoute}
                    >
                      Open In Maps App
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {routeStartPromptOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            className="job-card"
            style={{
              marginTop: 10,
              border: "1px solid var(--border)",
              background: "var(--panel-soft)",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1rem" }}>Route Start Point</h3>
            <p className="hint">
              Choose where the route should start. The end point is auto-optimized.
            </p>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="radio"
                name="route-start-mode"
                checked={routeStartMode === "pin"}
                onChange={() => setRouteStartMode("pin")}
              />
              Start from a selected pin
            </label>
            {routeStartMode === "pin" ? (
              <label className="stack" style={{ marginTop: 8 }}>
                Starting Pin
                <select
                  value={routeStartPinKey}
                  onChange={(event) => setRouteStartPinKey(event.target.value)}
                >
                  {selectedRoutePinOptions.map((pin) => (
                    <option key={pin.key} value={pin.key}>
                      {pin.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="row" style={{ gap: 8, marginTop: 8 }}>
              <input
                type="radio"
                name="route-start-mode"
                checked={routeStartMode === "user_location"}
                onChange={() => setRouteStartMode("user_location")}
              />
              Start from my current location
            </label>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => void confirmRouteStartAndGenerate()}
                disabled={
                  buildingRoute ||
                  selectedRoutePinOptions.length === 0
                }
              >
                {buildingRoute ? "Building Route..." : "Build Route"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setRouteStartPromptOpen(false)}
                disabled={buildingRoute}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        </>
        ) : null}
        {mapMode === "pins" ? (
        <>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {LEAD_STATUS_LEGEND.map((item) => {
            const meta = getLeadStatusMarkerMeta(item.status);
            const isActive = activeMapStatusFilters.includes(
              getStatusFilterKey(item.status),
            );
            return (
              <button
                type="button"
                onClick={() => toggleMapStatusFilter(item.status)}
                key={item.status ?? "none"}
                className="hint"
                aria-pressed={isActive}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "4px 10px",
                  background: isActive ? "var(--panel-soft)" : "transparent",
                  opacity: isActive ? 1 : 0.5,
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: meta.fill,
                    border: "1px solid rgba(15,23,42,0.35)",
                    display: "inline-block",
                  }}
                />
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setActiveMapStatusFilters(
                LEAD_STATUS_LEGEND.map((item) => getStatusFilterKey(item.status)),
              )
            }
            disabled={activeMapStatusFilters.length === LEAD_STATUS_LEGEND.length}
          >
            Show All
          </button>
        </div>
        <p className="hint">
          Map status filters: {activeMapStatusFilters.length}/
          {LEAD_STATUS_LEGEND.length} selected
        </p>
        </>
        ) : null}

        {mapMode === "pins" && visiblePins.length > 0 ? (
          <div className="jobs" style={{ marginTop: 12 }}>
            {visiblePins.map((pin) => {
              const pinKey = normalizeAddress(pin.address);
              const expanded = expandedPinKeys.includes(pinKey);
              const leadsForAddress = leadsByAddress.get(pinKey) ?? [];
              const newLeadDraft = getNewLeadDraft(pin);
              const hasMyLeadAtAddress = leadsForAddress.some(
                (lead) => lead.rep_id === user.id,
              );

              return (
                <article key={pinKey} className="job-card">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => togglePinExpanded(pinKey)}
                    style={{ width: "100%", textAlign: "left" }}
                  >
                    <div className="row">
                      <strong>{pin.address}</strong>
                      <span className="hint">
                        {expanded ? "Hide Details" : "Open Details"}
                      </span>
                    </div>
                  </button>

                  {expanded ? (
                    <div
                      style={{
                        marginTop: 8,
                        display: "grid",
                        gap: 8,
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                      }}
                    >
                      <p className="hint">
                        Activity:{" "}
                        {pin.knocks > 0
                          ? `${pin.knocks} knock(s)`
                          : `${pin.potentialLeadCount} potential lead(s)`}
                      </p>
                      <p className="hint">
                        Outcome: {displayOutcome(pin.lastOutcome)}
                      </p>
                      <p className="hint">
                        Last activity: {formatDateTime(pin.lastKnockedAt)}
                      </p>
                      <p className="hint">Homeowner: {pin.lastHomeownerName ?? "-"}</p>
                      <p className="hint">
                        Lead status: {getLeadStatusLabel(pin.resolvedLeadStatus)}
                      </p>
                      {managerView ? (
                        <p className="hint">
                          Last rep who knocked:{" "}
                          {pin.lastKnockedRepName ??
                            pin.lastKnockedRepId ??
                            "No knock yet"}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {expanded ? (
                    <div className="stack" style={{ marginTop: 10 }}>
                      {managerView ? (
                        <div className="row">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void deletePinData(pin)}
                            disabled={deletingPinKey === pinKey}
                          >
                            {deletingPinKey === pinKey
                              ? "Deleting..."
                              : "Delete Pin/Knocks"}
                          </button>
                        </div>
                      ) : null}
                      <h3 style={{ margin: 0, fontSize: "1rem" }}>
                        Lead Records At This Address
                      </h3>

                      {leadsForAddress.length === 0 ? (
                        <p className="hint">
                          No potential lead row exists yet for this address.
                        </p>
                      ) : null}

                      {leadsForAddress.map((lead) => {
                        const draft = getLeadDraft(lead);
                        const leadDocs = documentsByLeadId[lead.id] ?? [];
                        const leadOwner =
                          repNameById[lead.rep_id] || lead.rep_id || "Unknown";

                        return (
                          <article
                            key={lead.id}
                            className="job-card"
                            style={{ background: "var(--panel)" }}
                          >
                            <div className="row">
                              <strong>
                                Lead {lead.id.slice(0, 8)}{" "}
                                {managerView ? `| Rep: ${leadOwner}` : ""}
                              </strong>
                              <span className="hint">
                                Created {formatDateTime(lead.created_at ?? null)}
                              </span>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: 8,
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(180px, 1fr))",
                              }}
                            >
                              <label className="stack">
                                Address
                                <input
                                  value={draft.address}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "address",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>

                              <label className="stack">
                                Homeowner Name
                                <input
                                  value={draft.homeownerName}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "homeownerName",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>

                              <label className="stack">
                                Homeowner Phone
                                <input
                                  value={draft.homeownerPhone}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "homeownerPhone",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>

                              <label className="stack">
                                Homeowner Email
                                <input
                                  value={draft.homeownerEmail}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "homeownerEmail",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>

                              <label className="stack">
                                Lead Status
                                <select
                                  value={draft.leadStatus}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "leadStatus",
                                      event.target.value,
                                    )
                                  }
                                >
                                  {LEAD_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label className="stack">
                                Lead Source
                                <input
                                  value={draft.leadSource}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "leadSource",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Door knock, referral, etc."
                                />
                              </label>

                              <label className="stack">
                                Best Contact Time
                                <input
                                  value={draft.bestContactTime}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "bestContactTime",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Weekday evenings"
                                />
                              </label>

                              <label className="stack">
                                Follow Up
                                <input
                                  type="datetime-local"
                                  value={draft.followUpAtLocal}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "followUpAtLocal",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>

                              <label className="stack">
                                Latitude
                                <input
                                  value={draft.latitude}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "latitude",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="39.1234"
                                />
                              </label>

                              <label className="stack">
                                Longitude
                                <input
                                  value={draft.longitude}
                                  onChange={(event) =>
                                    setLeadDraftField(
                                      lead.id,
                                      "longitude",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="-104.1234"
                                />
                              </label>
                            </div>

                            <label className="stack">
                              Notes
                              <textarea
                                rows={3}
                                value={draft.notes}
                                onChange={(event) =>
                                  setLeadDraftField(
                                    lead.id,
                                    "notes",
                                    event.target.value,
                                  )
                                }
                              />
                            </label>

                            <label className="stack">
                              Additional Details
                              <textarea
                                rows={3}
                                value={draft.additionalDetails}
                                onChange={(event) =>
                                  setLeadDraftField(
                                    lead.id,
                                    "additionalDetails",
                                    event.target.value,
                                  )
                                }
                                placeholder="Roof age, gate code, pet notes, referral context, etc."
                              />
                            </label>

                            <div className="row">
                              <button
                                type="button"
                                onClick={() => void saveLead(lead)}
                                disabled={savingLeadId === lead.id}
                              >
                                {savingLeadId === lead.id ? "Saving..." : "Save Lead"}
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => void deleteLead(lead)}
                                disabled={deletingLeadId === lead.id}
                              >
                                {deletingLeadId === lead.id
                                  ? "Removing..."
                                  : "Delete Lead"}
                              </button>
                            </div>

                            <div
                              className="stack"
                              style={{
                                marginTop: 8,
                                paddingTop: 10,
                                borderTop: "1px solid var(--border)",
                              }}
                            >
                              <strong>Documents</strong>
                              <label className="stack">
                                Add Document
                                <input
                                  type="file"
                                  onChange={(event) =>
                                    setSelectedFileByLeadId((previous) => ({
                                      ...previous,
                                      [lead.id]:
                                        event.target.files?.[0] ?? null,
                                    }))
                                  }
                                />
                              </label>

                              <div className="row">
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => void uploadDocument(lead)}
                                  disabled={uploadingLeadId === lead.id}
                                >
                                  {uploadingLeadId === lead.id
                                    ? "Uploading..."
                                    : "Upload Document"}
                                </button>
                              </div>

                              {leadDocs.length > 0 ? (
                                <div className="stack">
                                  {leadDocs.map((doc) => (
                                    <div key={doc.id} className="job-card">
                                      <div className="row">
                                        <strong>{doc.file_name}</strong>
                                        <span className="hint">
                                          {formatBytes(
                                            toNumber(doc.size_bytes) ?? null,
                                          )}{" "}
                                          | {formatDateTime(doc.created_at ?? null)}
                                        </span>
                                      </div>
                                      <div className="row">
                                        <button
                                          type="button"
                                          className="secondary"
                                          onClick={() => void openDocument(doc)}
                                          disabled={openingDocumentId === doc.id}
                                        >
                                          {openingDocumentId === doc.id
                                            ? "Opening..."
                                            : "Open"}
                                        </button>
                                        <button
                                          type="button"
                                          className="secondary"
                                          onClick={() => void deleteDocument(doc)}
                                          disabled={deletingDocumentId === doc.id}
                                        >
                                          {deletingDocumentId === doc.id
                                            ? "Removing..."
                                            : "Remove"}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="hint">No documents uploaded.</p>
                              )}
                            </div>
                          </article>
                        );
                      })}

                      {!hasMyLeadAtAddress ? (
                        <article
                          className="job-card"
                          style={{ background: "var(--panel)" }}
                        >
                          <h4 style={{ margin: 0 }}>Create My Lead Here</h4>
                          <p className="hint">
                            You do not have a lead row here yet. Create one for
                            this address.
                          </p>

                        <div
                          style={{
                            display: "grid",
                            gap: 8,
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(180px, 1fr))",
                          }}
                        >
                          <label className="stack">
                            Address
                            <input
                              value={newLeadDraft.address}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "address",
                                  event.target.value,
                                )
                              }
                            />
                          </label>

                          <label className="stack">
                            Homeowner Name
                            <input
                              value={newLeadDraft.homeownerName}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "homeownerName",
                                  event.target.value,
                                )
                              }
                            />
                          </label>

                          <label className="stack">
                            Homeowner Phone
                            <input
                              value={newLeadDraft.homeownerPhone}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "homeownerPhone",
                                  event.target.value,
                                )
                              }
                            />
                          </label>

                          <label className="stack">
                            Homeowner Email
                            <input
                              value={newLeadDraft.homeownerEmail}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "homeownerEmail",
                                  event.target.value,
                                )
                              }
                            />
                          </label>

                          <label className="stack">
                            Lead Status
                            <select
                              value={newLeadDraft.leadStatus}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "leadStatus",
                                  event.target.value,
                                )
                              }
                            >
                              {LEAD_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="stack">
                            Lead Source
                            <input
                              value={newLeadDraft.leadSource}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "leadSource",
                                  event.target.value,
                                )
                              }
                            />
                          </label>

                          <label className="stack">
                            Best Contact Time
                            <input
                              value={newLeadDraft.bestContactTime}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "bestContactTime",
                                  event.target.value,
                                )
                              }
                            />
                          </label>

                          <label className="stack">
                            Follow Up
                            <input
                              type="datetime-local"
                              value={newLeadDraft.followUpAtLocal}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "followUpAtLocal",
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        </div>

                        <label className="stack">
                          Notes
                          <textarea
                            rows={2}
                            value={newLeadDraft.notes}
                            onChange={(event) =>
                              setNewLeadDraftField(
                                pinKey,
                                pin,
                                "notes",
                                event.target.value,
                              )
                            }
                          />
                        </label>

                        <label className="stack">
                          Additional Details
                          <textarea
                            rows={2}
                            value={newLeadDraft.additionalDetails}
                            onChange={(event) =>
                              setNewLeadDraftField(
                                pinKey,
                                pin,
                                "additionalDetails",
                                event.target.value,
                              )
                            }
                          />
                        </label>

                        <div
                          style={{
                            display: "grid",
                            gap: 8,
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(180px, 1fr))",
                          }}
                        >
                          <label className="stack">
                            Latitude
                            <input
                              value={newLeadDraft.latitude}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "latitude",
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                          <label className="stack">
                            Longitude
                            <input
                              value={newLeadDraft.longitude}
                              onChange={(event) =>
                                setNewLeadDraftField(
                                  pinKey,
                                  pin,
                                  "longitude",
                                  event.target.value,
                                )
                              }
                            />
                          </label>
                        </div>

                          <div className="row">
                            <button
                              type="button"
                              onClick={() => void createLeadForAddress(pin)}
                              disabled={savingNewAddressKey === pinKey}
                            >
                              {savingNewAddressKey === pinKey
                                ? "Saving..."
                                : "Save My Lead For This Address"}
                            </button>
                          </div>
                        </article>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {filteredPins.length > visiblePins.length ? (
              <p className="hint">
                Showing first {visiblePins.length} of {filteredPins.length}{" "}
                matched addresses.
              </p>
            ) : null}
          </div>
        ) : mapMode === "pins" ? (
          <p className="hint" style={{ marginTop: 12 }}>
            {pins.length === 0
              ? "No knocked doors or potential leads found."
              : "No addresses match your search filter."}
          </p>
        ) : (
          <p className="hint" style={{ marginTop: 12 }}>
            Heat map mode hides pin editing and route tools. Switch back to Lead Pins to edit lead records.
          </p>
        )}
      </section>
    </AppShell>
  );
}
