"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AddressAutocompleteInput from "@/components/AddressAutocompleteInput";
import { AppShell } from "@/components/AppShell";
import { crmApi } from "@/lib/crm-api";
import {
  countSyncOperations,
  enqueueSyncOperation,
  flushSyncQueue,
  setupAutoSync,
} from "@/lib/offline-sync";
import {
  getEventDelta,
  getSessionElapsedSeconds,
  getTodayLocalDate,
  type KnockAction,
  type KnockOutcome,
  type NightlyDelta,
  type SessionStatus,
} from "@/lib/knocking";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuthSession } from "@/lib/use-auth-session";
import type { AreaSuggestion, SessionFeedback } from "@/types/field-intelligence";
import {
  COMPONENT_PRESENCE_KEYS,
  REQUIRED_PHOTO_COUNTS,
  defaultComponentPresenceDraft,
  type CaptureSection,
  type DamageSlope,
  type DamageCause,
  type InspectionPhotoDraft,
  type InspectionStepKey,
  type HubSectionKey,
  type SectionCondition,
  type HubSectionStates,
  type RoofDamageMetrics,
  type DetachedBuilding,
  type ReportBuilderPayload,
  type TestSquare,
} from "@/types/inspection";
import HouseHub, { type HotspotState } from "@/components/inspection/HouseHub";
import SectionDrawer from "@/components/inspection/SectionDrawer";
import RoofSubHub from "@/components/inspection/RoofSubHub";
import ReportBuilder from "@/components/inspection/ReportBuilder";
import type { RepSignatureRow as RBRepSignatureRow } from "@/components/inspection/ReportBuilder";
import { useInspectionAutosave } from "@/hooks/useInspectionAutosave";
import type { JsonRecord } from "@/types/models";

type KnockSessionRow = JsonRecord & {
  id: string;
  rep_id: string;
  status: SessionStatus;
  started_at: string;
  paused_at?: string | null;
  ended_at?: string | null;
  total_paused_seconds?: number | null;
  latest_latitude?: number | null;
  latest_longitude?: number | null;
  latest_address?: string | null;
  knocks?: number | null;
  talks?: number | null;
  inspections?: number | null;
  contingencies?: number | null;
};

type SessionKnockEventRow = JsonRecord & {
  id: string;
  session_id: string;
  rep_id: string;
  action: KnockAction;
  outcome?: KnockOutcome | null;
  address?: string | null;
  homeowner_name?: string | null;
  homeowner_phone?: string | null;
  homeowner_email?: string | null;
  created_at?: string | null;
  is_locked?: boolean | null;
  linked_job_id?: string | null;
  linked_task_id?: string | null;
  knocks_delta?: number | null;
  talks_delta?: number | null;
  inspections_delta?: number | null;
  contingencies_delta?: number | null;
};

type PotentialLeadRow = JsonRecord & {
  id: string;
  rep_id: string;
  address: string;
  address_normalized?: string | null;
  homeowner_name?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
};

type HomeownerIntake = {
  homeownerName: string;
  phone: string;
  email: string;
  address: string;
};

type SessionStep = "door" | "outcome" | "homeowner" | "follow_up" | "inspection";
type EditableKnockOutcome = "no_answer" | "no";

type SessionEventEditDraft = {
  outcome: EditableKnockOutcome;
  address: string;
  homeownerName: string;
  homeownerPhone: string;
  homeownerEmail: string;
};

type PotentialLeadDraft = {
  address: string;
  homeownerName: string;
  notes: string;
};

type ReportSectionSelection = {
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

type QuickPhotoDraft = {
  file: File | null;
  damageCause: DamageCause;
  slopeTag: DamageSlope | "";
  componentTag: string;
  customTag: string;
  note: string;
};

type RepSignatureRow = JsonRecord & {
  id: string;
  rep_id: string;
  label?: string | null;
  file_path: string;
  is_active?: boolean | null;
  created_at?: string | null;
};

type InspectionCompletionModalState = {
  open: boolean;
  eventAddress: string;
  title: string;
  reportId: string | null;
  fileName: string;
  pdfUrl: string | null;
  pdfBytes: ArrayBuffer | null;
  uploadStatus: "uploaded" | "failed";
  uploadError: string | null;
  linkedJobId: string | null;
  inspectionId: string | null;
  selectedPhotoIds: string[];
  reportPayload: Record<string, unknown>;
};

type InspectionChecklist = {
  shingleLengthInches: string;
  shingleWidthInches: string;
  dripEdgePresent: boolean | null;
  notes: string;
  contingent: boolean;
  interiorStatus: "completed" | "skipped";
  interiorSkipReason: string;
  atticStatus: "completed" | "skipped";
  atticSkipReason: string;
  componentPresence: ReturnType<typeof defaultComponentPresenceDraft>;
  signatureRepName: string;
  selectedSignatureId: string | null;
};

type InspectionFlowStep = {
  key: InspectionStepKey;
  label: string;
  description: string;
  optional?: boolean;
};

const DEFAULT_INTAKE: HomeownerIntake = {
  homeownerName: "",
  phone: "",
  email: "",
  address: "",
};

const INSPECTION_FLOW: InspectionFlowStep[] = [
  {
    key: "perimeter_photos",
    label: "Perimeter Photos",
    description: "Capture perimeter photos quickly in bulk.",
  },
  {
    key: "collateral_damage",
    label: "Collateral Damage",
    description: "Capture one collateral-damage photo at a time with optional tags.",
  },
  {
    key: "roof_overview",
    label: "Roof Overview",
    description: "Capture overview photos, layer photo, shingle dimensions, and drip-edge status.",
  },
  {
    key: "roof_components",
    label: "Roof Components",
    description: "Mark component presence and quantity.",
  },
  {
    key: "roof_damage",
    label: "Roof Damage",
    description: "Capture one roof-damage photo at a time with optional slope and damage tags.",
  },
  {
    key: "interior_attic",
    label: "Interior + Attic",
    description: "Single page for interior and attic completion/skip status.",
    optional: true,
  },
  {
    key: "report_signature",
    label: "Report Design + Signature",
    description: "Choose report contents and apply a saved or drawn signature.",
  },
];

const DEFAULT_REPORT_SECTION_SELECTION: ReportSectionSelection = {
  homeowner: true,
  perimeterPhotos: false,
  collateralDamage: false,
  roofOverview: true,
  roofComponents: false,
  roofDamage: true,
  interiorAttic: false,
  signature: true,
  summaryNotes: true,
};

function makeDefaultChecklist(): InspectionChecklist {
  return {
    shingleLengthInches: "",
    shingleWidthInches: "",
    dripEdgePresent: null,
    notes: "",
    contingent: false,
    interiorStatus: "completed",
    interiorSkipReason: "",
    atticStatus: "completed",
    atticSkipReason: "",
    componentPresence: defaultComponentPresenceDraft(),
    signatureRepName: "",
    selectedSignatureId: null,
  };
}

const DEFAULT_POTENTIAL_LEAD_DRAFT: PotentialLeadDraft = {
  address: "",
  homeownerName: "",
  notes: "",
};

const KNOCK_EVENT_SELECT =
  "id,session_id,rep_id,action,outcome,address,homeowner_name,homeowner_phone,homeowner_email,created_at,is_locked,linked_job_id,linked_task_id,knocks_delta,talks_delta,inspections_delta,contingencies_delta";

function toNum(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeAddress(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toIsoFromLocalInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function parseError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function likelyNetworkError(error: unknown) {
  const message = parseError(error, "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("offline")
  );
}

function displayOutcome(value: string | null | undefined) {
  if (value === "no_answer") return "No Answer";
  if (value === "soft_set") return "Soft Set";
  if (value === "inspection") return "Inspection";
  if (value === "do_not_knock") return "Do Not Knock";
  if (value === "no") return "No";
  return "Unknown";
}

function eventTitle(action: string | null | undefined, outcome: string | null | undefined) {
  if (action === "door_hanger") return "Door Hanger";
  return `Knock: ${displayOutcome(outcome)}`;
}

function editableOutcome(value: unknown): EditableKnockOutcome {
  return value === "no" ? "no" : "no_answer";
}

function eventIsCrmLocked(event: SessionKnockEventRow) {
  return Boolean(event.is_locked || event.linked_job_id || event.linked_task_id);
}

function makeEditDraft(event: SessionKnockEventRow): SessionEventEditDraft {
  return {
    outcome: editableOutcome(event.outcome),
    address: typeof event.address === "string" ? event.address : "",
    homeownerName: typeof event.homeowner_name === "string" ? event.homeowner_name : "",
    homeownerPhone: typeof event.homeowner_phone === "string" ? event.homeowner_phone : "",
    homeownerEmail: typeof event.homeowner_email === "string" ? event.homeowner_email : "",
  };
}

function mergeNightlyDelta(base: NightlyDelta, delta: NightlyDelta): NightlyDelta {
  return {
    knocks: base.knocks + delta.knocks,
    talks: base.talks + delta.talks,
    inspections: base.inspections + delta.inspections,
    contingencies: base.contingencies + delta.contingencies,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

type KnockStageTarget = "lead" | "inspection_scheduled" | "contingency";

const KNOCK_STAGE_NAME_ALIASES: Record<KnockStageTarget, string[]> = {
  lead: ["lead"],
  inspection_scheduled: ["inspection scheduled"],
  contingency: ["contingency"],
};

const KNOCK_STAGE_FALLBACK_IDS: Partial<Record<KnockStageTarget, number>> = {
  lead: 1,
  contingency: 2,
};

function normalizeStageName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function loadKnockStageIds(supabase: any) {
  const { data, error } = await supabase.from("pipeline_stages").select("id,name");
  if (error) {
    throw new Error(error.message);
  }

  const stageIdByName = new Map<string, number>();
  ((data ?? []) as Array<{ id?: number | null; name?: string | null }>).forEach((row) => {
    const id = Number(row.id);
    const name = normalizeStageName(row.name);
    if (Number.isFinite(id) && id > 0 && name) {
      stageIdByName.set(name, id);
    }
  });

  const resolved: Partial<Record<KnockStageTarget, number>> = {};
  (Object.keys(KNOCK_STAGE_NAME_ALIASES) as KnockStageTarget[]).forEach((target) => {
    const stageId = KNOCK_STAGE_NAME_ALIASES[target]
      .map((name) => stageIdByName.get(normalizeStageName(name)))
      .find((id) => typeof id === "number" && Number.isFinite(id));

    if (typeof stageId === "number") {
      resolved[target] = stageId;
      return;
    }

    const fallback = KNOCK_STAGE_FALLBACK_IDS[target];
    if (typeof fallback === "number") {
      resolved[target] = fallback;
    }
  });

  return resolved;
}

async function reverseGeocode(lat: number, lng: number, apiKey: string) {
  if (!apiKey.trim()) return null;
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
      `${lat},${lng}`,
    )}&key=${encodeURIComponent(apiKey)}`,
  );
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{ formatted_address?: string }>;
  };
  if (payload.status !== "OK") return null;
  const address = payload.results?.[0]?.formatted_address;
  return typeof address === "string" && address.trim().length > 0 ? address : null;
}

async function geocodeAddressInput(address: string, apiKey: string) {
  if (!apiKey.trim()) return null;
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&key=${encodeURIComponent(apiKey)}`,
  );
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };
  if (payload.status !== "OK") return null;
  const location = payload.results?.[0]?.geometry?.location;
  if (!location) return null;

  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

export default function KnockingPage() {
  const router = useRouter();
  const {
    user,
    loading,
    role,
    signOut,
    accessToken,
    error: authError,
    fullName,
    profileImageUrl,
    includeInNightlyNumbers,
  } = useAuthSession();
  const supabase = getSupabaseBrowserClient();

  const [session, setSession] = useState<KnockSessionRow | null>(null);
  const [sessionEvents, setSessionEvents] = useState<SessionKnockEventRow[]>([]);
  const [loadingSessionEvents, setLoadingSessionEvents] = useState(false);
  const [sessionEventsError, setSessionEventsError] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventEditDraft, setEventEditDraft] = useState<SessionEventEditDraft | null>(null);
  const [potentialLeads, setPotentialLeads] = useState<PotentialLeadRow[]>([]);
  const [loadingPotentialLeads, setLoadingPotentialLeads] = useState(false);
  const [potentialLeadDraft, setPotentialLeadDraft] = useState<PotentialLeadDraft>(DEFAULT_POTENTIAL_LEAD_DRAFT);
  const [potentialLeadError, setPotentialLeadError] = useState<string | null>(null);
  const [potentialLeadMessage, setPotentialLeadMessage] = useState("");
  const [savingPotentialLead, setSavingPotentialLead] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [todayTotals, setTodayTotals] = useState<NightlyDelta>({
    knocks: 0,
    talks: 0,
    inspections: 0,
    contingencies: 0,
  });

  const [step, setStep] = useState<SessionStep>("door");
  const [eventAction, setEventAction] = useState<KnockAction>("knock");
  const [eventOutcome, setEventOutcome] = useState<KnockOutcome>("no_answer");

  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [currentAddress, setCurrentAddress] = useState("");
  const [doorAddress, setDoorAddress] = useState("");

  const [homeownerIntake, setHomeownerIntake] = useState<HomeownerIntake>(DEFAULT_INTAKE);
  const [followUpAt, setFollowUpAt] = useState("");
  const [inspectionChecklist, setInspectionChecklist] = useState<InspectionChecklist>(makeDefaultChecklist());
  const [inspectionPhotos, setInspectionPhotos] = useState<InspectionPhotoDraft[]>([]);
  const [inspectionStepIndex, setInspectionStepIndex] = useState(0);
  const [collateralPhotoDraft, setCollateralPhotoDraft] = useState<QuickPhotoDraft>({
    file: null,
    damageCause: "none",
    slopeTag: "",
    componentTag: "",
    customTag: "",
    note: "",
  });
  const [roofDamagePhotoDraft, setRoofDamagePhotoDraft] = useState<QuickPhotoDraft>({
    file: null,
    damageCause: "none",
    slopeTag: "",
    componentTag: "",
    customTag: "",
    note: "",
  });
  const [reportSectionSelection, setReportSectionSelection] = useState<ReportSectionSelection>(
    DEFAULT_REPORT_SECTION_SELECTION,
  );
  const [reportPhotoSelection, setReportPhotoSelection] = useState<Record<string, boolean>>({});
  const [repSignatures, setRepSignatures] = useState<RepSignatureRow[]>([]);
  const [loadingSignatures, setLoadingSignatures] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [signatureDrawn, setSignatureDrawn] = useState(false);

  // ── Hub v3 state ─────────────────────────────────────────────────────────
  const [activeHubSection, setActiveHubSection] = useState<HubSectionKey | null>(null);
  const [showRoofHub, setShowRoofHub] = useState(false);
  const [hubSectionStates, setHubSectionStates] = useState<HubSectionStates>({});
  const [roofDamageHub, setRoofDamageHub] = useState<RoofDamageMetrics>({
    windShingleCount: null,
    hailCount: null,
    slopesAffected: [],
    testSquares: [],
  });
  const [estimatedRoofAgeYears, setEstimatedRoofAgeYears] = useState<number | null>(null);
  const [layerCount, setLayerCount] = useState<"1" | "2" | "3+" | null>(null);
  const [layerPhotoId, setLayerPhotoId] = useState<string | null>(null);
  const [detachedBuildings, setDetachedBuildings] = useState<DetachedBuilding[]>([]);
  const [showReportBuilder, setShowReportBuilder] = useState(false);
  const [reportBuilderPayload, setReportBuilderPayload] = useState<ReportBuilderPayload>({
    cover: { intro: "", coverPhotoId: null },
    sections: [],
    closing: { notes: "" },
    contingent: false,
    signatureId: null,
    signaturePath: null,
  });
  const [activeInspectionId, setActiveInspectionId] = useState<string | null>(null);
  // ── /Hub v3 state ─────────────────────────────────────────────────────────

  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AreaSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completionModal, setCompletionModal] = useState<InspectionCompletionModalState>({
    open: false,
    eventAddress: "",
    title: "Inspection Report",
    reportId: null,
    fileName: "",
    pdfUrl: null,
    pdfBytes: null,
    uploadStatus: "failed",
    uploadError: null,
    linkedJobId: null,
    inspectionId: null,
    selectedPhotoIds: [],
    reportPayload: {},
  });

  const watchIdRef = useRef<number | null>(null);
  const currentAddressRef = useRef("");
  const addressTouchedRef = useRef(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const timeoutSweepWarnedRef = useRef(false);
  const knockStageIdsRef = useRef<Partial<Record<KnockStageTarget, number>> | null>(null);

  const { scheduleSave, saveLabel } = useInspectionAutosave({ inspectionId: activeInspectionId });

  const geocodeApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const canLog = Boolean(session && session.status === "active" && accessToken);
  const canEditSessionEvents = Boolean(session && (session.status === "active" || session.status === "paused"));
  const sessionStatusLabel = useMemo(() => {
    if (!session) return "NOT STARTED";
    return session.status.toUpperCase();
  }, [session]);
  const inspectionFlowStep = INSPECTION_FLOW[inspectionStepIndex] ?? INSPECTION_FLOW[0];

  const sessionFeedback = useMemo<SessionFeedback>(() => {
    const hours = Math.max(1 / 60, sessionSeconds / 3600);
    const knocks = toNum(session?.knocks);
    const talks = toNum(session?.talks);
    const inspections = toNum(session?.inspections);
    const contingencies = toNum(session?.contingencies);
    return {
      knocksPerHour: knocks / hours,
      talkRate: knocks > 0 ? talks / knocks : 0,
      inspectionRate: knocks > 0 ? inspections / knocks : 0,
      contingencyRate: knocks > 0 ? contingencies / knocks : 0,
    };
  }, [session, sessionSeconds]);

  const photoCountsBySection = useMemo(() => {
    return inspectionPhotos.reduce(
      (acc, photo) => {
        acc[photo.captureSection] = (acc[photo.captureSection] ?? 0) + 1;
        return acc;
      },
      {
        perimeter_photos: 0,
        collateral_damage: 0,
        roof_overview: 0,
        roof_damage: 0,
        interior_attic: 0,
        perimeter: 0,
        roof: 0,
        damage: 0,
        interior: 0,
        attic: 0,
        siding: 0,
        gutters: 0,
        windows: 0,
        roof_damage_test_square: 0,
        other: 0,
      } as Record<CaptureSection, number>,
    );
  }, [inspectionPhotos]);

  const missingRequiredPhotos = useMemo(() => {
    return {
      perimeterPhotos: Math.max(
        0,
        REQUIRED_PHOTO_COUNTS.perimeterPhotos - photoCountsBySection.perimeter_photos,
      ),
      collateralDamage: Math.max(
        0,
        REQUIRED_PHOTO_COUNTS.collateralDamage - photoCountsBySection.collateral_damage,
      ),
      roofOverview: Math.max(0, REQUIRED_PHOTO_COUNTS.roofOverview - photoCountsBySection.roof_overview),
      roofDamage: Math.max(0, REQUIRED_PHOTO_COUNTS.roofDamage - photoCountsBySection.roof_damage),
    };
  }, [photoCountsBySection]);

  const photoRequirementWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (missingRequiredPhotos.perimeterPhotos > 0) {
      warnings.push(`perimeter photos missing: ${missingRequiredPhotos.perimeterPhotos}`);
    }
    if (missingRequiredPhotos.roofOverview > 0) {
      warnings.push(`roof overview photos missing: ${missingRequiredPhotos.roofOverview}`);
    }
    if (missingRequiredPhotos.roofDamage > 0) {
      warnings.push(`roof damage photos missing: ${missingRequiredPhotos.roofDamage}`);
    }
    return warnings;
  }, [missingRequiredPhotos]);

  async function refreshSyncQueueCount() {
    try {
      setSyncQueueCount(await countSyncOperations());
    } catch {
      // noop
    }
  }

  async function queueOperation(
    resourceType: string,
    payload: Record<string, unknown>,
    operationType: "insert" | "update" | "upsert" | "delete" = "insert",
    resourceId?: string,
  ) {
    await enqueueSyncOperation({
      clientOperationId: crypto.randomUUID(),
      operationType,
      resourceType,
      resourceId: resourceId ?? null,
      payload,
    });
    await refreshSyncQueueCount();
  }

  async function syncNow() {
    setSyncingNow(true);
    setSyncStatusMessage(null);
    try {
      const result = await flushSyncQueue();
      setSyncStatusMessage(
        result.offline
          ? `Offline. ${result.remaining} queued operation(s) waiting.`
          : `Synced ${result.pushed} operation(s). ${result.remaining} remaining.`,
      );
      await refreshSyncQueueCount();
    } catch (syncError) {
      setSyncStatusMessage(parseError(syncError, "Sync failed."));
    } finally {
      setSyncingNow(false);
    }
  }

  async function runInactivityTimeoutSweep() {
    const { error: timeoutError } = await supabase.rpc("timeout_stale_knock_sessions", {
      inactivity_minutes: 30,
    });

    if (!timeoutError) return;

    const normalized = timeoutError.message.toLowerCase();
    const migrationMissing =
      (normalized.includes("function") && normalized.includes("does not exist")) ||
      normalized.includes("timeout_stale_knock_sessions");

    if (migrationMissing) {
      if (!timeoutSweepWarnedRef.current) {
        console.warn(
          "Knocking: session timeout migration is not applied yet (timeout_stale_knock_sessions).",
        );
        timeoutSweepWarnedRef.current = true;
      }
      return;
    }

    console.warn("Knocking: could not run session inactivity timeout sweep.", timeoutError);
  }

  function updateInspectionComponent(componentKey: string, isPresent: boolean) {
    setInspectionChecklist((previous) => ({
      ...previous,
      componentPresence: {
        ...previous.componentPresence,
        [componentKey]: {
          present: isPresent,
          quantity: isPresent ? previous.componentPresence[componentKey]?.quantity ?? 1 : null,
        },
      },
    }));
  }

  function updateInspectionComponentQuantity(componentKey: string, quantityText: string) {
    const parsed = Number(quantityText);
    setInspectionChecklist((previous) => ({
      ...previous,
      componentPresence: {
        ...previous.componentPresence,
        [componentKey]: {
          ...previous.componentPresence[componentKey],
          present: true,
          quantity: Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0,
        },
      },
    }));
  }

  // ── Hub v3 helpers ────────────────────────────────────────────────────────
  function updateHubSection(key: HubSectionKey, patch: Partial<{ condition: SectionCondition | null; note: string; manualComplete: boolean; manualIncomplete: boolean }>) {
    setHubSectionStates((prev) => ({
      ...prev,
      [key]: { condition: null, note: "", manualComplete: false, manualIncomplete: false, ...prev[key], ...patch },
    }));
    if (activeInspectionId) {
      scheduleSave({ metadata: { hubSectionStates: { ...hubSectionStates, [key]: { condition: null, note: "", manualComplete: false, manualIncomplete: false, ...hubSectionStates[key], ...patch } } } });
    }
  }

  function computeHotspotState(key: HubSectionKey): HotspotState {
    const state = hubSectionStates[key];
    if (state?.manualComplete) return "override_complete";
    const photoCount = photoCountsBySection[key as CaptureSection] ?? 0;
    const condition = state?.condition;
    if (key === "perimeter" && photoCount >= 8) return "complete";
    if (key === "roof") {
      const overviewCount = photoCountsBySection["roof_overview"] ?? 0;
      if (overviewCount >= 8 && inspectionChecklist.shingleLengthInches && inspectionChecklist.shingleWidthInches) return "complete";
      if (overviewCount > 0) return "in_progress";
      return "untouched";
    }
    if (condition) {
      if (condition === "good" || photoCount >= 1) return "complete";
      return "in_progress";
    }
    if (photoCount > 0) return "in_progress";
    return "untouched";
  }

  async function addPhotosFromHub(
    files: File[],
    tags: { cause: DamageCause; slope: DamageSlope | ""; note: string },
    captureSection: CaptureSection,
  ): Promise<InspectionPhotoDraft[]> {
    const newPhotos: InspectionPhotoDraft[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      captureSection,
      damageCause: tags.cause,
      slopeTag: tags.slope,
      componentTag: "",
      customTag: "",
      note: tags.note,
      autoTagged: false,
    }));
    setInspectionPhotos((prev) => [...prev, ...newPhotos]);
    setReportPhotoSelection((prev) => ({
      ...prev,
      ...Object.fromEntries(newPhotos.map((p) => [p.id, true])),
    }));
    return newPhotos;
  }
  // ── /Hub v3 helpers ───────────────────────────────────────────────────────

  function pushInspectionPhotos(
    files: FileList | null,
    options: {
      captureSection: CaptureSection;
      damageCause?: DamageCause;
      slopeTag?: DamageSlope | "";
      componentTag?: string;
      customTag?: string;
      note?: string;
      autoTagged?: boolean;
    },
  ) {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;

    const nextPhotos = picked.map((file) => ({
      id: crypto.randomUUID(),
      file,
      captureSection: options.captureSection,
      damageCause: options.damageCause ?? "none",
      slopeTag: options.slopeTag ?? "",
      componentTag: options.componentTag ?? "",
      customTag: options.customTag ?? "",
      note: options.note ?? "",
      autoTagged: Boolean(options.autoTagged),
    })) satisfies InspectionPhotoDraft[];

    setInspectionPhotos((previous) => [...previous, ...nextPhotos]);
    setReportPhotoSelection((previous) => ({
      ...previous,
      ...Object.fromEntries(nextPhotos.map((photo) => [photo.id, true])),
    }));
  }

  function addQuickTaggedPhoto(draft: QuickPhotoDraft, captureSection: CaptureSection) {
    if (!draft.file) {
      setError("Select a photo before saving.");
      return false;
    }
    const nextPhoto: InspectionPhotoDraft = {
      id: crypto.randomUUID(),
      file: draft.file,
      captureSection,
      damageCause: draft.damageCause,
      slopeTag: draft.slopeTag,
      componentTag: draft.componentTag,
      customTag: draft.customTag,
      note: draft.note,
      autoTagged: false,
    };
    setInspectionPhotos((previous) => [...previous, nextPhoto]);
    setReportPhotoSelection((previous) => ({
      ...previous,
      [nextPhoto.id]: true,
    }));
    return true;
  }

  async function loadRepSignatures() {
    if (!user) return;
    setLoadingSignatures(true);
    try {
      const { data, error: loadError } = await supabase
        .from("rep_signatures")
        .select("*")
        .eq("rep_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (loadError) {
        throw new Error(loadError.message);
      }
      setRepSignatures((data ?? []) as RepSignatureRow[]);
    } catch (loadError) {
      setRepSignatures([]);
      setError(parseError(loadError, "Could not load saved signatures."));
    } finally {
      setLoadingSignatures(false);
    }
  }

  function drawOnSignatureCanvas(clientX: number, clientY: number) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111";
    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
    setSignatureDrawn(true);
  }

  function startSignatureStroke(event: any) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    signatureDrawingRef.current = true;
    const context = canvas.getContext("2d");
    if (context) {
      context.beginPath();
    }
    drawOnSignatureCanvas(event.clientX, event.clientY);
  }

  function moveSignatureStroke(event: any) {
    if (!signatureDrawingRef.current) return;
    drawOnSignatureCanvas(event.clientX, event.clientY);
  }

  function endSignatureStroke() {
    signatureDrawingRef.current = false;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (context) {
      context.beginPath();
    }
  }

  function clearDrawnSignature() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDrawn(false);
  }

  async function persistDrawnSignature(labelPrefix: string): Promise<RepSignatureRow | null> {
    if (!user) return null;
    const canvas = signatureCanvasRef.current;
    if (!canvas || !signatureDrawn) {
      return null;
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/png");
    });
    if (!blob) {
      throw new Error("Could not export signature image.");
    }

    const filePath = `${user.id}/${Date.now()}-signature.png`;
    const upload = await supabase.storage.from("rep-signatures").upload(filePath, blob, {
      contentType: "image/png",
      upsert: false,
    });
    if (upload.error) {
      throw new Error(upload.error.message);
    }

    const deactive = await supabase
      .from("rep_signatures")
      .update({ is_active: false })
      .eq("rep_id", user.id)
      .eq("is_active", true);
    if (deactive.error) {
      throw new Error(deactive.error.message);
    }

    const { data, error: insertError } = await supabase
      .from("rep_signatures")
      .insert({
        rep_id: user.id,
        label: `${labelPrefix} ${new Date().toLocaleString()}`,
        file_path: filePath,
        is_active: true,
        metadata: { source: "inspection_step_7" },
      })
      .select("*")
      .single();
    if (insertError || !data) {
      throw new Error(insertError?.message || "Could not save signature.");
    }

    const saved = data as RepSignatureRow;
    setRepSignatures((previous) => [saved, ...previous.map((item) => ({ ...item, is_active: false }))]);
    setInspectionChecklist((previous) => ({ ...previous, selectedSignatureId: saved.id }));
    return saved;
  }

  async function saveDrawnSignature() {
    if (!signatureDrawn) {
      setError("Draw a signature before saving.");
      return;
    }
    setSavingSignature(true);
    try {
      const signature = await persistDrawnSignature("Signature");
      if (signature?.id) {
        setMessage("Signature saved.");
      }
    } catch (saveError) {
      setError(parseError(saveError, "Could not save signature."));
    } finally {
      setSavingSignature(false);
    }
  }

  function downloadCompletionPdf() {
    if (!completionModal.pdfUrl || !completionModal.fileName) return;
    const link = document.createElement("a");
    link.href = completionModal.pdfUrl;
    link.download = completionModal.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function closeCompletionModal() {
    if (completionModal.pdfUrl) {
      URL.revokeObjectURL(completionModal.pdfUrl);
    }
    const eventAddress = completionModal.eventAddress;
    setCompletionModal({
      open: false,
      eventAddress: "",
      title: "Inspection Report",
      reportId: null,
      fileName: "",
      pdfUrl: null,
      pdfBytes: null,
      uploadStatus: "failed",
      uploadError: null,
      linkedJobId: null,
      inspectionId: null,
      selectedPhotoIds: [],
      reportPayload: {},
    });
    if (eventAddress) {
      resetAfterEvent(eventAddress);
    }
  }

  async function uploadReportPdfToCrm(
    linkedJobId: string,
    fileName: string,
    pdfBytes: ArrayBuffer,
    accessTokenValue: string,
  ) {
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const init = await crmApi.initJobUpload(linkedJobId, accessTokenValue, {
      fileName,
      contentType: "application/pdf",
      size: blob.size,
    });
    const upload = init.upload;
    if (!upload?.filePath || !upload.token) {
      throw new Error("CRM did not return a signed upload path for the PDF report.");
    }
    const uploadRes = await supabase.storage.from("job-files").uploadToSignedUrl(upload.filePath, upload.token, blob, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadRes.error) {
      throw new Error(uploadRes.error.message);
    }
    const finalize = await crmApi.finalizeJobUpload(linkedJobId, accessTokenValue, {
      fileName,
      filePath: upload.filePath,
      contentType: "application/pdf",
    });
    const finalizeRecord = finalize as Record<string, unknown>;
    const crmDocumentId =
      typeof finalizeRecord.documentId === "string"
        ? finalizeRecord.documentId
        : typeof finalizeRecord.id === "string"
          ? finalizeRecord.id
          : null;
    const crmJobId =
      typeof finalizeRecord.jobId === "string"
        ? finalizeRecord.jobId
        : typeof finalizeRecord.job_id === "string"
          ? finalizeRecord.job_id
          : linkedJobId;
    return {
      filePath: upload.filePath,
      sizeBytes: blob.size,
      crmDocumentId,
      crmJobId,
    };
  }

  async function generateInspectionPdf(params: {
    inspectionId: string;
    title: string;
    selectedPhotoIds: string[];
    payload: Record<string, unknown>;
    accessTokenValue: string;
  }) {
    const pdfResponse = await fetch(`/api/inspections/${params.inspectionId}/report/pdf`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessTokenValue}`,
      },
      body: JSON.stringify({
        title: params.title,
        selectedPhotoIds: params.selectedPhotoIds,
        payload: params.payload,
      }),
    });
    if (!pdfResponse.ok) {
      const pdfErrorPayload = (await pdfResponse.json().catch(() => ({}))) as { error?: string };
      throw new Error(pdfErrorPayload.error || "Could not generate inspection PDF.");
    }
    const fileName =
      pdfResponse.headers.get("x-report-file-name")?.trim() || `inspection-report-${params.inspectionId}.pdf`;
    const bytes = await pdfResponse.arrayBuffer();
    return { fileName, bytes };
  }

  async function retryCompletionReportUpload() {
    if (!completionModal.open || !completionModal.linkedJobId || !completionModal.inspectionId || !accessToken) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let pdfBytes = completionModal.pdfBytes;
      let fileName = completionModal.fileName;
      if (!pdfBytes || !fileName) {
        const regenerated = await generateInspectionPdf({
          inspectionId: completionModal.inspectionId,
          title: completionModal.title,
          selectedPhotoIds: completionModal.selectedPhotoIds,
          payload: completionModal.reportPayload,
          accessTokenValue: accessToken,
        });
        pdfBytes = regenerated.bytes;
        fileName = regenerated.fileName;
        const refreshedUrl = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
        setCompletionModal((previous) => {
          if (previous.pdfUrl) URL.revokeObjectURL(previous.pdfUrl);
          return {
            ...previous,
            fileName,
            pdfBytes,
            pdfUrl: refreshedUrl,
          };
        });
      }

      const uploadMeta = await uploadReportPdfToCrm(
        completionModal.linkedJobId,
        fileName,
        pdfBytes,
        accessToken,
      );
      if (completionModal.reportId) {
        const { error: reportUpdateError } = await supabase
          .from("inspection_reports")
          .update({
            file_name: completionModal.fileName,
            file_path: uploadMeta.filePath,
            content_type: "application/pdf",
            size_bytes: uploadMeta.sizeBytes,
            crm_document_id: uploadMeta.crmDocumentId,
            crm_job_id: uploadMeta.crmJobId,
            payload: {
              ...completionModal.reportPayload,
              upload_status: "uploaded",
              upload_error: null,
            },
          })
          .eq("id", completionModal.reportId)
          .eq("inspection_id", completionModal.inspectionId)
          .eq("rep_id", user?.id ?? "");
        if (reportUpdateError) {
          throw new Error(reportUpdateError.message || "CRM upload succeeded but report update failed.");
        }
      } else {
        const retryReportResponse = await fetch(`/api/inspections/${completionModal.inspectionId}/report`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: completionModal.title,
            linkedJobId: completionModal.linkedJobId,
            selectedPhotoIds: completionModal.selectedPhotoIds,
            fileName,
            filePath: uploadMeta.filePath,
            contentType: "application/pdf",
            sizeBytes: uploadMeta.sizeBytes,
            crmDocumentId: uploadMeta.crmDocumentId,
            crmJobId: uploadMeta.crmJobId,
            payload: {
              ...completionModal.reportPayload,
              upload_status: "uploaded",
              upload_error: null,
            },
          }),
        });
        if (!retryReportResponse.ok) {
          const retryReportPayload = (await retryReportResponse.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(retryReportPayload.error || "CRM upload succeeded but report record save failed.");
        }
      }
      setCompletionModal((previous) => ({
        ...previous,
        uploadStatus: "uploaded",
        uploadError: null,
      }));
      setMessage("PDF uploaded to CRM successfully.");
    } catch (retryError) {
      setCompletionModal((previous) => ({
        ...previous,
        uploadStatus: "failed",
        uploadError: parseError(retryError, "Retry failed."),
      }));
      setError(parseError(retryError, "Could not retry CRM PDF upload."));
    } finally {
      setSaving(false);
    }
  }

  function stepReady(stepKey: InspectionStepKey) {
    if (stepKey === "perimeter_photos") {
      return true;
    }
    if (stepKey === "collateral_damage") {
      return true;
    }
    if (stepKey === "roof_overview") {
      return true;
    }
    if (stepKey === "roof_components") {
      return true;
    }
    if (stepKey === "roof_damage") {
      return true;
    }
    if (stepKey === "interior_attic") {
      return (
        (inspectionChecklist.interiorStatus === "completed" ||
          inspectionChecklist.interiorSkipReason.trim().length > 2) &&
        (inspectionChecklist.atticStatus === "completed" ||
          inspectionChecklist.atticSkipReason.trim().length > 2)
      );
    }
    if (stepKey === "report_signature") {
      return (
        inspectionChecklist.signatureRepName.trim().length > 1 &&
        (inspectionChecklist.selectedSignatureId !== null || signatureDrawn)
      );
    }
    return true;
  }

  function goToNextInspectionStep() {
    if (!stepReady(inspectionFlowStep.key)) {
      setError(`Complete "${inspectionFlowStep.label}" before continuing.`);
      return;
    }
    if (inspectionFlowStep.key === "roof_overview" || inspectionFlowStep.key === "roof_damage") {
      if (photoRequirementWarnings.length > 0) {
        setMessage(`Warning: ${photoRequirementWarnings.join(" | ")}`);
      }
    }
    setError(null);
    setInspectionStepIndex((previous) => Math.min(previous + 1, INSPECTION_FLOW.length - 1));
  }

  function goToPreviousInspectionStep() {
    setError(null);
    setInspectionStepIndex((previous) => Math.max(previous - 1, 0));
  }

  useEffect(() => {
    currentAddressRef.current = currentAddress;
  }, [currentAddress]);

  useEffect(() => {
    void refreshSyncQueueCount();
    const detach = setupAutoSync((syncError) => {
      setSyncStatusMessage(`Auto-sync warning: ${parseError(syncError, "Unknown sync error.")}`);
      void refreshSyncQueueCount();
    });
    void flushSyncQueue().finally(() => {
      void refreshSyncQueueCount();
    });
    return detach;
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadRepSignatures();
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?redirectTo=/knocking");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadState = async () => {
      setError(null);
      await runInactivityTimeoutSweep();

      const today = getTodayLocalDate();
      const [sessionResult, statsResult] = await Promise.all([
        supabase
          .from("knock_sessions")
          .select("*")
          .eq("rep_id", user.id)
          .in("status", ["active", "paused"])
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("rep_daily_stats")
          .select("knocks,talks,inspections,contingencies")
          .eq("rep_id", user.id)
          .eq("report_date", today)
          .maybeSingle(),
      ]);

      if (!active) return;

      if (sessionResult.error) {
        setError(sessionResult.error.message);
      } else {
        const loaded = (sessionResult.data as KnockSessionRow | null) ?? null;
        setSession(loaded);
        if (loaded?.latest_address && loaded.latest_address.trim()) {
          setCurrentAddress(loaded.latest_address);
          setDoorAddress(loaded.latest_address);
        }
      }

      if (statsResult.error) {
        setError(statsResult.error.message);
      } else {
        setTodayTotals({
          knocks: toNum(statsResult.data?.knocks),
          talks: toNum(statsResult.data?.talks),
          inspections: toNum(statsResult.data?.inspections),
          contingencies: toNum(statsResult.data?.contingencies),
        });
      }
    };

    void loadState();
    return () => {
      active = false;
    };
  }, [supabase, user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadSuggestions = async () => {
      setLoadingSuggestions(true);
      setSuggestionsError(null);
      try {
        const response = await fetch("/api/territory/suggestions", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          error?: string;
          suggestions?: Array<{
            area_key?: string;
            areaKey?: string;
            center_lat?: number;
            center_lng?: number;
            centerLat?: number;
            centerLng?: number;
            zip?: string | null;
            score?: number;
            rank?: number;
            reasons?: string[];
          }>;
        };
        if (!response.ok) {
          throw new Error(payload.error || `Failed to load suggestions (${response.status}).`);
        }
        if (!active) return;
        const rows = Array.isArray(payload.suggestions) ? payload.suggestions : [];
        setSuggestions(
          rows.map((row, index) => ({
            areaKey: String(row.areaKey ?? row.area_key ?? ""),
            centerLat: Number(row.centerLat ?? row.center_lat ?? 0),
            centerLng: Number(row.centerLng ?? row.center_lng ?? 0),
            zip: row.zip ?? null,
            score: Number(row.score ?? 0),
            rank: Number(row.rank ?? index + 1),
            reasons: Array.isArray(row.reasons) ? row.reasons : [],
          })),
        );
      } catch (loadError) {
        if (!active) return;
        setSuggestions([]);
        setSuggestionsError(parseError(loadError, "Could not load area suggestions."));
      } finally {
        if (active) {
          setLoadingSuggestions(false);
        }
      }
    };

    void loadSuggestions();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const loadPotentialLeads = async () => {
      setLoadingPotentialLeads(true);
      setPotentialLeadError(null);

      const { data, error: leadsError } = await supabase
        .from("knock_potential_leads")
        .select("id,rep_id,address,address_normalized,homeowner_name,notes,latitude,longitude,created_at")
        .order("created_at", { ascending: false })
        .limit(120);

      if (!active) return;

      if (leadsError) {
        setPotentialLeads([]);
        setPotentialLeadError(leadsError.message);
      } else {
        setPotentialLeads((data ?? []) as PotentialLeadRow[]);
      }

      setLoadingPotentialLeads(false);
    };

    void loadPotentialLeads();

    return () => {
      active = false;
    };
  }, [supabase, user]);

  useEffect(() => {
    if (!session?.id) {
      setSessionEvents([]);
      setSessionEventsError(null);
      setEditingEventId(null);
      setEventEditDraft(null);
      return;
    }

    let active = true;
    const loadSessionEvents = async () => {
      setLoadingSessionEvents(true);
      setSessionEventsError(null);

      const { data, error: loadError } = await supabase
        .from("knock_events")
        .select(KNOCK_EVENT_SELECT)
        .eq("session_id", session.id)
        .order("created_at", { ascending: false })
        .limit(400);

      if (!active) return;

      if (loadError) {
        setSessionEvents([]);
        setSessionEventsError(loadError.message);
      } else {
        setSessionEvents((data ?? []) as SessionKnockEventRow[]);
      }

      setLoadingSessionEvents(false);
    };

    void loadSessionEvents();

    return () => {
      active = false;
    };
  }, [session?.id, supabase]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      setSessionSeconds(
        getSessionElapsedSeconds({
          startedAt: String(session.started_at),
          pausedAt:
            typeof session.paused_at === "string" && session.paused_at.length > 0
              ? session.paused_at
              : null,
          totalPausedSeconds: toNum(session.total_paused_seconds),
        }),
      );
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [session]);

  useEffect(() => {
    if (!session || session.status !== "active") {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("Location tracking is not supported in this browser.");
      return;
    }

    let cancelled = false;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (cancelled) return;

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCurrentLat(lat);
        setCurrentLng(lng);
        setLocationError(null);

        let resolvedAddress: string | null = null;
        try {
          resolvedAddress = await reverseGeocode(lat, lng, geocodeApiKey);
        } catch {
          resolvedAddress = null;
        }

        if (resolvedAddress) {
          setCurrentAddress(resolvedAddress);
          if (!addressTouchedRef.current || !doorAddress.trim()) {
            setDoorAddress(resolvedAddress);
          }
        }

        const heartbeatAddress = resolvedAddress ?? currentAddressRef.current ?? "";
        await Promise.all([
          supabase
            .from("knock_sessions")
            .update({
              latest_latitude: lat,
              latest_longitude: lng,
              latest_address: heartbeatAddress || null,
              last_heartbeat_at: new Date().toISOString(),
            })
            .eq("id", session.id),
          supabase.from("knock_location_points").insert({
            session_id: session.id,
            rep_id: session.rep_id,
            latitude: lat,
            longitude: lng,
            address: heartbeatAddress || null,
            accuracy_meters: Number(position.coords.accuracy ?? 0),
            recorded_at: new Date().toISOString(),
          }),
        ]);
      },
      () => {
        if (!cancelled) {
          setLocationError("Allow location access to run knocking sessions.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );

    watchIdRef.current = watchId;
    return () => {
      cancelled = true;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [doorAddress, geocodeApiKey, session, supabase]);

  function canEditEventRow(event: SessionKnockEventRow) {
    return canEditSessionEvents && !eventIsCrmLocked(event);
  }

  function beginEditingEvent(event: SessionKnockEventRow) {
    if (!canEditEventRow(event)) {
      return;
    }
    setEditingEventId(event.id);
    setEventEditDraft(makeEditDraft(event));
    setSessionEventsError(null);
    setMessage("");
    setError(null);
  }

  function cancelEditingEvent() {
    setEditingEventId(null);
    setEventEditDraft(null);
  }

  async function saveEventEdits(event: SessionKnockEventRow) {
    if (!session || !eventEditDraft) return;
    if (!canEditEventRow(event)) {
      setSessionEventsError("This knock can no longer be edited.");
      return;
    }

    setSaving(true);
    setSessionEventsError(null);
    setMessage("");
    setError(null);

    try {
      const updatePayload = {
        outcome: event.action === "knock" ? eventEditDraft.outcome : null,
        address: eventEditDraft.address.trim() || null,
        homeowner_name: eventEditDraft.homeownerName.trim() || null,
        homeowner_phone: eventEditDraft.homeownerPhone.trim() || null,
        homeowner_email: eventEditDraft.homeownerEmail.trim() || null,
      };

      const { data, error: updateError } = await supabase
        .from("knock_events")
        .update(updatePayload)
        .eq("id", event.id)
        .eq("session_id", session.id)
        .select(KNOCK_EVENT_SELECT)
        .single();

      if (updateError || !data) {
        throw new Error(updateError?.message || "Failed to update this knock.");
      }

      const updated = data as SessionKnockEventRow;
      setSessionEvents((previous) =>
        previous.map((row) => (row.id === updated.id ? updated : row)),
      );
      setEditingEventId(null);
      setEventEditDraft(null);
      setMessage("Knock updated for this session.");
    } catch (updateError) {
      setSessionEventsError(parseError(updateError, "Failed to update this knock."));
    } finally {
      setSaving(false);
    }
  }

  async function addPotentialLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const address = potentialLeadDraft.address.trim();
    if (!address) {
      setPotentialLeadError("Address is required.");
      return;
    }

    setSavingPotentialLead(true);
    setPotentialLeadError(null);
    setPotentialLeadMessage("");

    try {
      let coordinates: { lat: number; lng: number } | null = null;
      try {
        coordinates = await geocodeAddressInput(address, geocodeApiKey);
      } catch {
        coordinates = null;
      }

      const payload = {
        rep_id: user.id,
        address,
        address_normalized: normalizeAddress(address),
        homeowner_name: potentialLeadDraft.homeownerName.trim() || null,
        notes: potentialLeadDraft.notes.trim() || null,
        latitude: coordinates?.lat ?? null,
        longitude: coordinates?.lng ?? null,
      };

      const { data, error: upsertError } = await supabase
        .from("knock_potential_leads")
        .upsert(payload, { onConflict: "rep_id,address_normalized" })
        .select("id,rep_id,address,address_normalized,homeowner_name,notes,latitude,longitude,created_at")
        .single();

      if (upsertError || !data) {
        throw new Error(upsertError?.message || "Could not save potential lead.");
      }

      const saved = data as PotentialLeadRow;
      setPotentialLeads((previous) => [saved, ...previous.filter((row) => row.id !== saved.id)]);
      setPotentialLeadDraft(DEFAULT_POTENTIAL_LEAD_DRAFT);
      setPotentialLeadMessage("Potential lead saved. It will show on Doors Map.");
    } catch (saveError) {
      if (likelyNetworkError(saveError) || (typeof navigator !== "undefined" && !navigator.onLine)) {
        try {
          await queueOperation("knock_potential_leads", {
            rep_id: user.id,
            address,
            address_normalized: normalizeAddress(address),
            homeowner_name: potentialLeadDraft.homeownerName.trim() || null,
            notes: potentialLeadDraft.notes.trim() || null,
          });
          setPotentialLeadDraft(DEFAULT_POTENTIAL_LEAD_DRAFT);
          setPotentialLeadMessage("No service. Lead queued for auto-sync.");
          setPotentialLeadError(null);
        } catch (queueError) {
          setPotentialLeadError(parseError(queueError, "Could not queue potential lead."));
        }
      } else {
        setPotentialLeadError(parseError(saveError, "Could not save potential lead."));
      }
    } finally {
      setSavingPotentialLead(false);
    }
  }

  async function fillAddressFromLocation() {
    if (!navigator.geolocation) {
      setLocationError("Location tracking is not supported on this browser.");
      return;
    }

    setLocating(true);
    setLocationError(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setCurrentLat(lat);
      setCurrentLng(lng);

      const resolvedAddress = await reverseGeocode(lat, lng, geocodeApiKey);
      const nextAddress = resolvedAddress ?? doorAddress;
      if (nextAddress) {
        setCurrentAddress(nextAddress);
        setDoorAddress(nextAddress);
        addressTouchedRef.current = false;
      }
    } catch {
      setLocationError("Could not read your location right now.");
    } finally {
      setLocating(false);
    }
  }

  async function applyNightlyDelta(delta: NightlyDelta) {
    if (!user) return;
    const today = getTodayLocalDate();
    const { data: existing, error: readError } = await supabase
      .from("rep_daily_stats")
      .select("knocks,talks,inspections,contingencies")
      .eq("rep_id", user.id)
      .eq("report_date", today)
      .maybeSingle();

    if (readError) {
      throw new Error(readError.message);
    }

    const nextPayload = {
      rep_id: user.id,
      report_date: today,
      knocks: toNum(existing?.knocks) + delta.knocks,
      talks: toNum(existing?.talks) + delta.talks,
      inspections: toNum(existing?.inspections) + delta.inspections,
      contingencies: toNum(existing?.contingencies) + delta.contingencies,
    };

    const { error: writeError } = await supabase.from("rep_daily_stats").upsert(nextPayload, {
      onConflict: "rep_id,report_date",
    });

    if (writeError) {
      throw new Error(writeError.message);
    }

    setTodayTotals({
      knocks: nextPayload.knocks,
      talks: nextPayload.talks,
      inspections: nextPayload.inspections,
      contingencies: nextPayload.contingencies,
    });
  }

  async function startSession() {
    if (!user) return;
    setSaving(true);
    setMessage("");
    setError(null);

    try {
      await runInactivityTimeoutSweep();
      const nowIso = new Date().toISOString();
      const payload = {
        rep_id: user.id,
        rep_name: fullName ?? user.email ?? "Rep",
        status: "active",
        started_at: nowIso,
        paused_at: null,
        ended_at: null,
        total_paused_seconds: 0,
        latest_latitude: currentLat,
        latest_longitude: currentLng,
        latest_address: doorAddress || currentAddress || null,
        last_heartbeat_at: nowIso,
        knocks: 0,
        talks: 0,
        inspections: 0,
        contingencies: 0,
      };

      const { data, error: insertError } = await supabase
        .from("knock_sessions")
        .insert(payload)
        .select("*")
        .single();

      if (insertError || !data) {
        throw new Error(insertError?.message || "Failed to start session.");
      }

      setSession(data as KnockSessionRow);
      setSessionEvents([]);
      setSessionEventsError(null);
      setEditingEventId(null);
      setEventEditDraft(null);
      setStep("door");
      setMessage("Knocking session started.");
    } catch (e) {
      if (likelyNetworkError(e) || (typeof navigator !== "undefined" && !navigator.onLine)) {
        try {
          const nowIso = new Date().toISOString();
          await queueOperation("knock_sessions", {
            rep_id: user.id,
            rep_name: fullName ?? user.email ?? "Rep",
            status: "active",
            started_at: nowIso,
            latest_latitude: currentLat,
            latest_longitude: currentLng,
            latest_address: doorAddress || currentAddress || null,
          });
          setError(null);
          setMessage("No service. Session start queued for auto-sync.");
        } catch (queueError) {
          setError(parseError(queueError, "Failed to queue session start."));
        }
      } else {
        setError(parseError(e, "Failed to start knocking session."));
      }
    } finally {
      setSaving(false);
    }
  }

  async function pauseSession() {
    if (!session) return;
    setSaving(true);
    setError(null);

    try {
      const nowIso = new Date().toISOString();
      const { data, error: updateError } = await supabase
        .from("knock_sessions")
        .update({ status: "paused", paused_at: nowIso })
        .eq("id", session.id)
        .select("*")
        .single();

      if (updateError || !data) {
        throw new Error(updateError?.message || "Failed to pause session.");
      }

      setSession(data as KnockSessionRow);
      setMessage("Session paused.");
    } catch (e) {
      if (likelyNetworkError(e) || (typeof navigator !== "undefined" && !navigator.onLine)) {
        try {
          await queueOperation(
            "knock_sessions",
            { id: session.id, status: "paused", paused_at: new Date().toISOString() },
            "update",
            session.id,
          );
          setSession((previous) =>
            previous ? { ...previous, status: "paused", paused_at: new Date().toISOString() } : previous,
          );
          setError(null);
          setMessage("No service. Pause queued for auto-sync.");
        } catch (queueError) {
          setError(parseError(queueError, "Failed to queue pause."));
        }
      } else {
        setError(parseError(e, "Failed to pause session."));
      }
    } finally {
      setSaving(false);
    }
  }

  async function resumeSession() {
    if (!session) return;
    setSaving(true);
    setError(null);

    try {
      const now = Date.now();
      const pausedAtMs = session.paused_at ? new Date(String(session.paused_at)).getTime() : now;
      const pausedSeconds = Math.max(0, Math.floor((now - pausedAtMs) / 1000));

      const { data, error: updateError } = await supabase
        .from("knock_sessions")
        .update({
          status: "active",
          paused_at: null,
          total_paused_seconds: toNum(session.total_paused_seconds) + pausedSeconds,
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .select("*")
        .single();

      if (updateError || !data) {
        throw new Error(updateError?.message || "Failed to resume session.");
      }

      setSession(data as KnockSessionRow);
      setMessage("Session resumed.");
    } catch (e) {
      if (likelyNetworkError(e) || (typeof navigator !== "undefined" && !navigator.onLine)) {
        try {
          await queueOperation(
            "knock_sessions",
            {
              id: session.id,
              status: "active",
              paused_at: null,
              total_paused_seconds: toNum(session.total_paused_seconds),
            },
            "update",
            session.id,
          );
          setSession((previous) => (previous ? { ...previous, status: "active", paused_at: null } : previous));
          setError(null);
          setMessage("No service. Resume queued for auto-sync.");
        } catch (queueError) {
          setError(parseError(queueError, "Failed to queue resume."));
        }
      } else {
        setError(parseError(e, "Failed to resume session."));
      }
    } finally {
      setSaving(false);
    }
  }

  async function endSession() {
    if (!session) return;
    setSaving(true);
    setError(null);

    try {
      const endedAt = new Date().toISOString();
      const elapsed = getSessionElapsedSeconds({
        startedAt: session.started_at,
        pausedAt: session.paused_at ? String(session.paused_at) : null,
        totalPausedSeconds: toNum(session.total_paused_seconds),
      });

      const { error: updateError } = await supabase
        .from("knock_sessions")
        .update({ status: "ended", ended_at: endedAt, session_seconds: elapsed })
        .eq("id", session.id);

      if (updateError) throw new Error(updateError.message);

      setSession(null);
      setSessionEvents([]);
      setSessionEventsError(null);
      setEditingEventId(null);
      setEventEditDraft(null);
      setStep("door");
      setSessionSeconds(0);
      setMessage("Session ended.");
    } catch (e) {
      if (likelyNetworkError(e) || (typeof navigator !== "undefined" && !navigator.onLine)) {
        try {
          await queueOperation(
            "knock_sessions",
            { id: session.id, status: "ended", ended_at: new Date().toISOString() },
            "update",
            session.id,
          );
          setSession(null);
          setSessionEvents([]);
          setSessionEventsError(null);
          setEditingEventId(null);
          setEventEditDraft(null);
          setStep("door");
          setSessionSeconds(0);
          setError(null);
          setMessage("No service. End-session queued for auto-sync.");
        } catch (queueError) {
          setError(parseError(queueError, "Failed to queue end session."));
        }
      } else {
        setError(parseError(e, "Failed to end session."));
      }
    } finally {
      setSaving(false);
    }
  }

  function resetAfterEvent(eventAddress: string) {
    setHomeownerIntake({ ...DEFAULT_INTAKE, address: eventAddress || "" });
    setInspectionChecklist(makeDefaultChecklist());
    setInspectionPhotos([]);
    setInspectionStepIndex(0);
    setReportSectionSelection(DEFAULT_REPORT_SECTION_SELECTION);
    setReportPhotoSelection({});
    setCollateralPhotoDraft({
      file: null,
      damageCause: "none",
      slopeTag: "",
      componentTag: "",
      customTag: "",
      note: "",
    });
    setRoofDamagePhotoDraft({
      file: null,
      damageCause: "none",
      slopeTag: "",
      componentTag: "",
      customTag: "",
      note: "",
    });
    clearDrawnSignature();
    setFollowUpAt("");
    setStep("door");
    setEventAction("knock");
    setEventOutcome("no_answer");
  }

  async function logEvent(params: {
    action: KnockAction;
    outcome?: KnockOutcome | null;
    homeownerRequired?: boolean;
    contingentOverride?: boolean;
    skipGuidedInspection?: boolean;
  }) {
    if (!session || !user || !accessToken) return;
    if (session.status !== "active") {
      setError("Session must be active to log events.");
      return;
    }

    if (params.homeownerRequired && !homeownerIntake.homeownerName.trim()) {
      setError("Homeowner name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage("");

    const postSaveWarnings: string[] = [];
    const isInspectionEvent = params.action === "knock" && params.outcome === "inspection";
    let completionModalState: InspectionCompletionModalState | null = null;

    try {
      const eventAddress = homeownerIntake.address.trim() || doorAddress.trim() || currentAddress;
      const isInspection = params.action === "knock" && params.outcome === "inspection";
      const isSoftSet = params.action === "knock" && params.outcome === "soft_set";
      const isDoNotKnock = params.action === "knock" && params.outcome === "do_not_knock";
      const isContingent = isInspection
        ? params.contingentOverride ?? inspectionChecklist.contingent
        : false;
      const inspectionSnapshot = isInspection ? { ...inspectionChecklist, contingent: isContingent } : null;
      const delta = getEventDelta({
        action: params.action,
        outcome: params.action === "knock" ? params.outcome ?? "no_answer" : null,
        contingent: isContingent,
      });

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueOperation("knock_events", {
          session_id: session.id,
          rep_id: user.id,
          action: params.action,
          outcome: params.action === "knock" ? params.outcome ?? null : null,
          address: eventAddress || null,
          latitude: currentLat,
          longitude: currentLng,
          knocks_delta: delta.knocks,
          talks_delta: delta.talks,
          inspections_delta: delta.inspections,
          contingencies_delta: delta.contingencies,
          homeowner_name: homeownerIntake.homeownerName.trim() || null,
          homeowner_phone: homeownerIntake.phone.trim() || null,
          homeowner_email: homeownerIntake.email.trim() || null,
          metadata: isInspection
            ? params.skipGuidedInspection
              ? {
                  guided_inspection_skipped: true,
                  queued_offline: true,
                }
              : {
                  checklist: inspectionSnapshot,
                  photos: inspectionPhotos.map((photo) => ({
                    file_name: photo.file.name,
                    capture_section: photo.captureSection,
                    damage_cause: photo.damageCause,
                    slope_tag: photo.slopeTag || null,
                    component_tag: photo.componentTag,
                    custom_tag: photo.customTag || null,
                    note: photo.note,
                  })),
                  queued_offline: true,
                }
            : { queued_offline: true },
        });

        if (isDoNotKnock && eventAddress.trim().length > 0) {
          await queueOperation("knock_potential_leads", {
            rep_id: user.id,
            address: eventAddress,
            address_normalized: normalizeAddress(eventAddress),
            homeowner_name: homeownerIntake.homeownerName.trim() || null,
            homeowner_phone: homeownerIntake.phone.trim() || null,
            homeowner_email: homeownerIntake.email.trim() || null,
            lead_status: "do_not_knock",
            notes: "Marked as Do Not Knock from knock outcome.",
            latitude: currentLat,
            longitude: currentLng,
          });
        }

        const optimisticId = `offline-${crypto.randomUUID()}`;
        const optimisticEvent: SessionKnockEventRow = {
          id: optimisticId,
          session_id: session.id,
          rep_id: user.id,
          action: params.action,
          outcome: params.action === "knock" ? params.outcome ?? null : null,
          address: eventAddress || null,
          homeowner_name: homeownerIntake.homeownerName.trim() || null,
          homeowner_phone: homeownerIntake.phone.trim() || null,
          homeowner_email: homeownerIntake.email.trim() || null,
          created_at: new Date().toISOString(),
          is_locked: false,
          knocks_delta: delta.knocks,
          talks_delta: delta.talks,
          inspections_delta: delta.inspections,
          contingencies_delta: delta.contingencies,
        };

        setSessionEvents((previous) => [optimisticEvent, ...previous]);
        setSession((previous) =>
          previous
            ? {
                ...previous,
                latest_address: eventAddress || null,
                latest_latitude: currentLat,
                latest_longitude: currentLng,
                last_heartbeat_at: new Date().toISOString(),
                knocks: toNum(previous.knocks) + delta.knocks,
                talks: toNum(previous.talks) + delta.talks,
                inspections: toNum(previous.inspections) + delta.inspections,
                contingencies: toNum(previous.contingencies) + delta.contingencies,
              }
            : previous,
        );

        if (includeInNightlyNumbers) {
          setTodayTotals((previous) => mergeNightlyDelta(previous, delta));
        }

        resetAfterEvent(eventAddress);
        setMessage("No service. Event queued for auto-sync.");
        return;
      }

      const shouldMoveToContingency = isInspection && isContingent;
      const stageTarget: KnockStageTarget | null = shouldMoveToContingency
        ? "contingency"
        : isSoftSet
          ? "inspection_scheduled"
          : isInspection
            ? "lead"
            : null;

      let linkedJobId: string | null = null;
      let linkedTaskId: string | null = null;
      let inspectionRecordId: string | null = null;
      let inspectionReportId: string | null = null;
      let signatureRecordId: string | null = inspectionChecklist.selectedSignatureId;

      if (isSoftSet || isInspection) {
        const jobResult = await crmApi.createJob(
          {
            homeownerName: homeownerIntake.homeownerName.trim(),
            phone: homeownerIntake.phone.trim(),
            email: homeownerIntake.email.trim(),
            address: eventAddress,
          },
          accessToken,
        );

        if (!jobResult.jobId) {
          throw new Error(jobResult.error || "CRM did not return a job id.");
        }
        linkedJobId = jobResult.jobId;
      }

      if (linkedJobId && stageTarget) {
        try {
          if (!knockStageIdsRef.current) {
            knockStageIdsRef.current = await loadKnockStageIds(supabase);
          }
          const stageId = knockStageIdsRef.current[stageTarget] ?? null;
          if (typeof stageId === "number" && Number.isFinite(stageId)) {
            await crmApi.updateJobStage(linkedJobId, stageId, accessToken);
          } else {
            postSaveWarnings.push(
              `Job stage update skipped (${stageTarget}): stage id could not be resolved from pipeline_stages.`,
            );
          }
        } catch (stageError) {
          postSaveWarnings.push(
            `Job stage update failed (${stageTarget}): ${parseError(
              stageError,
              "Unknown stage update error.",
            )}`,
          );
        }
      }

      if (isSoftSet && linkedJobId) {
        const followUpIso = toIsoFromLocalInput(followUpAt);
        if (!followUpIso) {
          throw new Error("Soft Set requires a follow-up date/time.");
        }

        const taskResult = await crmApi.createTask(
          {
            jobId: linkedJobId,
            title: `Soft Set Follow-up: ${homeownerIntake.homeownerName.trim()}`,
            description: "Auto-created from field knocking session.",
            kind: "appointment",
            scheduledFor: followUpIso,
            dueAt: followUpIso,
            appointmentAddress: eventAddress,
          },
          accessToken,
        );

        linkedTaskId = typeof taskResult.taskId === "string" ? taskResult.taskId : null;
      }

      if (isInspection && linkedJobId && !params.skipGuidedInspection) {
        try {
          let freshlySavedSignature: RepSignatureRow | null = null;
          if (!signatureRecordId && signatureDrawn) {
            freshlySavedSignature = await persistDrawnSignature("Inspection Signature");
            signatureRecordId = freshlySavedSignature?.id ?? null;
          }
          const selectedSignature =
            repSignatures.find((signature) => signature.id === signatureRecordId) ?? freshlySavedSignature ?? null;

          const inspectionResponse = await fetch("/api/inspections", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: session.id,
              linkedJobId,
              status: "completed",
              currentStep: inspectionFlowStep.key,
              homeownerName: homeownerIntake.homeownerName.trim(),
              homeownerPhone: homeownerIntake.phone.trim() || null,
              homeownerEmail: homeownerIntake.email.trim() || null,
              homeownerAddress: eventAddress || null,
              signatureRepName:
                inspectionChecklist.signatureRepName.trim() || fullName || user.email || "Rep",
              signatureSignedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              componentPresence: inspectionChecklist.componentPresence,
              perimeterFindings: {
                perimeterPhotoCount: photoCountsBySection.perimeter_photos,
                collateralDamagePhotoCount: photoCountsBySection.collateral_damage,
              },
              metadata: {
                guidedFlowVersion: "v3",
                shingleLengthInches: inspectionChecklist.shingleLengthInches || null,
                shingleWidthInches: inspectionChecklist.shingleWidthInches || null,
                dripEdgePresent: inspectionChecklist.dripEdgePresent,
                estimatedRoofAgeYears,
                layerCount,
                layerPhotoId,
                contingent: isContingent,
                notes: inspectionChecklist.notes,
                interiorStatus: inspectionChecklist.interiorStatus,
                interiorSkipReason: inspectionChecklist.interiorSkipReason,
                atticStatus: inspectionChecklist.atticStatus,
                atticSkipReason: inspectionChecklist.atticSkipReason,
                signatureId: signatureRecordId,
                signaturePath: selectedSignature?.file_path ?? null,
                requiredPhotoCounts: REQUIRED_PHOTO_COUNTS,
                roofDamage: roofDamageHub,
                sectionStates: hubSectionStates,
                detachedBuildings,
                testSquares: roofDamageHub.testSquares,
                reportBuilder: reportBuilderPayload.sections.length > 0 ? reportBuilderPayload : null,
              },
            }),
          });
          const inspectionPayload = (await inspectionResponse.json()) as {
            error?: string;
            inspection?: { id: string };
          };
          if (!inspectionResponse.ok || !inspectionPayload.inspection?.id) {
            throw new Error(
              inspectionPayload.error || `Could not create inspection (${inspectionResponse.status}).`,
            );
          }
          inspectionRecordId = inspectionPayload.inspection.id;

          const selectedPhotoIds: string[] = [];
          const selectedDraftPhotoIds = new Set(
            inspectionPhotos
              .filter((photo) => reportPhotoSelection[photo.id] !== false)
              .map((photo) => photo.id),
          );

          for (const photo of inspectionPhotos) {
            const mediaPath = `${user.id}/${inspectionRecordId}/${Date.now()}-${sanitizeFileName(photo.file.name)}`;
            const photoNotes = [
              photo.note.trim() || null,
              photo.slopeTag ? `slope:${photo.slopeTag}` : null,
              photo.componentTag.trim() ? `component:${photo.componentTag.trim()}` : null,
              photo.customTag.trim() ? `tag:${photo.customTag.trim()}` : null,
            ]
              .filter(Boolean)
              .join(" | ");
            const mediaUpload = await supabase.storage
              .from("inspection-media")
              .upload(mediaPath, photo.file, {
                contentType: photo.file.type || "application/octet-stream",
                upsert: false,
              });
            if (mediaUpload.error) {
              throw new Error(mediaUpload.error.message);
            }

            const { data: insertedPhoto, error: insertedPhotoError } = await supabase
              .from("inspection_photos")
              .insert({
                inspection_id: inspectionRecordId,
                rep_id: user.id,
                file_name: photo.file.name,
                file_path: mediaPath,
                content_type: photo.file.type || "application/octet-stream",
                size_bytes: photo.file.size,
                capture_section: photo.captureSection,
                damage_cause: photo.damageCause,
                auto_tag_source: photo.autoTagged ? "section_auto_tag" : null,
                notes: photoNotes || null,
              })
              .select("id")
              .single();

            if (insertedPhotoError || !insertedPhoto) {
              throw new Error(insertedPhotoError?.message || "Failed to save inspection photo.");
            }

            const photoId = String((insertedPhoto as { id: string }).id);
            if (selectedDraftPhotoIds.has(photo.id)) {
              selectedPhotoIds.push(photoId);
            }

            if (photo.damageCause !== "none") {
              const { error: tagError } = await supabase.from("inspection_damage_tags").insert({
                inspection_id: inspectionRecordId,
                photo_id: photoId,
                rep_id: user.id,
                damage_cause: photo.damageCause,
                slope_tag: photo.slopeTag || null,
                custom_tag: photo.customTag || null,
                component_tag: photo.componentTag || photo.customTag || photo.damageCause,
                severity: "moderate",
                note: photo.note || null,
              });
              if (tagError) {
                throw new Error(tagError.message);
              }
            }

            const init = await crmApi.initJobUpload(linkedJobId, accessToken, {
              fileName: photo.file.name,
              contentType: photo.file.type || "application/octet-stream",
              size: photo.file.size,
            });
            const upload = init.upload;
            if (upload?.filePath && upload.token) {
              const uploadRes = await supabase.storage
                .from("job-files")
                .uploadToSignedUrl(upload.filePath, upload.token, photo.file, {
                  contentType: photo.file.type || "application/octet-stream",
                  upsert: false,
                });
              if (uploadRes.error) {
                throw new Error(uploadRes.error.message);
              }
              await crmApi.finalizeJobUpload(linkedJobId, accessToken, {
                fileName: photo.file.name,
                filePath: upload.filePath,
                contentType: photo.file.type || "application/octet-stream",
              });
            }
          }

          const reportPayloadData = {
            logo: "/4ELogo.png",
            // v3 ordered sections if builder was used; v2 toggles for backward compat
            builderSections: reportBuilderPayload.sections.length > 0 ? reportBuilderPayload.sections : null,
            builderCover: reportBuilderPayload.sections.length > 0 ? reportBuilderPayload.cover : null,
            builderClosing: reportBuilderPayload.sections.length > 0 ? reportBuilderPayload.closing : null,
            sections: reportSectionSelection,
            homeowner: reportSectionSelection.homeowner ? homeownerIntake : null,
            perimeterPhotos: reportSectionSelection.perimeterPhotos
              ? inspectionPhotos
                  .filter((photo) => photo.captureSection === "perimeter_photos")
                  .map((photo) => photo.file.name)
              : null,
            collateralDamage: reportSectionSelection.collateralDamage
              ? inspectionPhotos
                  .filter((photo) => photo.captureSection === "collateral_damage")
                  .map((photo) => ({
                    fileName: photo.file.name,
                    damageCause: photo.damageCause,
                    slopeTag: photo.slopeTag || null,
                    componentTag: photo.componentTag || null,
                    customTag: photo.customTag || null,
                  }))
              : null,
            roofOverview: reportSectionSelection.roofOverview
              ? {
                  shingleLengthInches: inspectionChecklist.shingleLengthInches || null,
                  shingleWidthInches: inspectionChecklist.shingleWidthInches || null,
                  dripEdgePresent: inspectionChecklist.dripEdgePresent,
                }
              : null,
            roofComponents: reportSectionSelection.roofComponents ? inspectionChecklist.componentPresence : null,
            roofDamage: reportSectionSelection.roofDamage
              ? inspectionPhotos
                  .filter((photo) => photo.captureSection === "roof_damage")
                  .map((photo) => ({
                    fileName: photo.file.name,
                    damageCause: photo.damageCause,
                    slopeTag: photo.slopeTag || null,
                    componentTag: photo.componentTag || null,
                    customTag: photo.customTag || null,
                  }))
              : null,
            interiorAttic: reportSectionSelection.interiorAttic
              ? {
                  interiorStatus: inspectionChecklist.interiorStatus,
                  interiorSkipReason: inspectionChecklist.interiorSkipReason,
                  atticStatus: inspectionChecklist.atticStatus,
                  atticSkipReason: inspectionChecklist.atticSkipReason,
                }
              : null,
            signature: reportSectionSelection.signature
              ? {
                  signatureRepName: inspectionChecklist.signatureRepName,
                  signatureId: signatureRecordId,
                  signaturePath: selectedSignature?.file_path ?? null,
                }
              : null,
            notes: reportSectionSelection.summaryNotes ? inspectionChecklist.notes : null,
            selectedDraftPhotoIds: Array.from(selectedDraftPhotoIds),
            // v3 extras always included so the PDF route can use them regardless of v2/v3 mode
            testSquares: roofDamageHub.testSquares,
            sectionConditions: Object.fromEntries(
              Object.entries(hubSectionStates)
                .filter(([, v]) => v?.condition)
                .map(([k, v]) => [k, v!.condition!]),
            ),
          } as Record<string, unknown>;

          let reportBytes: ArrayBuffer | null = null;
          let reportFileName = `inspection-report-${inspectionRecordId}.pdf`;
          let reportUploadStatus: "uploaded" | "failed" = "uploaded";
          let reportUploadError: string | null = null;
          let crmDocumentId: string | null = null;
          let crmJobId: string | null = linkedJobId;
          let reportFilePath = `${user.id}/reports/${inspectionRecordId}/${Date.now()}-${reportFileName}`;
          let reportSizeBytes: number | null = null;

          try {
            const generatedPdf = await generateInspectionPdf({
              inspectionId: inspectionRecordId,
              title: "Inspection Report",
              selectedPhotoIds,
              payload: reportPayloadData,
              accessTokenValue: accessToken,
            });
            reportFileName = generatedPdf.fileName;
            reportBytes = generatedPdf.bytes;
            reportSizeBytes = reportBytes.byteLength;
          } catch (reportGenerationErrorValue) {
            reportUploadStatus = "failed";
            reportUploadError = parseError(
              reportGenerationErrorValue,
              "Could not generate inspection PDF.",
            );
            postSaveWarnings.push(`Inspection PDF generation failed: ${reportUploadError}`);
          }

          if (reportBytes) {
            try {
              const uploadMeta = await uploadReportPdfToCrm(linkedJobId, reportFileName, reportBytes, accessToken);
              reportFilePath = uploadMeta.filePath;
              reportSizeBytes = uploadMeta.sizeBytes;
              crmDocumentId = uploadMeta.crmDocumentId;
              crmJobId = uploadMeta.crmJobId;
            } catch (reportUploadErrorValue) {
              reportUploadStatus = "failed";
              reportUploadError = parseError(reportUploadErrorValue, "Could not upload PDF to CRM job files.");
              postSaveWarnings.push(`Inspection PDF upload pending retry: ${reportUploadError}`);
            }
          }

          const reportRecordResponse = await fetch(`/api/inspections/${inspectionRecordId}/report`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              title: "Inspection Report",
              linkedJobId,
              selectedPhotoIds,
              fileName: reportFileName,
              filePath: reportFilePath,
              contentType: "application/pdf",
              sizeBytes: reportSizeBytes ?? undefined,
              crmDocumentId,
              crmJobId,
              payload: {
                ...reportPayloadData,
                upload_status: reportUploadStatus,
                upload_error: reportUploadError,
              },
            }),
          });
          const reportRecordPayload = (await reportRecordResponse.json().catch(() => ({}))) as {
            error?: string;
            report?: { id: string };
          };
          if (!reportRecordResponse.ok || !reportRecordPayload.report?.id) {
            postSaveWarnings.push(
              `Inspection report metadata save failed: ${
                reportRecordPayload.error || "Could not create inspection report record."
              }`,
            );
          } else {
            inspectionReportId = reportRecordPayload.report.id;
          }
          const reportUrl = reportBytes
            ? URL.createObjectURL(new Blob([reportBytes], { type: "application/pdf" }))
            : null;
          completionModalState = {
            open: true,
            eventAddress,
            title: "Inspection Report",
            reportId: inspectionReportId ?? null,
            fileName: reportFileName,
            pdfUrl: reportUrl,
            pdfBytes: reportBytes,
            uploadStatus: reportUploadStatus,
            uploadError: reportUploadError,
            linkedJobId,
            inspectionId: inspectionRecordId,
            selectedPhotoIds,
            reportPayload: reportPayloadData,
          };

          const summary =
            `Inspection Intake\n` +
            `Homeowner: ${homeownerIntake.homeownerName}\n` +
            `Phone: ${homeownerIntake.phone || "-"}\n` +
            `Email: ${homeownerIntake.email || "-"}\n` +
            `Address: ${eventAddress || "-"}\n` +
            `Shingle Length (in): ${inspectionChecklist.shingleLengthInches || "-"}\n` +
            `Shingle Width (in): ${inspectionChecklist.shingleWidthInches || "-"}\n` +
            `Drip Edge Present: ${
              inspectionChecklist.dripEdgePresent === null
                ? "-"
                : inspectionChecklist.dripEdgePresent
                  ? "Yes"
                  : "No"
            }\n` +
            `Contingent: ${isContingent ? "Yes" : "No"}\n` +
            `Inspection Report ID: ${inspectionReportId || "-"}\n` +
            `Signature ID: ${signatureRecordId || "-"}\n` +
            `Notes: ${inspectionSnapshot?.notes || "-"}`;

          await crmApi.createJobNote(linkedJobId, accessToken, summary);
        } catch (inspectionError) {
          postSaveWarnings.push(
            `Inspection workflow assets warning: ${parseError(
              inspectionError,
              "Inspection workflow assets failed.",
            )}`,
          );
        }
      }

      const eventPayload: JsonRecord = {
        session_id: session.id,
        rep_id: user.id,
        action: params.action,
        outcome: params.action === "knock" ? params.outcome ?? null : null,
        address: eventAddress || null,
        latitude: currentLat,
        longitude: currentLng,
        knocks_delta: delta.knocks,
        talks_delta: delta.talks,
        inspections_delta: delta.inspections,
        contingencies_delta: delta.contingencies,
        homeowner_name: homeownerIntake.homeownerName.trim() || null,
        homeowner_phone: homeownerIntake.phone.trim() || null,
        homeowner_email: homeownerIntake.email.trim() || null,
        linked_job_id: linkedJobId,
        linked_task_id: linkedTaskId,
        is_locked: Boolean(linkedJobId || linkedTaskId),
        metadata: isInspection
          ? params.skipGuidedInspection
            ? {
                guided_inspection_skipped: true,
              }
            : {
                checklist: inspectionSnapshot,
                photo_count: inspectionPhotos.length,
                inspection_id: inspectionRecordId,
                inspection_report_id: inspectionReportId,
                signature_id: signatureRecordId,
              }
          : {},
      };

      const [{ data: insertedEvent, error: insertError }, { data: updatedSession, error: sessionError }] =
        await Promise.all([
        supabase.from("knock_events").insert(eventPayload).select(KNOCK_EVENT_SELECT).single(),
        supabase
          .from("knock_sessions")
          .update({
            latest_address: eventAddress || null,
            latest_latitude: currentLat,
            latest_longitude: currentLng,
            last_heartbeat_at: new Date().toISOString(),
            knocks: toNum(session.knocks) + delta.knocks,
            talks: toNum(session.talks) + delta.talks,
            inspections: toNum(session.inspections) + delta.inspections,
            contingencies: toNum(session.contingencies) + delta.contingencies,
          })
          .eq("id", session.id)
          .select("*")
          .single(),
        ]);

      if (insertError) throw new Error(insertError.message);
      if (sessionError) throw new Error(sessionError.message);
      if (updatedSession) {
        setSession(updatedSession as KnockSessionRow);
      }
      if (insertedEvent) {
        const inserted = insertedEvent as SessionKnockEventRow;
        setSessionEvents((previous) => [inserted, ...previous.filter((row) => row.id !== inserted.id)]);
      }

      if (isDoNotKnock && eventAddress.trim().length > 0) {
        const doNotKnockLeadPayload = {
          rep_id: user.id,
          address: eventAddress,
          address_normalized: normalizeAddress(eventAddress),
          homeowner_name: homeownerIntake.homeownerName.trim() || null,
          homeowner_phone: homeownerIntake.phone.trim() || null,
          homeowner_email: homeownerIntake.email.trim() || null,
          lead_status: "do_not_knock",
          notes: "Marked as Do Not Knock from knock outcome.",
          latitude: currentLat,
          longitude: currentLng,
        };
        const { error: doNotKnockLeadError } = await supabase
          .from("knock_potential_leads")
          .upsert(doNotKnockLeadPayload, { onConflict: "rep_id,address_normalized" });
        if (doNotKnockLeadError) {
          postSaveWarnings.push(`Do Not Knock lead tag warning: ${doNotKnockLeadError.message}`);
        }
      }

      if (includeInNightlyNumbers) {
        setTodayTotals((previous) => mergeNightlyDelta(previous, delta));
        try {
          await withTimeout(applyNightlyDelta(delta), 7000, "Nightly numbers sync timed out.");
        } catch (nightlyError) {
          postSaveWarnings.push(
            `Nightly numbers sync delayed: ${parseError(nightlyError, "Unknown nightly sync error.")}`,
          );
        }
      }

      if (completionModalState) {
        setCompletionModal(completionModalState);
      } else {
        resetAfterEvent(eventAddress);
      }

      const baseMessage =
        completionModalState
          ? "Inspection completed. PDF report is ready below."
          : isInspection && params.skipGuidedInspection
            ? "Inspection logged with homeowner info only. Guided inspection was skipped."
          : includeInNightlyNumbers
            ? "Event logged and nightly numbers synced."
            : "Event logged. Nightly sync skipped (not on nightly roster).";

      setMessage(
        postSaveWarnings.length > 0
          ? `${baseMessage} Warning: ${postSaveWarnings.join(" ")}`
          : baseMessage,
      );
      } catch (e) {
      if (likelyNetworkError(e)) {
        try {
          const fallbackAddress =
            homeownerIntake.address.trim() || doorAddress.trim() || currentAddress || "";
          await queueOperation("knock_events", {
            session_id: session.id,
            rep_id: user.id,
            action: params.action,
            outcome: params.action === "knock" ? params.outcome ?? null : null,
            address: fallbackAddress || null,
            homeowner_name: homeownerIntake.homeownerName.trim() || null,
            homeowner_phone: homeownerIntake.phone.trim() || null,
            homeowner_email: homeownerIntake.email.trim() || null,
            metadata: isInspectionEvent
              ? params.skipGuidedInspection
                ? {
                    guided_inspection_skipped: true,
                  }
                : {
                    checklist: inspectionChecklist,
                    photo_count: inspectionPhotos.length,
                  }
              : {},
          });

          if (
            params.action === "knock" &&
            params.outcome === "do_not_knock" &&
            fallbackAddress.trim().length > 0
          ) {
            await queueOperation("knock_potential_leads", {
              rep_id: user.id,
              address: fallbackAddress,
              address_normalized: normalizeAddress(fallbackAddress),
              homeowner_name: homeownerIntake.homeownerName.trim() || null,
              homeowner_phone: homeownerIntake.phone.trim() || null,
              homeowner_email: homeownerIntake.email.trim() || null,
              lead_status: "do_not_knock",
              notes: "Marked as Do Not Knock from knock outcome.",
              latitude: currentLat,
              longitude: currentLng,
            });
          }
          setError(null);
          setMessage("Network issue. Event queued for auto-sync.");
        } catch (queueError) {
          setError(parseError(queueError, "Failed to log or queue door event."));
        }
      } else {
        setError(parseError(e, "Failed to log door event."));
      }
    } finally {
      setSaving(false);
    }
  }

  function startKnockFlow() {
    setError(null);
    setEventAction("knock");
    setStep("outcome");
  }

  async function onOutcomeSelect(outcome: KnockOutcome) {
    setEventOutcome(outcome);

    if (outcome === "no" || outcome === "no_answer" || outcome === "do_not_knock") {
      await logEvent({ action: "knock", outcome });
      return;
    }

    setStep("homeowner");
  }

  async function onDoorHanger() {
    setEventAction("door_hanger");
    setEventOutcome("no_answer");
    await logEvent({ action: "door_hanger", outcome: null });
  }

  function onContinueHomeowner(event: FormEvent) {
    event.preventDefault();
    if (!homeownerIntake.homeownerName.trim()) {
      setError("Homeowner name is required.");
      return;
    }

    if (eventOutcome === "soft_set") {
      setStep("follow_up");
      return;
    }

    setInspectionStepIndex(0);
    setInspectionChecklist((previous) => ({
      ...previous,
      signatureRepName: previous.signatureRepName || fullName || user?.email || "",
      selectedSignatureId:
        previous.selectedSignatureId || repSignatures.find((signature) => signature.is_active)?.id || null,
    }));
    setStep("inspection");
  }

  if (loading) {
    return <main className="layout">Loading session...</main>;
  }

  if (!user) {
    return <main className="layout">Redirecting to sign in...</main>;
  }

  if (!session) {
    return (
      <AppShell
        role={role}
        profileName={fullName}
        profileImageUrl={profileImageUrl}
        onSignOut={signOut}
        debug={{ userId: user.id, role, accessToken, authError }}
      >
        <section className="panel">
          <h2 style={{ margin: 0 }}>Knocking</h2>
          <p className="hint">Start a session to enter full-screen mobile knocking mode.</p>
          <p className="hint">
            Today: K {todayTotals.knocks} | T {todayTotals.talks} | I {todayTotals.inspections} | C {" "}
            {todayTotals.contingencies}
          </p>
          <p className="hint">Offline queue: {syncQueueCount} pending operation(s).</p>
          {!includeInNightlyNumbers ? (
            <p className="error">You are not included on nightly numbers; events still log.</p>
          ) : null}
          <div className="row">
            <button onClick={startSession} disabled={saving}>
              {saving ? "Starting..." : "Start Session"}
            </button>
            <button className="secondary" onClick={() => void syncNow()} disabled={syncingNow}>
              {syncingNow ? "Syncing..." : "Sync Now"}
            </button>
            <button className="secondary" onClick={() => router.push("/jobs")}>
              Back Home
            </button>
          </div>
          {syncStatusMessage ? <p className="hint">{syncStatusMessage}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {message ? <p className="hint">{message}</p> : null}
        </section>

        <section className="panel">
          <div className="row">
            <h2 style={{ margin: 0 }}>Potential Leads For Doors Map</h2>
          </div>
          <p className="hint">
            Add addresses here to display as potential leads on the Doors Map without creating a job.
          </p>

          <form className="stack" onSubmit={addPotentialLead}>
            <label className="stack">
              Address *
              <AddressAutocompleteInput
                value={potentialLeadDraft.address}
                onChange={(address) =>
                  setPotentialLeadDraft((previous) => ({ ...previous, address }))
                }
                apiKey={geocodeApiKey}
                placeholder="123 Main St, City, ST ZIP"
                required
                showStatus
              />
            </label>

            <label className="stack">
              Homeowner Name (optional)
              <input
                value={potentialLeadDraft.homeownerName}
                onChange={(event) =>
                  setPotentialLeadDraft((previous) => ({ ...previous, homeownerName: event.target.value }))
                }
                placeholder="Jane Doe"
              />
            </label>

            <label className="stack">
              Notes (optional)
              <textarea
                rows={2}
                value={potentialLeadDraft.notes}
                onChange={(event) =>
                  setPotentialLeadDraft((previous) => ({ ...previous, notes: event.target.value }))
                }
                placeholder="Any quick context about this lead"
              />
            </label>

            <div className="row">
              <button type="submit" disabled={savingPotentialLead}>
                {savingPotentialLead ? "Saving..." : "Save Potential Lead"}
              </button>
            </div>
          </form>

          {potentialLeadError ? <p className="error">{potentialLeadError}</p> : null}
          {potentialLeadMessage ? <p className="hint">{potentialLeadMessage}</p> : null}
          <p className="hint">
            {loadingPotentialLeads
              ? "Loading saved potential leads..."
              : "Potential leads are shown on the Doors Map."}
          </p>
          <p className="hint">
            <Link href="/knocking/doors">Open Doors Map</Link>
          </p>
        </section>
      </AppShell>
    );
  }

  const isActive = session.status === "active";

  return (
    <main className="knock-screen">
      <section className="knock-card">
        <div className="row">
          <div>
            <h1 style={{ margin: 0, fontSize: "1.2rem" }}>Knocking Session</h1>
            <p className="knock-rep">
              {sessionStatusLabel} | {formatDuration(sessionSeconds)}
            </p>
          </div>
          <div className="knock-header-actions">
            <Link href="/jobs" className="knock-link-btn">
              Exit View
            </Link>
            {isActive ? (
              <button className="secondary" onClick={pauseSession} disabled={saving}>
                Pause
              </button>
            ) : (
              <button className="secondary" onClick={resumeSession} disabled={saving}>
                Resume
              </button>
            )}
            <button className="danger" onClick={endSession} disabled={saving}>
              End
            </button>
          </div>
        </div>
        <p className="knock-rep">Rep: {fullName || user.email || user.id}</p>
        <p className="knock-rep">
          Today: K {todayTotals.knocks} | T {todayTotals.talks} | I {todayTotals.inspections} | C {" "}
          {todayTotals.contingencies}
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="secondary" onClick={() => void syncNow()} disabled={syncingNow}>
            {syncingNow ? "Syncing..." : "Sync Now"}
          </button>
          <span className="hint">Offline queue: {syncQueueCount} pending</span>
          {syncStatusMessage ? <span className="hint">{syncStatusMessage}</span> : null}
        </div>
        <p className="hint">
          Session feedback: {sessionFeedback.knocksPerHour.toFixed(1)} knocks/hr | Talk{" "}
          {(sessionFeedback.talkRate * 100).toFixed(1)}% | Inspection{" "}
          {(sessionFeedback.inspectionRate * 100).toFixed(1)}% | Contingency{" "}
          {(sessionFeedback.contingencyRate * 100).toFixed(1)}%
        </p>
        <div className="job-card" style={{ marginTop: 10 }}>
          <div className="row">
            <strong>Suggested Areas To Knock</strong>
            <Link href="/knocking/doors" className="hint">
              Open Doors Map
            </Link>
          </div>
          {loadingSuggestions ? <p className="hint">Loading suggestions...</p> : null}
          {suggestionsError ? <p className="error">{suggestionsError}</p> : null}
          {!loadingSuggestions && suggestions.length === 0 ? (
            <p className="hint">No suggestion snapshot yet. Start knocking and refresh.</p>
          ) : null}
          <div className="grid" style={{ marginTop: 8 }}>
            {suggestions.slice(0, 3).map((suggestion) => (
              <article key={suggestion.areaKey} className="job-card">
                <div className="row">
                  <strong>Rank #{suggestion.rank}</strong>
                  <span className="hint">Score {(suggestion.score * 100).toFixed(1)}</span>
                </div>
                <p className="hint">
                  {suggestion.areaKey} {suggestion.zip ? `| ZIP ${suggestion.zip}` : ""}
                </p>
                <p className="hint">{suggestion.reasons.join(" | ")}</p>
              </article>
            ))}
          </div>
        </div>

        {locationError ? <p className="error">{locationError}</p> : null}
        {message ? <p className="hint">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {!isActive ? (
          <div className="knock-step">
            <h2>Session Paused</h2>
            <p className="hint">Resume to keep logging doors.</p>
            <button onClick={resumeSession} disabled={saving}>
              Resume Session
            </button>
          </div>
        ) : null}

        {isActive && step === "door" ? (
          <div className="knock-step">
            <h2>At This Door</h2>
            <label className="stack">
              Address
              <AddressAutocompleteInput
                value={doorAddress}
                onChange={(nextAddress) => {
                  addressTouchedRef.current = true;
                  setDoorAddress(nextAddress);
                  setHomeownerIntake((prev) => ({ ...prev, address: nextAddress }));
                }}
                apiKey={geocodeApiKey}
                placeholder={currentAddress || "Tap location to fill"}
                ariaLabel="Door address"
                disabled={saving || locating}
              />
            </label>
            <button className="secondary" onClick={fillAddressFromLocation} disabled={locating || saving}>
              {locating ? "Locating..." : "Use My Location"}
            </button>

            <div className="knock-cta-grid">
              <button onClick={startKnockFlow} disabled={!canLog || saving}>
                Knock
              </button>
              <button className="secondary" onClick={onDoorHanger} disabled={!canLog || saving}>
                Door Hanger
              </button>
            </div>
          </div>
        ) : null}

        {isActive && step === "outcome" ? (
          <div className="knock-step">
            <h2>Knock Outcome</h2>
            <div className="knock-cta-grid">
              <button className="secondary" onClick={() => void onOutcomeSelect("no_answer")} disabled={saving}>
                No Answer
              </button>
              <button className="secondary" onClick={() => void onOutcomeSelect("no")} disabled={saving}>
                No
              </button>
              <button onClick={() => void onOutcomeSelect("soft_set")} disabled={saving}>
                Soft Set
              </button>
              <button onClick={() => void onOutcomeSelect("inspection")} disabled={saving}>
                Inspection
              </button>
              <button className="danger" onClick={() => void onOutcomeSelect("do_not_knock")} disabled={saving}>
                Do Not Knock
              </button>
            </div>
            <button className="secondary" onClick={() => setStep("door")} disabled={saving}>
              Back
            </button>
          </div>
        ) : null}

        {isActive && step === "homeowner" ? (
          <form className="knock-step stack" onSubmit={onContinueHomeowner}>
            <h2>Homeowner Info</h2>
            <label className="stack">
              Name *
              <input
                value={homeownerIntake.homeownerName}
                onChange={(e) =>
                  setHomeownerIntake((prev) => ({ ...prev, homeownerName: e.target.value }))
                }
                required
              />
            </label>
            <label className="stack">
              Phone
              <input
                value={homeownerIntake.phone}
                onChange={(e) => setHomeownerIntake((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </label>
            <label className="stack">
              Email
              <input
                value={homeownerIntake.email}
                onChange={(e) => setHomeownerIntake((prev) => ({ ...prev, email: e.target.value }))}
              />
            </label>
            <label className="stack">
              Address
              <AddressAutocompleteInput
                value={homeownerIntake.address}
                onChange={(nextAddress) =>
                  setHomeownerIntake((prev) => ({ ...prev, address: nextAddress }))
                }
                apiKey={geocodeApiKey}
                placeholder={doorAddress || currentAddress || "Address"}
                ariaLabel="Homeowner address"
              />
            </label>
            <div className="row">
              <button type="submit">Continue</button>
              {eventOutcome === "inspection" ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={saving}
                  onClick={() =>
                    void logEvent({
                      action: "knock",
                      outcome: "inspection",
                      homeownerRequired: true,
                      skipGuidedInspection: true,
                    })
                  }
                >
                  {saving ? "Saving..." : "Save Homeowner Only"}
                </button>
              ) : null}
              <button type="button" className="secondary" onClick={() => setStep("outcome")} disabled={saving}>
                Back
              </button>
            </div>
          </form>
        ) : null}

        {isActive && step === "follow_up" ? (
          <form
            className="knock-step stack"
            onSubmit={(e) => {
              e.preventDefault();
              void logEvent({ action: "knock", outcome: "soft_set", homeownerRequired: true });
            }}
          >
            <h2>Set Follow-Up</h2>
            <label className="stack">
              Date + time *
              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Soft Set"}
            </button>
            <button type="button" className="secondary" onClick={() => setStep("homeowner")}>Back</button>
          </form>
        ) : null}

        {isActive && step === "inspection" ? (
          <div className="knock-step hub-root">
            {/* ── Hub header ──────────────────────────────────── */}
            <div className="hub-header">
              <div className="hub-header__left">
                <h2 className="hub-header__title">Inspection</h2>
                <span className="hub-address">{homeownerIntake.address || "Address not set"}</span>
              </div>
              <div className="hub-header__right">
                {saveLabel ? <span className="hub-save-label">{saveLabel}</span> : null}
                <button type="button" className="secondary hub-back-btn" onClick={() => setStep("homeowner")}>
                  ← Back
                </button>
              </div>
            </div>

            {/* ── House Hub ──────────────────────────────────── */}
            <HouseHub
              hotspots={([
                { key: "roof", label: "Roof" },
                { key: "perimeter", label: "Perimeter" },
                { key: "siding", label: "Siding" },
                { key: "gutters", label: "Gutters" },
                { key: "windows", label: "Windows" },
                { key: "interior", label: "Interior" },
                { key: "attic", label: "Attic" },
              ] as { key: HubSectionKey; label: string }[]).map((h) => ({
                key: h.key,
                label: h.label,
                state: computeHotspotState(h.key),
              }))}
              onTap={(key) => {
                if (key === "roof") { setShowRoofHub(true); }
                else { setActiveHubSection(key); }
              }}
              onAddDetached={() => {
                const building: DetachedBuilding = {
                  id: crypto.randomUUID(),
                  label: "shed",
                  completedAt: null,
                };
                setDetachedBuildings((prev) => [...prev, building]);
              }}
            />

            {/* ── Section drawers ──────────────────────────── */}
            {activeHubSection && activeHubSection !== "roof" ? (
              <div className="hub-drawer-overlay">
                <SectionDrawer
                  config={{
                    key: activeHubSection,
                    label: activeHubSection.charAt(0).toUpperCase() + activeHubSection.slice(1),
                    captureSection: activeHubSection as CaptureSection,
                    suggestedPhotoCount: activeHubSection === "perimeter" ? 8 : undefined,
                    hideCondition: activeHubSection === "perimeter",
                  }}
                  photos={inspectionPhotos.filter((p) => p.captureSection === activeHubSection)}
                  condition={hubSectionStates[activeHubSection]?.condition ?? null}
                  note={hubSectionStates[activeHubSection]?.note ?? ""}
                  manualComplete={hubSectionStates[activeHubSection]?.manualComplete ?? false}
                  onClose={() => setActiveHubSection(null)}
                  onAddPhotos={(files, tags, section) => addPhotosFromHub(files, tags, section)}
                  onRemovePhoto={(photoId) => setInspectionPhotos((prev) => prev.filter((p) => p.id !== photoId))}
                  onConditionChange={(c) => updateHubSection(activeHubSection, { condition: c })}
                  onNoteChange={(n) => updateHubSection(activeHubSection, { note: n })}
                  onToggleManualComplete={() =>
                    updateHubSection(activeHubSection, {
                      manualComplete: !(hubSectionStates[activeHubSection]?.manualComplete ?? false),
                    })
                  }
                />
              </div>
            ) : null}

            {/* ── Roof sub-hub ─────────────────────────────── */}
            {showRoofHub ? (
              <div className="hub-drawer-overlay">
                <RoofSubHub
                  photos={inspectionPhotos.filter((p) =>
                    ["roof_overview", "roof_damage", "roof_damage_test_square"].includes(p.captureSection),
                  )}
                  shingleLengthInches={inspectionChecklist.shingleLengthInches}
                  shingleWidthInches={inspectionChecklist.shingleWidthInches}
                  dripEdgePresent={
                    inspectionChecklist.dripEdgePresent === true
                      ? "yes"
                      : inspectionChecklist.dripEdgePresent === false
                        ? "no"
                        : null
                  }
                  estimatedRoofAgeYears={estimatedRoofAgeYears}
                  layerCount={layerCount}
                  layerPhotoId={layerPhotoId}
                  componentPresence={inspectionChecklist.componentPresence}
                  roofDamage={roofDamageHub}
                  onClose={() => setShowRoofHub(false)}
                  onAddPhotos={async (files, tags, section) => {
                    return await addPhotosFromHub(files, tags, section);
                  }}
                  onRemovePhoto={(photoId) =>
                    setInspectionPhotos((prev) => prev.filter((p) => p.id !== photoId))
                  }
                  onShingleLength={(v) =>
                    setInspectionChecklist((prev) => ({ ...prev, shingleLengthInches: v }))
                  }
                  onShingleWidth={(v) =>
                    setInspectionChecklist((prev) => ({ ...prev, shingleWidthInches: v }))
                  }
                  onDripEdge={(v) =>
                    setInspectionChecklist((prev) => ({
                      ...prev,
                      dripEdgePresent: v === "yes" ? true : v === "no" ? false : null,
                    }))
                  }
                  onRoofAge={setEstimatedRoofAgeYears}
                  onLayerCount={setLayerCount}
                  onLayerPhoto={setLayerPhotoId}
                  onComponentToggle={updateInspectionComponent}
                  onComponentQty={updateInspectionComponentQuantity}
                  onRoofDamage={(patch) => setRoofDamageHub((prev) => ({ ...prev, ...patch }))}
                />
              </div>
            ) : null}

            {/* ── Report builder ───────────────────────────── */}
            {showReportBuilder ? (
              <ReportBuilder
                photos={inspectionPhotos}
                initialPayload={reportBuilderPayload}
                repSignatures={repSignatures as RBRepSignatureRow[]}
                loadingSignatures={loadingSignatures}
                generating={saving}
                onClose={() => setShowReportBuilder(false)}
                onGenerate={(payload) => {
                  setReportBuilderPayload(payload);
                  setInspectionChecklist((prev) => ({
                    ...prev,
                    contingent: payload.contingent,
                    notes: payload.closing.notes || prev.notes,
                    selectedSignatureId: payload.signatureId,
                  }));
                  setShowReportBuilder(false);
                  if (photoRequirementWarnings.length > 0) {
                    setMessage(`Warning: ${photoRequirementWarnings.join(" | ")}. Submitting anyway.`);
                  }
                  void logEvent({
                    action: "knock",
                    outcome: "inspection",
                    homeownerRequired: true,
                    contingentOverride: payload.contingent,
                  });
                }}
              />
            ) : null}

            {/* ── Persistent hub footer ────────────────────── */}
            <div className="hub-footer">
              <button
                type="button"
                className="hub-footer-btn"
                onClick={() => updateHubSection("perimeter", { note: (hubSectionStates.perimeter?.note ?? "") + " " })}
              >
                📝 Notes
              </button>
              <button
                type="button"
                className="hub-footer-btn hub-footer-btn--primary"
                onClick={() => setShowReportBuilder(true)}
                disabled={saving}
              >
                {saving ? "Saving…" : "Generate Report →"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {completionModal.open ? (
        <section className="knock-card" style={{ borderColor: "var(--accent)" }}>
          <div className="row">
            <h2 style={{ margin: 0 }}>Inspection Complete</h2>
            <span className="hint">
              CRM Upload: {completionModal.uploadStatus === "uploaded" ? "Uploaded" : "Needs Retry"}
            </span>
          </div>
          {completionModal.uploadError ? <p className="error">{completionModal.uploadError}</p> : null}
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={downloadCompletionPdf}>
              Download PDF
            </button>
            {completionModal.uploadStatus !== "uploaded" ? (
              <button type="button" className="secondary" onClick={() => void retryCompletionReportUpload()} disabled={saving}>
                {saving ? "Retrying..." : "Retry CRM Upload"}
              </button>
            ) : null}
            <button type="button" className="secondary" onClick={closeCompletionModal}>
              Done
            </button>
          </div>
          {completionModal.pdfUrl ? (
            <iframe
              title="Inspection report PDF preview"
              src={completionModal.pdfUrl}
              style={{
                width: "100%",
                minHeight: 440,
                border: "1px solid var(--border)",
                borderRadius: 8,
                marginTop: 10,
                background: "#fff",
              }}
            />
          ) : (
            <p className="hint">Preview unavailable. Use download instead.</p>
          )}
        </section>
      ) : null}

      <section className="knock-card">
        <div className="row">
          <h2 style={{ margin: 0 }}>Session Knocks</h2>
          <p className="hint">{sessionEvents.length} logged</p>
        </div>
        <p className="hint">
          Edit unlocked knocks while this session is active or paused. After the session ends, edits are locked.
        </p>
        {sessionEventsError ? <p className="error">{sessionEventsError}</p> : null}
        {loadingSessionEvents ? <p className="hint">Loading session knocks...</p> : null}

        <div className="grid knock-events-list">
          {sessionEvents.map((event) => {
            const isEditing = editingEventId === event.id;
            const canEdit = canEditEventRow(event);
            const contactParts = [
              typeof event.homeowner_name === "string" && event.homeowner_name.trim()
                ? event.homeowner_name.trim()
                : null,
              typeof event.homeowner_phone === "string" && event.homeowner_phone.trim()
                ? event.homeowner_phone.trim()
                : null,
              typeof event.homeowner_email === "string" && event.homeowner_email.trim()
                ? event.homeowner_email.trim()
                : null,
            ].filter((value): value is string => Boolean(value));

            return (
              <article key={event.id} className="job-card knock-event-card">
                <div className="row">
                  <strong>{eventTitle(event.action, typeof event.outcome === "string" ? event.outcome : null)}</strong>
                  <span className="hint">
                    {event.created_at ? new Date(event.created_at).toLocaleString() : "-"}
                  </span>
                </div>

                {isEditing && eventEditDraft ? (
                  <form
                    className="stack"
                    onSubmit={(submitEvent) => {
                      submitEvent.preventDefault();
                      void saveEventEdits(event);
                    }}
                  >
                    {event.action === "knock" ? (
                      <label className="stack">
                        Outcome
                        <select
                          value={eventEditDraft.outcome}
                          onChange={(changeEvent) =>
                            setEventEditDraft((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    outcome: editableOutcome(changeEvent.target.value),
                                  }
                                : previous,
                            )
                          }
                        >
                          <option value="no_answer">No Answer</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                    ) : null}

                    <label className="stack">
                      Address
                      <AddressAutocompleteInput
                        value={eventEditDraft.address}
                        onChange={(nextAddress) =>
                          setEventEditDraft((previous) =>
                            previous ? { ...previous, address: nextAddress } : previous,
                          )
                        }
                        apiKey={geocodeApiKey}
                        ariaLabel="Edit event address"
                        disabled={saving}
                      />
                    </label>

                    <label className="stack">
                      Homeowner Name
                      <input
                        value={eventEditDraft.homeownerName}
                        onChange={(changeEvent) =>
                          setEventEditDraft((previous) =>
                            previous ? { ...previous, homeownerName: changeEvent.target.value } : previous,
                          )
                        }
                      />
                    </label>

                    <label className="stack">
                      Phone
                      <input
                        value={eventEditDraft.homeownerPhone}
                        onChange={(changeEvent) =>
                          setEventEditDraft((previous) =>
                            previous ? { ...previous, homeownerPhone: changeEvent.target.value } : previous,
                          )
                        }
                      />
                    </label>

                    <label className="stack">
                      Email
                      <input
                        value={eventEditDraft.homeownerEmail}
                        onChange={(changeEvent) =>
                          setEventEditDraft((previous) =>
                            previous ? { ...previous, homeownerEmail: changeEvent.target.value } : previous,
                          )
                        }
                      />
                    </label>

                    <div className="row">
                      <button type="submit" disabled={saving}>
                        {saving ? "Saving..." : "Save Edit"}
                      </button>
                      <button type="button" className="secondary" onClick={cancelEditingEvent} disabled={saving}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="muted">
                      {typeof event.address === "string" && event.address.trim() ? event.address : "No address"}
                    </p>
                    <p className="hint">
                      {contactParts.length > 0 ? contactParts.join(" | ") : "No homeowner/contact info"}
                    </p>
                    <div className="row">
                      {canEdit ? (
                        <button className="secondary" onClick={() => beginEditingEvent(event)} disabled={saving}>
                          Edit
                        </button>
                      ) : (
                        <span className="hint">
                          {eventIsCrmLocked(event)
                            ? "Locked after CRM link"
                            : "Editing locked outside active session"}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </article>
            );
          })}
          {!loadingSessionEvents && sessionEvents.length === 0 ? (
            <p className="hint">No knocks logged in this session yet.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
