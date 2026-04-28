export const dynamic = "force-dynamic";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type InspectionPhotoRow = {
  id: string;
  file_name: string;
  file_path: string;
  content_type: string | null;
  capture_section: string | null;
  damage_cause: string | null;
  notes: string | null;
};

type ReportPayload = {
  // v2 legacy fields
  sections?: Record<string, unknown>;
  homeowner?: Record<string, unknown>;
  roofOverview?: Record<string, unknown>;
  interiorAttic?: Record<string, unknown>;
  signature?: Record<string, unknown>;
  notes?: unknown;
  // v3 builder fields
  builderSections?: Array<{
    key: string;
    title: string;
    visible: boolean;
    includePhotos: boolean;
    photoIds: string[];
  }>;
  builderCover?: {
    intro: string;
    coverPhotoId: string | null;
  };
  builderClosing?: {
    notes: string;
  };
  // v3 metadata
  testSquares?: Array<{
    id: string;
    slope: string;
    photoId: string | null;
    hitCount: number | null;
    note: string;
  }>;
  sectionConditions?: Record<string, string>;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const MAX_REPORT_PHOTOS = 80;
const PHOTO_EMBED_BATCH_SIZE = 6;

async function getId(context: RouteContext) {
  const resolved = await context.params;
  return resolved.id;
}

function sectionLabel(section: string | null) {
  switch (section) {
    case "perimeter_photos":
      return "Perimeter";
    case "collateral_damage":
      return "Collateral";
    case "roof_overview":
      return "Roof Overview";
    case "roof_damage":
      return "Roof Damage";
    case "interior_attic":
      return "Interior/Attic";
    default:
      return "Other";
  }
}

function sectionSortKey(section: string | null) {
  switch (section) {
    case "perimeter_photos":
      return 0;
    case "collateral_damage":
      return 1;
    case "roof_overview":
      return 2;
    case "roof_damage":
      return 3;
    case "interior_attic":
      return 4;
    default:
      return 9;
  }
}

function formatDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function toDisplay(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "-";
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return "-";
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number) {
  const clean = text.trim();
  if (!clean) return "";
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;

  let left = 0;
  let right = clean.length;
  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    const candidate = `${clean.slice(0, mid)}...`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }
  return `${clean.slice(0, Math.max(1, left))}...`;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    font: PDFFont;
    size: number;
    lineHeight: number;
    color?: ReturnType<typeof rgb>;
  },
) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = options.y;
  const color = options.color ?? rgb(0.1, 0.1, 0.1);

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const width = options.font.widthOfTextAtSize(candidate, options.size);
    if (width <= options.maxWidth) {
      line = candidate;
      continue;
    }

    if (!line) {
      page.drawText(word, {
        x: options.x,
        y: cursorY,
        size: options.size,
        font: options.font,
        color,
      });
      cursorY -= options.lineHeight;
      continue;
    }

    page.drawText(line, {
      x: options.x,
      y: cursorY,
      size: options.size,
      font: options.font,
      color,
    });
    cursorY -= options.lineHeight;
    line = word;
  }

  if (line) {
    page.drawText(line, {
      x: options.x,
      y: cursorY,
      size: options.size,
      font: options.font,
      color,
    });
    cursorY -= options.lineHeight;
  }

  return cursorY;
}

function extractPhotoTags(row: InspectionPhotoRow) {
  const tags: string[] = [];

  if (row.damage_cause && row.damage_cause !== "none") {
    tags.push(row.damage_cause.toUpperCase());
  }

  for (const piece of (row.notes ?? "").split("|").map((value) => value.trim())) {
    if (!piece) continue;
    if (piece.startsWith("slope:")) {
      const value = piece.slice(6).trim();
      if (value) tags.push(`Slope ${value}`);
      continue;
    }
    if (piece.startsWith("component:")) {
      const value = piece.slice(10).trim();
      if (value) tags.push(value);
      continue;
    }
    if (piece.startsWith("tag:")) {
      const value = piece.slice(4).trim();
      if (value) tags.push(value);
    }
  }

  return Array.from(new Set(tags)).slice(0, 4);
}

async function loadLocalLogoBytes() {
  try {
    const logoPath = join(process.cwd(), "public", "4ELogo.png");
    const buffer = await readFile(logoPath);
    return new Uint8Array(buffer);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "inspection_pdf_logo_load_failed",
        reason: error instanceof Error ? error.message : "unknown",
      }),
    );
    return null;
  }
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array, contentType: string | null, fileName: string) {
  const lowered = (contentType ?? "").toLowerCase();
  const loweredName = fileName.toLowerCase();
  const tryPngFirst = lowered.includes("png") || loweredName.endsWith(".png");

  if (tryPngFirst) {
    try {
      return await doc.embedPng(bytes);
    } catch {
      try {
        return await doc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  }

  try {
    return await doc.embedJpg(bytes);
  } catch {
    try {
      return await doc.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

function drawImageFit(
  page: PDFPage,
  image: PDFImage,
  box: { x: number; y: number; width: number; height: number },
) {
  const scaled = image.scale(1);
  const ratio = Math.min(box.width / scaled.width, box.height / scaled.height, 1);
  const width = scaled.width * ratio;
  const height = scaled.height * ratio;
  const x = box.x + (box.width - width) / 2;
  const y = box.y + (box.height - height) / 2;

  page.drawImage(image, { x, y, width, height });
}

function isPhotoEnabledBySections(row: InspectionPhotoRow, sections: Record<string, unknown>) {
  switch (row.capture_section) {
    case "perimeter_photos":
      return sections.perimeterPhotos !== false;
    case "collateral_damage":
      return sections.collateralDamage !== false;
    case "roof_overview":
      return sections.roofOverview !== false;
    case "roof_damage":
      return sections.roofDamage !== false;
    case "interior_attic":
      return sections.interiorAttic !== false;
    default:
      return true;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getRouteUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const inspectionId = await getId(context);
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      selectedPhotoIds?: string[];
      payload?: ReportPayload;
    };

    const selectedPhotoIds = Array.isArray(body.selectedPhotoIds)
      ? body.selectedPhotoIds.filter((id) => typeof id === "string" && id.length > 0)
      : [];

    const payload = (body.payload ?? {}) as ReportPayload;
    const sections = (payload.sections ?? {}) as Record<string, unknown>;
    const homeowner = (payload.homeowner ?? {}) as Record<string, unknown>;
    const roofOverview = (payload.roofOverview ?? {}) as Record<string, unknown>;
    const interiorAttic = (payload.interiorAttic ?? {}) as Record<string, unknown>;
    const signature = (payload.signature ?? {}) as Record<string, unknown>;

    // v3 builder fields
    const builderSections = Array.isArray(payload.builderSections) ? payload.builderSections : null;
    const builderCover = payload.builderCover ?? null;
    const builderClosing = payload.builderClosing ?? null;
    const testSquares = Array.isArray(payload.testSquares) ? payload.testSquares : [];

    const supabase = getRouteSupabaseClient(request);

    // Collect all photo IDs we need — from selectedPhotoIds (v2) or all builder section photoIds (v3)
    const allNeededPhotoIds = builderSections
      ? [...new Set(builderSections.flatMap((s) => s.photoIds))]
      : selectedPhotoIds;

    const { data: photoRows, error: photoError } = allNeededPhotoIds.length
      ? await supabase
          .from("inspection_photos")
          .select("id,file_name,file_path,content_type,capture_section,damage_cause,notes")
          .eq("inspection_id", inspectionId)
          .eq("rep_id", userId)
          .in("id", allNeededPhotoIds)
      : { data: [], error: null };

    if (photoError) throw new Error(photoError.message);

    const rowMap = new Map<string, InspectionPhotoRow>();
    for (const row of (photoRows ?? []) as InspectionPhotoRow[]) {
      rowMap.set(row.id, row);
    }

    // Build ordered rows for the gallery
    let orderedRows: InspectionPhotoRow[];
    if (builderSections) {
      // v3: respect the builder section order and per-section photo lists
      orderedRows = builderSections
        .filter((s) => s.visible && s.includePhotos)
        .flatMap((s) => s.photoIds.map((id) => rowMap.get(id)).filter((r): r is InspectionPhotoRow => Boolean(r)));
    } else {
      orderedRows = selectedPhotoIds
        .map((id) => rowMap.get(id))
        .filter((row): row is InspectionPhotoRow => Boolean(row))
        .filter((row) => isPhotoEnabledBySections(row, sections))
        .sort((a, b) => sectionSortKey(a.capture_section) - sectionSortKey(b.capture_section));
    }
    const limitedRows = orderedRows.slice(0, MAX_REPORT_PHOTOS);
    const omittedPhotoCount = Math.max(0, orderedRows.length - limitedRows.length);

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const title = (body.title || "Inspection Report").trim() || "Inspection Report";

    // ── v3 Cover page (only when builder intro is provided) ────────────────
    if (builderCover?.intro?.trim()) {
      const coverPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

      // Brand blue header bar
      coverPage.drawRectangle({ x: 0, y: PAGE_HEIGHT - 120, width: PAGE_WIDTH, height: 120, color: rgb(0.12, 0.31, 0.55) });

      const logoBytes = await loadLocalLogoBytes();
      if (logoBytes) {
        const logoImage = await embedImage(doc, logoBytes, "image/png", "4ELogo.png");
        if (logoImage) {
          drawImageFit(coverPage, logoImage, { x: PAGE_WIDTH - MARGIN - 120, y: PAGE_HEIGHT - 108, width: 100, height: 88 });
        }
      }

      coverPage.drawText(title, { x: MARGIN, y: PAGE_HEIGHT - 52, size: 22, font: bold, color: rgb(1, 1, 1) });
      coverPage.drawText(`Generated: ${formatDateTime(new Date())}`, {
        x: MARGIN, y: PAGE_HEIGHT - 72, size: 9, font, color: rgb(0.82, 0.88, 0.97),
      });

      // Cover photo (if selected)
      if (builderCover.coverPhotoId) {
        const coverPhotoRow = rowMap.get(builderCover.coverPhotoId);
        if (coverPhotoRow) {
          const dl = await supabase.storage.from("inspection-media").download(coverPhotoRow.file_path);
          if (!dl.error && dl.data) {
            const bytes = new Uint8Array(await dl.data.arrayBuffer());
            const img = await embedImage(doc, bytes, coverPhotoRow.content_type, coverPhotoRow.file_name);
            if (img) {
              drawImageFit(coverPage, img, { x: MARGIN, y: PAGE_HEIGHT - 380, width: PAGE_WIDTH - MARGIN * 2, height: 240 });
            }
          }
        }
      }

      // Intro paragraph
      let introCursor = builderCover.coverPhotoId ? PAGE_HEIGHT - 400 : PAGE_HEIGHT - 160;
      introCursor = drawWrappedText(coverPage, builderCover.intro, {
        x: MARGIN, y: introCursor, maxWidth: PAGE_WIDTH - MARGIN * 2,
        font, size: 11, lineHeight: 16, color: rgb(0.12, 0.12, 0.14),
      });
    }

    const summaryPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    summaryPage.drawRectangle({
      x: MARGIN,
      y: PAGE_HEIGHT - 124,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 84,
      color: rgb(0.95, 0.97, 1),
      borderColor: rgb(0.83, 0.88, 0.96),
      borderWidth: 1,
    });

    const logoBytes = await loadLocalLogoBytes();
    if (logoBytes) {
      const logoImage = await embedImage(doc, logoBytes, "image/png", "4ELogo.png");
      if (logoImage) {
        drawImageFit(summaryPage, logoImage, {
          x: PAGE_WIDTH - MARGIN - 140,
          y: PAGE_HEIGHT - 112,
          width: 120,
          height: 60,
        });
      } else {
        console.warn(JSON.stringify({ event: "inspection_pdf_logo_embed_failed", reason: "unsupported_image" }));
      }
    }

    summaryPage.drawText(title, {
      x: MARGIN + 12,
      y: PAGE_HEIGHT - 76,
      size: 20,
      font: bold,
      color: rgb(0.09, 0.15, 0.28),
    });
    summaryPage.drawText(`Inspection ID: ${inspectionId}`, {
      x: MARGIN + 12,
      y: PAGE_HEIGHT - 95,
      size: 9,
      font,
      color: rgb(0.32, 0.32, 0.32),
    });
    summaryPage.drawText(`Generated: ${formatDateTime(new Date())}`, {
      x: MARGIN + 12,
      y: PAGE_HEIGHT - 108,
      size: 9,
      font,
      color: rgb(0.32, 0.32, 0.32),
    });

    let cursorY = PAGE_HEIGHT - 154;
    const contentWidth = PAGE_WIDTH - MARGIN * 2;

    const drawHeader = (label: string) => {
      summaryPage.drawText(label, {
        x: MARGIN,
        y: cursorY,
        size: 12,
        font: bold,
        color: rgb(0.11, 0.19, 0.31),
      });
      cursorY -= 16;
    };

    const drawLine = (label: string, value: unknown) => {
      cursorY = drawWrappedText(summaryPage, `${label}: ${toDisplay(value)}`, {
        x: MARGIN,
        y: cursorY,
        maxWidth: contentWidth - 220,
        font,
        size: 10,
        lineHeight: 13,
        color: rgb(0.12, 0.12, 0.12),
      });
      cursorY -= 2;
    };

    // ── Section conditions helper ────────────────────────────────────────────
    function drawConditionBadge(page: PDFPage, condition: string, x: number, y: number) {
      const conditionColors: Record<string, [number, number, number]> = {
        good:        [0.18, 0.54, 0.28],
        damaged:     [0.75, 0.19, 0.18],
        missing:     [0.84, 0.70, 0.47],
        not_visible: [0.42, 0.44, 0.46],
      };
      const c = conditionColors[condition] ?? [0.42, 0.44, 0.46];
      page.drawRectangle({ x, y: y - 3, width: 64, height: 13, color: rgb(c[0], c[1], c[2]) });
      page.drawText(condition.replace(/_/g, " ").toUpperCase(), {
        x: x + 4, y: y - 1, size: 7, font: bold, color: rgb(1, 1, 1),
      });
    }

    if (builderSections) {
      // ── v3: render visible sections from builder ─────────────────────────
      for (const bs of builderSections.filter((s) => s.visible)) {
        if (cursorY < 80) break;
        drawHeader(bs.title || bs.key);

        // Condition badge if section has a condition stored in sectionConditions
        const cond = (payload.sectionConditions ?? {})[bs.key];
        if (cond) {
          drawConditionBadge(summaryPage, cond, MARGIN + contentWidth - 80, cursorY + 14);
        }

        // Special content for known sections
        if (bs.key === "roof_overview" || bs.key === "roof") {
          drawLine("Shingle Length (in)", roofOverview.shingleLengthInches);
          drawLine("Shingle Width (in)", roofOverview.shingleWidthInches);
          drawLine("Drip Edge Present", roofOverview.dripEdgePresent);
        } else if (bs.key === "roof_damage" || bs.key === "damage") {
          // Test square table
          if (testSquares.length > 0) {
            cursorY -= 4;
            summaryPage.drawText("Test Squares:", { x: MARGIN, y: cursorY, size: 9, font: bold, color: rgb(0.18, 0.18, 0.22) });
            cursorY -= 13;
            for (const ts of testSquares) {
              if (cursorY < 80) break;
              const line = `  ${ts.slope ? ts.slope.toUpperCase() : "ANY"} slope — ${ts.hitCount ?? "?"} hits${ts.note ? ` (${ts.note})` : ""}`;
              cursorY = drawWrappedText(summaryPage, line, { x: MARGIN + 8, y: cursorY, maxWidth: contentWidth - 230, font, size: 9, lineHeight: 12, color: rgb(0.2, 0.2, 0.24) });
              cursorY -= 2;
            }
          }
        } else if ((bs.key === "interior" || bs.key === "interior_attic") && Object.keys(interiorAttic).length > 0) {
          drawLine("Interior Status", interiorAttic.interiorStatus);
          drawLine("Attic Status", interiorAttic.atticStatus);
        }
        cursorY -= 4;
      }

      // Closing notes
      const closingNotes = builderClosing?.notes?.trim() ?? "";
      if (closingNotes.length > 0) {
        if (cursorY >= 80) {
          drawHeader("Closing Notes");
          cursorY = drawWrappedText(summaryPage, closingNotes, { x: MARGIN, y: cursorY, maxWidth: contentWidth - 220, font, size: 10, lineHeight: 13 });
        }
      }
    } else {
      // ── v2 legacy section rendering ──────────────────────────────────────
      if (sections.homeowner !== false) {
        drawHeader("Homeowner");
        drawLine("Name", homeowner.homeownerName);
        drawLine("Phone", homeowner.phone);
        drawLine("Email", homeowner.email);
        cursorY -= 4;
      }

      if (sections.roofOverview !== false) {
        drawHeader("Roof Overview");
        drawLine("Shingle Length (in)", roofOverview.shingleLengthInches);
        drawLine("Shingle Width (in)", roofOverview.shingleWidthInches);
        drawLine("Drip Edge Present", roofOverview.dripEdgePresent);
        cursorY -= 4;
      }

      if (sections.interiorAttic === true) {
        drawHeader("Interior + Attic");
        drawLine("Interior Status", interiorAttic.interiorStatus);
        drawLine("Interior Skip Reason", interiorAttic.interiorSkipReason);
        drawLine("Attic Status", interiorAttic.atticStatus);
        drawLine("Attic Skip Reason", interiorAttic.atticSkipReason);
        cursorY -= 4;
      }

      // Test squares (v3 data embedded in v2 call)
      if (testSquares.length > 0) {
        drawHeader("Hail Test Squares");
        for (const ts of testSquares) {
          if (cursorY < 80) break;
          const line = `${ts.slope ? ts.slope.toUpperCase() : "ANY"} slope — ${ts.hitCount ?? "?"} strikes${ts.note ? ` · ${ts.note}` : ""}`;
          cursorY = drawWrappedText(summaryPage, line, { x: MARGIN, y: cursorY, maxWidth: contentWidth - 220, font, size: 10, lineHeight: 13, color: rgb(0.12, 0.12, 0.12) });
          cursorY -= 2;
        }
        cursorY -= 4;
      }

      const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";
      if (notes.length > 0) {
        drawHeader("Summary Notes");
        cursorY = drawWrappedText(summaryPage, notes, {
          x: MARGIN,
          y: cursorY,
          maxWidth: contentWidth - 220,
          font,
          size: 10,
          lineHeight: 13,
        });
      }
    }

    if (sections.signature !== false) {
      const signatureX = PAGE_WIDTH - MARGIN - 192;
      const signatureY = Math.max(84, cursorY - 10);
      const signatureWidth = 192;
      const signatureHeight = 118;

      summaryPage.drawRectangle({
        x: signatureX,
        y: signatureY,
        width: signatureWidth,
        height: signatureHeight,
        color: rgb(0.98, 0.98, 0.99),
        borderColor: rgb(0.84, 0.84, 0.88),
        borderWidth: 1,
      });
      summaryPage.drawText("Rep Signature", {
        x: signatureX + 10,
        y: signatureY + signatureHeight - 16,
        size: 10,
        font: bold,
        color: rgb(0.16, 0.16, 0.2),
      });

      const signatureName = toDisplay(signature.signatureRepName);
      summaryPage.drawText(`By: ${truncateToWidth(signatureName, font, 8.5, signatureWidth - 20)}`, {
        x: signatureX + 10,
        y: signatureY + 12,
        size: 8.5,
        font,
        color: rgb(0.33, 0.33, 0.33),
      });
      summaryPage.drawText(`At: ${formatDateTime(new Date())}`, {
        x: signatureX + 10,
        y: signatureY + 2,
        size: 7.5,
        font,
        color: rgb(0.42, 0.42, 0.42),
      });

      const signaturePath =
        typeof signature.signaturePath === "string" && signature.signaturePath.trim().length > 0
          ? signature.signaturePath.trim()
          : null;

      if (signaturePath) {
        const signatureDl = await supabase.storage.from("rep-signatures").download(signaturePath);
        if (!signatureDl.error && signatureDl.data) {
          const signatureBytes = new Uint8Array(await signatureDl.data.arrayBuffer());
          const signatureImage = await embedImage(doc, signatureBytes, "image/png", "signature.png");
          if (signatureImage) {
            drawImageFit(summaryPage, signatureImage, {
              x: signatureX + 8,
              y: signatureY + 26,
              width: signatureWidth - 16,
              height: signatureHeight - 44,
            });
          } else {
            summaryPage.drawText("Signature image unavailable", {
              x: signatureX + 10,
              y: signatureY + 54,
              size: 8,
              font,
              color: rgb(0.5, 0.3, 0.3),
            });
          }
        } else {
          summaryPage.drawText("Signature not found", {
            x: signatureX + 10,
            y: signatureY + 54,
            size: 8,
            font,
            color: rgb(0.5, 0.3, 0.3),
          });
          if (signatureDl.error) {
            console.warn(
              JSON.stringify({ event: "inspection_pdf_signature_download_failed", reason: signatureDl.error.message }),
            );
          }
        }
      } else {
        summaryPage.drawText("No signature selected", {
          x: signatureX + 10,
          y: signatureY + 54,
          size: 8,
          font,
          color: rgb(0.45, 0.45, 0.45),
        });
      }
    }

    const galleryRows = limitedRows;
    const unsupportedPhotos: string[] = [];

    type EmbeddedRow = { row: InspectionPhotoRow; image: PDFImage };
    const embeddedRows: EmbeddedRow[] = [];
    for (let start = 0; start < galleryRows.length; start += PHOTO_EMBED_BATCH_SIZE) {
      const batch = galleryRows.slice(start, start + PHOTO_EMBED_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (row) => {
          const dl = await supabase.storage.from("inspection-media").download(row.file_path);
          if (dl.error || !dl.data) {
            return { row, image: null as PDFImage | null, unsupported: true };
          }
          const bytes = new Uint8Array(await dl.data.arrayBuffer());
          const image = await embedImage(doc, bytes, row.content_type, row.file_name);
          return { row, image, unsupported: !image };
        }),
      );

      for (const result of batchResults) {
        if (result.unsupported || !result.image) {
          unsupportedPhotos.push(result.row.file_name);
          continue;
        }
        embeddedRows.push({ row: result.row, image: result.image });
      }
    }

    const chunkSize = 8;
    const totalGalleryPages = Math.ceil(embeddedRows.length / chunkSize);
    for (let i = 0; i < embeddedRows.length; i += chunkSize) {
      const chunk = embeddedRows.slice(i, i + chunkSize);
      const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const galleryPageIndex = i / chunkSize + 1;

      page.drawText(`Photo Gallery ${galleryPageIndex}/${Math.max(1, totalGalleryPages)}`, {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN,
        size: 14,
        font: bold,
        color: rgb(0.11, 0.19, 0.31),
      });

      const cols = 4;
      const rows = 2;
      const gapX = 10;
      const gapY = 18;
      const tileWidth = (PAGE_WIDTH - MARGIN * 2 - gapX * (cols - 1)) / cols;
      const tileHeight = 146;
      const imageHeight = 112;
      const topY = PAGE_HEIGHT - 74;

      for (let index = 0; index < chunk.length; index += 1) {
        const col = index % cols;
        const rowIndex = Math.floor(index / cols);
        if (rowIndex >= rows) break;

        const tileX = MARGIN + col * (tileWidth + gapX);
        const tileTopY = topY - rowIndex * (tileHeight + gapY);
        const tileBottomY = tileTopY - tileHeight;

        page.drawRectangle({
          x: tileX,
          y: tileBottomY,
          width: tileWidth,
          height: tileHeight,
          borderColor: rgb(0.85, 0.87, 0.9),
          borderWidth: 0.8,
          color: rgb(1, 1, 1),
        });

        const { row: photoRow, image } = chunk[index];
        drawImageFit(page, image, {
          x: tileX + 5,
          y: tileTopY - imageHeight - 5,
          width: tileWidth - 10,
          height: imageHeight,
        });

        const sectionText = truncateToWidth(sectionLabel(photoRow.capture_section), bold, 8.2, tileWidth - 10);
        page.drawText(sectionText, {
          x: tileX + 5,
          y: tileBottomY + 20,
          size: 8.2,
          font: bold,
          color: rgb(0.18, 0.18, 0.22),
        });

        const tags = extractPhotoTags(photoRow);
        const tagText = tags.length > 0 ? tags.join(" | ") : "No tags";
        page.drawText(truncateToWidth(tagText, font, 7.2, tileWidth - 10), {
          x: tileX + 5,
          y: tileBottomY + 9,
          size: 7.2,
          font,
          color: rgb(0.38, 0.38, 0.42),
        });
      }
    }

    if (unsupportedPhotos.length > 0 || omittedPhotoCount > 0) {
      const appendix = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      appendix.drawText("Photos Not Embedded", {
        x: MARGIN,
        y: PAGE_HEIGHT - MARGIN,
        size: 14,
        font: bold,
        color: rgb(0.42, 0.19, 0.16),
      });

      let y = PAGE_HEIGHT - MARGIN - 20;
      if (omittedPhotoCount > 0) {
        y = drawWrappedText(appendix, `- ${omittedPhotoCount} photo(s) omitted to keep PDF fast and uploadable.`, {
          x: MARGIN,
          y,
          maxWidth: PAGE_WIDTH - MARGIN * 2,
          font,
          size: 9,
          lineHeight: 12,
          color: rgb(0.35, 0.35, 0.35),
        });
      }
      for (const fileName of unsupportedPhotos) {
        y = drawWrappedText(appendix, `- ${fileName}`, {
          x: MARGIN,
          y,
          maxWidth: PAGE_WIDTH - MARGIN * 2,
          font,
          size: 9,
          lineHeight: 12,
          color: rgb(0.35, 0.35, 0.35),
        });
        if (y < 60) break;
      }
    }

    const pdfBytes = await doc.save({ useObjectStreams: true });
    const fileName = `inspection-report-${inspectionId}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=\"${fileName}\"`,
        "X-Report-File-Name": fileName,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate inspection PDF." },
      { status: 500 },
    );
  }
}
