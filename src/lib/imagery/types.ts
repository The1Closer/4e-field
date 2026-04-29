// Shared types for the per-inspection imagery cache (satellite + Street View).

export type ImageryAssetRecord = {
  path: string;
  signedUrl: string;
  expiresAt: string; // ISO
  width: number;
  height: number;
};

export type ImageryRecord = {
  status: "ready" | "partial" | "failed";
  addressHash: string;
  fetchedAt: string; // ISO
  lat: number | null;
  lng: number | null;
  satellite: ImageryAssetRecord | null;
  streetView:
    | (ImageryAssetRecord & {
        heading: number;
        panoLat: number;
        panoLng: number;
      })
    | null;
  error?: string;
};

// Stable, fast hash for "did the source change since last fetch?".
export function hashAddress(address: string, lat: number | null | undefined, lng: number | null | undefined): string {
  const norm = (address ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const latPart = typeof lat === "number" ? lat.toFixed(5) : "_";
  const lngPart = typeof lng === "number" ? lng.toFixed(5) : "_";
  return `${norm}|${latPart}|${lngPart}`;
}
