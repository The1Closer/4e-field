"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueSyncOperation } from "@/lib/offline-sync";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

type AutosaveOptions = {
  inspectionId: string | null;
  /** Debounce delay in ms (default 750) */
  debounceMs?: number;
};

const LS_KEY = (id: string) => `inspection:${id}`;

export function useInspectionAutosave({ inspectionId, debounceMs = 750 }: AutosaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);

  const flush = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!inspectionId) return;

      // Shadow to localStorage immediately for offline resilience
      try {
        const existing = JSON.parse(localStorage.getItem(LS_KEY(inspectionId)) ?? "{}") as Record<string, unknown>;
        localStorage.setItem(LS_KEY(inspectionId), JSON.stringify({ ...existing, ...patch }));
      } catch {
        // localStorage unavailable — non-fatal
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        // Enqueue for later flush via offline-sync queue
        try {
          await enqueueSyncOperation({
            clientOperationId: `inspection-patch-${inspectionId}-${Date.now()}`,
            operationType: "update",
            resourceType: "inspections",
            resourceId: inspectionId,
            payload: patch,
          });
        } catch {
          // queue full — non-fatal, localStorage shadow still has data
        }
        setSaveStatus("offline");
        return;
      }

      setSaveStatus("saving");
      try {
        const res = await fetch(`/api/inspections/${inspectionId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Autosave failed (${res.status})`);
        }

        setLastSavedAt(new Date());
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
        // Enqueue for retry when back online
        try {
          await enqueueSyncOperation({
            clientOperationId: `inspection-patch-${inspectionId}-${Date.now()}`,
            operationType: "update",
            resourceType: "inspections",
            resourceId: inspectionId,
            payload: patch,
          });
        } catch {
          // non-fatal
        }
      }
    },
    [inspectionId],
  );

  /** Schedule a debounced save. Merges patch fields — later calls win. */
  const scheduleSave = useCallback(
    (patch: Record<string, unknown>) => {
      if (!inspectionId) return;
      pendingRef.current = { ...(pendingRef.current ?? {}), ...patch };

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const toFlush = pendingRef.current;
        pendingRef.current = null;
        if (toFlush) void flush(toFlush);
      }, debounceMs);
    },
    [inspectionId, debounceMs, flush],
  );

  /** Immediately flush any pending debounced write (call on unmount / before navigation). */
  const flushNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const toFlush = pendingRef.current;
    pendingRef.current = null;
    if (toFlush && inspectionId) {
      void flush(toFlush);
    }
  }, [inspectionId, flush]);

  /** Read the localStorage shadow (used when re-hydrating from offline state). */
  function readLocalShadow(id: string): Record<string, unknown> {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY(id)) ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /** Clear the localStorage shadow once the DB row is confirmed current. */
  function clearLocalShadow(id: string) {
    try {
      localStorage.removeItem(LS_KEY(id));
    } catch {
      // non-fatal
    }
  }

  // Flush on unmount so navigating away doesn't lose data
  useEffect(() => {
    return () => {
      flushNow();
    };
  }, [flushNow]);

  const saveLabel = (() => {
    if (saveStatus === "saving") return "Saving…";
    if (saveStatus === "error") return "Save failed — will retry";
    if (saveStatus === "offline") return "Will sync when online";
    if (saveStatus === "saved" && lastSavedAt) {
      const diffSec = Math.round((Date.now() - lastSavedAt.getTime()) / 1000);
      return diffSec < 5 ? "Saved just now" : `Saved ${diffSec}s ago`;
    }
    return null;
  })();

  return { scheduleSave, flushNow, saveStatus, saveLabel, readLocalShadow, clearLocalShadow };
}
