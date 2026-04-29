"use client";

import { useEffect, useRef, useState } from "react";
import { hashAddress, type ImageryRecord } from "@/lib/imagery/types";

export type ImageryHookState = {
  status: "idle" | "loading" | "ready" | "partial" | "failed";
  satelliteUrl: string | null;
  streetViewUrl: string | null;
  streetViewHeading: number | null;
  error: string | null;
};

const INITIAL: ImageryHookState = {
  status: "idle",
  satelliteUrl: null,
  streetViewUrl: null,
  streetViewHeading: null,
  error: null,
};

type Options = {
  inspectionId: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  accessToken: string | null;
  // When true, skip the GET-cached probe and force a POST fetch.
  // Used for "the rep just edited the address — refetch from scratch".
  forceRefresh?: boolean;
};

export function useInspectionImagery({
  inspectionId,
  address,
  lat,
  lng,
  accessToken,
  forceRefresh,
}: Options): ImageryHookState {
  const [state, setState] = useState<ImageryHookState>(INITIAL);
  const lastHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (!inspectionId) {
      setState(INITIAL);
      lastHashRef.current = null;
      return;
    }
    const trimmedAddress = address.trim();
    const hasGps = typeof lat === "number" && typeof lng === "number";
    if (!trimmedAddress && !hasGps) {
      // Nothing to fetch yet.
      setState(INITIAL);
      lastHashRef.current = null;
      return;
    }
    const sourceHash = hashAddress(trimmedAddress, lat, lng);
    if (lastHashRef.current === sourceHash && !forceRefresh) return;
    lastHashRef.current = sourceHash;

    let cancelled = false;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    function applyImagery(record: ImageryRecord | null) {
      if (cancelled) return;
      if (!record) {
        setState({ ...INITIAL, status: "loading" });
        return;
      }
      setState({
        status:
          record.status === "ready"
            ? "ready"
            : record.status === "partial"
              ? "partial"
              : "failed",
        satelliteUrl: record.satellite?.signedUrl ?? null,
        streetViewUrl: record.streetView?.signedUrl ?? null,
        streetViewHeading: record.streetView?.heading ?? null,
        error: record.error ?? null,
      });
    }

    async function run() {
      setState((prev) => ({ ...prev, status: "loading", error: null }));
      try {
        // Probe cache first unless caller explicitly wants a refresh.
        if (!forceRefresh) {
          try {
            const cached = await fetch(`/api/inspections/${inspectionId}/imagery`, {
              method: "GET",
              credentials: "include",
              headers,
              cache: "no-store",
            });
            if (!cancelled && cached.ok) {
              const json = (await cached.json()) as { imagery: ImageryRecord | null };
              if (json.imagery && json.imagery.addressHash === sourceHash) {
                applyImagery(json.imagery);
                return;
              }
            }
          } catch {
            // Ignore — fall through to POST fetch.
          }
        }
        if (cancelled) return;
        const fetchRes = await fetch(`/api/inspections/${inspectionId}/imagery`, {
          method: "POST",
          credentials: "include",
          headers,
          cache: "no-store",
          body: JSON.stringify({
            address: trimmedAddress || undefined,
            lat: hasGps ? lat : undefined,
            lng: hasGps ? lng : undefined,
          }),
        });
        if (!cancelled) {
          if (!fetchRes.ok) {
            setState({
              ...INITIAL,
              status: "failed",
              error: `Imagery fetch failed (${fetchRes.status})`,
            });
            return;
          }
          const json = (await fetchRes.json()) as { imagery: ImageryRecord | null; error?: string };
          applyImagery(json.imagery ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            ...INITIAL,
            status: "failed",
            error: err instanceof Error ? err.message : "Imagery fetch error",
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [inspectionId, address, lat, lng, accessToken, forceRefresh]);

  return state;
}
