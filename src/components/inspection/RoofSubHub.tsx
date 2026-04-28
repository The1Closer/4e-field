"use client";

import React, { useState } from "react";
import type {
  InspectionPhotoDraft,
  ComponentPresenceDraft,
  RoofDamageMetrics,
  TestSquare,
  DamageSlope,
  DamageCause,
  CaptureSection,
} from "@/types/inspection";
import { COMPONENT_PRESENCE_KEYS } from "@/types/inspection";
import InAppCamera from "./InAppCamera";

type RoofCardKey = "overview" | "damage" | "components";

type Props = {
  // Shared photos — all roof photos
  photos: InspectionPhotoDraft[];
  // Checklist data
  shingleLengthInches: string;
  shingleWidthInches: string;
  dripEdgePresent: "yes" | "no" | "na" | null;
  estimatedRoofAgeYears: number | null;
  layerCount: "1" | "2" | "3+" | null;
  layerPhotoId: string | null;
  componentPresence: ComponentPresenceDraft;
  roofDamage: RoofDamageMetrics;
  // Callbacks
  onClose: () => void;
  onAddPhotos: (files: File[], tags: { cause: DamageCause; slope: DamageSlope | ""; note: string }, captureSection: CaptureSection) => Promise<InspectionPhotoDraft[]>;
  onRemovePhoto: (photoId: string) => void;
  onShingleLength: (v: string) => void;
  onShingleWidth: (v: string) => void;
  onDripEdge: (v: "yes" | "no" | "na" | null) => void;
  onRoofAge: (v: number | null) => void;
  onLayerCount: (v: "1" | "2" | "3+" | null) => void;
  onLayerPhoto: (photoId: string | null) => void;
  onComponentToggle: (key: string, present: boolean) => void;
  onComponentQty: (key: string, qty: string) => void;
  onRoofDamage: (patch: Partial<RoofDamageMetrics>) => void;
};

type CameraTarget = { section: CaptureSection; cause: DamageCause; slope: DamageSlope | "" } | null;

export default function RoofSubHub({
  photos,
  shingleLengthInches,
  shingleWidthInches,
  dripEdgePresent,
  estimatedRoofAgeYears,
  layerCount,
  componentPresence,
  roofDamage,
  onClose,
  onAddPhotos,
  onRemovePhoto,
  onShingleLength,
  onShingleWidth,
  onDripEdge,
  onRoofAge,
  onLayerCount,
  onComponentToggle,
  onComponentQty,
  onRoofDamage,
}: Props) {
  const [activeCard, setActiveCard] = useState<RoofCardKey | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>(null);

  const overviewPhotos = photos.filter((p) => p.captureSection === "roof_overview");
  const damagePhotos = photos.filter((p) => p.captureSection === "roof_damage" && !p.testSquareId);

  function openCamera(section: CaptureSection, cause: DamageCause = "none", slope: DamageSlope | "" = "") {
    setCameraTarget({ section, cause, slope });
  }

  function addTestSquare() {
    const ts: TestSquare = {
      id: crypto.randomUUID(),
      slope: "",
      photoId: null,
      hitCount: null,
      note: "",
      createdAt: new Date().toISOString(),
    };
    onRoofDamage({ testSquares: [...roofDamage.testSquares, ts] });
  }

  function updateTestSquare(id: string, patch: Partial<TestSquare>) {
    onRoofDamage({
      testSquares: roofDamage.testSquares.map((ts) => (ts.id === id ? { ...ts, ...patch } : ts)),
    });
  }

  function removeTestSquare(id: string) {
    onRoofDamage({ testSquares: roofDamage.testSquares.filter((ts) => ts.id !== id) });
  }

  const CARDS: { key: RoofCardKey; label: string; emoji: string; summary: string }[] = [
    {
      key: "overview",
      label: "Overview",
      emoji: "🏠",
      summary: `${overviewPhotos.length} photo${overviewPhotos.length !== 1 ? "s" : ""} · ${shingleLengthInches && shingleWidthInches ? `${shingleLengthInches}"×${shingleWidthInches}"` : "dims needed"}`,
    },
    {
      key: "damage",
      label: "Damage",
      emoji: "⚠️",
      summary: `${damagePhotos.length} photo${damagePhotos.length !== 1 ? "s" : ""} · ${roofDamage.testSquares.length} test square${roofDamage.testSquares.length !== 1 ? "s" : ""}`,
    },
    {
      key: "components",
      label: "Components & Dims",
      emoji: "🔧",
      summary: `${Object.values(componentPresence).filter((v) => v.present).length} component${Object.values(componentPresence).filter((v) => v.present).length !== 1 ? "s" : ""} noted`,
    },
  ];

  return (
    <>
      {cameraTarget ? (
        <InAppCamera
          sectionLabel="Roof"
          captureSection={cameraTarget.section}
          photoCount={photos.filter((p) => p.captureSection === cameraTarget.section).length}
          suggestedCount={cameraTarget.section === "roof_overview" ? 8 : cameraTarget.section === "roof_damage" ? 3 : undefined}
          initialCause={cameraTarget.cause}
          initialSlope={cameraTarget.slope}
          onCapture={async (files, tags) => {
            await onAddPhotos(files, tags, cameraTarget.section);
            setCameraTarget(null);
          }}
          onClose={() => setCameraTarget(null)}
        />
      ) : null}

      <div className="section-drawer" role="dialog" aria-label="Roof inspection">
        <div className="section-drawer__header">
          <h3 className="section-drawer__title">Roof</h3>
          <button type="button" className="section-drawer__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Card selector */}
        {activeCard === null ? (
          <div className="roof-cards">
            {CARDS.map((card) => (
              <button
                key={card.key}
                type="button"
                className="roof-card"
                onClick={() => setActiveCard(card.key)}
              >
                <span className="roof-card__emoji">{card.emoji}</span>
                <span className="roof-card__label">{card.label}</span>
                <span className="roof-card__summary">{card.summary}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="roof-card-detail">
            <button
              type="button"
              className="roof-back-btn"
              onClick={() => setActiveCard(null)}
            >
              ← Back to Roof
            </button>

            {/* ── OVERVIEW ─────────────────────────────────────────────── */}
            {activeCard === "overview" ? (
              <div className="stack">
                <h4 className="roof-section-title">Overview Photos</h4>
                <div className="section-drawer__photo-bar">
                  <span className="section-drawer__photo-count">
                    {overviewPhotos.length} / 8 suggested
                    {overviewPhotos.length < 8 ? <span className="section-drawer__photo-warn"> ⚠</span> : null}
                  </span>
                  <div className="section-drawer__add-btns">
                    <button type="button" className="photo-add-btn" onClick={() => openCamera("roof_overview", "none", "")}>
                      📷 Camera
                    </button>
                    <label className="photo-add-btn">
                      🖼 Library
                      <input
                        type="file" accept="image/*" multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length > 0) await onAddPhotos(files, { cause: "none", slope: "", note: "" }, "roof_overview");
                          e.target.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                </div>
                <PhotoGrid photos={overviewPhotos} onRemove={onRemovePhoto} />

                <h4 className="roof-section-title">Drip Edge</h4>
                <div className="chip-row">
                  {(["yes", "no", "na"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={`chip${dripEdgePresent === v ? " active" : ""}`}
                      onClick={() => onDripEdge(v)}
                    >
                      {v === "yes" ? "Yes" : v === "no" ? "No" : "N/A"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* ── DAMAGE ───────────────────────────────────────────────── */}
            {activeCard === "damage" ? (
              <div className="stack">
                <h4 className="roof-section-title">Damage Photos</h4>
                <div className="section-drawer__photo-bar">
                  <span className="section-drawer__photo-count">
                    {damagePhotos.length} / 3 suggested
                    {damagePhotos.length < 3 ? <span className="section-drawer__photo-warn"> ⚠</span> : null}
                  </span>
                  <div className="section-drawer__add-btns">
                    <button type="button" className="photo-add-btn" onClick={() => openCamera("roof_damage", "hail", "")}>
                      📷 Camera
                    </button>
                    <label className="photo-add-btn">
                      🖼 Library
                      <input
                        type="file" accept="image/*" multiple
                        onChange={async (e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length > 0) await onAddPhotos(files, { cause: "hail", slope: "", note: "" }, "roof_damage");
                          e.target.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                </div>
                <PhotoGrid photos={damagePhotos} onRemove={onRemovePhoto} />

                <h4 className="roof-section-title">Damage Metrics</h4>
                <div className="form-row">
                  <label className="form-field">
                    <span>Wind Damaged Shingles</span>
                    <input
                      type="number"
                      min={0}
                      value={roofDamage.windShingleCount ?? ""}
                      onChange={(e) => onRoofDamage({ windShingleCount: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="Count"
                    />
                  </label>
                  <label className="form-field">
                    <span>Total Hail Count</span>
                    <input
                      type="number"
                      min={0}
                      value={roofDamage.hailCount ?? ""}
                      onChange={(e) => onRoofDamage({ hailCount: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="Count"
                    />
                  </label>
                </div>

                <h4 className="roof-section-title">Slopes Affected</h4>
                <div className="chip-row">
                  {(["front", "rear", "left", "right"] as const).map((s) => {
                    const active = roofDamage.slopesAffected.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`chip${active ? " active" : ""}`}
                        onClick={() =>
                          onRoofDamage({
                            slopesAffected: active
                              ? roofDamage.slopesAffected.filter((x) => x !== s)
                              : [...roofDamage.slopesAffected, s],
                          })
                        }
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    );
                  })}
                </div>

                <h4 className="roof-section-title">Test Squares</h4>
                {roofDamage.testSquares.map((ts) => (
                  <TestSquareCard
                    key={ts.id}
                    testSquare={ts}
                    photos={photos}
                    onUpdate={(patch) => updateTestSquare(ts.id, patch)}
                    onRemove={() => removeTestSquare(ts.id)}
                    onAddPhoto={() => openCamera("roof_damage_test_square", "hail", ts.slope || "")}
                    onAddPhotoFromLibrary={async (files) => {
                      const added = await onAddPhotos(files, { cause: "hail", slope: ts.slope || "", note: "" }, "roof_damage_test_square");
                      const newPhoto = added[0];
                      if (newPhoto) updateTestSquare(ts.id, { photoId: newPhoto.id });
                    }}
                  />
                ))}
                <button type="button" className="secondary" onClick={addTestSquare}>
                  + Add Test Square
                </button>
              </div>
            ) : null}

            {/* ── COMPONENTS & DIMS ────────────────────────────────────── */}
            {activeCard === "components" ? (
              <div className="stack">
                <h4 className="roof-section-title">Roof Details</h4>
                <div className="form-row">
                  <label className="form-field">
                    <span>Estimated Roof Age (yrs)</span>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      value={estimatedRoofAgeYears ?? ""}
                      onChange={(e) => onRoofAge(e.target.value === "" ? null : Number(e.target.value))}
                      placeholder="e.g. 12"
                    />
                  </label>
                  <label className="form-field">
                    <span>Layer Count</span>
                    <div className="chip-row">
                      {(["1", "2", "3+"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`chip${layerCount === v ? " active" : ""}`}
                          onClick={() => onLayerCount(v)}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </label>
                </div>

                <h4 className="roof-section-title">Shingle Dimensions</h4>
                <div className="form-row">
                  <label className="form-field">
                    <span>Length (in)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={shingleLengthInches}
                      onChange={(e) => onShingleLength(e.target.value)}
                      placeholder="e.g. 36"
                    />
                  </label>
                  <label className="form-field">
                    <span>Width (in)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={shingleWidthInches}
                      onChange={(e) => onShingleWidth(e.target.value)}
                      placeholder="e.g. 12"
                    />
                  </label>
                </div>

                <h4 className="roof-section-title">Components</h4>
                <div className="components-grid">
                  {COMPONENT_PRESENCE_KEYS.map((key) => {
                    const item = componentPresence[key] ?? { present: false, quantity: null };
                    return (
                      <div key={key} className="component-row">
                        <label className="component-toggle">
                          <input
                            type="checkbox"
                            checked={item.present}
                            onChange={(e) => onComponentToggle(key, e.target.checked)}
                          />
                          <span>{key.replace(/_/g, " ")}</span>
                        </label>
                        {item.present ? (
                          <input
                            type="number"
                            min={0}
                            className="component-qty"
                            value={item.quantity ?? ""}
                            onChange={(e) => onComponentQty(key, e.target.value)}
                            placeholder="Qty"
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function PhotoGrid({ photos, onRemove }: { photos: InspectionPhotoDraft[]; onRemove: (id: string) => void }) {
  if (photos.length === 0) return <p className="section-drawer__empty">No photos yet</p>;
  return (
    <div className="section-drawer__photo-grid">
      {photos.map((photo) => {
        const url = URL.createObjectURL(photo.file);
        return (
          <div key={photo.id} className="section-drawer__photo-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="section-drawer__photo-img" />
            <button
              type="button"
              className="section-drawer__photo-remove"
              onClick={() => onRemove(photo.id)}
              aria-label="Remove photo"
            >
              ✕
            </button>
            {photo.slopeTag ? <span className="section-drawer__photo-badge">{photo.slopeTag}</span> : null}
            {photo.damageCause && photo.damageCause !== "none" ? (
              <span className="section-drawer__photo-badge" style={{ bottom: 22 }}>{photo.damageCause}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TestSquareCard({
  testSquare,
  photos,
  onUpdate,
  onRemove,
  onAddPhoto,
  onAddPhotoFromLibrary,
}: {
  testSquare: TestSquare;
  photos: InspectionPhotoDraft[];
  onUpdate: (patch: Partial<TestSquare>) => void;
  onRemove: () => void;
  onAddPhoto: () => void;
  onAddPhotoFromLibrary: (files: File[]) => void;
}) {
  const linkedPhoto = photos.find((p) => p.id === testSquare.photoId);

  return (
    <div className="test-square-card">
      <div className="test-square-card__header">
        <span className="test-square-card__title">Test Square</span>
        <button type="button" className="test-square-card__remove" onClick={onRemove}>
          ✕
        </button>
      </div>

      <div className="chip-row">
        {(["front", "rear", "left", "right"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`chip chip--sm${testSquare.slope === s ? " active" : ""}`}
            onClick={() => onUpdate({ slope: s })}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="test-square-card__photo-row">
        {linkedPhoto ? (
          <div className="test-square-card__thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(linkedPhoto.file)} alt="Test square" className="section-drawer__photo-img" />
          </div>
        ) : (
          <div className="test-square-card__no-photo">
            <button type="button" className="photo-add-btn" onClick={onAddPhoto}>📷</button>
            <label className="photo-add-btn">
              🖼
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) onAddPhotoFromLibrary(files);
                  e.target.value = "";
                }}
                style={{ display: "none" }}
              />
            </label>
          </div>
        )}
        <label className="form-field" style={{ flex: 1 }}>
          <span>Hit Count</span>
          <input
            type="number"
            min={0}
            value={testSquare.hitCount ?? ""}
            onChange={(e) => onUpdate({ hitCount: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="# hail strikes"
          />
        </label>
      </div>

      <input
        type="text"
        className="test-square-card__note"
        value={testSquare.note}
        onChange={(e) => onUpdate({ note: e.target.value })}
        placeholder="Optional note…"
      />
    </div>
  );
}
