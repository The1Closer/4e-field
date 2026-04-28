import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import { THEME } from "./theme";

const { page: PAGE, spacing: SP, typography: TY, colors: C } = THEME;

// ── Text helpers ───────────────────────────────────────────────────────────────

export function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number) {
  const clean = text.trim();
  if (!clean) return "";
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let left = 0;
  let right = clean.length;
  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    const candidate = `${clean.slice(0, mid)}…`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) left = mid;
    else right = mid - 1;
  }
  return `${clean.slice(0, Math.max(1, left))}…`;
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ── PDF Context ────────────────────────────────────────────────────────────────

type CtxOptions = {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  logoBytes: Uint8Array | null;
  title: string;
};

export function createPdfContext(opts: CtxOptions) {
  const { doc, font, bold } = opts;
  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - SP.margin;
  let pageNum = 1;
  const totalPagesRef = { value: 0 };

  function addPage() {
    page = doc.addPage([PAGE.width, PAGE.height]);
    pageNum += 1;
    y = PAGE.height - SP.margin;
    drawPageChrome();
    y -= 8;
    return page;
  }

  function currentPage() {
    return page;
  }

  function drawPageChrome() {
    // Top bar
    page.drawRectangle({ x: 0, y: PAGE.height - 28, width: PAGE.width, height: 28, color: C.brandBlue });
    page.drawText("4 Elements Renovations", {
      x: SP.margin, y: PAGE.height - 19, size: TY.bodySmall, font: bold, color: C.white,
    });
    page.drawText(truncateToWidth(opts.title, font, TY.caption, PAGE.width - SP.margin * 2 - 140), {
      x: SP.margin + 165, y: PAGE.height - 19, size: TY.caption, font, color: rgb(0.75, 0.86, 0.98),
    });
    // Page number placeholder — we write "Page X" in place
    const pageLabel = `Page ${pageNum}`;
    const pw = font.widthOfTextAtSize(pageLabel, TY.caption);
    page.drawText(pageLabel, { x: PAGE.width - SP.margin - pw, y: PAGE.height - 19, size: TY.caption, font, color: rgb(0.75, 0.86, 0.98) });

    // Bottom bar
    page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: 22, color: C.brandBlueDark });
    page.drawText("4 Elements Renovations · Inspection Report", {
      x: SP.margin, y: 7, size: TY.micro, font, color: rgb(0.6, 0.72, 0.88),
    });
  }

  function ensureSpace(needed: number) {
    if (y - needed < 32) {
      addPage();
    }
  }

  function spacer(amount: number) {
    y -= amount;
  }

  function sectionRule(label: string) {
    ensureSpace(28);
    page.drawRectangle({ x: SP.margin, y: y - 2, width: 3, height: 16, color: C.accent });
    page.drawText(label.toUpperCase(), {
      x: SP.margin + 10, y, size: TY.h3, font: bold, color: C.brandBlue,
    });
    page.drawLine({ start: { x: SP.margin + 10, y: y - 4 }, end: { x: PAGE.width - SP.margin, y: y - 4 }, thickness: 0.5, color: C.divider });
    y -= SP.sectionGap;
  }

  function heading(label: string, size: number = TY.h2) {
    ensureSpace(24);
    page.drawText(label, { x: SP.margin, y, size, font: bold, color: C.ink });
    y -= size + 6;
  }

  function subheading(label: string) {
    ensureSpace(18);
    page.drawText(label, { x: SP.margin, y, size: TY.bodySmall, font: bold, color: C.muted });
    y -= TY.bodySmall + 4;
  }

  function paragraph(text: string, indentX = 0, maxW?: number) {
    if (!text.trim()) return;
    const lines = wrapText(text, font, TY.body, (maxW ?? PAGE.width - SP.margin * 2) - indentX);
    for (const line of lines) {
      ensureSpace(SP.lineBody);
      page.drawText(line, { x: SP.margin + indentX, y, size: TY.body, font, color: C.body });
      y -= SP.lineBody;
    }
  }

  function labelValue(label: string, value: string, x = SP.margin, colWidth = PAGE.width - SP.margin * 2) {
    ensureSpace(SP.lineBody);
    page.drawText(`${label}:`, { x, y, size: TY.bodySmall, font: bold, color: C.muted });
    const lw = bold.widthOfTextAtSize(`${label}: `, TY.bodySmall);
    const truncated = truncateToWidth(value || "—", font, TY.bodySmall, colWidth - lw);
    page.drawText(truncated, { x: x + lw, y, size: TY.bodySmall, font, color: C.body });
    y -= SP.lineSmall;
  }

  function conditionBadge(condition: string, bx: number, by: number) {
    const styles: Record<string, [ReturnType<typeof rgb>, string]> = {
      good:        [C.good, "GOOD"],
      damaged:     [C.poor, "DAMAGED"],
      missing:     [C.fair, "MISSING"],
      not_visible: [C.unknown, "N/V"],
      present:     [C.good, "PRESENT"],
      absent:      [C.poor, "ABSENT"],
      fair:        [C.fair, "FAIR"],
      poor:        [C.poor, "POOR"],
    };
    const [color, label] = styles[condition] ?? [C.unknown, condition.toUpperCase()];
    const w = Math.max(44, bold.widthOfTextAtSize(label, TY.micro) + 8);
    page.drawRectangle({ x: bx, y: by - 2, width: w, height: 13, color });
    page.drawText(label, { x: bx + 4, y: by + 1, size: TY.micro, font: bold, color: C.white });
    return w;
  }

  function card(drawFn: () => void, bgColor = C.surface) {
    const startY = y + 4;
    drawFn();
    const endY = y - 4;
    const h = startY - endY;
    // We can't go back and fill bg after drawing text, so draw bg on new page only
    // Use a subtle rule instead
    page.drawLine({ start: { x: SP.margin, y: endY }, end: { x: PAGE.width - SP.margin, y: endY }, thickness: 0.5, color: C.divider });
    y -= 4;
  }

  function drawCardBackground(startY: number, endY: number, bgColor = C.surface) {
    const h = startY - endY;
    if (h > 0) {
      page.drawRectangle({
        x: SP.margin - SP.cardPad,
        y: endY,
        width: PAGE.width - SP.margin * 2 + SP.cardPad * 2,
        height: h,
        color: bgColor,
        borderColor: C.divider,
        borderWidth: 0.6,
      });
    }
  }

  function table(opts: {
    columns: Array<{ header: string; width: number }>;
    rows: Array<Array<string | null>>;
    x?: number;
    striped?: boolean;
  }) {
    const tableX = opts.x ?? SP.margin;
    const colWidths = opts.columns.map((c) => c.width);
    const rowHeight = SP.lineBody + 2;

    // Header
    ensureSpace(rowHeight + 4);
    let cx = tableX;
    page.drawRectangle({ x: tableX, y: y - 4, width: colWidths.reduce((a, b) => a + b, 0), height: rowHeight, color: C.brandBlue });
    for (let ci = 0; ci < opts.columns.length; ci++) {
      page.drawText(opts.columns[ci].header, {
        x: cx + 4, y: y - 1, size: TY.caption, font: bold, color: C.white,
      });
      cx += colWidths[ci];
    }
    y -= rowHeight;

    // Rows
    for (let ri = 0; ri < opts.rows.length; ri++) {
      ensureSpace(rowHeight + 2);
      const rowData = opts.rows[ri];
      const stripe = opts.striped !== false && ri % 2 === 1;
      const totalW = colWidths.reduce((a, b) => a + b, 0);
      if (stripe) {
        page.drawRectangle({ x: tableX, y: y - 4, width: totalW, height: rowHeight, color: C.tableStripe });
      }
      cx = tableX;
      for (let ci = 0; ci < opts.columns.length; ci++) {
        const cell = rowData[ci] ?? "—";
        const truncated = truncateToWidth(cell, font, TY.bodySmall, colWidths[ci] - 8);
        page.drawText(truncated, { x: cx + 4, y: y - 1, size: TY.bodySmall, font, color: C.body });
        cx += colWidths[ci];
      }
      // horizontal rule
      page.drawLine({ start: { x: tableX, y: y - 4 }, end: { x: tableX + totalW, y: y - 4 }, thickness: 0.3, color: C.divider });
      y -= rowHeight;
    }
    y -= 4;
  }

  async function imageBlock(
    image: PDFImage | null,
    box: { width: number; height: number; caption?: string },
    alignX = SP.margin,
  ) {
    ensureSpace(box.height + (box.caption ? 14 : 0) + 4);
    if (image) {
      const scaled = image.scale(1);
      const ratio = Math.min(box.width / scaled.width, box.height / scaled.height, 1);
      const w = scaled.width * ratio;
      const h = scaled.height * ratio;
      const ix = alignX + (box.width - w) / 2;
      page.drawImage(image, { x: ix, y: y - h, width: w, height: h });
      y -= h;
    } else {
      page.drawRectangle({ x: alignX, y: y - box.height, width: box.width, height: box.height, color: C.surface, borderColor: C.divider, borderWidth: 0.6 });
      page.drawText("Photo unavailable", { x: alignX + 8, y: y - box.height / 2 - 3, size: TY.caption, font, color: C.muted });
      y -= box.height;
    }
    if (box.caption) {
      page.drawText(truncateToWidth(box.caption, font, TY.caption, box.width), { x: alignX, y: y - 2, size: TY.caption, font, color: C.muted });
      y -= 13;
    }
    y -= 4;
  }

  // Initialize first page chrome
  drawPageChrome();
  y -= 8;

  return {
    doc,
    get page() { return page; },
    get y() { return y; },
    set y(val) { y = val; },
    get pageNum() { return pageNum; },
    addPage,
    currentPage,
    ensureSpace,
    spacer,
    sectionRule,
    heading,
    subheading,
    paragraph,
    labelValue,
    conditionBadge,
    card,
    drawCardBackground,
    table,
    imageBlock,
    totalPagesRef,
  };
}
