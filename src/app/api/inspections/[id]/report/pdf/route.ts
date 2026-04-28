export const dynamic = "force-dynamic";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, PDFImage, StandardFonts, rgb } from "pdf-lib";
import { getRouteSupabaseClient, getRouteUserId } from "@/lib/server-supabase";
import { THEME } from "@/lib/pdf/theme";
import { createPdfContext, truncateToWidth, wrapText } from "@/lib/pdf/layout";
import { ROOF_COMPONENT_BY_KEY, ROOF_COMPONENT_GROUP_LABELS, ROOF_COMPONENT_GROUP_ORDER, ROOF_COMPONENTS } from "@/lib/roof-components";
import { collateralLabel } from "@/lib/exterior-collateral-taxonomy";
import { migrateComponentItem } from "@/types/inspection";
import type { DetachedBuilding, ExteriorCollateralItem, PersonalPropertyRoom } from "@/types/inspection";

const { page: PAGE, spacing: SP, typography: TY, colors: C } = THEME;

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
  // v2 legacy
  sections?: Record<string, unknown>;
  homeowner?: Record<string, unknown>;
  roofOverview?: Record<string, unknown>;
  interiorAttic?: Record<string, unknown>;
  signature?: Record<string, unknown>;
  notes?: unknown;
  // v3 builder
  builderSections?: Array<{
    key: string;
    title: string;
    visible: boolean;
    includePhotos: boolean;
    photoIds: string[];
  }>;
  builderCover?: { intro: string; coverPhotoId: string | null };
  builderClosing?: { notes: string };
  // Shared v3 metadata
  testSquares?: Array<{ id: string; slope: string; photoId: string | null; hitCount: number | null; note: string }>;
  sectionConditions?: Record<string, string>;
  sectionNotes?: Record<string, string>;
  componentPresence?: Record<string, unknown>;
  shingleLengthInches?: string | null;
  shingleWidthInches?: string | null;
  dripEdgePresent?: string | null;
  estimatedRoofAgeYears?: number | null;
  layerCount?: string | null;
  homeownerName?: string;
  address?: string;
  phone?: string;
  claimNumber?: string;
  insuranceCarrier?: string;
  adjuster?: string;
  inspectorName?: string;
  // v3 coverage extensions
  personalProperty?: PersonalPropertyRoom[];
  exteriorCollateral?: ExteriorCollateralItem[];
  detachedBuildings?: DetachedBuilding[];
};

const MAX_REPORT_PHOTOS = 80;
const PHOTO_EMBED_BATCH_SIZE = 6;

async function getId(context: RouteContext) {
  const resolved = await context.params;
  return resolved.id;
}

function humanSection(section: string | null) {
  const map: Record<string, string> = {
    perimeter_photos: "Perimeter", perimeter: "Perimeter",
    collateral_damage: "Collateral Damage",
    roof_overview: "Roof Overview", roof: "Roof",
    roof_damage: "Roof Damage", damage: "Roof Damage",
    interior_attic: "Interior / Attic", interior: "Interior", attic: "Attic",
    siding: "Siding", gutters: "Gutters", windows: "Windows",
    roof_damage_test_square: "Test Square",
  };
  return map[section ?? ""] ?? (section ?? "Other");
}

function sectionSortKey(section: string | null) {
  const order: Record<string, number> = {
    perimeter_photos: 0, perimeter: 0,
    collateral_damage: 1,
    roof_overview: 2, roof: 2,
    roof_damage: 3, damage: 3,
    interior_attic: 4, interior: 4, attic: 4,
    siding: 5, gutters: 6, windows: 7,
  };
  return order[section ?? ""] ?? 9;
}

function toDisplay(value: unknown) {
  if (typeof value === "string") { const t = value.trim(); return t.length > 0 ? t : "—"; }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return "—";
}

function formatDate(d = new Date()) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function extractPhotoTags(row: InspectionPhotoRow): string[] {
  const tags: string[] = [];
  if (row.damage_cause && row.damage_cause !== "none") tags.push(row.damage_cause.toUpperCase());
  for (const piece of (row.notes ?? "").split("|").map((v) => v.trim())) {
    if (!piece) continue;
    if (piece.startsWith("slope:")) { const v = piece.slice(6).trim(); if (v) tags.push(`${v} slope`); }
    else if (piece.startsWith("component:")) { const v = piece.slice(10).trim(); if (v) tags.push(ROOF_COMPONENT_BY_KEY.get(v)?.label ?? v); }
    else if (piece.startsWith("tag:")) { const v = piece.slice(4).trim(); if (v) tags.push(v); }
  }
  return Array.from(new Set(tags)).slice(0, 4);
}

function getComponentTag(row: InspectionPhotoRow): string | null {
  for (const piece of (row.notes ?? "").split("|").map((v) => v.trim())) {
    if (piece.startsWith("component:")) return piece.slice(10).trim() || null;
  }
  return null;
}

async function loadLogoBytes() {
  try {
    return new Uint8Array(await readFile(join(process.cwd(), "public", "4ELogo.png")));
  } catch { return null; }
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array, contentType: string | null, fileName: string): Promise<PDFImage | null> {
  const isPng = (contentType ?? "").toLowerCase().includes("png") || fileName.toLowerCase().endsWith(".png");
  const attempts = isPng
    ? [() => doc.embedPng(bytes), () => doc.embedJpg(bytes)]
    : [() => doc.embedJpg(bytes), () => doc.embedPng(bytes)];
  for (const attempt of attempts) {
    try { return await attempt(); } catch { continue; }
  }
  console.warn(JSON.stringify({ event: "pdf_image_embed_failed", file: fileName }));
  return null;
}

function fitImage(image: PDFImage, maxW: number, maxH: number) {
  const s = image.scale(1);
  const ratio = Math.min(maxW / s.width, maxH / s.height, 1);
  return { width: s.width * ratio, height: s.height * ratio };
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

    const payload = (body.payload ?? {}) as ReportPayload;
    const sections = (payload.sections ?? {}) as Record<string, unknown>;
    const homeowner = (payload.homeowner ?? {}) as Record<string, unknown>;
    const roofOverview = (payload.roofOverview ?? {}) as Record<string, unknown>;
    const interiorAttic = (payload.interiorAttic ?? {}) as Record<string, unknown>;
    const signature = (payload.signature ?? {}) as Record<string, unknown>;

    const builderSections = Array.isArray(payload.builderSections) ? payload.builderSections : null;
    const builderCover = payload.builderCover ?? null;
    const builderClosing = payload.builderClosing ?? null;
    const testSquares = Array.isArray(payload.testSquares) ? payload.testSquares : [];
    const sectionConditions = payload.sectionConditions ?? {};
    const sectionNotes = payload.sectionNotes ?? {};
    const componentPresence = payload.componentPresence ?? {};
    const selectedPhotoIds = Array.isArray(body.selectedPhotoIds)
      ? body.selectedPhotoIds.filter((id): id is string => typeof id === "string")
      : [];

    const title = (body.title || "Inspection Report").trim() || "Inspection Report";
    const reportDate = formatDate();
    const homeownerName = toDisplay(payload.homeownerName ?? homeowner.homeownerName);
    const address = toDisplay(payload.address ?? homeowner.address);
    const claimNumber = toDisplay(payload.claimNumber ?? homeowner.claimNumber);
    const insuranceCarrier = toDisplay(payload.insuranceCarrier ?? homeowner.insuranceCarrier);

    const supabase = getRouteSupabaseClient(request);

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
    for (const row of (photoRows ?? []) as InspectionPhotoRow[]) rowMap.set(row.id, row);

    let orderedRows: InspectionPhotoRow[];
    if (builderSections) {
      orderedRows = builderSections
        .filter((s) => s.visible && s.includePhotos)
        .flatMap((s) => s.photoIds.map((id) => rowMap.get(id)).filter((r): r is InspectionPhotoRow => Boolean(r)));
    } else {
      orderedRows = selectedPhotoIds
        .map((id) => rowMap.get(id))
        .filter((r): r is InspectionPhotoRow => Boolean(r))
        .sort((a, b) => sectionSortKey(a.capture_section) - sectionSortKey(b.capture_section));
    }
    const limitedRows = orderedRows.slice(0, MAX_REPORT_PHOTOS);
    const omittedCount = Math.max(0, orderedRows.length - limitedRows.length);

    // ── Document setup ─────────────────────────────────────────────────────────
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const logoBytes = await loadLogoBytes();

    // Pre-embed logo
    let logoImage: PDFImage | null = null;
    if (logoBytes) logoImage = await embedImage(doc, logoBytes, "image/png", "4ELogo.png");

    // ── COVER PAGE ─────────────────────────────────────────────────────────────
    {
      const coverPage = doc.addPage([PAGE.width, PAGE.height]);

      // Find cover photo
      let coverPhotoImage: PDFImage | null = null;
      const coverPhotoId = builderCover?.coverPhotoId ?? null;
      if (coverPhotoId) {
        const coverRow = rowMap.get(coverPhotoId);
        if (coverRow) {
          const dl = await supabase.storage.from("inspection-media").download(coverRow.file_path);
          if (!dl.error && dl.data) {
            const bytes = new Uint8Array(await dl.data.arrayBuffer());
            coverPhotoImage = await embedImage(doc, bytes, coverRow.content_type, coverRow.file_name);
          }
        }
      }

      if (coverPhotoImage) {
        // Full-bleed photo
        const { width: w, height: h } = fitImage(coverPhotoImage, PAGE.width, PAGE.height);
        const px = (PAGE.width - w) / 2;
        const py = (PAGE.height - h) / 2;
        coverPage.drawImage(coverPhotoImage, { x: px, y: py, width: w, height: h });
        // Dark gradient overlay — stacked translucent rects
        for (let i = 0; i < 6; i++) {
          const opacity = 0.08 + i * 0.06;
          coverPage.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: 260 + i * 10, color: rgb(0.05, 0.10, 0.20), opacity });
        }
      } else {
        // Brand solid background
        coverPage.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: C.brandBlueDark });
        // Diagonal accent stripe
        coverPage.drawLine({ start: { x: 0, y: 220 }, end: { x: PAGE.width, y: 320 }, thickness: 80, color: C.brandBlue, opacity: 0.5 });
        coverPage.drawLine({ start: { x: 0, y: 160 }, end: { x: PAGE.width, y: 260 }, thickness: 2, color: C.accent, opacity: 0.6 });
      }

      // Bottom brand panel
      coverPage.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: 220, color: rgb(0.06, 0.12, 0.24), opacity: 0.94 });

      // Accent rule
      coverPage.drawRectangle({ x: SP.margin, y: 185, width: 48, height: 3, color: C.accent });

      // Title
      const titleLines = wrapText(title, bold, TY.display, PAGE.width - SP.margin * 2);
      let ty2 = 178;
      for (const line of titleLines) {
        coverPage.drawText(line, { x: SP.margin, y: ty2, size: TY.display, font: bold, color: C.white });
        ty2 -= TY.display + 6;
      }

      // Address
      if (address !== "—") {
        coverPage.drawText(truncateToWidth(address, font, TY.h3, PAGE.width - SP.margin * 2), {
          x: SP.margin, y: ty2 - 4, size: TY.h3, font, color: C.accent,
        });
        ty2 -= 20;
      }

      // Date + ID
      coverPage.drawText(`${reportDate}  ·  ID: ${inspectionId.slice(0, 8).toUpperCase()}`, {
        x: SP.margin, y: ty2 - 4, size: TY.bodySmall, font, color: rgb(0.6, 0.72, 0.88),
      });

      // Logo top-right
      if (logoImage) {
        const lw = 100; const lh = 50;
        const { width: lfw, height: lfh } = fitImage(logoImage, lw, lh);
        coverPage.drawImage(logoImage, { x: PAGE.width - SP.margin - lfw, y: PAGE.height - 14 - lfh, width: lfw, height: lfh });
      }

      // Company name top-left
      coverPage.drawText("4 ELEMENTS RENOVATIONS", {
        x: SP.margin, y: PAGE.height - 28, size: TY.bodySmall, font: bold, color: rgb(0.75, 0.86, 0.98),
      });

      // Intro text if builder
      if (builderCover?.intro?.trim()) {
        const introLines = wrapText(builderCover.intro, font, TY.bodySmall, PAGE.width - SP.margin * 2);
        let iy = 22;
        for (const line of introLines.slice(0, 3)) {
          coverPage.drawText(line, { x: SP.margin, y: iy, size: TY.bodySmall, font, color: rgb(0.6, 0.72, 0.88) });
          iy -= 12;
        }
      }
    }

    // ── Create layout context (starts on page 2 = summary) ─────────────────────
    const ctx = createPdfContext({ doc, font, bold, logoBytes, title });

    // ── SUMMARY PAGE ───────────────────────────────────────────────────────────
    {
      // Title block
      ctx.page.drawRectangle({ x: SP.margin, y: ctx.y - 48, width: PAGE.width - SP.margin * 2, height: 52, color: C.surface, borderColor: C.divider, borderWidth: 0.6 });
      if (logoImage) {
        const { width: lw, height: lh } = fitImage(logoImage, 80, 38);
        ctx.page.drawImage(logoImage, { x: PAGE.width - SP.margin - lw - 8, y: ctx.y - 44, width: lw, height: lh });
      }
      ctx.page.drawText(title, { x: SP.margin + 12, y: ctx.y - 18, size: TY.h1, font: bold, color: C.brandBlue });
      ctx.page.drawText(`Inspection ID: ${inspectionId}  ·  ${reportDate}`, { x: SP.margin + 12, y: ctx.y - 34, size: TY.caption, font, color: C.muted });
      ctx.y -= 64;

      const half = (PAGE.width - SP.margin * 2 - 12) / 2;

      // Left column: homeowner + claim info
      const leftX = SP.margin;
      const leftY = ctx.y;

      ctx.sectionRule("Property & Claim");
      ctx.labelValue("Homeowner", homeownerName);
      ctx.labelValue("Address", address);
      ctx.labelValue("Phone", toDisplay(payload.phone ?? homeowner.phone));
      ctx.labelValue("Claim #", claimNumber);
      ctx.labelValue("Insurance", insuranceCarrier);
      ctx.labelValue("Adjuster", toDisplay(payload.adjuster ?? homeowner.adjuster));
      ctx.labelValue("Inspector", toDisplay(payload.inspectorName ?? homeowner.inspectorName));

      const afterLeft = ctx.y;
      ctx.y = leftY; // Reset to render right column in parallel

      // Right column: section conditions matrix
      const rightX = leftX + half + 12;
      const condSections: Array<[string, string]> = [
        ["roof", "Roof"],
        ["siding", "Siding"],
        ["gutters", "Gutters"],
        ["windows", "Windows"],
        ["interior", "Interior"],
        ["attic", "Attic"],
        ["perimeter", "Perimeter"],
      ];

      ctx.page.drawText("SECTION CONDITIONS", {
        x: rightX, y: ctx.y - 2, size: TY.caption, font: bold, color: C.muted,
      });
      ctx.page.drawLine({ start: { x: rightX, y: ctx.y - 6 }, end: { x: rightX + half, y: ctx.y - 6 }, thickness: 0.5, color: C.divider });
      let condY = ctx.y - 20;
      for (const [key, label] of condSections) {
        const cond = sectionConditions[key];
        ctx.page.drawText(label, { x: rightX, y: condY, size: TY.bodySmall, font, color: C.body });
        if (cond) {
          ctx.conditionBadge(cond, rightX + 80, condY);
        } else {
          ctx.page.drawText("—", { x: rightX + 80, y: condY, size: TY.bodySmall, font, color: C.light });
        }
        condY -= SP.lineSmall + 2;
      }

      ctx.y = Math.min(afterLeft, condY) - 8;
    }

    // ── ROOF SUMMARY ───────────────────────────────────────────────────────────
    {
      ctx.sectionRule("Roof Overview");
      const shingleL = toDisplay(payload.shingleLengthInches ?? (roofOverview.shingleLengthInches));
      const shingleW = toDisplay(payload.shingleWidthInches ?? (roofOverview.shingleWidthInches));
      ctx.labelValue("Shingle Dimensions", shingleL !== "—" && shingleW !== "—" ? `${shingleL}" × ${shingleW}"` : "—");
      ctx.labelValue("Estimated Age", payload.estimatedRoofAgeYears != null ? `${payload.estimatedRoofAgeYears} yrs` : toDisplay(roofOverview.estimatedRoofAgeYears));
      ctx.labelValue("Layer Count", toDisplay(payload.layerCount ?? roofOverview.layerCount));
      ctx.labelValue("Drip Edge", toDisplay(payload.dripEdgePresent ?? roofOverview.dripEdgePresent));

      if (testSquares.length > 0) {
        ctx.spacer(4);
        ctx.subheading("Test Squares");
        ctx.table({
          columns: [
            { header: "Slope", width: 80 },
            { header: "Hit Count", width: 80 },
            { header: "Note", width: PAGE.width - SP.margin * 2 - 160 },
          ],
          rows: testSquares.map((ts) => [
            ts.slope ? ts.slope.charAt(0).toUpperCase() + ts.slope.slice(1) : "Any",
            ts.hitCount != null ? String(ts.hitCount) : "—",
            ts.note || "—",
          ]),
        });
      }
    }

    // ── ROOF COMPONENTS PAGE ───────────────────────────────────────────────────
    {
      const notedKeys = Object.entries(componentPresence)
        .map(([key, raw]) => ({
          key,
          item: migrateComponentItem(raw as Record<string, unknown>),
        }))
        .filter(({ item }) => item.status === "present");

      if (notedKeys.length > 0) {
        ctx.addPage();
        ctx.heading("Roof Components", TY.h1);
        ctx.spacer(4);

        for (const group of ROOF_COMPONENT_GROUP_ORDER) {
          const groupItems = notedKeys.filter(({ key }) => ROOF_COMPONENT_BY_KEY.get(key)?.group === group);
          if (groupItems.length === 0) continue;

          ctx.sectionRule(ROOF_COMPONENT_GROUP_LABELS[group]);
          ctx.table({
            columns: [
              { header: "Component", width: 180 },
              { header: "Qty", width: 60 },
              { header: "Condition", width: 80 },
              { header: "Note", width: PAGE.width - SP.margin * 2 - 320 },
            ],
            rows: groupItems.map(({ key, item }) => {
              const def = ROOF_COMPONENT_BY_KEY.get(key);
              const label = def?.label ?? key.replace(/_/g, " ");
              const qty = item.quantity != null ? `${item.quantity}${def?.qtyUnit ? ` ${def.qtyUnit}` : ""}` : "—";
              const cond = item.condition ? item.condition.charAt(0).toUpperCase() + item.condition.slice(1) : "—";
              return [label, qty, cond, item.note?.trim() || "—"];
            }),
          });
        }
      }
    }

    // ── SECTION DETAIL PAGES ───────────────────────────────────────────────────
    const hubSections: Array<[string, string]> = [
      ["roof", "Roof"], ["siding", "Siding"], ["gutters", "Gutters"],
      ["windows", "Windows"], ["interior", "Interior"], ["attic", "Attic"], ["perimeter", "Perimeter"],
    ];

    const hasAnySection = hubSections.some(([key]) => sectionConditions[key] || sectionNotes[key]);
    if (hasAnySection) {
      ctx.addPage();
      ctx.heading("Section Details", TY.h1);
      for (const [key, label] of hubSections) {
        const cond = sectionConditions[key];
        const note = sectionNotes[key]?.trim();
        if (!cond && !note) continue;

        ctx.ensureSpace(50);
        ctx.spacer(6);
        // Section name + condition badge inline
        ctx.page.drawText(label, { x: SP.margin, y: ctx.y, size: TY.h2, font: bold, color: C.brandBlue });
        if (cond) {
          const bw = ctx.conditionBadge(cond, SP.margin + bold.widthOfTextAtSize(label, TY.h2) + 10, ctx.y);
          void bw;
        }
        ctx.y -= TY.h2 + 6;
        ctx.page.drawLine({ start: { x: SP.margin, y: ctx.y }, end: { x: PAGE.width - SP.margin, y: ctx.y }, thickness: 0.4, color: C.divider });
        ctx.y -= 8;
        if (note) {
          ctx.paragraph(note);
        }
        ctx.spacer(4);
      }
    }

    // Closing notes
    const closingNotes = builderClosing?.notes?.trim() ?? (typeof payload.notes === "string" ? payload.notes.trim() : "");
    if (closingNotes) {
      ctx.ensureSpace(40);
      ctx.sectionRule("Closing Notes");
      ctx.paragraph(closingNotes);
    }

    // ── SIGNATURE ─────────────────────────────────────────────────────────────
    {
      const signaturePath =
        typeof signature.signaturePath === "string" && signature.signaturePath.trim()
          ? signature.signaturePath.trim()
          : null;
      const signatureRepName = toDisplay(signature.signatureRepName);

      if (signaturePath || signatureRepName !== "—") {
        ctx.ensureSpace(140);
        const sigX = PAGE.width - SP.margin - 192;
        const sigY = ctx.y - 120;
        ctx.page.drawRectangle({ x: sigX, y: sigY, width: 192, height: 120, color: C.surface, borderColor: C.divider, borderWidth: 0.6 });
        ctx.page.drawText("Inspector Signature", { x: sigX + 10, y: sigY + 108, size: TY.bodySmall, font: bold, color: C.brandBlue });
        ctx.page.drawText(`By: ${truncateToWidth(signatureRepName, font, TY.caption, 172)}`, { x: sigX + 10, y: sigY + 14, size: TY.caption, font, color: C.muted });
        ctx.page.drawText(`Date: ${reportDate}`, { x: sigX + 10, y: sigY + 5, size: TY.caption, font, color: C.muted });

        if (signaturePath) {
          const dl = await supabase.storage.from("rep-signatures").download(signaturePath);
          if (!dl.error && dl.data) {
            const bytes = new Uint8Array(await dl.data.arrayBuffer());
            const img = await embedImage(doc, bytes, "image/png", "signature.png");
            if (img) {
              const { width: w, height: h } = fitImage(img, 172, 76);
              ctx.page.drawImage(img, { x: sigX + (192 - w) / 2, y: sigY + 26, width: w, height: h });
            }
          }
        } else {
          ctx.page.drawText("(no signature captured)", { x: sigX + 10, y: sigY + 60, size: TY.caption, font, color: C.light });
        }
        ctx.y -= 134;
      }
    }

    // ── PERSONAL PROPERTY ─────────────────────────────────────────────────────
    const personalProperty = Array.isArray(payload.personalProperty) ? payload.personalProperty : [];
    const documentedPPRooms = personalProperty.filter((r) => r && (Array.isArray(r.photoIds) ? r.photoIds.length > 0 : false) || (r?.note ?? "").trim().length > 0);
    if (documentedPPRooms.length > 0) {
      ctx.addPage();
      ctx.sectionRule("Personal Property");
      ctx.paragraph("Damaged contents flagged by room. Photos and damage causes are recorded for each room below.");
      ctx.spacer(8);

      const PP_LABELS: Record<string, string> = {
        living_room: "Living Room",
        dining_room: "Dining Room",
        kitchen: "Kitchen",
        master_bedroom: "Master Bedroom",
        bedroom_2: "Bedroom 2",
        bedroom_3: "Bedroom 3",
        bathroom: "Bathroom",
        office: "Office",
        basement: "Basement",
      };

      for (const room of documentedPPRooms) {
        const label = room.key.startsWith("custom:") ? (room.customLabel || "Custom Room") : (PP_LABELS[room.key] ?? room.key);
        ctx.ensureSpace(40);
        ctx.heading(label, TY.h2);
        if (room.damageCause && room.damageCause !== "none") {
          ctx.labelValue("Damage Cause", room.damageCause.charAt(0).toUpperCase() + room.damageCause.slice(1));
        }
        ctx.labelValue("Photos", String((room.photoIds ?? []).length));
        if ((room.note ?? "").trim()) {
          ctx.spacer(4);
          ctx.paragraph(room.note.trim());
        }
        ctx.spacer(10);
      }
    }

    // ── EXTERIOR COLLATERAL ───────────────────────────────────────────────────
    const exteriorCollateral = Array.isArray(payload.exteriorCollateral) ? payload.exteriorCollateral : [];
    if (exteriorCollateral.length > 0) {
      ctx.addPage();
      ctx.sectionRule("Exterior Collateral");
      ctx.paragraph("Items outside the home damaged or affected by the storm event. Each line item is itemized for the carrier.");
      ctx.spacer(8);

      ctx.table({
        columns: [
          { header: "Type", width: 180 },
          { header: "Condition", width: 90 },
          { header: "Cause", width: 80 },
          { header: "Photos", width: 50 },
        ],
        rows: exteriorCollateral.map((it) => [
          collateralLabel(it.type, it.customTypeLabel) || "—",
          it.condition ? it.condition.charAt(0).toUpperCase() + it.condition.slice(1) : "—",
          it.damageCause && it.damageCause !== "none" ? it.damageCause : "—",
          String((it.photoIds ?? []).length),
        ]),
      });
      ctx.spacer(10);

      // Per-item detail blocks for items with notes
      const itemsWithDetail = exteriorCollateral.filter((it) => (it.note ?? "").trim());
      if (itemsWithDetail.length > 0) {
        ctx.subheading("Notes");
        for (const it of itemsWithDetail) {
          ctx.ensureSpace(30);
          ctx.heading(collateralLabel(it.type, it.customTypeLabel), TY.h3);
          if (it.note) ctx.paragraph(it.note.trim());
          ctx.spacer(6);
        }
      }
    }

    // ── DETACHED STRUCTURES ───────────────────────────────────────────────────
    const detachedBuildings = Array.isArray(payload.detachedBuildings) ? payload.detachedBuildings : [];
    const submittedBuildings = detachedBuildings.filter((b) => b && b.submitted);
    for (const b of submittedBuildings) {
      const title = b.label === "other" && b.customLabel ? b.customLabel : b.label.charAt(0).toUpperCase() + b.label.slice(1);
      const sectionEntries = Object.entries(b.sections ?? {}).filter(([, s]) => s?.condition || (s?.note ?? "").trim());
      const ppRooms = (b.personalProperty ?? []).filter((r) => (r.photoIds ?? []).length > 0 || (r.note ?? "").trim());
      const ecItems = b.exteriorCollateral ?? [];
      if (sectionEntries.length === 0 && ppRooms.length === 0 && ecItems.length === 0) continue;

      ctx.addPage();
      ctx.sectionRule(`Detached: ${title}`);
      ctx.labelValue("Type", b.label.toUpperCase());
      if (b.completedAt) ctx.labelValue("Status", "Completed");
      ctx.labelValue("Photos", String((b.photoIds ?? []).length));
      ctx.spacer(10);

      const SECTION_LABELS: Record<string, string> = {
        roof: "Roof", siding: "Siding", gutters: "Gutters", windows: "Windows",
        interior: "Interior", attic: "Attic", perimeter: "Perimeter",
      };

      for (const [key, st] of sectionEntries) {
        ctx.ensureSpace(30);
        ctx.heading(SECTION_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1), TY.h3);
        if (st?.condition) {
          const w = ctx.conditionBadge(st.condition, SP.margin, ctx.y);
          ctx.spacer(16);
        }
        if ((st?.note ?? "").trim()) {
          ctx.paragraph(st.note.trim());
        }
        ctx.spacer(6);
      }

      if (ppRooms.length > 0) {
        ctx.ensureSpace(24);
        ctx.subheading("Contents");
        for (const r of ppRooms) {
          const lbl = r.key.startsWith("custom:") ? (r.customLabel || "Custom") : r.key.replace(/_/g, " ");
          ctx.paragraph(`• ${lbl}${(r.note ?? "").trim() ? ` — ${r.note.trim()}` : ""}`);
        }
        ctx.spacer(6);
      }

      if (ecItems.length > 0) {
        ctx.ensureSpace(24);
        ctx.subheading("Collateral Items");
        for (const it of ecItems) {
          const lbl = collateralLabel(it.type, it.customTypeLabel);
          const cond = it.condition ? ` (${it.condition})` : "";
          ctx.paragraph(`• ${lbl}${cond}${(it.note ?? "").trim() ? ` — ${it.note.trim()}` : ""}`);
        }
        ctx.spacer(6);
      }
    }

    // ── PHOTO GALLERY ─────────────────────────────────────────────────────────
    const photoFailures: string[] = [];
    if (limitedRows.length > 0) {
      const unsupportedPhotos: string[] = [];
      type EmbeddedRow = { row: InspectionPhotoRow; image: PDFImage | null };
      const embeddedRows: EmbeddedRow[] = [];

      for (let start = 0; start < limitedRows.length; start += PHOTO_EMBED_BATCH_SIZE) {
        const batch = limitedRows.slice(start, start + PHOTO_EMBED_BATCH_SIZE);
        const results = await Promise.all(batch.map(async (row) => {
          const dl = await supabase.storage.from("inspection-media").download(row.file_path);
          if (dl.error || !dl.data) {
            console.warn(JSON.stringify({ event: "pdf_photo_download_failed", file: row.file_name, error: dl.error?.message }));
            photoFailures.push(row.file_name);
            return { row, image: null };
          }
          const bytes = new Uint8Array(await dl.data.arrayBuffer());
          const image = await embedImage(doc, bytes, row.content_type, row.file_name);
          if (!image) {
            unsupportedPhotos.push(row.file_name);
            photoFailures.push(row.file_name);
          }
          return { row, image };
        }));
        embeddedRows.push(...results);
      }

      // 2-column, 3-row grid = 6 photos per page
      const COLS = 2;
      const ROWS = 3;
      const PER_PAGE = COLS * ROWS;
      const GAP_X = 12;
      const GAP_Y = 10;
      const tileW = (PAGE.width - SP.margin * 2 - GAP_X * (COLS - 1)) / COLS;
      const IMG_H = 156;
      const CAP_H = 28;
      const TILE_H = IMG_H + CAP_H + 4;
      const TOP_Y = PAGE.height - SP.margin - 24;

      const totalGalleryPages = Math.ceil(embeddedRows.length / PER_PAGE);

      for (let pi = 0; pi < embeddedRows.length; pi += PER_PAGE) {
        const chunk = embeddedRows.slice(pi, pi + PER_PAGE);
        const galleryPage = doc.addPage([PAGE.width, PAGE.height]);

        // Page chrome
        galleryPage.drawRectangle({ x: 0, y: PAGE.height - 28, width: PAGE.width, height: 28, color: C.brandBlue });
        galleryPage.drawText("4 Elements Renovations", { x: SP.margin, y: PAGE.height - 19, size: TY.bodySmall, font: bold, color: C.white });
        const gpLabel = `Photo Gallery · ${pi / PER_PAGE + 1} of ${Math.max(1, totalGalleryPages)}`;
        const gpw = font.widthOfTextAtSize(gpLabel, TY.caption);
        galleryPage.drawText(gpLabel, { x: PAGE.width - SP.margin - gpw, y: PAGE.height - 19, size: TY.caption, font, color: rgb(0.75, 0.86, 0.98) });
        galleryPage.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: 22, color: C.brandBlueDark });
        galleryPage.drawText("4 Elements Renovations · Inspection Report", { x: SP.margin, y: 7, size: TY.micro, font, color: rgb(0.6, 0.72, 0.88) });

        for (let i = 0; i < chunk.length; i++) {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          if (row >= ROWS) break;

          const tileX = SP.margin + col * (tileW + GAP_X);
          const tileTopY = TOP_Y - row * (TILE_H + GAP_Y);

          galleryPage.drawRectangle({ x: tileX, y: tileTopY - TILE_H, width: tileW, height: TILE_H, color: C.white, borderColor: C.divider, borderWidth: 0.6 });

          const { row: photoRow, image } = chunk[i];

          if (image) {
            const { width: iw, height: ih } = fitImage(image, tileW - 4, IMG_H - 4);
            const ix = tileX + (tileW - iw) / 2;
            galleryPage.drawImage(image, { x: ix, y: tileTopY - 2 - ih, width: iw, height: ih });
          } else {
            galleryPage.drawRectangle({ x: tileX + 2, y: tileTopY - IMG_H - 2, width: tileW - 4, height: IMG_H - 4, color: C.surface });
            galleryPage.drawText("Photo unavailable", { x: tileX + 8, y: tileTopY - IMG_H / 2 - 6, size: TY.caption, font, color: C.muted });
          }

          // Caption area
          const captionY = tileTopY - IMG_H - 4;
          galleryPage.drawRectangle({ x: tileX, y: captionY - CAP_H, width: tileW, height: CAP_H, color: C.surface });
          const sectionText = truncateToWidth(humanSection(photoRow.capture_section), bold, TY.caption, tileW - 8);
          galleryPage.drawText(sectionText, { x: tileX + 4, y: captionY - 11, size: TY.caption, font: bold, color: C.brandBlue });
          const tags = extractPhotoTags(photoRow);
          const tagText = tags.length > 0 ? tags.join(" · ") : "";
          if (tagText) {
            galleryPage.drawText(truncateToWidth(tagText, font, TY.micro, tileW - 8), { x: tileX + 4, y: captionY - 22, size: TY.micro, font, color: C.muted });
          }
        }
      }

      // Omitted / unavailable notice
      if (unsupportedPhotos.length > 0 || omittedCount > 0) {
        const notePage = doc.addPage([PAGE.width, PAGE.height]);
        notePage.drawRectangle({ x: 0, y: PAGE.height - 28, width: PAGE.width, height: 28, color: C.brandBlue });
        notePage.drawText("Photo Notes", { x: SP.margin, y: PAGE.height - 19, size: TY.bodySmall, font: bold, color: C.white });
        let ny = PAGE.height - SP.margin - 24;
        if (omittedCount > 0) {
          notePage.drawText(`${omittedCount} photo(s) omitted — PDF capped at ${MAX_REPORT_PHOTOS} for file size.`, { x: SP.margin, y: ny, size: TY.body, font, color: C.body });
          ny -= SP.lineBody;
        }
        for (const fname of unsupportedPhotos.slice(0, 40)) {
          notePage.drawText(`• ${fname} — could not be embedded`, { x: SP.margin, y: ny, size: TY.bodySmall, font, color: C.muted });
          ny -= SP.lineSmall;
          if (ny < 40) break;
        }
      }
    }

    const pdfBytes = await doc.save({ useObjectStreams: true });
    const fileName = `inspection-report-${inspectionId}.pdf`;

    const responseHeaders: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "X-Report-File-Name": fileName,
    };
    if (photoFailures.length > 0) {
      // Cap the header value at a reasonable size (~1.5KB) to avoid header limits.
      const joined = photoFailures.slice(0, 40).join(",");
      responseHeaders["X-Report-Photo-Failures"] = joined;
    }
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      route: "/api/inspections/[id]/report/pdf",
      message: error instanceof Error ? error.message : String(error),
    }));
    return NextResponse.json({ error: "Failed to generate report PDF." }, { status: 500 });
  }
}
