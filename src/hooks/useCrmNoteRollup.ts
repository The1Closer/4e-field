"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueSyncOperation } from "@/lib/offline-sync";
import type {
  HubSectionStates,
  ComponentPresenceDraft,
  DetachedBuilding,
  ExteriorCollateralItem,
  PersonalPropertyRoom,
} from "@/types/inspection";
import { ROOF_COMPONENT_BY_KEY } from "@/lib/roof-components";
import { collateralLabel } from "@/lib/exterior-collateral-taxonomy";
import { migrateComponentItem } from "@/types/inspection";

export type CrmRollupStatus = "idle" | "syncing" | "synced" | "pending" | "offline";

const SECTION_LABELS: Record<string, string> = {
  roof: "Roof",
  perimeter: "Perimeter",
  siding: "Siding",
  gutters: "Gutters",
  windows: "Windows",
  interior: "Interior",
  attic: "Attic",
};

const CONDITION_LABELS: Record<string, string> = {
  good: "Good",
  damaged: "Damaged",
  missing: "Missing",
  not_visible: "Not Visible",
};

const PP_ROOM_LABELS: Record<string, string> = {
  living_room: "Living Room",
  dining_room: "Dining Room",
  kitchen: "Kitchen",
  master_bedroom: "Master Bed",
  bedroom_2: "Bedroom 2",
  bedroom_3: "Bedroom 3",
  bathroom: "Bathroom",
  office: "Office",
  basement: "Basement",
};

function ppRoomLabel(room: PersonalPropertyRoom): string {
  if (room.key.startsWith("custom:")) return room.customLabel || "Custom Room";
  return PP_ROOM_LABELS[room.key] ?? room.key;
}

function buildRollupBody(
  sectionStates: HubSectionStates,
  componentPresence: ComponentPresenceDraft,
  personalProperty: PersonalPropertyRoom[],
  exteriorCollateral: ExteriorCollateralItem[],
  detachedBuildings: DetachedBuilding[],
): string {
  const lines: string[] = ["# Inspection Notes\n"];

  // Per-section notes
  for (const [key, label] of Object.entries(SECTION_LABELS)) {
    const state = sectionStates[key as keyof HubSectionStates];
    if (!state) continue;
    const hasNote = state.note?.trim();
    const hasCondition = state.condition;
    if (!hasNote && !hasCondition) continue;

    lines.push(`## ${label}`);
    if (hasCondition) {
      lines.push(`**Condition:** ${CONDITION_LABELS[state.condition!] ?? state.condition}`);
    }
    if (hasNote) {
      lines.push(state.note.trim());
    }
    lines.push("");
  }

  // Roof components summary
  const notedComponents = Object.entries(componentPresence)
    .map(([key, raw]) => {
      const item = "status" in (raw ?? {}) ? raw as ReturnType<typeof migrateComponentItem> : migrateComponentItem(raw as Record<string, unknown>);
      return { key, item };
    })
    .filter(({ item }) => item.status === "present");

  if (notedComponents.length > 0) {
    lines.push("## Roof Components");
    for (const { key, item } of notedComponents) {
      const def = ROOF_COMPONENT_BY_KEY.get(key);
      const name = def?.label ?? key.replace(/_/g, " ");
      const parts: string[] = [name];
      if (item.quantity != null) parts.push(`${item.quantity}${def?.qtyUnit ? ` ${def.qtyUnit}` : ""}`);
      if (item.condition) parts.push(item.condition.charAt(0).toUpperCase() + item.condition.slice(1));
      if (item.note?.trim()) parts.push(`"${item.note.trim()}"`);
      lines.push(`- ${parts.join(" — ")}`);
    }
    lines.push("");
  }

  // Personal Property
  const documentedRooms = personalProperty.filter((r) => r.photoIds.length > 0 || r.note.trim());
  if (documentedRooms.length > 0) {
    lines.push("## Personal Property");
    for (const room of documentedRooms) {
      const parts: string[] = [ppRoomLabel(room)];
      if (room.damageCause && room.damageCause !== "none") {
        parts.push(`cause: ${room.damageCause}`);
      }
      parts.push(`${room.photoIds.length} photo${room.photoIds.length === 1 ? "" : "s"}`);
      if (room.note.trim()) parts.push(`"${room.note.trim()}"`);
      lines.push(`- ${parts.join(" — ")}`);
    }
    lines.push("");
  }

  // Exterior Collateral
  if (exteriorCollateral.length > 0) {
    lines.push("## Exterior Collateral");
    for (const item of exteriorCollateral) {
      const parts: string[] = [collateralLabel(item.type, item.customTypeLabel)];
      if (item.condition) parts.push(CONDITION_LABELS[item.condition] ?? item.condition);
      if (item.damageCause && item.damageCause !== "none") parts.push(`cause: ${item.damageCause}`);
      if (item.photoIds.length > 0) parts.push(`${item.photoIds.length} photo${item.photoIds.length === 1 ? "" : "s"}`);
      if (item.note.trim()) parts.push(`"${item.note.trim()}"`);
      lines.push(`- ${parts.join(" — ")}`);
    }
    lines.push("");
  }

  // Detached buildings
  for (const b of detachedBuildings) {
    if (!b.submitted) continue;
    const title = b.label === "other" && b.customLabel ? b.customLabel : b.label.charAt(0).toUpperCase() + b.label.slice(1);
    const sectionEntries = Object.entries(b.sections ?? {}).filter(([, s]) => s?.condition || s?.note?.trim());
    const ppDocumented = (b.personalProperty ?? []).filter((r) => r.photoIds.length > 0 || r.note.trim());
    const ecCount = (b.exteriorCollateral ?? []).length;
    if (sectionEntries.length === 0 && ppDocumented.length === 0 && ecCount === 0) continue;

    lines.push(`## Detached: ${title}`);
    for (const [key, state] of sectionEntries) {
      const label = SECTION_LABELS[key] ?? key;
      lines.push(`### ${label}`);
      if (state?.condition) lines.push(`**Condition:** ${CONDITION_LABELS[state.condition] ?? state.condition}`);
      if (state?.note?.trim()) lines.push(state.note.trim());
      lines.push("");
    }
    if (ppDocumented.length > 0) {
      lines.push("### Contents");
      for (const room of ppDocumented) {
        lines.push(`- ${ppRoomLabel(room)}${room.note.trim() ? ` — "${room.note.trim()}"` : ""}`);
      }
      lines.push("");
    }
    if (ecCount > 0) {
      lines.push("### Collateral Items");
      for (const item of (b.exteriorCollateral ?? [])) {
        lines.push(`- ${collateralLabel(item.type, item.customTypeLabel)}${item.condition ? ` (${CONDITION_LABELS[item.condition] ?? item.condition})` : ""}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

type Options = {
  jobId: string | null;
  inspectionId: string | null;
  accessToken: string | null;
  sectionStates: HubSectionStates;
  componentPresence: ComponentPresenceDraft;
  personalProperty?: PersonalPropertyRoom[];
  exteriorCollateral?: ExteriorCollateralItem[];
  detachedBuildings?: DetachedBuilding[];
  debounceMs?: number;
};

export function useCrmNoteRollup({
  jobId,
  inspectionId,
  accessToken,
  sectionStates,
  componentPresence,
  personalProperty = [],
  exteriorCollateral = [],
  detachedBuildings = [],
  debounceMs = 4000,
}: Options) {
  const [status, setStatus] = useState<CrmRollupStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (!jobId || !inspectionId || !accessToken) return;

    const body = buildRollupBody(sectionStates, componentPresence, personalProperty, exteriorCollateral, detachedBuildings);
    if (!body) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await enqueueSyncOperation({
          clientOperationId: `crm-notes-rollup-${inspectionId}-${Date.now()}`,
          operationType: "update",
          resourceType: "crm-notes-rollup",
          resourceId: `${jobId}:${inspectionId}`,
          payload: { jobId, inspectionId, body },
        });
      } catch {
        // non-fatal
      }
      setStatus("offline");
      return;
    }

    setStatus("syncing");
    try {
      const res = await fetch(`/api/crm/api/jobs/${jobId}/notes`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ body, source: "inspection", inspection_id: inspectionId }),
      });

      if (!res.ok) throw new Error(`CRM notes sync failed (${res.status})`);
      setStatus("synced");
    } catch {
      setStatus("pending");
      try {
        await enqueueSyncOperation({
          clientOperationId: `crm-notes-rollup-${inspectionId}-${Date.now()}`,
          operationType: "update",
          resourceType: "crm-notes-rollup",
          resourceId: `${jobId}:${inspectionId}`,
          payload: { jobId, inspectionId, body },
        });
      } catch {
        // non-fatal
      }
    }
  }, [jobId, inspectionId, accessToken, sectionStates, componentPresence, personalProperty, exteriorCollateral, detachedBuildings]);

  const scheduleRollup = useCallback(() => {
    if (!jobId || !inspectionId) return;
    setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush();
    }, debounceMs);
  }, [jobId, inspectionId, debounceMs, flush]);

  const flushNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void flush();
  }, [flush]);

  // On unload, send via beacon if possible
  useEffect(() => {
    function handleUnload() {
      if (!jobId || !inspectionId || !accessToken) return;
      const body = buildRollupBody(sectionStates, componentPresence, personalProperty, exteriorCollateral, detachedBuildings);
      if (!body) return;
      navigator.sendBeacon?.(
        `/api/crm/api/jobs/${jobId}/notes`,
        new Blob(
          [JSON.stringify({ body, source: "inspection", inspection_id: inspectionId })],
          { type: "application/json" }
        )
      );
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [jobId, inspectionId, accessToken, sectionStates, componentPresence]);

  const statusLabel = (() => {
    if (status === "syncing") return "Syncing to CRM…";
    if (status === "synced") return "Synced to CRM ✓";
    if (status === "pending") return "Pending CRM sync";
    if (status === "offline") return "Offline — will sync";
    return null;
  })();

  return { scheduleRollup, flushNow, crmStatus: status, crmStatusLabel: statusLabel };
}
