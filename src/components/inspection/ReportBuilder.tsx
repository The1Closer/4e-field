"use client";

import React, { useRef, useState } from "react";
import type { InspectionPhotoDraft, ReportBuilderPayload, ReportSection } from "@/types/inspection";

export type RepSignatureRow = {
  id: string;
  rep_id: string;
  label?: string | null;
  file_path: string;
  is_active?: boolean | null;
  created_at?: string | null;
};

type Tab = "cover" | "sections" | "closing";

type Props = {
  photos: InspectionPhotoDraft[];
  initialPayload: ReportBuilderPayload;
  repSignatures: RepSignatureRow[];
  loadingSignatures: boolean;
  onGenerate: (payload: ReportBuilderPayload) => void;
  onClose: () => void;
  generating: boolean;
};

const DEFAULT_SECTIONS: Omit<ReportSection, "photoIds">[] = [
  { key: "perimeter", title: "Perimeter", visible: true, includePhotos: true },
  { key: "roof_overview", title: "Roof Overview", visible: true, includePhotos: true },
  { key: "roof_damage", title: "Roof Damage", visible: true, includePhotos: true },
  { key: "roof_components", title: "Roof Components", visible: false, includePhotos: false },
  { key: "siding", title: "Siding", visible: false, includePhotos: true },
  { key: "gutters", title: "Gutters", visible: false, includePhotos: true },
  { key: "windows", title: "Windows & Screens", visible: false, includePhotos: true },
  { key: "interior", title: "Interior", visible: false, includePhotos: true },
  { key: "attic", title: "Attic", visible: false, includePhotos: true },
];

function buildDefaultSections(photos: InspectionPhotoDraft[]): ReportSection[] {
  return DEFAULT_SECTIONS.map((s) => ({
    ...s,
    photoIds: photos.filter((p) => p.captureSection === s.key).map((p) => p.id),
  }));
}

export default function ReportBuilder({
  photos,
  initialPayload,
  repSignatures,
  loadingSignatures,
  onGenerate,
  onClose,
  generating,
}: Props) {
  const [tab, setTab] = useState<Tab>("cover");
  const [payload, setPayload] = useState<ReportBuilderPayload>(() => {
    if (initialPayload.sections.length > 0) return initialPayload;
    return { ...initialPayload, sections: buildDefaultSections(photos) };
  });

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const [signatureDrawn, setSignatureDrawn] = useState(false);

  function patchCover(patch: Partial<ReportBuilderPayload["cover"]>) {
    setPayload((p) => ({ ...p, cover: { ...p.cover, ...patch } }));
  }
  function patchClosing(patch: Partial<ReportBuilderPayload["closing"]>) {
    setPayload((p) => ({ ...p, closing: { ...p.closing, ...patch } }));
  }
  function patchSection(key: string, patch: Partial<ReportSection>) {
    setPayload((p) => ({
      ...p,
      sections: p.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }));
  }

  // Drag-and-drop reorder
  const dragIndex = useRef<number | null>(null);

  function onDragStart(index: number) {
    dragIndex.current = index;
  }
  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const sections = [...payload.sections];
    const [moved] = sections.splice(dragIndex.current, 1);
    sections.splice(index, 0, moved);
    dragIndex.current = index;
    setPayload((p) => ({ ...p, sections }));
  }
  function onDragEnd() {
    dragIndex.current = null;
  }

  // Signature canvas
  function startStroke(e: React.PointerEvent) {
    signatureDrawingRef.current = true;
    drawPoint(e.clientX, e.clientY);
  }
  function moveStroke(e: React.PointerEvent) {
    if (!signatureDrawingRef.current) return;
    drawPoint(e.clientX, e.clientY);
  }
  function endStroke() {
    signatureDrawingRef.current = false;
    setSignatureDrawn(true);
  }
  function drawPoint(clientX: number, clientY: number) {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ctx.fillStyle = "#1a2a4a";
    ctx.beginPath();
    ctx.arc((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDrawn(false);
    setPayload((p) => ({ ...p, signatureId: null, signaturePath: null }));
  }

  const coverPhoto = photos.find((p) => p.id === payload.cover.coverPhotoId);

  return (
    <div className="report-builder-overlay">
      <div className="report-builder">
        <div className="report-builder__header">
          <h2 className="report-builder__title">Build Report</h2>
          <button type="button" className="section-drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="report-builder__tabs">
          {(["cover", "sections", "closing"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`report-tab${tab === t ? " active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="report-builder__body">
          {/* ── COVER ─────────────────────────────────────────────────── */}
          {tab === "cover" ? (
            <div className="stack">
              <label className="form-field">
                <span>Introduction Paragraph</span>
                <textarea
                  rows={5}
                  value={payload.cover.intro}
                  onChange={(e) => patchCover({ intro: e.target.value })}
                  placeholder="Introduce the inspection, the homeowner, and any context…"
                />
              </label>

              <label className="form-field">
                <span>Cover Photo (optional)</span>
              </label>
              {coverPhoto ? (
                <div style={{ position: "relative", width: 120 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={URL.createObjectURL(coverPhoto.file)}
                    alt="Cover"
                    style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }}
                  />
                  <button
                    type="button"
                    className="section-drawer__photo-remove"
                    onClick={() => patchCover({ coverPhotoId: null })}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="report-cover-photo-grid">
                  {photos.slice(0, 12).map((photo) => {
                    const url = URL.createObjectURL(photo.file);
                    return (
                      <button
                        key={photo.id}
                        type="button"
                        className="report-cover-photo-option"
                        onClick={() => patchCover({ coverPhotoId: photo.id })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </button>
                    );
                  })}
                  {photos.length === 0 ? <p className="hint">No photos yet</p> : null}
                </div>
              )}
            </div>
          ) : null}

          {/* ── SECTIONS ──────────────────────────────────────────────── */}
          {tab === "sections" ? (
            <div className="stack">
              <p className="hint">Drag to reorder. Toggle sections and choose photos.</p>
              {payload.sections.map((section, index) => (
                <div
                  key={section.key}
                  className="report-section-row"
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => onDragOver(e, index)}
                  onDragEnd={onDragEnd}
                >
                  <span className="report-section-drag">⠿</span>
                  <div className="report-section-row__body">
                    <div className="report-section-row__top">
                      <input
                        type="checkbox"
                        checked={section.visible}
                        onChange={(e) => patchSection(section.key, { visible: e.target.checked })}
                        style={{ width: "auto" }}
                      />
                      <input
                        type="text"
                        className="report-section-title-input"
                        value={section.title}
                        onChange={(e) => patchSection(section.key, { title: e.target.value })}
                        disabled={!section.visible}
                      />
                    </div>
                    {section.visible ? (
                      <div className="report-section-row__photos">
                        <label className="report-section-photos-toggle">
                          <input
                            type="checkbox"
                            checked={section.includePhotos}
                            onChange={(e) => patchSection(section.key, { includePhotos: e.target.checked })}
                            style={{ width: "auto" }}
                          />
                          <span className="hint">Include photos</span>
                        </label>
                        {section.includePhotos ? (
                          <div className="report-section-photo-picks">
                            {photos
                              .filter((p) => p.captureSection === section.key || section.photoIds.includes(p.id))
                              .map((photo) => {
                                const included = section.photoIds.includes(photo.id);
                                const url = URL.createObjectURL(photo.file);
                                return (
                                  <button
                                    key={photo.id}
                                    type="button"
                                    className={`report-photo-pick${included ? " included" : ""}`}
                                    onClick={() =>
                                      patchSection(section.key, {
                                        photoIds: included
                                          ? section.photoIds.filter((id) => id !== photo.id)
                                          : [...section.photoIds, photo.id],
                                      })
                                    }
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt="" className="report-photo-pick__img" />
                                    {included ? <span className="report-photo-pick__check">✓</span> : null}
                                  </button>
                                );
                              })}
                            {photos.filter((p) => p.captureSection === section.key).length === 0 ? (
                              <span className="hint">No photos in this section</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* ── CLOSING ───────────────────────────────────────────────── */}
          {tab === "closing" ? (
            <div className="stack">
              <label className="form-field">
                <span>Closing Notes</span>
                <textarea
                  rows={4}
                  value={payload.closing.notes}
                  onChange={(e) => patchClosing({ notes: e.target.value })}
                  placeholder="Any final notes for the homeowner…"
                />
              </label>

              <label className="form-field">
                <input
                  type="checkbox"
                  checked={payload.contingent}
                  onChange={(e) => setPayload((p) => ({ ...p, contingent: e.target.checked }))}
                  style={{ width: "auto" }}
                />
                <span> Contingency agreement</span>
              </label>

              <h4 className="roof-section-title">Saved Signatures</h4>
              {loadingSignatures ? (
                <p className="hint">Loading…</p>
              ) : repSignatures.length > 0 ? (
                <div className="stack">
                  {repSignatures.map((sig) => (
                    <label key={sig.id} className="row">
                      <input
                        type="radio"
                        name="sig"
                        checked={payload.signatureId === sig.id}
                        onChange={() => setPayload((p) => ({ ...p, signatureId: sig.id, signaturePath: sig.file_path }))}
                        style={{ width: "auto" }}
                      />
                      <span>{sig.label ?? sig.id}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="hint">No saved signatures</p>
              )}

              <h4 className="roof-section-title">Draw Signature</h4>
              <canvas
                ref={signatureCanvasRef}
                width={420}
                height={160}
                style={{
                  width: "100%",
                  maxWidth: 420,
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "#fff",
                  touchAction: "none",
                }}
                onPointerDown={startStroke}
                onPointerMove={moveStroke}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
              />
              <div className="row">
                <button type="button" className="secondary" onClick={clearSignature}>
                  Clear Drawing
                </button>
              </div>
              {signatureDrawn ? <p className="hint">Signature drawn — will be included in report.</p> : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="report-builder__footer">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onGenerate(payload)}
            disabled={generating}
          >
            {generating ? "Generating…" : "Generate Report →"}
          </button>
        </div>
      </div>
    </div>
  );
}
